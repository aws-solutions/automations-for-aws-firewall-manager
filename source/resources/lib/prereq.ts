/**
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
/**
 * @description
 * This is Master Stack for AWS Centralized WAF & Security Group Automations
 * The stack should be deployed in Organization master account
 * @author @aws-solutions
 */

import {
  Stack,
  App,
  StackProps,
  CfnParameter,
  CustomResource,
  CfnMapping,
  CfnOutput,
  Duration,
  CfnCondition,
  Fn,
  NestedStack,
  CfnResource,
} from "@aws-cdk/core";
import { Provider } from "@aws-cdk/custom-resources";
import { Policy, Effect, PolicyStatement, CfnPolicy } from "@aws-cdk/aws-iam";
import { Code, Runtime, Function, CfnFunction } from "@aws-cdk/aws-lambda";
import { FMSStack } from "./fms";
import manifest from "./manifest.json";

enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

export class PreReqStack extends Stack {
  readonly account: string;
  readonly region: string;

  /**
   * @constructor
   * @param {cdk.Construct} scope - parent of the construct
   * @param {string} id - identifier for the object
   */
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);
    const stack = Stack.of(this);

    this.account = stack.account; // Returns the AWS::AccountId for this stack (or the literal value if known)
    this.region = stack.region; // Returns the AWS::Region for this stack (or the literal value if known)

    //=============================================================================================
    // Parameters
    //=============================================================================================
    const fmsAdmin = new CfnParameter(this, "FMSAdmin", {
      description: "AWS Account Id for Firewall Manager admin account",
      type: "String",
      allowedPattern: "^[0-9]{1}\\d{11}$",
    });

    const enableConfig = new CfnParameter(this, "EnableConfig", {
      description:
        "Do you want to enable AWS Config across your AWS Organization? You may chose 'No' if you are already using Config",
      type: "String",
      allowedValues: ["Yes", "No"],
      default: "Yes",
    });

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: { default: "Pre-Requisite Configuration" },
            Parameters: [fmsAdmin.logicalId, enableConfig.logicalId],
          },
        ],
        ParameterLabels: {
          [fmsAdmin.logicalId]: {
            default: "FMS Admin Account",
          },
          [enableConfig.logicalId]: {
            default: "Enable Config",
          },
        },
      },
    };
    this.templateOptions.description = `(${manifest.secondarySolutionId}) - The AWS CloudFormation template for deployment of the ${manifest.solutionName}. Version ${manifest.solutionVersion}`;
    this.templateOptions.templateFormatVersion = manifest.templateVersion;

    //=============================================================================================
    // Map
    //=============================================================================================
    const map = new CfnMapping(this, "FMSMap", {
      mapping: {
        Metric: {
          SendAnonymousMetric: manifest.sendMetric,
          MetricsEndpoint: manifest.metricsEndpoint, // aws-solutions metrics endpoint
        },
        Solution: {
          SolutionId: manifest.secondarySolutionId,
          SolutionVersion: manifest.solutionVersion,
          GlobalStackSetName: manifest.globalStackSetName,
          RegionalStackSetName: manifest.regionalStackSetName,
        },
      },
    });

    //=============================================================================================
    // Condition
    //=============================================================================================
    const accountCheck = new CfnCondition(this, "accountCheck", {
      expression: Fn.conditionEquals(fmsAdmin.valueAsString, this.account),
    });

    //=============================================================================================
    // Resources
    //=============================================================================================
    /**
     * @description lambda backed custom resource to validate and install pre-reqs
     * @type {Function}
     */
    const helperFunction: Function = new Function(this, "FMSHelperFunction", {
      description: "DO NOT DELETE - FMS helper function",
      runtime: Runtime.NODEJS_12_X,
      code: Code.fromAsset(
        "../../source/services/helper/dist/helperFunction.zip"
      ),
      handler: "index.handler",
      memorySize: 512,
      environment: {
        METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
        SEND_METRIC: map.findInMap("Metric", "SendAnonymousMetric"),
        LOG_LEVEL: LogLevel.INFO, //change as needed
      },
    });

    /**
     * @description custom resource for helper functions
     * @type {Provider}
     */
    const helperProvider: Provider = new Provider(this, "helperProvider", {
      onEventHandler: helperFunction,
    });

    /**
     * Get UUID for deployment
     */
    const uuid = new CustomResource(this, "CreateUUID", {
      resourceType: "Custom::CreateUUID",
      serviceToken: helperProvider.serviceToken,
    });

    /**
     * Send launch data to aws-solutions
     */
    new CustomResource(this, "LaunchData", {
      resourceType: "Custom::LaunchData",
      serviceToken: helperProvider.serviceToken,
      properties: {
        SolutionId: map.findInMap("Solution", "SolutionId"),
        SolutionVersion: map.findInMap("Solution", "SolutionVersion"),
        SolutionUuid: uuid.getAttString("UUID"),
        Stack: "PreReqStack",
      },
    });

    /**
     * @description lambda backed custom resource to validate and install pre-reqs
     * @type {Function}
     */
    const preReqManager: Function = new Function(this, "preReqManager", {
      description:
        "Function to validate and install pre-requisites for the FMS solution",
      runtime: Runtime.NODEJS_12_X,
      code: Code.fromAsset(
        "../../source/services/preReqManager/dist/preReqManager.zip"
      ),
      handler: "index.handler",
      memorySize: 512,
      timeout: Duration.minutes(15),
      environment: {
        METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
        SEND_METRIC: map.findInMap("Metric", "SendAnonymousMetric"),
        LOG_LEVEL: LogLevel.INFO, //change as needed
      },
    });

    if (!preReqManager.role) throw new Error("no pre req lambda role found");
    const po: Policy = new Policy(this, "preReqManagerPolicy", {
      policyName: manifest.prereqPolicy,
      roles: [preReqManager.role],
    });
    const po0: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "VisualEditor0",
      actions: [
        "cloudformation:CreateStackInstances",
        "cloudformation:DeleteStackInstances",
      ],
      resources: [
        `arn:aws:cloudformation:*:*:*/${map.findInMap(
          "Solution",
          "GlobalStackSetName"
        )}:*`,
        `arn:aws:cloudformation:*:*:*/${map.findInMap(
          "Solution",
          "RegionalStackSetName"
        )}:*`,
        `arn:aws:cloudformation:*::type/resource/AWS-IAM-Role`,
        `arn:aws:cloudformation:*::type/resource/AWS-SNS-Topic`,
        `arn:aws:cloudformation:*::type/resource/AWS-S3-Bucket`,
        `arn:aws:cloudformation:*::type/resource/AWS-SNS-TopicPolicy`,
        `arn:aws:cloudformation:*::type/resource/AWS-SNS-Subscription`,
        `arn:aws:cloudformation:*::type/resource/AWS-S3-BucketPolicy`,
        `arn:aws:cloudformation:*::type/resource/AWS-Config-ConfigurationRecorder`,
        `arn:aws:cloudformation:*::type/resource/AWS-Config-DeliveryChannel`,
      ],
    });
    const po1: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "VisualEditor1",
      actions: [
        "fms:AssociateAdminAccount",
        "organizations:ListRoots",
        "organizations:EnableAWSServiceAccess",
        "organizations:DescribeAccount",
        "organizations:DescribeOrganization",
        "ec2:DescribeRegions",
        "fms:GetAdminAccount",
        "cloudformation:CreateStackSet",
      ],
      resources: ["*"],
    });
    po.addStatements(po0);
    po.addStatements(po1);

    /**
     * @description custom resource for checking pre-requisites
     * @type {Provider}
     */
    const preReqProvider: Provider = new Provider(this, "PreReqProvider", {
      onEventHandler: preReqManager,
    });

    const prereqManager = new CustomResource(this, "PreReqManager", {
      serviceToken: preReqProvider.serviceToken,
      resourceType: "Custom::PreReqChecker",
      properties: {
        FMSAdmin: fmsAdmin.valueAsString,
        EnableConfig: enableConfig.valueAsString,
        AccountId: this.account,
        Region: this.region,
        GlobalStackSetName: map.findInMap("Solution", "GlobalStackSetName"),
        RegionalStackSetName: map.findInMap("Solution", "RegionalStackSetName"),
        SolutionId: map.findInMap("Solution", "SolutionId"),
        SolutionVersion: map.findInMap("Solution", "SolutionVersion"),
        SolutionUuid: uuid.getAttString("UUID"),
      },
    });

    /**
     * @description FMS stack
     * @type {NestedStack}
     */
    const fms: NestedStack = new FMSStack(this, "FMSStack");
    fms.nestedStackResource!.cfnOptions.condition = accountCheck;
    fms.nestedStackResource!.addDependsOn(
      prereqManager.node.defaultChild as CfnResource
    );

    //=============================================================================================
    // cfn_nag suppress rules
    //=============================================================================================
    const prRole = po.node.findChild("Resource") as CfnPolicy;
    prRole.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W12",
            reason:
              "Resource * is required for IAM actions that do not support resource level permissions",
          },
        ],
      },
    };

    const prF = preReqManager.node.findChild("Resource") as CfnFunction;
    prF.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W58",
            reason:
              "CloudWatch logs write permissions added with managed role AWSLambdaBasicExecutionRole",
          },
        ],
      },
    };

    const hF = helperFunction.node.findChild("Resource") as CfnFunction;
    hF.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W58",
            reason:
              "CloudWatch logs write permissions added with managed role AWSLambdaBasicExecutionRole",
          },
        ],
      },
    };

    const hpP = helperProvider.node.children[0].node.findChild(
      "Resource"
    ) as CfnFunction;
    hpP.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W58",
            reason:
              "CloudWatch logs write permissions added with managed role AWSLambdaBasicExecutionRole",
          },
        ],
      },
    };

    const prP = preReqProvider.node.children[0].node.findChild(
      "Resource"
    ) as CfnFunction;
    prP.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W58",
            reason:
              "CloudWatch logs write permissions added with managed role AWSLambdaBasicExecutionRole",
          },
        ],
      },
    };

    //=============================================================================================
    // Output
    //=============================================================================================
    new CfnOutput(this, "UUID", {
      description: "UUID for deployment",
      value: uuid.getAttString("UUID"),
    });
  }
}
