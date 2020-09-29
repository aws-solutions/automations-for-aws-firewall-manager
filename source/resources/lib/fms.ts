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
 * This is Firewall Manager Stack for AWS Centralized WAF & Security Group Automations
 * The stack should be deployed in Firewall Manager admin account
 * @author @aws-solutions
 */

import {
  Stack,
  Construct,
  CfnMapping,
  RemovalPolicy,
  Duration,
  NestedStack,
  NestedStackProps,
  CfnOutput,
  CustomResource,
} from "@aws-cdk/core";
import { Provider } from "@aws-cdk/custom-resources";
import { StringListParameter, StringParameter } from "@aws-cdk/aws-ssm";
import { Queue, QueueEncryption } from "@aws-cdk/aws-sqs";
import { Table, AttributeType, BillingMode } from "@aws-cdk/aws-dynamodb";
import { Code, Runtime, Function, CfnFunction } from "@aws-cdk/aws-lambda";
import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";
import { LogGroup, RetentionDays } from "@aws-cdk/aws-logs";
import { IAMConstruct } from "./iam";
import manifest from "./manifest.json";
import { CfnPolicy, Effect, Policy, PolicyStatement } from "@aws-cdk/aws-iam";
const {
  LambdaToDynamoDB,
} = require("@aws-solutions-constructs/aws-lambda-dynamodb");
const {
  EventsRuleToLambda,
} = require("@aws-solutions-constructs/aws-events-rule-lambda");

enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

export class FMSStack extends NestedStack {
  readonly account: string;
  readonly region: string;
  /**
   * @constructor
   * @param {cdk.Construct} scope - parent of the construct
   * @param {string} id - identifier for the object
   */
  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);
    const stack = Stack.of(this);

    this.account = stack.account; // Returns the AWS::AccountId for this stack (or the literal value if known)
    this.region = stack.region; // Returns the AWS::Region for this stack (or the literal value if known)

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.description = `(${manifest.primarySolutionId}) - The AWS CloudFormation template for deployment of the ${manifest.solutionName}. Version ${manifest.solutionVersion}`;
    this.templateOptions.templateFormatVersion = manifest.templateVersion;

    //=============================================================================================
    // Map
    //=============================================================================================
    const map = new CfnMapping(this, "FMSStackMap", {
      mapping: {
        SSMParameters: {
          Region: manifest.ssmParameters.Region,
          OUs: manifest.ssmParameters.OUs,
          Tags: manifest.ssmParameters.Tags,
        },
        Metric: {
          SendAnonymousMetric: manifest.sendMetric,
          MetricsEndpoint: manifest.metricsEndpoint, // aws-solutions metrics endpoint
        },
        Solution: {
          SolutionId: manifest.primarySolutionId,
          SolutionVersion: manifest.solutionVersion,
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
     * @description - ssm parameter for org units
     * @type {StringListParameter}
     */
    const ou: StringListParameter = new StringListParameter(this, "FMSOUs", {
      description: "FMS parameter store for OUs",
      stringListValue: ["NOP"],
      parameterName: map.findInMap("SSMParameters", "OUs"),
      simpleName: false,
    });

    /**
     * @description ssm parameter for tags
     * @type {StringParameter}
     */
    const tags: StringParameter = new StringParameter(this, "FMSTags", {
      description: "fms parameter for fms tags",
      parameterName: map.findInMap("SSMParameters", "Tags"),
      stringValue: "NOP",
      simpleName: false,
    });

    /**
     * @description ssm parameter for regions
     * @type {StringListParameter}
     */
    const regions: StringListParameter = new StringListParameter(
      this,
      "FMSRegions",
      {
        description: "fms parameter for fms regions",
        parameterName: map.findInMap("SSMParameters", "Region"),
        stringListValue: ["NOP"],
        simpleName: false,
      }
    );

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
      serverSideEncryption: true,
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    /**
     * @description dead letter queue for lambda
     * @type {Queue}
     */
    const dlq: Queue = new Queue(this, `dlq`, {
      encryption: QueueEncryption.KMS_MANAGED,
    });

    /**
     * @description dead letter queue for lambda
     * @type {Queue}
     */
    const metricsQueue: Queue = new Queue(this, `metricsQueue`, {
      encryption: QueueEncryption.KMS_MANAGED,
    });

    /**
     * @description lambda function to create FMS security policy
     * @type {Function}
     */
    const policyManager: Function = new Function(this, "policyManager", {
      description:
        "Function to create/update/delete FMS security policies for the FMS solution",
      runtime: Runtime.NODEJS_12_X,
      code: Code.fromAsset(
        "../../source/services/policyManager/dist/policyManager.zip"
      ),
      handler: "index.handler",
      deadLetterQueue: dlq,
      retryAttempts: 0,
      maxEventAge: Duration.minutes(15),
      deadLetterQueueEnabled: true,
      memorySize: 512,
      environment: {
        FMS_OU: ou.parameterName,
        FMS_TAGS: tags.parameterName,
        FMS_REGIONS: regions.parameterName,
        FMS_TABLE: table.tableName,
        SEND_METRIC: map.findInMap("Metric", "SendAnonymousMetric"),
        LOG_LEVEL: LogLevel.INFO, //change as needed
        SOLUTION_ID: map.findInMap("Solution", "SolutionId"),
        SOLUTION_VERSION: map.findInMap("Solution", "SolutionVersion"),
        UUID: uuid.getAttString("UUID"),
        METRICS_QUEUE: metricsQueue.queueUrl,
      },
      timeout: Duration.minutes(15),
    });

    /**
     * @description lambda function to publish metrics
     * @type {Function}
     */

    const metricsManager: Function = new Function(this, "metricsManager", {
      description: "Function to publish policy metrics to aws-solutions",
      runtime: Runtime.NODEJS_12_X,
      code: Code.fromAsset(
        "../../source/services/metricsManager/dist/metricsManager.zip"
      ),
      handler: "index.handler",
      memorySize: 128,
      reservedConcurrentExecutions: 1,
      environment: {
        METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
        LOG_LEVEL: LogLevel.INFO, //change as needed
      },
      timeout: Duration.seconds(15),
    });
    metricsManager.addEventSource(
      new SqsEventSource(metricsQueue, {
        batchSize: 1,
      })
    );

    /**
     * @description Events rule to Lambda construct pattern
     * @example `
     * {
          "source": [
            "aws.ssm"
          ],
          "detail-type": [
            "Parameter Store Change"
          ],
          "resources": [
            "arn:aws:ssm:<region>:<account-id>:parameter<parameter-name>",
            "arn:aws:ssm:<region>:<account-id>:parameter<parameter-name-2>",
          ]
        }
     */
    new EventsRuleToLambda(this, "EventsRuleLambda", {
      existingLambdaObj: policyManager,
      eventRuleProps: {
        ruleName: "FMSPolicyRule",
        eventPattern: {
          source: ["aws.ssm"],
          detailType: ["Parameter Store Change"],
          resources: [
            `${ou.parameterArn}`,
            `${tags.parameterArn}`,
            `${regions.parameterArn}`,
          ],
        },
      },
    });

    /**
     * Lambda to DynamoDB constuct pattern
     */
    new LambdaToDynamoDB(this, "LambdaDDB", {
      existingLambdaObj: policyManager,
      existingTableObj: table,
      tablePermissions: "ReadWrite",
    });

    /**
     * @description log group for policy manager lambda function
     * @type {LogGroup}
     */
    const lg: LogGroup = new LogGroup(this, "PolicyMangerLogGroup", {
      logGroupName: `/aws/lambda/${policyManager.functionName}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_WEEK,
    });

    /**
     * @description iam permissions for the helper lambda function
     * @type {Policy}
     */
    const po: Policy = new Policy(this, "helperPolicy", {
      policyName: manifest.helperPolicy,
      roles: [helperFunction.role!],
    });

    /**
     * @description iam policy for the helper lambda function
     * @type {PolicyStatement}
     */
    const po0: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "VisualEditor1",
      actions: ["fms:GetAdminAccount"],
      resources: ["*"],
    });
    po.addStatements(po0);

    /**
     * @description iam permissions for the policy manager lambda function
     * @type {IAMConstruct}
     */
    new IAMConstruct(this, "LambdaIAM", {
      dynamodb: table.tableArn,
      sqs: dlq.queueArn,
      logGroup: lg.logGroupArn,
      role: policyManager.role!,
      accountId: this.account,
      region: this.region,
      metricsQueue: metricsQueue.queueArn,
    });

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

    const mm = metricsManager.node.findChild("Resource") as CfnFunction;
    mm.cfnOptions.metadata = {
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

    const pm = policyManager.node.findChild("Resource") as CfnFunction;
    pm.cfnOptions.metadata = {
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

    //=============================================================================================
    // Output
    //=============================================================================================
    new CfnOutput(this, "OU Parameter", {
      description: "SSM Parameter for OUs",
      value: map.findInMap("SSMParameters", "OUs"),
    });

    new CfnOutput(this, "Region Parameter", {
      description: "SSM Parameter for Regions",
      value: map.findInMap("SSMParameters", "Region"),
    });

    new CfnOutput(this, "Tag Parameter", {
      description: "SSM Parameter for Tags",
      value: map.findInMap("SSMParameters", "Tags"),
    });

    new CfnOutput(this, "UUID", {
      description: "UUID for FMS Stack",
      value: uuid.getAttString("UUID"),
    });
  }
}
