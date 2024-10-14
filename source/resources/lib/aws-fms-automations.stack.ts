// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * This is Firewall Manager Stack for Automations for AWS Firewall Manager
 * The stack should be deployed in Firewall Manager admin account
 * This stack creates shared resources
 * @author @aws-solutions
 */

import {
  CfnCondition,
  CfnMapping,
  CfnOutput,
  CfnParameter,
  CustomResource,
  Fn,
  NestedStack,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import {
  CfnPolicy,
  Effect,
  Policy,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import * as path from "path";
import manifest from "./solution_manifest.json";
import {
  LAMBDA_RUNTIME_NODE,
  LOG_LEVEL,
  PolicyIdentifiers,
} from "./common/exports";
import { PolicyStack } from "./nestedStacks/policy.stack";
import { ComplianceGeneratorStack } from "./nestedStacks/compliance.stack";
import { CfnFunction, Code, Function } from "aws-cdk-lib/aws-lambda";
import { Provider } from "aws-cdk-lib/custom-resources";
import {
  AttributeType,
  BillingMode,
  CfnTable,
  Table,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { Layer } from "./common/lambda-layer.construct";

export class FirewallManagerAutomationsStack extends Stack {
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
    const complianceGeneratorParam = new CfnParameter(
      this,
      "DeployComplianceGenerator",
      {
        type: "String",
        allowedValues: ["Yes", "No"],
        default: "Yes",
      }
    );

    const emailAddress = new CfnParameter(this, "EmailAddress", {
      type: "String",
      description:
        "Email address to receive notifications regarding issues creating Firewall Manager policies.",
      allowedPattern: "^(?:\\S+@\\S+\\.\\S+)?$",
      default: "",
      constraintDescription:
        "Email Address is invalid. Please ensure it is of the form example@example.com",
      maxLength: 150,
    });

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: {
              default:
                "Do you want to generate compliance reports for your FMS policies?",
            },
            Parameters: [complianceGeneratorParam.logicalId],
          },
          {
            Label: {
              default: "Do you want to receive error notifications by email?",
            },
            Parameters: [emailAddress.logicalId],
          },
        ],
        ParameterLabels: {
          [complianceGeneratorParam.logicalId]: {
            default: "Compliance Reporting",
          },
          [emailAddress.logicalId]: {
            default: "Email Address",
          },
        },
      },
    };
    this.templateOptions.description = `(${manifest.solution.primarySolutionId}) - The AWS CloudFormation template for deployment of the ${manifest.solution.name}. Version ${manifest.solution.solutionVersion}`;
    this.templateOptions.templateFormatVersion =
      manifest.solution.templateVersion;

    //=============================================================================================
    // Map
    //=============================================================================================
    const map = new CfnMapping(this, "CommonResourceStackMap", {
      mapping: {
        Metric: {
          SendAnonymizedMetric: manifest.solution.sendMetric,
          MetricsEndpoint: manifest.solution.metricsEndpoint, // aws-solutions metrics endpoint
        },
        Solution: {
          SolutionId: manifest.solution.primarySolutionId,
          SolutionName: manifest.solution.name,
          SolutionVersion: manifest.solution.solutionVersion,
          UserAgentPrefix: manifest.solution.userAgentPrefix,
        },
      },
    });

    //=============================================================================================
    // Condition
    //=============================================================================================
    const complianceReportingCheck = new CfnCondition(this, "reportingCheck", {
      expression: Fn.conditionEquals(
        complianceGeneratorParam.valueAsString,
        "Yes"
      ),
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
    const helperFunction: Function = new Function(this, "HelperFunction", {
      description: `${map.findInMap(
        "Solution",
        "SolutionId"
      )} - Function to help with FMS solution installation (DO NOT DELETE)`,
      runtime: LAMBDA_RUNTIME_NODE,
      layers: [utilsLayer.layer],
      code: Code.fromAsset(
        `${path.dirname(__dirname)}/../services/helper/dist/helperFunction.zip`
      ),
      handler: "index.handler",
      memorySize: 512,
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
     * Get UUID for deployment
     */
    const uuid = new CustomResource(this, "CreateUUID", {
      resourceType: "Custom::CreateUUID",
      serviceToken: helperProvider.serviceToken,
    });

    /**
     * Check deployment account
     */
    new CustomResource(this, "FMSAdminCheck", {
      resourceType: "Custom::FMSAdminCheck",
      serviceToken: helperProvider.serviceToken,
      properties: {
        Stack: "FMSStack",
        Account: this.account,
        Region: this.region,
      },
    });

    /**
     * @description dynamodb table for policy items
     * @type {Table}
     */
    const table: Table = new Table(this, "FMSTable", {
      partitionKey: {
        name: "PolicyName",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "Region",
        type: AttributeType.STRING,
      },
      pointInTimeRecovery: true,
      encryption: TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    /**
     * @description iam permissions for the helper lambda function
     * @type {Policy}
     */
    const helperPolicy: Policy = new Policy(this, "HelperPolicy", {
      policyName: manifest.commonResourceStack.helperPolicy,
      roles: [helperFunction.role!],
    });

    /**
     * @description iam policy for the helper lambda function
     * @type {PolicyStatement}
     */
    const fmsReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "FMSRead",
      actions: ["fms:GetAdminAccount"],
      resources: ["*"],
    });
    helperPolicy.addStatements(fmsReadStatement);

    /**
     * @description compliance generator stack
     * @type {NestedStack}
     */
    const complianceStack: NestedStack = new ComplianceGeneratorStack(
      this,
      "ComplianceGeneratorStack",
      {
        parameters: {
          ["UUID"]: uuid.getAttString("UUID"),
        },
      }
    );
    complianceStack.nestedStackResource!.cfnOptions.condition =
      complianceReportingCheck;

    /**
     * @description nested stack for default policy
     * @type {NestedStack}
     */
    PolicyIdentifiers.forEach((policyId) => {
      new PolicyStack(this, `PolicyStack-${policyId}`, {
        parameters: {
          ["PolicyTable"]: table.tableName,
          ["UUID"]: uuid.getAttString("UUID"),
          ["PolicyIdentifier"]: policyId,
          ["EmailAddress"]: emailAddress.valueAsString,
        },
      });
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

    const prRole = helperPolicy.node.findChild("Resource") as CfnPolicy;
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

    const cfnFMSTable = table.node.findChild("Resource") as CfnTable;
    cfnFMSTable.cfnOptions.metadata = {
      guard: {
        SuppressedRules: ["DYNAMODB_TABLE_ENCRYPTED_KMS"],
        Reason: "DynamoDB Table encrypted using AWS Managed encryption",
      },
    };

    //=============================================================================================
    // Output
    //=============================================================================================
    new CfnOutput(this, "UUID", {
      description: "UUID for deployment",
      value: uuid.getAttString("UUID"),
    });

    new CfnOutput(this, "Policy Table", {
      description: "Table for FMS policies metadata",
      value: table.tableName,
    });

    new CfnOutput(this, "Compliance Reporting", {
      description: "Generate compliance reports on FMS policies",
      value: complianceGeneratorParam.valueAsString,
    });
  }
}
