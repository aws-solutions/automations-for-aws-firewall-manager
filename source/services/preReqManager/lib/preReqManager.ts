// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { DescribeRegionsCommand, EC2Client } from "@aws-sdk/client-ec2";
import {
  DescribeOrganizationCommand,
  EnableAWSServiceAccessCommand,
  ListRootsCommand,
  ListRootsCommandOutput,
  OrganizationsClient,
} from "@aws-sdk/client-organizations";
import {
  CloudFormationClient,
  CreateStackInstancesCommand,
  CreateStackSetCommand,
  DeleteStackInstancesCommand,
} from "@aws-sdk/client-cloudformation";
import enableConfigTemplate from "./enableConfig.json";
import { logger } from "./common/logger";
import { customUserAgent, dataplane } from "./exports";
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

  /**
   * @constructor
   * @param {IPreReq} props
   */
  constructor(props: IPreReq) {
    this.accountId = props.accountId;
    this.region = props.region;
    this.globalStackSetName = props.globalStackSetName;
    this.regionalStackSetName = props.regionalStackSetName;

    this.organizationsClient = new OrganizationsClient({
      region: dataplane,
      customUserAgent,
      maxAttempts: 12,
    });
  }

  /**
   * @description returns regions list
   * @returns
   */
  getRegions = async (): Promise<string[]> => {
    logger.debug({
      label: "PreRegManager/getRegions",
      message: `getting EC2 regions`,
    });
    const ec2 = new EC2Client({
      customUserAgent,
    });
    const _r = await ec2.send(
      new DescribeRegionsCommand({ AllRegions: false })
    );

    if (!_r.Regions || _r.Regions.length === 0) {
      logger.error({
        label: "PreRegManager/getRegions",
        message: `failed to describe regions`,
      });
      throw new Error("failed to describe regions");
    }

    const regions = _r.Regions.filter((region) => {
      return region.RegionName !== "ap-northeast-3";
    }).map((region) => {
      return region.RegionName as string;
    });
    logger.debug({
      label: "PreRegManager/getRegions",
      message: `fetched EC2 regions: ${regions}`,
    });
    return regions;
  };

  /**
   * @description enable trusted access for aws services
   */
  enableTrustedAccess = async (): Promise<void> => {
    logger.debug({
      label: "PreRegManager/enableTrustedAccess",
      message: `enabling trusted access for FMS, RAM and StackSets`,
    });
    try {
      // enable trusted access for fms
      await this.organizationsClient.send(
        new EnableAWSServiceAccessCommand({
          ServicePrincipal: "fms.amazonaws.com",
        })
      );

      // enable trusted access for stack sets
      await this.organizationsClient.send(
        new EnableAWSServiceAccessCommand({
          ServicePrincipal: "member.org.stacksets.cloudformation.amazonaws.com",
        })
      );

      // enable trusted access for resource access manager
      await this.organizationsClient.send(
        new EnableAWSServiceAccessCommand({
          ServicePrincipal: "ram.amazonaws.com",
        })
      );

      const ram = new RAMClient({
        region: dataplane,
        customUserAgent,
        maxAttempts: 3,
      });
      await ram.send(new EnableSharingWithAwsOrganizationCommand({}));

      logger.info({
        label: "PreRegManager/enableTrustedAccess",
        message: `trusted access was successfully enabled for Organization services that are needed by the solution (FMS, RAM & StackSets)`,
      });
    } catch (e) {
      logger.error({
        label: "PreRegManager/enableTrustedAccess",
        message: e.message,
      });
      throw new Error(e.message);
    }
  };

  /**
   * @description throw error if the current account is not the organization management account
   */
  throwIfNotOrgManagementAccount = async (): Promise<void> => {
    const loggerLabel = "PreRegManager/throwIfNotOrgManagementAccount";
    logger.debug({
      label: loggerLabel,
      message: `initiating organization management check`,
    });

    let response;
    try {
      response = await this.organizationsClient.send(
        new DescribeOrganizationCommand({})
      );
      logger.debug({
        label: loggerLabel,
        message: `organization management check: ${response}`,
      });
    } catch (e) {
      logger.error({
        label: loggerLabel,
        message: `organization management check error: ${e.message}`,
      });
      throw new Error(e.message);
    }

    if (
      response.Organization &&
      response.Organization.MasterAccountId !== this.accountId
    ) {
      const _m =
        "The template must be deployed in Organization Management account";
      logger.error({
        label: loggerLabel,
        message: `organization management check error: ${_m}`,
      });
      throw new Error(_m);
    }

    logger.info({
      label: loggerLabel,
      message: `organization management check success`,
    });
  };

  /**
   * @description throw error unless the organization full features is enabled
   */
  throwIfOrgLacksFullFeatures = async (): Promise<void> => {
    const loggerLabel = "PreRegManager/throwIfOrgLacksFullFeatures";
    logger.debug({
      label: loggerLabel,
      message: `initiating organization feature check`,
    });

    let response;
    try {
      response = await this.organizationsClient.send(
        new DescribeOrganizationCommand({})
      );
      logger.debug({
        label: loggerLabel,
        message: `organization feature check: ${JSON.stringify(response)}`,
      });
    } catch (e) {
      logger.error({
        label: loggerLabel,
        message: `organization feature check error: ${e.message}`,
      });
      throw new Error(`${e.message}`);
    }

    if (response.Organization && response.Organization.FeatureSet !== "ALL") {
      const _m = "Organization must be set with full-features";
      logger.error({
        label: loggerLabel,
        message: `organization feature check error: ${_m}`,
      });
      throw new Error(_m);
    }

    logger.info({
      label: loggerLabel,
      message: `organization feature pre-req success`,
    });
  };

  /**
   * @description enable Config in all accounts
   */
  enableConfig = async (): Promise<void> => {
    logger.debug({
      label: "PreRegManager/enableConfig",
      message: `initiating aws config check`,
    });

    const cloudformation = new CloudFormationClient({
      customUserAgent,
    });
    const params = {
      StackSetName: "NOP",
      AutoDeployment: {
        Enabled: true,
        RetainStacksOnAccountRemoval: false,
      },
      Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"],
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
      PermissionModel: "SERVICE_MANAGED",
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
          logger.info({
            label: "PreReqManager/enableConfig",
            message: `stack set created for ${params.StackSetName}`,
          });
        })
        .catch((e: { name: string; message: string | undefined }) => {
          if (e.name === "NameAlreadyExistsException") {
            logger.warn({
              label: "PreReqManager/enableConfig",
              message: `${params.StackSetName} stack set already exists`,
            });
          } else throw new Error(e.message);
        });

      // regional stack set params
      params.StackSetName = this.regionalStackSetName;
      const regionalParams = params;
      regionalParams.Parameters.push({
        ParameterKey: "ResourceTypes",
        ParameterValue:
          "AWS::EC2::SecurityGroup,AWS::EC2::Instance,AWS::EC2::NetworkInterface,AWS::EC2::EIP,AWS::ElasticLoadBalancing::LoadBalancer,AWS::ElasticLoadBalancingV2::LoadBalancer,AWS::ApiGateway::Stage,AWS::ShieldRegional::Protection,AWS::WAFRegional::WebACL,AWS::WAFv2::WebACL",
      });
      await cloudformation
        .send(new CreateStackSetCommand(regionalParams))
        .then(() => {
          logger.info({
            label: "PreReqManager/enableConfig",
            message: `regional stack set created for ${params.StackSetName}`,
          });
        })
        .catch((e: { name: string; message: string | undefined }) => {
          if (e.name === "NameAlreadyExistsException") {
            logger.warn({
              label: "PreReqManager/enableConfig",
              message: `${params.StackSetName} regional stack set already exists`,
            });
          } else throw new Error(e.message);
        });

      const roots = await this.getOrgRoot();

      logger.debug({
        label: "PreRegManager/enableConfig",
        message: `Organization root list: ${JSON.stringify(roots)}`,
      });

      // create stack instances for global resources
      await cloudformation.send(
        new CreateStackInstancesCommand({
          Regions: ["us-east-1"],
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
      const _r = (await this.getRegions()).filter((r) => {
        return r != "us-east-1";
      });
      await cloudformation.send(
        new CreateStackInstancesCommand({
          Regions: _r,
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
      logger.info({
        label: "PreRegManager/enableConfig",
        message: `Config stack set instances create initiated, please see in Config console for latest status`,
      });
    } catch (e) {
      logger.error({
        label: "PreRegManager/enableConfig",
        message: e.message,
      });
      throw new Error("failed to create stack set instances");
    }
  };

  /**
   * @description delete global and regional stack instances
   */
  deleteConfig = async (): Promise<void> => {
    const loggerLabel = "PreReqManager/deleteConfig";
    logger.debug({
      label: loggerLabel,
      message: `initiating aws config delete`,
    });
    const cloudformation = new CloudFormationClient({
      customUserAgent,
    });
    try {
      const roots = await this.getOrgRoot();

      // delete global stack set instances
      await cloudformation
        .send(
          new DeleteStackInstancesCommand({
            StackSetName: this.globalStackSetName,
            Regions: ["us-east-1"],
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
          logger.info({
            label: loggerLabel,
            message: `delete initiated on ${this.globalStackSetName} stack set instances`,
          });
        })
        .catch((e) => {
          logger.warn({
            label: "PreReqManager/deleteConfig",
            message: `delete failed on ${
              this.globalStackSetName
            } stack set instances: ${JSON.stringify(e)}`,
          });
        });

      // delete regional stack set instances
      const _r = (await this.getRegions()).filter((r) => {
        return r != "us-east-1";
      });
      await cloudformation
        .send(
          new DeleteStackInstancesCommand({
            StackSetName: this.regionalStackSetName,
            Regions: _r,
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
          logger.info({
            label: "PreReqManager/deleteConfig",
            message: `delete initiated on ${this.regionalStackSetName} stack set instances`,
          });
        })
        .catch((e) => {
          logger.warn({
            label: "PreReqManager/deleteConfig",
            message: `delete failed on ${
              this.regionalStackSetName
            } stack set instances: ${JSON.stringify(e)}`,
          });
        });
      logger.info({
        label: "PreRegManager/deleteConfig",
        message: `delete config stack set instances initiated, please see in Config console for latest status`,
      });
    } catch (e) {
      logger.warn({
        label: "PreRegManager/deleteConfig",
        message: `${JSON.stringify(e)}`,
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
      logger.debug({
        label: "PreRegManager/enableConfig",
        message: `organization root list: ${JSON.stringify(_ro)}`,
      });

      if (!_ro || !_ro.Roots) {
        const _m = "error fetching organization details";
        logger.error({
          label: "PreRegManager/enableConfig",
          message: `${_m}`,
        });
        throw new Error(_m);
      }

      const roots = _ro.Roots.map((root) => {
        return root.Id as string;
      });
      logger.debug({
        label: "PreRegManager/getOrgRoot",
        message: `organization roots: ${roots}`,
      });
      return roots;
    } catch (e) {
      logger.error({
        label: "PreRegManager/getOrgRoot",
        message: `error in getting Organization root: ${JSON.stringify(e)}`,
      });
      throw new Error(e);
    }
  }
}
