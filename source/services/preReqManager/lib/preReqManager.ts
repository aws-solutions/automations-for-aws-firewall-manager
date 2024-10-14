// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { DescribeRegionsCommand, EC2Client } from "@aws-sdk/client-ec2";
import {
  DescribeOrganizationCommand,
  EnableAWSServiceAccessCommand,
  ListRootsCommand,
  ListRootsCommandOutput,
  OrganizationFeatureSet,
  OrganizationsClient,
} from "@aws-sdk/client-organizations";
import {
  ActivateOrganizationsAccessCommand,
  Capability,
  CloudFormationClient,
  CreateStackInstancesCommand,
  CreateStackSetCommand,
  DeleteStackInstancesCommand,
  PermissionModels,
} from "@aws-sdk/client-cloudformation";
import enableConfigTemplate from "./enableConfig.json";
import { logger, tracer } from "solutions-utils";
import { customUserAgent } from "./exports";
import {
  EnableSharingWithAwsOrganizationCommand,
  RAMClient,
} from "@aws-sdk/client-ram";

export interface IPreReq {
  /**
   * @description AccountId where the function is deployed
   */
  accountId: string;
  /**
   * @description Deployment region for the stack
   */
  region: string;
  /**
   * @description Deployment dataplane for the stack
   */
  dataplane: string;
  /**
   * @description Name of stack set to enable config for global resources
   */
  globalStackSetName: string;
  /**
   * @description Name of stack set to enable config for regional resources
   */
  regionalStackSetName: string;
}

/**
 * @description
 * The pre-requisite manager class has methods to support pre-req checks
 */

export class PreReqManager {
  readonly accountId: string;
  readonly region: string;
  readonly globalStackSetName: string;
  readonly regionalStackSetName: string;
  readonly organizationsClient: OrganizationsClient;
  readonly cloudFormationClient: CloudFormationClient;
  readonly dataplane: string;

  /**
   * @constructor
   * @param {IPreReq} props
   */
  constructor(props: IPreReq) {
    this.accountId = props.accountId;
    this.region = props.region;
    this.globalStackSetName = props.globalStackSetName;
    this.regionalStackSetName = props.regionalStackSetName;
    this.dataplane = props.dataplane;

    this.organizationsClient = tracer.captureAWSv3Client(
      new OrganizationsClient({
        region: this.dataplane,
        customUserAgent: customUserAgent,
        maxAttempts: 12,
      })
    );

    this.cloudFormationClient = tracer.captureAWSv3Client(
      new CloudFormationClient({
        customUserAgent: customUserAgent,
      })
    );
  }

  /**
   * @description returns regions list
   * @returns
   */
  getRegions = async (): Promise<string[]> => {
    const ec2 = tracer.captureAWSv3Client(
      new EC2Client({
        customUserAgent: customUserAgent,
      })
    );
    const _r = await ec2.send(
      new DescribeRegionsCommand({ AllRegions: false })
    );

    if (!_r.Regions || _r.Regions.length === 0) {
      logger.error("failed to describe EC2 regions", {
        requestId: _r.$metadata?.requestId,
      });
      throw new Error("failed to describe regions");
    }

    const regions = _r.Regions.filter((region) => {
      return region.RegionName !== "ap-northeast-3";
    }).map((region) => {
      return region.RegionName as string;
    });

    logger.debug("fetched EC2 regions", {
      regions: regions,
    });

    return regions;
  };

  /**
   * @description enable trusted access for aws services
   */
  enableTrustedAccess = async (): Promise<void> => {
    try {
      // enable trusted access for fms
      await this.organizationsClient.send(
        new EnableAWSServiceAccessCommand({
          ServicePrincipal: "fms.amazonaws.com",
        })
      );

      // enable trusted access for stack sets
      await this.cloudFormationClient.send(
        new ActivateOrganizationsAccessCommand({})
      );

      // enable trusted access for resource access manager
      await this.organizationsClient.send(
        new EnableAWSServiceAccessCommand({
          ServicePrincipal: "ram.amazonaws.com",
        })
      );

      const ram = tracer.captureAWSv3Client(
        new RAMClient({
          region: this.dataplane,
          customUserAgent: customUserAgent,
          maxAttempts: 3,
        })
      );
      await ram.send(new EnableSharingWithAwsOrganizationCommand({}));

      logger.info(
        "enabled trusted access for Organization services that are needed by the solution (FMS, RAM, StackSets)"
      );
    } catch (e) {
      logger.error("encountered error enabling trusted access", {
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error(e.message);
    }
  };

  /**
   * @description throw error if the current account is not the organization management account
   */
  throwIfNotOrgManagementAccount = async (): Promise<void> => {
    let response;
    try {
      response = await this.organizationsClient.send(
        new DescribeOrganizationCommand({})
      );
      logger.debug("described organization", {
        organizationId: response.Organization?.Id,
      });
    } catch (e) {
      logger.error("encountered error describing organization", {
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error(e.message);
    }

    if (
      response.Organization &&
      response.Organization.MasterAccountId !== this.accountId
    ) {
      const _m =
        "The template must be deployed in Organization Management account";
      logger.error(_m, {
        currentAccount: this.accountId,
        managementAccountId: response.Organization.MasterAccountId,
      });
      throw new Error(_m);
    }

    logger.info("validated organization management account", {
      organizationId: response.Organization?.Id,
      organizationManagementAccount: response.Organization?.MasterAccountId,
    });
  };

  /**
   * @description throw error unless the organization full features is enabled
   */
  throwIfOrgLacksFullFeatures = async (): Promise<void> => {
    let response;
    try {
      response = await this.organizationsClient.send(
        new DescribeOrganizationCommand({})
      );
      logger.debug("described organization", {
        organizationId: response.Organization?.Id,
      });
    } catch (e) {
      logger.error("encountered error describing organization", {
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error(`${e.message}`);
    }

    if (
      response.Organization &&
      response.Organization.FeatureSet !== OrganizationFeatureSet.ALL
    ) {
      const _m = "Organization must be set with all-features";
      logger.error(_m, {
        organizationId: response.Organization.Id,
        organizationFeatureSet: response.Organization.FeatureSet,
      });
      throw new Error(_m);
    }

    logger.info("validated organization all-features", {
      organizationId: response.Organization?.Id,
      organizationFeatureSet: response.Organization?.FeatureSet,
    });
  };

  /**
   * @description enable Config in all accounts
   */
  enableConfig = async (): Promise<void> => {
    const cloudformation = tracer.captureAWSv3Client(
      new CloudFormationClient({
        customUserAgent: customUserAgent,
      })
    );
    const params = {
      StackSetName: "NOP",
      AutoDeployment: {
        Enabled: true,
        RetainStacksOnAccountRemoval: false,
      },
      Capabilities: [
        Capability.CAPABILITY_IAM,
        Capability.CAPABILITY_NAMED_IAM,
      ],
      Description: "stack set to enable Config in all member accounts",
      Parameters: [
        {
          ParameterKey: "AllSupported",
          ParameterValue: "false",
        },
        {
          ParameterKey: "DeliveryChannelName",
          ParameterValue: "<Generated>",
        },
        {
          ParameterKey: "Frequency",
          ParameterValue: "24hours",
        },
        {
          ParameterKey: "IncludeGlobalResourceTypes",
          ParameterValue: "false",
        },
        {
          ParameterKey: "NotificationEmail",
          ParameterValue: "<None>",
        },
        {
          ParameterKey: "TopicArn",
          ParameterValue: "<New Topic>",
        },
      ],
      PermissionModel: PermissionModels.SERVICE_MANAGED,
      TemplateBody: JSON.stringify(enableConfigTemplate),
    };
    try {
      // global stack set
      params.StackSetName = this.globalStackSetName;
      const globalParams = params;
      globalParams.Parameters.push({
        ParameterKey: "ResourceTypes",
        ParameterValue:
          "AWS::CloudFront::Distribution,AWS::EC2::SecurityGroup,AWS::EC2::Instance,AWS::EC2::NetworkInterface,AWS::EC2::EIP,AWS::ElasticLoadBalancing::LoadBalancer,AWS::ElasticLoadBalancingV2::LoadBalancer,AWS::ApiGateway::Stage,AWS::WAFRegional::WebACL,AWS::WAF::WebACL,AWS::WAFv2::WebACL,AWS::Shield::Protection,AWS::ShieldRegional::Protection",
      });
      await cloudformation
        .send(new CreateStackSetCommand(globalParams))
        .then(() => {
          logger.info("created global stack set", {
            stackSetName: params.StackSetName,
          });
        })
        .catch(
          (e: {
            name: string;
            message: string | undefined;
            $metadata: any;
          }) => {
            if (e.name === "NameAlreadyExistsException") {
              logger.warn(
                `global stack set ${params.StackSetName} already exists`,
                {
                  stackSetName: params.StackSetName,
                  requestId: e.$metadata?.requestId,
                }
              );
            } else throw new Error(e.message);
          }
        );

      // regional stack set params
      params.StackSetName = this.regionalStackSetName;
      const regionalParams = params;
      regionalParams.Parameters.push({
        ParameterKey: "ResourceTypes",
        ParameterValue:
          "AWS::EC2::SecurityGroup,AWS::EC2::Instance,AWS::EC2::NetworkInterface,AWS::EC2::EIP,AWS::ElasticLoadBalancing::LoadBalancer,AWS::ElasticLoadBalancingV2::LoadBalancer,AWS::ApiGateway::Stage,AWS::ShieldRegional::Protection,AWS::WAFRegional::WebACL,AWS::WAFv2::WebACL,AWS::EC2::VPC",
      });
      await cloudformation
        .send(new CreateStackSetCommand(regionalParams))
        .then(() => {
          logger.info("created regional stack set", {
            stackSetName: params.StackSetName,
            regionalParams: regionalParams,
          });
        })
        .catch((e: { name: string; message: string | undefined }) => {
          if (e.name === "NameAlreadyExistsException") {
            logger.warn(
              `regional stack set ${params.StackSetName} already exists`,
              {
                stackSetName: params.StackSetName,
                regionalParams: regionalParams,
              }
            );
          } else throw new Error(e.message);
        });

      const roots = await this.getOrgRoot();

      logger.debug("retrieved Organization root list", {
        organizationRoots: roots,
      });

      // create stack instances for global resources
      const createGlobalInstancesResp = await cloudformation.send(
        new CreateStackInstancesCommand({
          Regions: [this.dataplane],
          StackSetName: this.globalStackSetName,
          DeploymentTargets: {
            OrganizationalUnitIds: roots,
          },
          OperationPreferences: {
            FailureTolerancePercentage: 100,
            MaxConcurrentPercentage: 25,
          },
        })
      );

      // create stack instances for regional resources
      const regions = (await this.getRegions()).filter((region) => {
        return region !== this.dataplane;
      });
      const createRegionalInstancesResp = await cloudformation.send(
        new CreateStackInstancesCommand({
          Regions: regions,
          StackSetName: this.regionalStackSetName,
          DeploymentTargets: {
            OrganizationalUnitIds: roots,
          },
          OperationPreferences: {
            FailureTolerancePercentage: 100,
            MaxConcurrentPercentage: 25,
          },
        })
      );
      logger.info("initiated Config stack set creation", {
        globalInstancesOperationId: createGlobalInstancesResp.OperationId,
        regionalInstancesOperationId: createRegionalInstancesResp.OperationId,
      });
    } catch (e) {
      logger.error(
        "encountered error creating stack set instances for enabling config",
        {
          error: e,
          requestId: e.$metadata?.requestId,
        }
      );
      throw new Error("failed to create stack set instances");
    }
  };

  /**
   * @description delete global and regional stack instances
   */
  deleteConfig = async (): Promise<void> => {
    const cloudformation = tracer.captureAWSv3Client(
      new CloudFormationClient({
        customUserAgent: customUserAgent,
      })
    );
    try {
      const roots = await this.getOrgRoot();

      // delete global stack set instances
      await cloudformation
        .send(
          new DeleteStackInstancesCommand({
            StackSetName: this.globalStackSetName,
            Regions: [this.dataplane],
            RetainStacks: false,
            DeploymentTargets: {
              OrganizationalUnitIds: roots,
            },
            OperationPreferences: {
              FailureTolerancePercentage: 100,
              MaxConcurrentPercentage: 25,
            },
          })
        )
        .then(() => {
          logger.info("initiated delete on global stack set instances", {
            globalStackSetName: this.globalStackSetName,
          });
        })
        .catch((e) => {
          logger.warn("failed to delete global stack set", {
            error: e,
            globalStackSetName: this.globalStackSetName,
            requestId: e.$metadata?.requestId,
          });
        });

      // delete regional stack set instances
      const regions = (await this.getRegions()).filter((region) => {
        return region !== this.dataplane;
      });
      await cloudformation
        .send(
          new DeleteStackInstancesCommand({
            StackSetName: this.regionalStackSetName,
            Regions: regions,
            RetainStacks: false,
            DeploymentTargets: {
              OrganizationalUnitIds: roots,
            },
            OperationPreferences: {
              FailureTolerancePercentage: 100,
              MaxConcurrentPercentage: 25,
            },
          })
        )
        .then(() => {
          logger.info("initiated delete on regional stack set instances", {
            regionalStackSetName: this.regionalStackSetName,
          });
        })
        .catch((e) => {
          logger.warn("failed to delete regional stack set", {
            error: e,
            regionalStackSetName: this.regionalStackSetName,
            requestId: e.$metadata?.requestId,
          });
        });
      logger.info("initiated delete on Config stack set instances", {
        globalStackSetName: this.globalStackSetName,
        regionalStackSetName: this.regionalStackSetName,
      });
    } catch (e) {
      logger.error("encountered error deleting config stack set instances", {
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error("failed to delete stack set instances");
    }
  };

  /**
   * @description get Organization root
   */
  private async getOrgRoot() {
    try {
      const _ro: ListRootsCommandOutput = await this.organizationsClient.send(
        new ListRootsCommand({})
      );

      if (!_ro || !_ro.Roots) {
        const _m = "error fetching organization details";
        logger.error("unable to retrieve organization details", {
          requestId: _ro.$metadata?.requestId,
        });
        throw new Error(_m);
      }

      const roots = _ro.Roots.map((root) => {
        return root.Id as string;
      });

      logger.debug("retrieved organization roots", {
        roots: roots,
      });

      return roots;
    } catch (e) {
      logger.error("encountered error getting organization root", {
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error(e);
    }
  }
}
