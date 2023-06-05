// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * This is Policy Stack for Automations for AWS Firewall Manager
 * The stack should be deployed in Firewall Manager admin account
 * This stack provisions resources needed to manage FMS policies
 * @author @aws-solutions
 */
import {
  Stack,
  CfnMapping,
  RemovalPolicy,
  Duration,
  NestedStack,
  CfnOutput,
  CfnResource,
  CfnParameter,
  NestedStackProps,
} from "aws-cdk-lib";
import {Construct} from "constructs";
import { StringListParameter, StringParameter } from "aws-cdk-lib/aws-ssm";
import { Queue, QueueEncryption, QueuePolicy } from "aws-cdk-lib/aws-sqs";
import { Code, Runtime, Function, CfnFunction } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import * as path from "path";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  StorageClass,
} from "aws-cdk-lib/aws-s3";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { AnyPrincipal, Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { IAMConstruct } from "./iam";
import manifest from "./solution_manifest.json";
import { LOG_LEVEL } from "./exports";
import {EventbridgeToLambda} from "@aws-solutions-constructs/aws-eventbridge-lambda";


export class PolicyStack extends NestedStack {
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
    const table = new CfnParameter(this, "PolicyTable", {
      description: "DynamoDB table for policy metadata",
      type: "String",
    });

    const uuid = new CfnParameter(this, "UUID", {
      description: "UUID for primary stack deployment",
      type: "String",
    });

    const metricsQueue = new CfnParameter(this, "MetricsQueue", {
      description: "Metrics queue for solution anonymized metrics",
      type: "String",
    });

    const policyIdentifier = new CfnParameter(this, "PolicyIdentifier", {
      description: "A unique string identifier for the policies",
      type: "String",
    });

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: { default: "Policy Configuration" },
            Parameters: [policyIdentifier.logicalId],
          },
          {
            Label: { default: "Shared Resource Configurations" },
            Parameters: [
              table.logicalId,
              uuid.logicalId,
              metricsQueue.logicalId,
            ],
          },
        ],
        ParameterLabels: {
          [table.logicalId]: {
            default: "Policy Table",
          },
          [metricsQueue.logicalId]: {
            default: "Metric Queue",
          },
          [uuid.logicalId]: {
            default: "UUID",
          },
          [policyIdentifier.logicalId]: {
            default: "Policy Identifier",
          },
        },
      },
    };
    this.templateOptions.description = `(${manifest.solution.primarySolutionId}-po) - The AWS CloudFormation template for deployment of the ${manifest.solution.name}. Version ${manifest.solution.solutionVersion}`;
    this.templateOptions.templateFormatVersion =
      manifest.solution.templateVersion;

    //=============================================================================================
    // Map
    //=============================================================================================
    const map = new CfnMapping(this, "PolicyStackMap", {
      mapping: {
        Metric: {
          SendAnonymousMetric: manifest.solution.sendMetric,
        },
        Solution: {
          SolutionId: manifest.solution.primarySolutionId,
          SolutionVersion: manifest.solution.solutionVersion,
          UserAgentPrefix: manifest.solution.userAgentPrefix,
        },
      },
    });

    //=============================================================================================
    // Resources
    //=============================================================================================
    /**
     * @description - ssm parameter for org units
     * @type {StringListParameter}
     */
    const ou: StringListParameter = new StringListParameter(this, "FMSOUs", {
      description: "FMS parameter store for OUs",
      stringListValue: ["NOP"],
      parameterName: `/FMS/${policyIdentifier.valueAsString}/OUs`,
      simpleName: false,
    });

    /**
     * @description ssm parameter for tags
     * @type {StringParameter}
     */
    const tags: StringParameter = new StringParameter(this, "FMSTags", {
      description: "fms parameter for fms tags",
      parameterName: `/FMS/${policyIdentifier.valueAsString}/Tags`,
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
        parameterName: `/FMS/${policyIdentifier.valueAsString}/Regions`,
        stringListValue: ["NOP"],
        simpleName: false,
      }
    );

    /**
     * @description S3 bucket for access logs
     * @type {Bucket}
     */
    const accessLogsBucket: Bucket = new Bucket(this, "AccessLogsBucket", {
      versioned: true,
      encryption: BucketEncryption.S3_MANAGED,
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
     * @description S3 bucket with default policy manifest
     * @type {Bucket}
     */
    const policyBucket: Bucket = new Bucket(this, "ManifestBucket", {
      versioned: true,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: accessLogsBucket,
      enforceSSL: true
    });

    /**
     * @description following snippet can be used to source policy manifest from local file
     * @link https://docs.aws.amazon.com/cdk/api/latest/docs/aws-s3-deployment-readme.html
     * @example
      ```
      new BucketDeployment(this, "CopyManifest", {
        sources: [
          Source.asset(`${path.dirname(__dirname)}/lib`, {
            exclude: ["**", "!policy_manifest.json"],
          }),
        ],
        destinationBucket: policyBucket,
        prune: true,
      });
      ```
      */
    new AwsCustomResource(this, "CopyManifest", {
      onCreate: {
        service: "S3",
        action: "copyObject",
        parameters: {
          Bucket: policyBucket.bucketName,
          CopySource: `${manifest.solution.policyBucket}/${manifest.solution.name}/${manifest.solution.solutionVersion}/policy_manifest.json`,
          Key: "policy_manifest.json",
        },
        physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          sid: "S3Get",
          actions: ["s3:GetObject"],
          resources: [`arn:aws:s3:::${manifest.solution.policyBucket}/*`],
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          sid: "S3Put",
          actions: ["s3:PutObject"],
          resources: [`${policyBucket.bucketArn}/*`],
        }),
      ]),
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
     * @description lambda function to create FMS security policy
     * @type {Function}
     */
    const policyManager: Function = new Function(this, "PolicyManager", {
      description: `${map.findInMap(
        "Solution",
        "SolutionId"
      )} - Function to create/update/delete FMS security policies`,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset(
        `${path.dirname(
          __dirname
        )}/../services/policyManager/dist/policyManager.zip`
      ),
      handler: "index.handler",
      deadLetterQueue: dlq,
      retryAttempts: 0,
      maxEventAge: Duration.minutes(15),
      deadLetterQueueEnabled: true,
      memorySize: 512,
      environment: {
        FMS_OU: ou.parameterName,
        FMS_TAG: tags.parameterName,
        FMS_REGION: regions.parameterName,
        FMS_TABLE: table.valueAsString,
        POLICY_MANIFEST: `${policyBucket.bucketName}|policy_manifest.json`, // manifest file to be used for policy configuration
        POLICY_IDENTIFIER: policyIdentifier.valueAsString,
        SEND_METRIC: map.findInMap("Metric", "SendAnonymousMetric"),
        LOG_LEVEL: LOG_LEVEL.INFO, //change as needed
        SOLUTION_ID: map.findInMap("Solution", "SolutionId"),
        SOLUTION_VERSION: map.findInMap("Solution", "SolutionVersion"),
        MAX_ATTEMPTS: "" + 10, // retry attempts for SDKs, increase if you see throttling errors
        UUID: uuid.valueAsString,
        METRICS_QUEUE: `https://sqs.${this.region}.amazonaws.com/${this.account}/${metricsQueue.valueAsString}`,
        USER_AGENT_PREFIX: map.findInMap("Solution", "UserAgentPrefix"),
      },
      timeout: Duration.minutes(15),
    });

    new EventbridgeToLambda(this, "EventsRuleLambda", {
      existingLambdaObj: policyManager,
      eventRuleProps: {
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
     * @description log group for policy manager lambda function
     * @type {LogGroup}
     */
    const lg: LogGroup = new LogGroup(this, "PolicyMangerLogGroup", {
      logGroupName: `/aws/lambda/${policyManager.functionName}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_WEEK,
    });

    /**
     * @description iam permissions for the policy manager lambda function
     * @type {IAMConstruct}
     */
    new IAMConstruct(this, "LambdaIAM", {
      policyTable: table.valueAsString,
      sqs: dlq.queueArn,
      logGroup: lg.logGroupArn,
      role: policyManager.role!,
      accountId: this.account,
      region: this.region,
      metricsQueue: metricsQueue.valueAsString,
      regionParamArn: regions.parameterArn,
      ouParamArn: ou.parameterArn,
      tagParamArn: tags.parameterArn,
      s3Bucket: policyBucket,
    });

    //=============================================================================================
    // cfn_nag suppress rules
    //=============================================================================================
    const cfn_nag_w58_w89_w92 = [
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
      {
        id: "W92",
        reason: "Lambda ReservedConcurrentExecutions not needed",
      },
    ];

    (lg.node.findChild("Resource") as CfnResource).cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W84",
            reason:
              "Using service default encryption https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/data-protection.html",
          },
        ],
      },
    };

    (
      policyManager.node.findChild("Resource") as CfnFunction
    ).cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [...cfn_nag_w58_w89_w92],
      },
    };

    (accessLogsBucket.node.defaultChild as CfnResource).cfnOptions.metadata = {
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
    };

    (policyBucket.node.defaultChild as CfnResource).cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W51",
            reason: "permission given to lambda to get policy manifest",
          },
        ],
      },
    };

    //=============================================================================================
    // Output
    //=============================================================================================
    new CfnOutput(this, "Policy Manifest Bucket", {
      description: "S3 Bucket with policy manifest file",
      value: `s3://${policyBucket.bucketName}`,
    });
  }
}
