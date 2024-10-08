// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  CfnCondition,
  CfnMapping,
  CfnParameter,
  CustomResource,
  Duration,
  Fn,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import manifest from "../solution_manifest.json";
import {
  CfnPolicy,
  CfnRole,
  Effect,
  ManagedPolicy,
  Policy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { CfnDRTAccess, CfnProactiveEngagement } from "aws-cdk-lib/aws-shield";
import { Code, Function, CfnFunction } from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import { LAMBDA_RUNTIME_NODE, LOG_LEVEL } from "../common/exports";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Layer } from "../common/lambda-layer.construct";

/**
 * @description
 * This is Proactive Event Response stack for Automations for AWS Firewall Manager
 * The stack should be deployed as a service-managed StackSet in Organization's management account
 * or delegated admin account. Only accounts with Shield Advanced AND business/enterprise support plan
 * should be targeted for deployment. Stack enables Proactive Engagement & (optionally) SRT access.
 * @author @aws-solutions
 */

export class ProactiveEventResponseStack extends Stack {
  /**
   * stack deployment aws account
   */
  readonly account: string;
  /**
   * stack deployment aws region
   */
  readonly region: string;

  /**
   * @constructor
   * @param {Construct} scope - parent of the construct
   * @param {string} id - identifier for the object
   */
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const stack = Stack.of(this);

    this.account = stack.account; // Returns the AWS::AccountId for this stack (or the literal value if known)
    this.region = stack.region; // Returns the AWS::Region for this stack (or the literal value if known)

    //=============================================================================================
    // Parameters
    //=============================================================================================
    const enableSRTParam: CfnParameter = new CfnParameter(this, "EnableSRT", {
      type: "String",
      description:
        "Option to grant SRT access to accounts where this stack is deployed. " +
        "This allows the SRT to make AWS Shield Advanced and AWS WAF API calls on your behalf and to access your AWS WAF logs.",
      allowedValues: ["Yes", "No"],
      default: "No",
    });

    const emergencyContactPhone: CfnParameter = new CfnParameter(
      this,
      "EmergencyContactPhone",
      {
        type: "String",
        description:
          "Emergency Contact Phone Number for Proactive Engagement in E.164 format, e.g. +11111111111. Additional contacts can be added later in the AWS Shield console.",
        allowedPattern: "^\\+[1-9]\\d{1,14}$",
        constraintDescription:
          "Emergency Contact Phone number is invalid. Please ensure it is in E.164 format, e.g. +11111111111",
        maxLength: 16,
        minLength: 1,
      }
    );

    const emergencyContactEmail: CfnParameter = new CfnParameter(
      this,
      "EmergencyContactEmail",
      {
        type: "String",
        description:
          "Emergency Contact Email Address for Proactive Engagement. Additional contacts can be added later in the AWS Shield console.",
        allowedPattern: "^\\S+@\\S+\\.\\S+$",
        constraintDescription:
          "Emergency Contact Email is invalid. Please ensure it is of the form example@example.com",
        maxLength: 150,
        minLength: 1,
      }
    );

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: {
              default: "Proactive Engagement Configuration",
            },
            Parameters: [
              emergencyContactPhone.logicalId,
              emergencyContactEmail.logicalId,
            ],
          },
          {
            Label: {
              default:
                "Do you want to grant Shield Response Team (SRT) access?",
            },
            Parameters: [enableSRTParam.logicalId],
          },
        ],
        ParameterLabels: {
          [emergencyContactPhone.logicalId]: {
            default: "Emergency Contact Phone Number",
          },
          [emergencyContactEmail.logicalId]: {
            default: "Emergency Contact Email Address",
          },
          [enableSRTParam.logicalId]: {
            default: "Grant SRT (Shield Response Team) Account Access",
          },
        },
      },
    };
    this.templateOptions.description = `(${manifest.solution.proactiveEventResponseSolutionId}) - The AWS CloudFormation template for deployment of the ${manifest.solution.name}. Version ${manifest.solution.solutionVersion}`;
    this.templateOptions.templateFormatVersion =
      manifest.solution.templateVersion;
    //=============================================================================================
    // Map
    //=============================================================================================
    const map = new CfnMapping(this, "ProactiveEventResponseStackMap", {
      mapping: {
        Metric: {
          SendAnonymizedMetric: manifest.solution.sendMetric,
          MetricsEndpoint: manifest.solution.metricsEndpoint, // aws-solutions metrics endpoint
        },
        Solution: {
          SolutionId: manifest.solution.proactiveEventResponseSolutionId,
          SolutionName: manifest.solution.name,
          SolutionVersion: manifest.solution.solutionVersion,
          UserAgentPrefix: manifest.solution.userAgentPrefix,
        },
      },
    });

    //=============================================================================================
    // Condition
    //=============================================================================================
    const enableSRTCheck: CfnCondition = new CfnCondition(
      this,
      "enableSRTCheck",
      {
        expression: Fn.conditionEquals(enableSRTParam.valueAsString, "Yes"),
      }
    );

    //=============================================================================================
    // Resources
    //=============================================================================================
    /**
     * @description utility layer for common microservice code
     */
    const utilsLayer = new Layer(
      this,
      "AFM-UtilsLayer",
      `${path.dirname(
        __dirname
      )}../../../services/utilsLayer/dist/utilsLayer.zip`
    );

    /**
     * @description lambda backed custom resource to send metrics & validate pre-reqs
     * @type {Function}
     */
    const helperFunction: Function = new Function(
      this,
      "ProactiveEventResponseHelper",
      {
        description: `${map.findInMap(
          "Solution",
          "SolutionId"
        )} - Function to help with Proactive Event Response installation (DO NOT DELETE)`,
        runtime: LAMBDA_RUNTIME_NODE,
        layers: [utilsLayer.layer],
        code: Code.fromAsset(
          `${path.dirname(
            __dirname
          )}../../../services/helper/dist/helperFunction.zip`
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
      }
    );

    /**
     * @description iam permissions for the helper lambda function
     * @type {Policy}
     */
    const helperPolicy: Policy = new Policy(this, "HelperPolicy", {
      policyName: manifest.proactiveEventResponseStack.helperPolicy,
      roles: [helperFunction.role!],
    });

    const helperShieldReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "ShieldRead",
      actions: ["shield:GetSubscriptionState"],
      resources: ["*"],
    });
    helperPolicy.addStatements(helperShieldReadStatement);

    const helperSupportReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "SupportRead",
      actions: ["support:DescribeSeverityLevels"],
      resources: ["*"],
    });
    helperPolicy.addStatements(helperSupportReadStatement);

    /**
     * @description custom resource for helper function
     * @type {Provider}
     */
    const helperProvider: Provider = new Provider(this, "HelperProvider", {
      onEventHandler: helperFunction,
    });

    /**
     * Check deployment account is subscribed to Shield Advanced
     */
    new CustomResource(this, "ShieldSubscriptionCheck", {
      resourceType: "Custom::ShieldSubscriptionCheck",
      serviceToken: helperProvider.serviceToken,
      properties: {
        Stack: "ProactiveEventResponseStack",
        Account: this.account,
        Region: this.region,
      },
    });

    /**
     * Check deployment account is subscribed to Support Plan
     */
    new CustomResource(this, "SupportPlanCheck", {
      resourceType: "Custom::SupportPlanCheck",
      serviceToken: helperProvider.serviceToken,
      properties: {
        Stack: "ProactiveEventResponseStack",
        Account: this.account,
        Region: this.region,
      },
    });

    /**
     * @description Configures Proactive Engagement feature of Shield Advanced
     * @type {CfnProactiveEngagement}
     */
    new CfnProactiveEngagement(this, "ShieldProactiveEngagement", {
      emergencyContactList: [
        {
          emailAddress: emergencyContactEmail.valueAsString,
          phoneNumber: emergencyContactPhone.valueAsString,
        },
      ],
      proactiveEngagementStatus: "ENABLED",
    });

    /**
     * @description IAM role for granting SRT access
     * @type {Role}
     */
    const srtRole: Role = new Role(this, "srtRole", {
      assumedBy: new ServicePrincipal("drt.shield.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          manifest.proactiveEventResponseStack.srtAccessManagedPolicy
        ),
      ],
    });
    const cfnSRTRole: CfnRole = srtRole.node.findChild("Resource") as CfnRole;
    cfnSRTRole.cfnOptions.condition = enableSRTCheck;

    /**
     * @description Configures access to customer's account for SRT
     * @type {CfnDRTAccess}
     */
    const shieldGrantSRTAccess: CfnDRTAccess = new CfnDRTAccess(
      this,
      "ShieldGrantSRTAccess",
      {
        roleArn: srtRole.roleArn,
      }
    );
    shieldGrantSRTAccess.cfnOptions.condition = enableSRTCheck;
    shieldGrantSRTAccess.addDependency(cfnSRTRole);

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

    const cfnHelperFunction = helperFunction.node.findChild(
      "Resource"
    ) as CfnFunction;
    cfnHelperFunction.cfnOptions.metadata = {
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

    const cfnHelperProvider = helperProvider.node.children[0].node.findChild(
      "Resource"
    ) as CfnFunction;
    cfnHelperProvider.cfnOptions.metadata = {
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

    const cfnHelperPolicy = helperPolicy.node.defaultChild as CfnPolicy;
    cfnHelperPolicy.cfnOptions.metadata = {
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
  }
}
