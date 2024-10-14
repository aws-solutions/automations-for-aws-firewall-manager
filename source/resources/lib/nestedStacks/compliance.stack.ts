// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * This is Compliance Stack for Automations for AWS Firewall Manager
 * The stack should be deployed in Firewall Manager admin account
 * This stack provisions resources needed to generate compliance reports on FMS policies
 * @author @aws-solutions
 */

import {
  AnyPrincipal,
  CfnPolicy,
  Effect,
  Policy,
  PolicyDocument,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import { SnsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  StorageClass,
} from "aws-cdk-lib/aws-s3";
import { Topic, TopicPolicy } from "aws-cdk-lib/aws-sns";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Alias } from "aws-cdk-lib/aws-kms";
import { CfnFunction, Code, Function, Tracing } from "aws-cdk-lib/aws-lambda";
import {
  CfnMapping,
  CfnOutput,
  CfnParameter,
  CfnResource,
  Duration,
  NestedStack,
  NestedStackProps,
  Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import manifest from ".././solution_manifest.json";
import { LAMBDA_RUNTIME_NODE, LOG_LEVEL } from "../common/exports";
import { Queue, QueueEncryption, QueuePolicy } from "aws-cdk-lib/aws-sqs";
import { Layer } from "../common/lambda-layer.construct";

export class ComplianceGeneratorStack extends NestedStack {
  /**
   * stack deployment AWS account
   */
  readonly account: string;
  /**
   * stack deployment region
   */
  readonly region: string;

  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);
    const stack = Stack.of(this);
    this.account = stack.account; // Returns the AWS::AccountId for this stack (or the literal value if known)
    this.region = stack.region; // Returns the AWS::Region for this stack (or the literal value if known)

    //=============================================================================================
    // Parameters
    //=============================================================================================
    const uuid = new CfnParameter(this, "UUID", {
      description: "UUID for primary stack deployment",
      type: "String",
    });

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: { default: "Shared Resource Configurations" },
            Parameters: [uuid.logicalId],
          },
        ],
        ParameterLabels: {
          [uuid.logicalId]: {
            default: "UUID",
          },
        },
      },
    };
    this.templateOptions.description = `(${manifest.solution.primarySolutionId}-cr) - The AWS CloudFormation template for deployment of the ${manifest.solution.name} compliance reporter resources. Version ${manifest.solution.solutionVersion}`;
    this.templateOptions.templateFormatVersion =
      manifest.solution.templateVersion;

    //=============================================================================================
    // Map
    //=============================================================================================
    const map = new CfnMapping(this, "PolicyStackMap", {
      mapping: {
        Metric: {
          SendAnonymizedMetric: manifest.solution.sendMetric,
          MetricsEndpoint: manifest.solution.metricsEndpoint, // aws-solutions metrics endpoint
        },
        Solution: {
          SolutionId: manifest.solution.primarySolutionId,
          SolutionVersion: manifest.solution.solutionVersion,
          UserAgentPrefix: manifest.solution.userAgentPrefix,
        },
        Compliance: {
          serviceName: manifest.complianceStack.serviceName,
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
      `${path.dirname(__dirname)}/../../services/utilsLayer/dist/utilsLayer.zip`
    );

    /**
     * @description S3 bucket for access logs
     * @type {Bucket}
     */
    const accessLogsBucket: Bucket = new Bucket(this, "AccessLogsBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
            {
              storageClass: StorageClass.GLACIER,
              transitionAfter: Duration.days(90),
            },
          ],
          expiration: Duration.days(365 * 2), // expire after 2 years
        },
      ],
    });

    /**
     * @description bucket to collect compliance reports
     * @type {Bucket}
     */
    const reportBucket: Bucket = new Bucket(this, "ComplianceReportBucket", {
      versioned: true,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: accessLogsBucket,
      enforceSSL: true,
    });

    /**
     * @description SNS topic for triggering compliance generator microservice
     * @type {Topic}
     */
    const fmsTopic: Topic = new Topic(this, "Topic", {
      displayName: "FMS compliance report generator subscription topic",
      topicName: "FMS_Compliance_Generator_Topic",
      masterKey: Alias.fromAliasName(this, "SNSKey", "alias/aws/sns"),
    });

    /**
     * @description SNS topic policy to enforce only encrypted connections over HTTPS,
     * adding aws:SecureTransport in conditions
     * @type {TopicPolicy}
     */
    new TopicPolicy(this, "TopicPolicy", {
      topics: [fmsTopic],
      policyDocument: new PolicyDocument({
        statements: [
          new PolicyStatement({
            sid: "AllowPublishThroughSSLOnly",
            actions: ["sns:Publish"],
            effect: Effect.DENY,
            resources: [fmsTopic.topicArn],
            conditions: {
              ["Bool"]: {
                "aws:SecureTransport": "false",
              },
            },

            principals: [new AnyPrincipal()],
          }),
        ],
      }),
    });

    /**
     * @description dead letter queue for lambda
     * @type {Queue}
     */
    const dlq: Queue = new Queue(this, `DLQ`, {
      encryption: QueueEncryption.KMS_MANAGED,
    });

    /**
     * @description SQS queue policy to enforce only encrypted connections over HTTPS,
     * adding aws:SecureTransport in conditions
     * @type {QueuePolicy}
     */
    const queuePolicy: QueuePolicy = new QueuePolicy(this, "QueuePolicy", {
      queues: [dlq],
    });
    queuePolicy.document.addStatements(
      new PolicyStatement({
        sid: "AllowPublishThroughSSLOnly",
        actions: ["sqs:*"],
        effect: Effect.DENY,
        resources: [],
        conditions: {
          ["Bool"]: {
            "aws:SecureTransport": "false",
          },
        },
        principals: [new AnyPrincipal()],
      })
    );

    /**
     * @description lambda function to generate compliance reports
     * @type {Function}
     */
    const complianceGenerator: Function = new Function(
      this,
      "ComplianceGenerator",
      {
        description: `${manifest.solution.primarySolutionId} - Function to generate compliance reports for FMS policies`,
        runtime: LAMBDA_RUNTIME_NODE,
        layers: [utilsLayer.layer],
        deadLetterQueue: dlq,
        code: Code.fromAsset(
          `${path.dirname(
            __dirname
          )}/../../services/complianceGenerator/dist/complianceGenerator.zip`
        ),
        handler: "index.handler",
        memorySize: 256,
        reservedConcurrentExecutions: 200,
        tracing: Tracing.ACTIVE,
        environment: {
          FMS_REPORT_BUCKET: reportBucket.bucketName, // bucket to upload compliance reports
          EXCLUDED_POLICIES: "NOP", // policies to exclude from compliance reporting
          FMS_TOPIC_ARN: fmsTopic.topicArn, // sns topic arn
          FMS_TOPIC_REGION: this.region, // deployment region
          SEND_METRIC: map.findInMap("Metric", "SendAnonymizedMetric"),
          LOG_LEVEL: LOG_LEVEL.INFO, //change as needed
          SOLUTION_ID: map.findInMap("Solution", "SolutionId"),
          SOLUTION_VERSION: map.findInMap("Solution", "SolutionVersion"),
          SERVICE_NAME: map.findInMap("Compliance", "serviceName"),
          MAX_ATTEMPTS: "" + 10, // retry attempts for SDKs, increase if you see throttling errors
          UUID: uuid.valueAsString,
          METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
          USER_AGENT_PREFIX: map.findInMap("Solution", "UserAgentPrefix"),
        },
        timeout: Duration.seconds(300),
      }
    );
    complianceGenerator.addEventSource(new SnsEventSource(fmsTopic));

    /**
     * @description Events Rule for compliance generator
     * @type {Rule}
     */
    new Rule(this, "ComplianceGeneratorRule", {
      ruleName: "FMS-Compliance-Generator",
      schedule: Schedule.rate(Duration.days(1)),
      targets: [new LambdaFunction(complianceGenerator)],
    });

    /**
     * @description iam permissions for the compliance generator lambda function
     * @type {Policy}
     */
    const cgPolicy: Policy = new Policy(this, "ComplianceGeneratorPolicy", {
      policyName: "FMS-ComplianceGeneratorPolicy",
      roles: [complianceGenerator.role!],
    });

    /**
     * @description iam policy statement with FMS actions for compliance generator lambda
     * @type {PolicyStatement}
     */
    const fmsReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "FMSRead",
      actions: [
        "fms:ListComplianceStatus",
        "fms:GetComplianceDetail",
        "fms:ListPolicies",
      ],
      resources: ["*"], // fms read actions, to be performed on multiple policies
    });
    cgPolicy.addStatements(fmsReadStatement);

    /**
     * @description iam policy statement with EC2 actions for compliance generator lambda
     * @type {PolicyStatement}
     */
    const ec2ReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "EC2Read",
      actions: ["ec2:DescribeRegions"],
      resources: ["*"], // resource level permission not valid for this iam action
    });
    cgPolicy.addStatements(ec2ReadStatement);

    /**
     * @description iam policy statement with SNS actions for compliance generator lambda
     * @type {PolicyStatement}
     */
    const snsWriteStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "SNSWrite",
      actions: ["sns:Publish"],
      resources: [fmsTopic.topicArn],
    });
    cgPolicy.addStatements(snsWriteStatement);

    /**
     * @description iam policy statement with S3 actions for compliance generator lambda
     * @type {PolicyStatement}
     */
    const s3WriteStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "S3Write",
      actions: ["s3:PutObject"],
      resources: [reportBucket.bucketArn, `${reportBucket.bucketArn}/*`],
    });
    cgPolicy.addStatements(s3WriteStatement);

    /**
     * @description iam policy statement with x-ray permissions
     * @type {PolicyStatement}
     */
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
    cgPolicy.addStatements(xrayStatement);

    //=============================================================================================
    // cfn_nag suppress rules
    //=============================================================================================
    const cfn_nag_w89 = [
      {
        id: "W89",
        reason:
          "Not a valid use case for Lambda functions to be deployed inside a VPC",
      },
    ];

    const cfnComplianceGeneratorDefaultPolicy =
      complianceGenerator.role?.node.findChild("DefaultPolicy").node
        .defaultChild as CfnPolicy;
    cfnComplianceGeneratorDefaultPolicy.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W12",
            reason: "Resource * is required for xray permissions",
          },
        ],
      },
    };

    const cg = complianceGenerator.node.findChild("Resource") as CfnFunction;
    cg.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W58",
            reason:
              "CloudWatch logs write permissions added with managed role AWSLambdaBasicExecutionRole",
          },
          ...cfn_nag_w89,
        ],
      },
    };

    const cfnAccessLogsBucket = accessLogsBucket.node
      .defaultChild as CfnResource;
    cfnAccessLogsBucket.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W35",
            reason: "access logging disabled, its a logging bucket",
          },
          {
            id: "W51",
            reason: "permission given for log delivery",
          },
        ],
      },
      guard: {
        SuppressedRules: ["S3_BUCKET_NO_PUBLIC_RW_ACL"],
        Reason: "Public RW access is disabled by default",
      },
    };

    (reportBucket.node.defaultChild as CfnResource).cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W51",
            reason: "permission given to lambda to put compliance reports",
          },
        ],
      },
    };

    (cgPolicy.node.findChild("Resource") as CfnPolicy).cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W12",
            reason:
              "Resource * is required for IAM Read actions (fms:ListComplianceStatus,fms:GetComplianceDetail,fms:ListPolicies) to be performed on multiple FMS policies in different regions",
          },
        ],
      },
    };

    //=============================================================================================
    // Output
    //=============================================================================================
    new CfnOutput(this, "Report Bucket", {
      description: "Bucket with compliance reports",
      value: `s3://${reportBucket.bucketName}`,
    });
  }
}
