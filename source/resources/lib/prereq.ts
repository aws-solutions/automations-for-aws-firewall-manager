// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  Stack,
  App,
  StackProps,
  CfnParameter,
  CustomResource,
  CfnMapping,
  CfnOutput,
  Duration,
} from "@aws-cdk/core";
import { Provider } from "@aws-cdk/custom-resources";
import { Policy, Effect, PolicyStatement, CfnPolicy } from "@aws-cdk/aws-iam";
import { Code, Runtime, Function, CfnFunction } from "@aws-cdk/aws-lambda";
import * as path from "path";
import manifest from "./solution_manifest.json";
import { LOG_LEVEL } from "./exports";

/**
 * @description
 * This is Pre-Req Stack for Automations for AWS Firewall Manager
 * The stack should be deployed in Organization management account
 * @author aws-solutions
 */
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
    this.templateOptions.description = `(${manifest.solution.secondarySolutionId}) - The AWS CloudFormation template for deployment of the ${manifest.solution.name}. Version ${manifest.solution.solutionVersion}`;
    this.templateOptions.templateFormatVersion =
      manifest.solution.templateVersion;

    //=============================================================================================
    // Map
    //=============================================================================================
    const map = new CfnMapping(this, "FMSMap", {
      mapping: {
        Metric: {
          SendAnonymousMetric: manifest.solution.sendMetric,
          MetricsEndpoint: manifest.solution.metricsEndpoint, // aws-solutions metrics endpoint
        },
        Solution: {
          SolutionId: manifest.solution.secondarySolutionId,
          SolutionVersion: manifest.solution.solutionVersion,
          GlobalStackSetName: manifest.prereqStack.globalStackSetName,
          RegionalStackSetName: manifest.prereqStack.regionalStackSetName,
        },
      },
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
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset(
        `${path.dirname(__dirname)}/../services/helper/dist/helperFunction.zip`
      ),
      handler: "index.handler",
      memorySize: 128,
      timeout: Duration.seconds(5),
      environment: {
        METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
        SEND_METRIC: map.findInMap("Metric", "SendAnonymousMetric"),
        LOG_LEVEL: LOG_LEVEL.INFO, //change as needed
        CUSTOM_SDK_USER_AGENT: `AwsSolution/${map.findInMap(
          "Solution",
          "SolutionId"
        )}/${map.findInMap("Solution", "SolutionVersion")}`,
      },
    });

    /**
     * @description custom resource for helper functions
     * @type {Provider}
     */
    const helperProvider: Provider = new Provider(this, "HelperProvider", {
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
    const preReqManager: Function = new Function(
      this,
      "PreReqManagerFunction",
      {
        description:
          "Function to validate and install pre-requisites for the FMS solution",
        runtime: Runtime.NODEJS_16_X,
        code: Code.fromAsset(
          `${path.dirname(
            __dirname
          )}/../services/preReqManager/dist/preReqManager.zip`
        ),
        handler: "index.handler",
        memorySize: 256,
        timeout: Duration.seconds(15),
        environment: {
          METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
          SEND_METRIC: map.findInMap("Metric", "SendAnonymousMetric"),
          LOG_LEVEL: LOG_LEVEL.INFO, //change as needed
          CUSTOM_SDK_USER_AGENT: `AwsSolution/${map.findInMap(
            "Solution",
            "SolutionId"
          )}/${map.findInMap("Solution", "SolutionVersion")}`,
        },
      }
    );

    if (!preReqManager.role) throw new Error("no pre req lambda role found");
    const po: Policy = new Policy(this, "PreReqManagerPolicy", {
      policyName: manifest.prereqStack.prereqPolicy,
      roles: [preReqManager.role],
    });
    const po0: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "PreReqWrite01",
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
      sid: "PreReqWrite02",
      actions: [
        "fms:AssociateAdminAccount",
        "organizations:ListRoots",
        "organizations:EnableAWSServiceAccess",
        "organizations:DescribeAccount",
        "organizations:DescribeOrganization",
        "organizations:RegisterDelegatedAdministrator",
        "iam:CreateServiceLinkedRole",
        "ec2:DescribeRegions",
        "fms:GetAdminAccount",
        "cloudformation:CreateStackSet",
        "ram:EnableSharingWithAwsOrganization",
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

    new CustomResource(this, "PreReqManagerCR", {
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

    //=============================================================================================
    // cfn_nag suppress rules
    //=============================================================================================
    const cfn_nag_w89_w92 = [
      {
        id: "W89",
        reason:
          "Not a valid use case for Lambda functions to be deployed inside a VPC",
      },
      {
        id: "W92",
        reason: "Lambda ReservedConcurrentExecutions not needed",
      },
    ];
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
          ...cfn_nag_w89_w92,
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
          ...cfn_nag_w89_w92,
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
          ...cfn_nag_w89_w92,
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
          ...cfn_nag_w89_w92,
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
