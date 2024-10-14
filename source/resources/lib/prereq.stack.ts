// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  App,
  CfnMapping,
  CfnParameter,
  CustomResource,
  Duration,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Provider } from "aws-cdk-lib/custom-resources";
import {
  CfnPolicy,
  Effect,
  Policy,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import { CfnFunction, Code, Function, Tracing } from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import manifest from "./solution_manifest.json";
import { LAMBDA_RUNTIME_NODE, LOG_LEVEL } from "./common/exports";
import { Layer } from "./common/lambda-layer.construct";

/**
 * @description
 * This is Pre-Req Stack for Automations for AWS Firewall Manager
 * The stack should be deployed in Organization management account
 * @author aws-solutions
 */
export class PreReqStack extends Stack {
  readonly account: string;
  readonly region: string;

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
          SendAnonymizedMetric: manifest.solution.sendMetric,
          MetricsEndpoint: manifest.solution.metricsEndpoint, // aws-solutions metrics endpoint
        },
        Solution: {
          SolutionId: manifest.solution.secondarySolutionId,
          SolutionName: manifest.solution.name,
          SolutionVersion: manifest.solution.solutionVersion,
          GlobalStackSetName: manifest.prereqStack.globalStackSetName,
          RegionalStackSetName: manifest.prereqStack.regionalStackSetName,
          UserAgentPrefix: manifest.solution.userAgentPrefix,
        },
      },
    });

    //=============================================================================================
    // Resources
    //=============================================================================================
    /**
     * @description utility layer for common microservice code
     */
    const utilsLayer = new Layer(
      this,
      "AFM-UtilsLayer",
      `${path.dirname(__dirname)}/../services/utilsLayer/dist/utilsLayer.zip`
    );

    /**
     * @description lambda backed custom resource to validate and install pre-reqs
     * @type {Function}
     */
    const helperFunction: Function = new Function(this, "FMSHelperFunction", {
      description: "DO NOT DELETE - FMS helper function",
      runtime: LAMBDA_RUNTIME_NODE,
      layers: [utilsLayer.layer],
      code: Code.fromAsset(
        `${path.dirname(__dirname)}/../services/helper/dist/helperFunction.zip`
      ),
      handler: "index.handler",
      memorySize: 128,
      timeout: Duration.seconds(30),
      environment: {
        METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
        SEND_METRIC: map.findInMap("Metric", "SendAnonymizedMetric"),
        LOG_LEVEL: LOG_LEVEL.INFO, //change as needed
        USER_AGENT_PREFIX: map.findInMap("Solution", "UserAgentPrefix"),
        SOLUTION_NAME: map.findInMap("Solution", "SolutionName"),
        SOLUTION_VERSION: map.findInMap("Solution", "SolutionVersion"),
        SOLUTION_ID: map.findInMap("Solution", "SolutionId"),
        SERVICE_NAME: map.findInMap("Solution", "SolutionName"),
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
     * @description lambda backed custom resource to validate and install pre-reqs
     * @type {Function}
     */
    const preReqManager: Function = new Function(
      this,
      "PreReqManagerFunction",
      {
        description:
          "Function to validate and install pre-requisites for the FMS solution",
        runtime: LAMBDA_RUNTIME_NODE,
        layers: [utilsLayer.layer],
        code: Code.fromAsset(
          `${path.dirname(
            __dirname
          )}/../services/preReqManager/dist/preReqManager.zip`
        ),
        handler: "index.handler",
        memorySize: 256,
        timeout: Duration.seconds(300),
        tracing: Tracing.ACTIVE,
        environment: {
          METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
          SEND_METRIC: map.findInMap("Metric", "SendAnonymizedMetric"),
          LOG_LEVEL: LOG_LEVEL.INFO, //change as needed
          USER_AGENT_PREFIX: map.findInMap("Solution", "UserAgentPrefix"),
          PARTITION: stack.partition,
          SERVICE_NAME: map.findInMap("Solution", "SolutionName"),
        },
      }
    );

    if (!preReqManager.role) throw new Error("no pre req lambda role found");
    const preReqManagerPolicy: Policy = new Policy(
      this,
      "PreReqManagerPolicy",
      {
        policyName: manifest.prereqStack.prereqPolicy,
        roles: [preReqManager.role],
      }
    );

    const cfnStackInstanceStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "CloudFormationWrite",
      actions: [
        "cloudformation:CreateStackInstances",
        "cloudformation:DeleteStackInstances",
      ],
      resources: [
        `arn:${stack.partition}:cloudformation:*:*:*/${map.findInMap(
          "Solution",
          "GlobalStackSetName"
        )}:*`,
        `arn:${stack.partition}:cloudformation:*:*:*/${map.findInMap(
          "Solution",
          "RegionalStackSetName"
        )}:*`,
        `arn:${stack.partition}:cloudformation:*::type/resource/AWS-IAM-Role`,
        `arn:${stack.partition}:cloudformation:*::type/resource/AWS-SNS-Topic`,
        `arn:${stack.partition}:cloudformation:*::type/resource/AWS-S3-Bucket`,
        `arn:${stack.partition}:cloudformation:*::type/resource/AWS-SNS-TopicPolicy`,
        `arn:${stack.partition}:cloudformation:*::type/resource/AWS-SNS-Subscription`,
        `arn:${stack.partition}:cloudformation:*::type/resource/AWS-S3-BucketPolicy`,
        `arn:${stack.partition}:cloudformation:*::type/resource/AWS-Config-ConfigurationRecorder`,
        `arn:${stack.partition}:cloudformation:*::type/resource/AWS-Config-DeliveryChannel`,
      ],
    });
    preReqManagerPolicy.addStatements(cfnStackInstanceStatement);

    const cfnGetOrgAdminRole = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "GetOrgAdminRole",
      actions: ["iam:GetRole"],
      resources: [
        `arn:${stack.partition}:iam::${this.account}:role/aws-service-role/stacksets.cloudformation.amazonaws.com/AWSServiceRoleForCloudFormationStackSetsOrgAdmin`,
      ],
    });
    preReqManagerPolicy.addStatements(cfnGetOrgAdminRole);

    const fmsStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "FMSAdmin",
      actions: ["fms:GetAdminAccount", "fms:AssociateAdminAccount"],
      resources: ["*"],
    });
    preReqManagerPolicy.addStatements(fmsStatement);

    const orgReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "OrganizationsRead",
      actions: [
        "organizations:ListRoots",
        "organizations:DescribeOrganization",
        "organizations:DescribeAccount",
      ],
      resources: ["*"],
    });
    preReqManagerPolicy.addStatements(orgReadStatement);

    const orgWriteStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "OrganizationsWrite",
      actions: [
        "organizations:EnableAWSServiceAccess",
        "organizations:RegisterDelegatedAdministrator",
      ],
      resources: ["*"],
    });
    preReqManagerPolicy.addStatements(orgWriteStatement);

    const preReqRead0: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "PreReqRead0",
      actions: ["ec2:DescribeRegions"],
      resources: ["*"],
    });
    preReqManagerPolicy.addStatements(preReqRead0);

    const preReqWrite0: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "PreReqWrite0",
      actions: [
        "iam:CreateServiceLinkedRole",
        "cloudformation:CreateStackSet",
        "ram:EnableSharingWithAwsOrganization",
        "cloudformation:ActivateOrganizationsAccess",
      ],
      resources: ["*"],
    });
    preReqManagerPolicy.addStatements(preReqWrite0);

    const xrayStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "XRayWriteAccess",
      actions: [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
        "xray:GetSamplingRules",
        "xray:GetSamplingTargets",
        "xray:GetSamplingStatisticSummaries",
      ],
      resources: ["*"],
    });
    preReqManagerPolicy.addStatements(xrayStatement);

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

    const cfnPrereqManagerDefaultPolicy = preReqManager.role?.node.findChild(
      "DefaultPolicy"
    ).node.defaultChild as CfnPolicy;
    cfnPrereqManagerDefaultPolicy.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W12",
            reason: "Resource * is required for xray permissions",
          },
        ],
      },
    };

    const prRole = preReqManagerPolicy.node.findChild("Resource") as CfnPolicy;
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
  }
}
