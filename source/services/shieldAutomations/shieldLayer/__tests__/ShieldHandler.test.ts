// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { ShieldHandler } from "../lib/ShieldHandler";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { Logger } from "@aws-lambda-powertools/logger";
import { mockClient } from "aws-sdk-client-mock";
import {
  AssociateHealthCheckCommand,
  DescribeProtectionCommand,
  ShieldClient,
} from "@aws-sdk/client-shield";
import { ShieldResource } from "../lib/CommonExports";
import {
  DescribeAddressesCommand,
  DescribeNetworkInterfacesCommand,
  EC2Client,
  NetworkInterfaceType,
} from "@aws-sdk/client-ec2";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const shieldClientMock = mockClient(ShieldClient);

describe("ShieldHandler Tests", () => {
  beforeEach(() => {
    shieldClientMock.reset();
  });

  const mockCredentials = {
    AccessKeyId: "accessKeyId",
    SecretAccessKey: "secretAccessKey",
    SessionToken: "sessionToken",
    Expiration: new Date(),
  };
  const logger = new Logger();
  const tracer = new Tracer();

  describe("getShieldProtectionDetails", () => {
    const shieldHandler = new ShieldHandler(mockCredentials, tracer, logger);

    it("retrieves shield protection details", async () => {
      const shieldProtectionId = "shieldProtectionId";
      shieldClientMock.on(DescribeProtectionCommand).resolvesOnce({
        Protection: {
          Id: shieldProtectionId,
        },
      });

      const response = await shieldHandler.getShieldProtectionDetails(
        shieldProtectionId
      );
      expect(response.Id).toEqual(shieldProtectionId);
    });

    it("throws an error if shield protection could not be fetched", async () => {
      const shieldProtectionId = "shieldProtectionId";
      shieldClientMock.on(DescribeProtectionCommand).resolvesOnce({});

      await expect(
        shieldHandler.getShieldProtectionDetails(shieldProtectionId)
      ).rejects.toThrow(
        /Shield DescribeProtectionResponse Protection is undefined/i
      );
    });

    it("throws an error if shield protection Id could not be fetched", async () => {
      const shieldProtectionId = "shieldProtectionId";
      shieldClientMock
        .on(DescribeProtectionCommand)
        .resolvesOnce({ Protection: {} });

      await expect(
        shieldHandler.getShieldProtectionDetails(shieldProtectionId)
      ).rejects.toThrow(
        /Shield DescribeProtectionResponse Protection is undefined/i
      );
    });
  });

  describe("isValid", () => {
    const shieldHandler = new ShieldHandler(mockCredentials, tracer, logger);

    const shieldProtectionDetails = {
      Id: "protectionId",
    };
    const mockGetProtectedResourceARN = jest.fn();
    const mockGetProtectedAWSResourceType = jest.fn();

    shieldHandler.getProtectedResourceARN = mockGetProtectedResourceARN;
    shieldHandler.getProtectedAWSResourceType = mockGetProtectedAWSResourceType;

    it("succeeds on a valid shield protection", async () => {
      mockGetProtectedResourceARN.mockResolvedValueOnce(
        "protected_resource_ARN"
      );
      mockGetProtectedAWSResourceType.mockResolvedValueOnce({
        protectedResourceType: ShieldResource.ApplicationLoadBalancer,
        protectedResourceId: "resourceId",
      });

      const response = await shieldHandler.isValid(shieldProtectionDetails);
      expect(response).toStrictEqual({
        isValid: true,
        isIncompleteEIP: false,
      });
    });

    it("detects incomplete Elastic IP", async () => {
      mockGetProtectedResourceARN.mockResolvedValueOnce(
        "protected_resource_ARN"
      );
      mockGetProtectedAWSResourceType.mockResolvedValueOnce({
        protectedResourceType: ShieldResource.IncompleteElasticIP,
        protectedResourceId: "resourceId",
      });

      const response = await shieldHandler.isValid(shieldProtectionDetails);
      expect(response).toStrictEqual({
        isValid: false,
        isIncompleteEIP: true,
      });
    });

    it("detects unknown resource type", async () => {
      mockGetProtectedResourceARN.mockResolvedValueOnce(
        "protected_resource_ARN"
      );
      mockGetProtectedAWSResourceType.mockResolvedValueOnce({
        protectedResourceType: ShieldResource.Unknown,
        protectedResourceId: "resourceId",
      });

      const response = await shieldHandler.isValid(shieldProtectionDetails);
      expect(response).toStrictEqual({
        isValid: false,
        isIncompleteEIP: false,
      });
    });
  });

  describe("isCompliant", () => {
    const shieldHandler = new ShieldHandler(mockCredentials, tracer, logger);

    it("succeeds on protection with nonempty HealthCheckIds", () => {
      const shieldProtectionDetails = {
        Id: "protectionId",
        HealthCheckIds: ["healthCheckId"],
      };

      const response = shieldHandler.isCompliant(shieldProtectionDetails);
      expect(response).toBeTruthy();
    });

    it("detects non-compliant protection with empty HealthCheckIds", () => {
      const shieldProtectionDetails = {
        Id: "protectionId",
        HealthCheckIds: [],
      };

      const response = shieldHandler.isCompliant(shieldProtectionDetails);
      expect(response).toBeFalsy();
    });

    it("detects non-compliant protection with undefined HealthCheckIds", () => {
      const shieldProtectionDetails = {
        Id: "protectionId",
        HealthCheckIds: undefined,
      };

      const response = shieldHandler.isCompliant(shieldProtectionDetails);
      expect(response).toBeFalsy();
    });
  });

  describe("getProtectedAWSResourceType", () => {
    const shieldHandler = new ShieldHandler(mockCredentials, tracer, logger);

    it("gets protected Application Load Balancer", async () => {
      const albARN =
        "arn:aws:elasticloadbalancing:region:account-id:loadbalancer/app/load-balancer-name/load-balancer-id";

      const response = await shieldHandler.getProtectedAWSResourceType(albARN);
      expect(response).toStrictEqual({
        protectedResourceType: ShieldResource.ApplicationLoadBalancer,
        protectedResourceId: "load-balancer-name",
      });
    });

    it("gets protected Classic Load Balancer", async () => {
      const clbARN =
        "arn:aws:elasticloadbalancing:region:account-id:loadbalancer/load-balancer-name";

      const response = await shieldHandler.getProtectedAWSResourceType(clbARN);
      expect(response).toStrictEqual({
        protectedResourceType: ShieldResource.ClassicLoadBalancer,
        protectedResourceId: "load-balancer-name",
      });
    });

    it("gets protected CloudFront Distribution", async () => {
      const cfARN =
        "arn:aws:cloudfront::account-id:distribution/distribution-id";

      const response = await shieldHandler.getProtectedAWSResourceType(cfARN);
      expect(response).toStrictEqual({
        protectedResourceType: ShieldResource.CloudFrontDistribution,
        protectedResourceId: "distribution-id",
      });
    });

    it("gets protected CloudFront Distribution", async () => {
      const cfARN =
        "arn:aws:cloudfront::account-id:distribution/distribution-id";

      const response = await shieldHandler.getProtectedAWSResourceType(cfARN);
      expect(response).toStrictEqual({
        protectedResourceType: ShieldResource.CloudFrontDistribution,
        protectedResourceId: "distribution-id",
      });
    });

    it("gets protected Elastic IP", async () => {
      const eipARN =
        "arn:aws:ec2:region:account-id:eip-allocation/allocation-id";

      const mockGetEIPProtectionType = jest.fn();
      shieldHandler.getEIPProtectionType = mockGetEIPProtectionType;

      mockGetEIPProtectionType.mockResolvedValueOnce({
        protectedResourceType: ShieldResource.ElasticIP,
        protectedResourceId: "allocation-id",
      });

      const response = await shieldHandler.getProtectedAWSResourceType(eipARN);
      expect(response).toStrictEqual({
        protectedResourceType: ShieldResource.ElasticIP,
        protectedResourceId: "allocation-id",
      });
    });

    it("detects unsupported resource type", async () => {
      const unknownARN = "arn:aws:route53:::hostedzone/hosted-zone-id";

      const response = await shieldHandler.getProtectedAWSResourceType(
        unknownARN
      );
      expect(response).toStrictEqual({
        protectedResourceType: ShieldResource.Unknown,
        protectedResourceId: "Unknown",
      });
    });

    it("detects invalid ARN format", async () => {
      const invalidARN =
        "arn::::aws:ec2:region:account-id:eip-allocation/allocation-id";

      const response = await shieldHandler.getProtectedAWSResourceType(
        invalidARN
      );
      expect(response).toStrictEqual({
        protectedResourceType: ShieldResource.Unknown,
        protectedResourceId: "Unknown",
      });
    });

    it("handles error", async () => {
      const mockGetEIPProtectionType = jest.fn();
      shieldHandler.getEIPProtectionType = mockGetEIPProtectionType;

      mockGetEIPProtectionType.mockRejectedValue({
        $metadata: { $requestId: "id" },
      });

      const eipARN =
        "arn:aws:ec2:region:account-id:eip-allocation/allocation-id";

      const response = await shieldHandler.getProtectedAWSResourceType(eipARN);
      expect(response).toStrictEqual({
        protectedResourceType: ShieldResource.Unknown,
        protectedResourceId: "Unknown",
      });
    });
  });

  describe("getProtectedResourceARN", () => {
    const shieldHandler = new ShieldHandler(mockCredentials, tracer, logger);

    it("gets resource ARN from shield protection", () => {
      const shieldProtectionDetails = {
        Id: "protectionId",
        ResourceArn: "resourceARN",
      };

      const response = shieldHandler.getProtectedResourceARN(
        shieldProtectionDetails
      );
      expect(response).toEqual("resourceARN");
    });

    it("throws an error if resource ARN is undefined", () => {
      const shieldProtectionDetails = {
        Id: "protectionId",
      };

      expect(() =>
        shieldHandler.getProtectedResourceARN(shieldProtectionDetails)
      ).toThrow(
        /Shield DescribeProtectionResponse protectedResourceARN is undefined/i
      );
    });
  });

  describe("getEIPProtectionType", () => {
    const shieldHandler = new ShieldHandler(mockCredentials, tracer, logger);

    const mockEC2Client = mockClient(EC2Client);

    beforeEach(() => {
      mockEC2Client.reset();
    });

    it("retrieves Elastic IP protection details for an EIP attached to an EC2 instance", async () => {
      mockEC2Client.on(DescribeAddressesCommand).resolvesOnce({
        Addresses: [{ InstanceId: "instanceId" }],
      });

      const response = await shieldHandler.getEIPProtectionType("eipId");
      expect(response).toEqual({
        protectedResourceType: ShieldResource.ElasticIP,
        protectedResourceId: "instanceId",
      });
    });

    it("retrieves Elastic IP protection details for an EIP attached to a Network Load Balancer", async () => {
      mockEC2Client.on(DescribeAddressesCommand).resolvesOnce({
        Addresses: [{ NetworkInterfaceId: "networkInterfaceId" }],
      });
      const mockGetNLBProtectionType = jest.fn();
      shieldHandler.getNLBProtectionType = mockGetNLBProtectionType;

      mockGetNLBProtectionType.mockResolvedValueOnce({
        protectedResourceType: ShieldResource.NetworkLoadBalancer,
        protectedResourceId: "loadBalancerId",
      });

      const response = await shieldHandler.getEIPProtectionType("eipId");
      expect(response).toEqual({
        protectedResourceType: ShieldResource.NetworkLoadBalancer,
        protectedResourceId: "loadBalancerId",
      });
    });

    it("returns incomplete if instanceId or NetworkInterfaceId are unavailable", async () => {
      mockEC2Client.on(DescribeAddressesCommand).resolvesOnce({
        Addresses: [{ AllocationId: "someId" }],
      });

      const response = await shieldHandler.getEIPProtectionType("eipId");
      expect(response).toEqual({
        protectedResourceType: ShieldResource.IncompleteElasticIP,
        protectedResourceId: "eipId",
      });
    });

    it("returns unknown if Addresses are empty", async () => {
      mockEC2Client.on(DescribeAddressesCommand).resolvesOnce({
        Addresses: [],
      });

      const response = await shieldHandler.getEIPProtectionType("eipId");
      expect(response).toEqual({
        protectedResourceType: ShieldResource.Unknown,
        protectedResourceId: "eipId",
      });
    });
  });

  describe("getNLBProtectionType", () => {
    const shieldHandler = new ShieldHandler(mockCredentials, tracer, logger);

    const mockEC2Client = mockClient(EC2Client);

    beforeEach(() => {
      mockEC2Client.reset();
    });

    it("returns NLB details for NetworkInterface attached to Network Load Balancer", async () => {
      mockEC2Client.on(DescribeNetworkInterfacesCommand).resolvesOnce({
        NetworkInterfaces: [
          {
            NetworkInterfaceId: "networkInterfaceId",
            InterfaceType: NetworkInterfaceType.network_load_balancer,
            Description:
              "ELB net/network-load-balancer-name/id this is my description",
          },
        ],
      });
      const ec2Client = new EC2Client();

      const response = await shieldHandler.getNLBProtectionType(
        "networkInterfaceId",
        "eipAllocationId",
        ec2Client
      );
      expect(response).toEqual({
        protectedResourceType: ShieldResource.NetworkLoadBalancer,
        protectedResourceId: "network-load-balancer-name",
      });
    });

    it("returns incomplete Elastic IP type when unable to retrieve NLB details", async () => {
      mockEC2Client.on(DescribeNetworkInterfacesCommand).resolvesOnce({
        NetworkInterfaces: [
          {
            NetworkInterfaceId: "networkInterfaceId",
            InterfaceType: NetworkInterfaceType.network_load_balancer,
          },
        ],
      });
      const ec2Client = new EC2Client();

      const response = await shieldHandler.getNLBProtectionType(
        "networkInterfaceId",
        "eipAllocationId",
        ec2Client
      );
      expect(response).toEqual({
        protectedResourceType: ShieldResource.IncompleteElasticIP,
        protectedResourceId: "eipAllocationId",
      });
    });

    it("returns incomplete Elastic IP type on invalid Network Interface description", async () => {
      mockEC2Client.on(DescribeNetworkInterfacesCommand).resolvesOnce({
        NetworkInterfaces: [
          {
            NetworkInterfaceId: "networkInterfaceId",
            InterfaceType: NetworkInterfaceType.network_load_balancer,
            Description: "This is my invalid description.",
          },
        ],
      });
      const ec2Client = new EC2Client();

      const response = await shieldHandler.getNLBProtectionType(
        "networkInterfaceId",
        "eipAllocationId",
        ec2Client
      );
      expect(response).toEqual({
        protectedResourceType: ShieldResource.IncompleteElasticIP,
        protectedResourceId: "eipAllocationId",
      });
    });

    it("returns incomplete Elastic IP type when no Network Interfaces are available", async () => {
      mockEC2Client.on(DescribeNetworkInterfacesCommand).resolvesOnce({
        NetworkInterfaces: [],
      });
      const ec2Client = new EC2Client();

      const response = await shieldHandler.getNLBProtectionType(
        "networkInterfaceId",
        "eipAllocationId",
        ec2Client
      );
      expect(response).toEqual({
        protectedResourceType: ShieldResource.IncompleteElasticIP,
        protectedResourceId: "eipAllocationId",
      });
    });
  });

  describe("associateHealthCheck", () => {
    const shieldHandler = new ShieldHandler(mockCredentials, tracer, logger);

    it("associates health check with shield protection", async () => {
      shieldClientMock.on(AssociateHealthCheckCommand).resolvesOnce({});

      expect(
        async () =>
          await shieldHandler.associateHealthCheck(
            "protectionId",
            "healthCheckId"
          )
      ).not.toThrow();
    });

    it("throws an error if associateHealthCheck fails", async () => {
      shieldClientMock.on(AssociateHealthCheckCommand).rejectsOnce({});

      await expect(async () =>
        shieldHandler.associateHealthCheck("protectionId", "healthCheckId")
      ).rejects.toThrow();
    });
  });

  describe("publishShieldTopicMessage", () => {
    const shieldHandler = new ShieldHandler(mockCredentials, tracer, logger);

    const snsClientMock = mockClient(SNSClient);

    beforeEach(() => {
      snsClientMock.reset();
    });

    it("publishes a message to the shield topic", async () => {
      snsClientMock.on(PublishCommand).resolvesOnce({});

      expect(
        async () =>
          await shieldHandler.publishShieldTopicMessage("subject", "message")
      ).not.toThrow();
    });

    it("does not throw an error when SNS client throws an error", async () => {
      snsClientMock
        .on(PublishCommand)
        .rejectsOnce({ $metadata: { requestId: "id" } });

      expect(
        async () =>
          await shieldHandler.publishShieldTopicMessage("subject", "message")
      ).not.toThrow();
    });
  });
});
