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
  Duration,
  Fn,
  NestedStack,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import {
  AnyPrincipal,
  CfnPolicy,
  Effect,
  Policy,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import * as path from "path";
import manifest from "./solution_manifest.json";
import { LOG_LEVEL, PolicyIdentifiers } from "./exports";
import { PolicyStack } from "./policy";
import { ComplianceGeneratorStack } from "./compliance";
import { CfnFunction, Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Provider } from "aws-cdk-lib/custom-resources";
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import { Queue, QueueEncryption, QueuePolicy } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export class CommonResourceStack extends Stack {
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
        ],
        ParameterLabels: {
          [complianceGeneratorParam.logicalId]: {
            default: "Compliance Reporting",
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
          SendAnonymousMetric: manifest.solution.sendMetric,
          MetricsEndpoint: manifest.solution.metricsEndpoint, // aws-solutions metrics endpoint
        },
        Solution: {
          SolutionId: manifest.solution.primarySolutionId,
          SolutionVersion: manifest.solution.solutionVersion,
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
     * @description lambda backed custom resource to validate and install pre-reqs
     * @type {Function}
     */
    const helperFunction: Function = new Function(this, "HelperFunction", {
      description: `${map.findInMap(
        "Solution",
        "SolutionId"
      )} - Function to help with FMS solution installation (DO NOT DELETE)`,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset(
        `${path.dirname(__dirname)}/../services/helper/dist/helperFunction.zip`
      ),
      handler: "index.handler",
      memorySize: 512,
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
     * Send launch data to aws-solutions
     */
    new CustomResource(this, "LaunchData", {
      resourceType: "Custom::LaunchData",
      serviceToken: helperProvider.serviceToken,
      properties: {
        SolutionId: map.findInMap("Solution", "SolutionId"),
        SolutionVersion: map.findInMap("Solution", "SolutionVersion"),
        SolutionUuid: uuid.getAttString("UUID"),
        Stack: "FMSStack",
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
     * @description dead letter queue for lambda
     * @type {Queue}
     */
    const dlq: Queue = new Queue(this, `MetricsDLQ`, {
      encryption: QueueEncryption.KMS_MANAGED,
    });
    const metricsQueue: Queue = new Queue(this, `MetricsQueue`, {
      encryption: QueueEncryption.KMS_MANAGED,
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: Queue.fromQueueArn(this, "dlq", dlq.queueArn),
      },
    });

    /**
     * @description SQS queue policy to enforce only encrypted connections over HTTPS,
     * adding aws:SecureTransport in conditions
     * @type {QueuePolicy}
     */
    const queuePolicy: QueuePolicy = new QueuePolicy(this, "QueuePolicy", {
      queues: [dlq, metricsQueue],
    });
    queuePolicy.document.addStatements(
      new PolicyStatement({
        sid: "AllowPublishThroughSSLOnly01",
        actions: ["sqs:*"],
        effect: Effect.DENY,
        resources: [dlq.queueArn],
        conditions: {
          ["Bool"]: {
            "aws:SecureTransport": "false",
          },
        },
        principals: [new AnyPrincipal()],
      }),
      new PolicyStatement({
        sid: "AllowPublishThroughSSLOnly02",
        actions: ["sqs:*"],
        effect: Effect.DENY,
        resources: [metricsQueue.queueArn],
        conditions: {
          ["Bool"]: {
            "aws:SecureTransport": "false",
          },
        },
        principals: [new AnyPrincipal()],
      })
    );

    /**
     * @description lambda function to publish metrics
     * @type {Function}
     */
    const metricsManager: Function = new Function(this, "MetricsManager", {
      description: `${map.findInMap(
        "Solution",
        "SolutionId"
      )} - Function to publish FMS solution metrics to aws-solutions`,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset(
        `${path.dirname(
          __dirname
        )}/../services/metricsManager/dist/metricsManager.zip`
      ),
      handler: "index.handler",
      memorySize: 128,
      reservedConcurrentExecutions: 1,
      environment: {
        METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
        LOG_LEVEL: LOG_LEVEL.INFO, //change as needed
      },
      timeout: Duration.seconds(15),
    });
    metricsManager.addEventSource(
      new SqsEventSource(metricsQueue, {
        batchSize: 1,
      })
    );

    /**
     * @description iam permissions for the helper lambda function
     * @type {Policy}
     */
    const po: Policy = new Policy(this, "HelperPolicy", {
      policyName: manifest.commonResourceStack.helperPolicy,
      roles: [helperFunction.role!],
    });

    /**
     * @description iam policy for the helper lambda function
     * @type {PolicyStatement}
     */
    const po0: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "FMSRead",
      actions: ["fms:GetAdminAccount"],
      resources: ["*"],
    });
    po.addStatements(po0);

    /**
     * @description compliance generator stack
     * @type {NestedStack}
     */
    const complianceStack: NestedStack = new ComplianceGeneratorStack(
      this,
      "ComplianceGeneratorStack",
      {
        parameters: {
          ["MetricsQueue"]: metricsQueue.queueName,
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
          ["MetricsQueue"]: metricsQueue.queueName,
          ["UUID"]: uuid.getAttString("UUID"),
          ["PolicyIdentifier"]: policyId,
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

    const mm = metricsManager.node.findChild("Resource") as CfnFunction;
    mm.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W58",
            reason:
              "CloudWatch logs write permissions added with managed role AWSLambdaBasicExecutionRole",
          },
          {
            id: "W89",
            reason:
              "Not a valid use case for Lambda functions to be deployed inside a VPC",
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

    new CfnOutput(this, "Metrics SQS Queue", {
      description: "SQS queue for solution anonymous metric",
      value: metricsQueue.queueName,
    });

    new CfnOutput(this, "Compliance Reporting", {
      description: "Generate compliance reports on FMS policies",
      value: complianceGeneratorParam.valueAsString,
    });
  }
}
