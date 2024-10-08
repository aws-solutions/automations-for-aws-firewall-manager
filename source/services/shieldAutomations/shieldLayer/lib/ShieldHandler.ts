// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Credentials } from "@aws-sdk/client-sts";
import {
  ShieldValidatorResponse,
  ProtectedResourceTypeResponse,
  ShieldResource,
} from "./CommonExports";
import {
  AssociateHealthCheckCommand,
  DescribeProtectionCommand,
  DescribeProtectionResponse,
  Protection,
  ShieldClient,
} from "@aws-sdk/client-shield";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { Logger } from "@aws-lambda-powertools/logger";
import {
  DescribeAddressesCommand,
  DescribeNetworkInterfacesCommand,
  EC2Client,
  NetworkInterfaceType,
} from "@aws-sdk/client-ec2";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

export class ShieldHandler {
  /**
   * @description IAM credentials assumed by lambda for member account access
   */
  private readonly assumedCredentials: Credentials;

  /**
   *@description SNS Client to send messages to Shield SNS Topic
   */
  private snsClient: SNSClient = new SNSClient({});

  /**
   * @description ARN of the Shield SNS Topic created by Shield Automations stack
   */
  private shieldTopicARN: string = <string>process.env.TOPIC_ARN;

  private logger: Logger;

  private tracer: Tracer;

  private shieldClient: ShieldClient;

  constructor(
    crossAccountCredentials: Credentials,
    tracer: Tracer,
    logger: Logger
  ) {
    this.logger = logger;
    this.tracer = tracer;
    this.assumedCredentials = crossAccountCredentials;

    this.shieldClient = tracer.captureAWSv3Client(
      new ShieldClient({
        credentials: {
          accessKeyId: <string>crossAccountCredentials.AccessKeyId,
          secretAccessKey: <string>crossAccountCredentials.SecretAccessKey,
          sessionToken: crossAccountCredentials.SessionToken,
        },
      })
    );
  }

  /**
   * @description Retrieves the shield protection for `shieldProtectionId`
   */
  public async getShieldProtectionDetails(
    shieldProtectionId: string
  ): Promise<Protection> {
    const describeProtectionResponse = await this.describeShieldProtection(
      shieldProtectionId
    );
    const shieldProtectionDetails = describeProtectionResponse.Protection;

    if (!shieldProtectionDetails?.Id) {
      this.logger.error(
        `could not describe shield protection ${shieldProtectionId}`,
        {
          shieldProtectionId: shieldProtectionId,
        }
      );
      throw new Error(
        "Shield DescribeProtectionResponse Protection is undefined"
      );
    }
    return shieldProtectionDetails;
  }

  /**
   * @description Check if ShieldProtection is valid.
   * A ShieldProtection is valid if it exists and
   * protects an ELB, EIP, or CloudFront Distribution.
   */
  public async isValid(
    shieldProtectionDetails: Protection
  ): Promise<ShieldValidatorResponse> {
    const protectedResourceArn: string = this.getProtectedResourceARN(
      shieldProtectionDetails
    );
    const protectedResourceTypeResponse: ProtectedResourceTypeResponse =
      await this.getProtectedAWSResourceType(protectedResourceArn);

    const isValidResourceType =
      protectedResourceTypeResponse.protectedResourceType !==
        ShieldResource.Unknown &&
      protectedResourceTypeResponse.protectedResourceType !==
        ShieldResource.IncompleteElasticIP;

    this.logger.info("validated shield protection", {
      ShieldProtectionId: shieldProtectionDetails.Id,
      ProtectedResourceType: protectedResourceTypeResponse,
      IsValidResourceType: isValidResourceType,
    });

    return {
      isValid: isValidResourceType,
      isIncompleteEIP:
        protectedResourceTypeResponse.protectedResourceType ===
        ShieldResource.IncompleteElasticIP,
    };
  }

  /**
   * @description Check if ShieldProtection resource is compliant.
   * A ShieldProtection is compliant if it has HealthCheckIDs.
   */
  public isCompliant(shieldProtectionDetails: Protection): boolean {
    const healthCheckIds = shieldProtectionDetails?.HealthCheckIds;

    this.logger.info(
      `retrieved compliance information for shield protection ${shieldProtectionDetails.Id}`,
      {
        shieldProtectionId: shieldProtectionDetails.Id,
        numHealthChecks: healthCheckIds?.length,
      }
    );

    return healthCheckIds !== undefined && healthCheckIds.length > 0;
  }

  /**
   * Returns the AWS Resource type which is protected by
   * this Shield Protection given the ARN of the protected resource.
   */
  public async getProtectedAWSResourceType(
    protectedResourceARN: string
  ): Promise<ProtectedResourceTypeResponse> {
    const arnParts = protectedResourceARN.split(":");

    try {
      if (arnParts.length >= 6) {
        const resourceDetails: string = arnParts[5];
        const splitResourceDetails = resourceDetails.split("/");
        if (/loadbalancer\/app\//i.test(resourceDetails)) {
          return {
            protectedResourceType: ShieldResource.ApplicationLoadBalancer,
            protectedResourceId: splitResourceDetails[2],
          };
        } else if (/loadbalancer\//i.test(resourceDetails)) {
          return {
            protectedResourceType: ShieldResource.ClassicLoadBalancer,
            protectedResourceId: splitResourceDetails[1],
          };
        } else if (/eip-allocation\//i.test(resourceDetails)) {
          const eipAllocationId = splitResourceDetails[1];
          return await this.getEIPProtectionType(eipAllocationId);
        } else if (/distribution\//i.test(resourceDetails)) {
          return {
            protectedResourceType: ShieldResource.CloudFrontDistribution,
            protectedResourceId: splitResourceDetails[1],
          };
        } else {
          this.logger.info(
            "resource protected by Shield is not currently supported for remediation",
            {
              ResourceARN: protectedResourceARN,
            }
          );
        }
      } else {
        this.logger.error("invalid ARN format", {
          ResourceARN: protectedResourceARN,
        });
      }
    } catch (e) {
      this.logger.error(
        "encountered error while retrieving protected resource type",
        {
          error: e,
          ResourceARN: protectedResourceARN,
          requestId: e.$metadata?.requestId,
        }
      );
    }

    return {
      protectedResourceType: ShieldResource.Unknown,
      protectedResourceId: "Unknown",
    };
  }

  /**
   * Returns the ARN of the resource that is protected by `
   * this.shieldProtectionId`
   */
  public getProtectedResourceARN(shieldProtectionDetails: Protection): string {
    const protectedResourceARN = shieldProtectionDetails?.ResourceArn;
    if (!protectedResourceARN) {
      this.logger.debug(
        "Shield DescribeProtectionResponse has undefined protectedResourceARN",
        {
          ProtectionId: shieldProtectionDetails?.Id,
        }
      );
      throw new Error(
        "Shield DescribeProtectionResponse protectedResourceARN is undefined"
      );
    }
    return protectedResourceARN;
  }

  /**
   * @description Checks if the Shield Protection protects a Network Load Balancer
   * through the provided EIP. NLBs are a special case, since they cannot be
   * directly protected by Shield.
   */
  public async getEIPProtectionType(
    eipAllocationId: string
  ): Promise<ProtectedResourceTypeResponse> {
    const ec2Client = this.ec2Client();

    const describeAddressesCommand = new DescribeAddressesCommand({
      AllocationIds: [eipAllocationId],
    });
    const describeAddressesResponse = await ec2Client.send(
      describeAddressesCommand
    );

    if (
      !describeAddressesResponse.Addresses ||
      describeAddressesResponse.Addresses?.length < 1
    ) {
      this.logger.debug("EIP from Shield Protection could not be found", {
        EIPAllocationId: eipAllocationId,
      });
      return {
        protectedResourceType: ShieldResource.Unknown,
        protectedResourceId: eipAllocationId,
      };
    }

    const eipDetails = describeAddressesResponse.Addresses[0];
    if (eipDetails.InstanceId) {
      this.logger.debug("found EIP attached to EC2 Instance", {
        InstanceId: eipDetails.InstanceId,
      });
      return {
        protectedResourceType: ShieldResource.ElasticIP,
        protectedResourceId: eipDetails.InstanceId,
      };
    } else if (eipDetails.NetworkInterfaceId) {
      // NLBs are a special case, since they cannot be directly protected by Shield
      // Need to check if EIP is attached to NLB through Network Interface
      this.logger.debug("found EIP attached to Network Interface", {
        NetworkInterfaceId: eipDetails.NetworkInterfaceId,
      });

      return this.getNLBProtectionType(
        eipDetails.NetworkInterfaceId,
        eipAllocationId,
        ec2Client
      );
    }
    return {
      protectedResourceType: ShieldResource.IncompleteElasticIP,
      protectedResourceId: eipAllocationId,
    };
  }

  /**
   * @description Retrieves NLB protection details
   */
  async getNLBProtectionType(
    networkInterfaceId: string,
    eipAllocationId: string,
    ec2Client: EC2Client
  ): Promise<ProtectedResourceTypeResponse> {
    const describeNetworkInterfacesCommand =
      new DescribeNetworkInterfacesCommand({
        NetworkInterfaceIds: [networkInterfaceId],
      });
    const describeNetworkInterfacesResponse = await ec2Client.send(
      describeNetworkInterfacesCommand
    );

    if (
      describeNetworkInterfacesResponse.NetworkInterfaces &&
      describeNetworkInterfacesResponse.NetworkInterfaces?.length == 1
    ) {
      const networkInterface =
        describeNetworkInterfacesResponse.NetworkInterfaces[0];
      if (
        networkInterface.InterfaceType ===
        NetworkInterfaceType.network_load_balancer
      ) {
        // Network Interface description must be of the form '*/nlb-name/*'
        let nlbName: string | undefined = "";

        try {
          nlbName = networkInterface.Description?.split("/")[1];
          this.logger.debug("found Network Load Balancer attached to EIP", {
            NLBName: nlbName,
          });
        } catch (e) {
          this.logger.warn(
            "Could not parse Network Interface description. Description must be of the form */load-balancer-name/* for automatic remediation of Network Load Balancers. " +
              "If this interface is not attached to a NLB, ignore this message.",
            {
              error: e,
              NetworkInterfaceId: networkInterfaceId,
            }
          );
        }

        return {
          protectedResourceType: nlbName
            ? ShieldResource.NetworkLoadBalancer
            : ShieldResource.IncompleteElasticIP,
          protectedResourceId: nlbName ? nlbName : eipAllocationId,
        };
      }
    }
    return {
      protectedResourceType: ShieldResource.IncompleteElasticIP,
      protectedResourceId: eipAllocationId,
    };
  }

  private ec2Client(): EC2Client {
    return this.tracer.captureAWSv3Client(
      new EC2Client({
        credentials: {
          accessKeyId: <string>this.assumedCredentials.AccessKeyId,
          secretAccessKey: <string>this.assumedCredentials.SecretAccessKey,
          sessionToken: this.assumedCredentials.SessionToken,
        },
      })
    );
  }

  /**
   * Invokes the Shield API to associate a HealthCheck with the Shield Protection.
   */
  public async associateHealthCheck(
    shieldProtectionId: string,
    healthCheckId: string
  ): Promise<void> {
    const healthCheckARN = `arn:${process.env.PARTITION}:route53:::healthcheck/${healthCheckId}`;

    const associateHealthCheckCommand = new AssociateHealthCheckCommand({
      ProtectionId: shieldProtectionId,
      HealthCheckArn: healthCheckARN,
    });

    await this.shieldClient.send(associateHealthCheckCommand);
    this.logger.info(
      `Associated calculated Health Check ${healthCheckId} with Shield Protection ${shieldProtectionId}`
    );
  }

  /**
   *@description Publishes a message to the Shield Topic
   */
  public async publishShieldTopicMessage(
    subject: string,
    message: string
  ): Promise<void> {
    const publishCommand = new PublishCommand({
      TopicArn: this.shieldTopicARN,
      Message: message,
      Subject: subject,
    });

    try {
      await this.snsClient.send(publishCommand);
    } catch (e) {
      this.logger.error("Error publishing Shield Topic Message", {
        Error: e,
        Message: message,
        requestId: e.$metadata?.requestId,
      });
    }
  }

  /**
   * Calls Shield API to get info on the Shield Protection
   */
  private async describeShieldProtection(
    shieldProtectionId: string
  ): Promise<DescribeProtectionResponse> {
    const describeCommand: DescribeProtectionCommand =
      new DescribeProtectionCommand({
        ProtectionId: shieldProtectionId,
      });

    const describeProtectionResponse = await this.shieldClient.send(
      describeCommand
    );
    this.logger.debug(
      `Described shield protection ${describeProtectionResponse.Protection?.Id}`,
      {
        shieldProtectionId: describeProtectionResponse.Protection?.Id,
      }
    );
    return describeProtectionResponse;
  }
}
