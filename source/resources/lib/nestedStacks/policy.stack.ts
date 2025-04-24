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
  CfnCondition,
  Fn,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { StringListParameter, StringParameter } from "aws-cdk-lib/aws-ssm";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Code, Function, CfnFunction, Tracing} from "aws-cdk-lib/aws-lambda";
import {
  LogGroup,
  RetentionDays,
  QueryDefinition,
  QueryString,
} from "aws-cdk-lib/aws-logs";
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
import {
  CfnPolicy,
  Effect,
  Policy,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import { IAMConstruct } from "../common/iam.construct";
import manifest from "../solution_manifest.json";
import { LAMBDA_RUNTIME_NODE, LOG_LEVEL } from "../common/exports";
import { EventbridgeToLambda } from "@aws-solutions-constructs/aws-eventbridge-lambda";
import { Layer } from "../common/lambda-layer.construct";
import { CfnSubscription, Topic, TracingConfig } from "aws-cdk-lib/aws-sns";
import { Alias } from "aws-cdk-lib/aws-kms";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { DeadLetterQueueConstruct } from "../common/dead-letter-queue.construct";
import { addCfnGuardSuppression } from '../../cdk-helper/add-cfn-guard-supression-helper';


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

    const policyIdentifier = new CfnParameter(this, "PolicyIdentifier", {
      description: "A unique string identifier for the policies",
      type: "String",
    });

    const emailAddress = new CfnParameter(this, "EmailAddress", {
      type: "String",
      description:
        "Email address to receive notifications regarding problems deploying Firewall Manager policies.",
    });

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: { default: "Policy Configuration" },
            Parameters: [policyIdentifier.logicalId, emailAddress.logicalId],
          },
          {
            Label: { default: "Shared Resource Configurations" },
            Parameters: [table.logicalId, uuid.logicalId],
          },
        ],
        ParameterLabels: {
          [table.logicalId]: {
            default: "Policy Table",
          },
          [uuid.logicalId]: {
            default: "UUID",
          },
          [policyIdentifier.logicalId]: {
            default: "Policy Identifier",
          },
          [emailAddress.logicalId]: {
            default: "SNS Topic Email Address",
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
          SendAnonymizedMetric: manifest.solution.sendMetric,
          MetricsEndpoint: manifest.solution.metricsEndpoint, // aws-solutions metrics endpoint
        },
        Solution: {
          SolutionId: manifest.solution.primarySolutionId,
          SolutionVersion: manifest.solution.solutionVersion,
          UserAgentPrefix: manifest.solution.userAgentPrefix,
        },
        PolicyManager: {
          ServiceName: manifest.policyStack.serviceName,
          SNSTopicName: manifest.policyStack.SNSTopicName,
        },
      },
    });

    //=============================================================================================
    // Condition
    //=============================================================================================
    const emailAddressExists = new CfnCondition(this, "emailAddressExists", {
      expression: Fn.conditionNot(
        Fn.conditionEquals(emailAddress.valueAsString, "")
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
      `${path.dirname(__dirname)}/../../services/utilsLayer/dist/utilsLayer.zip`
    );

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
      enforceSSL: true,
      eventBridgeEnabled: true,
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
          CopySource: `${manifest.solution.policyBucket}-${this.region}/${manifest.solution.name}/${manifest.solution.solutionVersion}/policy_manifest.json`,
          Key: "policy_manifest.json",
        },
        physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
      },
      installLatestAwsSdk: false,
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          sid: "S3Get",
          actions: ["s3:GetObject"],
          resources: [
            `arn:${stack.partition}:s3:::${manifest.solution.policyBucket}-${this.region}/*`,
          ],
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
     */
    const deadLetterQueueConstruct = new DeadLetterQueueConstruct(
      this,
      "DLQConstruct"
    );
    const deadLetterQueue: Queue = deadLetterQueueConstruct.getQueue();

    /**
     * @description SNS topic for communicating errors during Policy deployment
     * @type {Topic}
     */
    const policyManagerTopic: Topic = new Topic(this, "PolicyManagerTopic", {
      displayName: "FMS Policy Manager Topic",
      topicName: map.findInMap("PolicyManager", "SNSTopicName"),
      masterKey: Alias.fromAliasName(this, "SNSKey", "alias/aws/sns"),
      enforceSSL: true,
      tracingConfig: TracingConfig.ACTIVE,
    });

    const emailSubscription = policyManagerTopic.addSubscription(
      new EmailSubscription(emailAddress.valueAsString)
    );

    const rawEmailSubscription = emailSubscription.node
      .defaultChild as CfnSubscription;
    rawEmailSubscription.cfnOptions.condition = emailAddressExists;

    /**
     * @description lambda function to create FMS security policy
     * @type {Function}
     */
    const policyManager: Function = new Function(this, "PolicyManager", {
      description: `${map.findInMap(
        "Solution",
        "SolutionId"
      )} - Function to create/update/delete FMS security policies`,
      runtime: LAMBDA_RUNTIME_NODE,
      layers: [utilsLayer.layer],
      code: Code.fromAsset(
        `${path.dirname(
          __dirname
        )}/../../services/policyManager/dist/policyManager.zip`
      ),
      handler: "index.handler",
      deadLetterQueue: deadLetterQueue,
      retryAttempts: 0,
      maxEventAge: Duration.minutes(15),
      deadLetterQueueEnabled: true,
      memorySize: 512,
      tracing: Tracing.ACTIVE,
      environment: {
        FMS_OU: ou.parameterName,
        FMS_TAG: tags.parameterName,
        FMS_REGION: regions.parameterName,
        SSM_PARAM_PREFIX: `/FMS/${policyIdentifier.valueAsString}`,
        FMS_TABLE: table.valueAsString,
        POLICY_MANIFEST: `${policyBucket.bucketName}|policy_manifest.json`, // manifest file to be used for policy configuration
        POLICY_IDENTIFIER: policyIdentifier.valueAsString,
        SEND_METRIC: map.findInMap("Metric", "SendAnonymizedMetric"),
        LOG_LEVEL: LOG_LEVEL.INFO, //change as needed
        SOLUTION_ID: map.findInMap("Solution", "SolutionId"),
        SOLUTION_VERSION: map.findInMap("Solution", "SolutionVersion"),
        SERVICE_NAME: map.findInMap("PolicyManager", "ServiceName"),
        MAX_ATTEMPTS: "" + 10, // retry attempts for SDKs, increase if you see throttling errors
        UUID: uuid.valueAsString,
        METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
        USER_AGENT_PREFIX: map.findInMap("Solution", "UserAgentPrefix"),
        PARTITION: stack.partition,
        TOPIC_ARN: policyManagerTopic.topicArn,
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

    new EventbridgeToLambda(this, "EventsRuleS3Lambda", {
      existingLambdaObj: policyManager,
      eventRuleProps: {
        eventPattern: {
          detailType: ["Object Created"],
          source: ["aws.s3"],
          resources: [policyBucket.bucketArn],
          detail: {
            bucket: {
              name: [policyBucket.bucketName],
            },
            object: {
              key: ["policy_manifest.json"],
            },
          },
        },
      },
    });

    // Add dependency between policy and notifications, so they aren't applied at the same time.
    // Fixes race condition which causes failure to create Bucket Policy intermittently.
    policyBucket.node
      .findChild("Notifications")
      .node.addDependency(policyBucket.node.findChild("Policy"));

    /**
     * @description log group for policy manager lambda function
     * @type {LogGroup}
     */
    const lg: LogGroup = new LogGroup(this, "PolicyMangerLogGroup", {
      logGroupName: `/aws/lambda/${policyManager.functionName}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.TEN_YEARS,
    });

    /**
     * @description iam permissions for the policy manager lambda function
     * @type {IAMConstruct}
     */
    new IAMConstruct(this, "LambdaIAM", {
      policyTable: table.valueAsString,
      sqs: deadLetterQueue.queueArn,
      logGroup: lg.logGroupArn,
      role: policyManager.role!,
      accountId: this.account,
      region: this.region,
      regionParamArn: regions.parameterArn,
      ouParamArn: ou.parameterArn,
      tagParamArn: tags.parameterArn,
      s3Bucket: policyBucket,
      policyIdentifier: policyIdentifier.valueAsString,
    });

    /**
     * @description iam permissions for the policy lambda function
     * to access X-ray
     * @type {Policy}
     */
    const policyManagerIAMPolicy: Policy = new Policy(
      this,
      "PolicyManagerIAMPolicy",
      {
        roles: [policyManager.role!],
      }
    );

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
    policyManagerIAMPolicy.addStatements(xrayStatement);

    /**
     * @description IAM permissions for writing to Policy Manager SNS topic
     * @type {PolicyStatement}
     */
    const SNSWriteStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "SNSWrite",
      actions: ["sns:Publish"],
      resources: [policyManagerTopic.topicArn],
    });
    policyManagerIAMPolicy.addStatements(SNSWriteStatement);

    //=============================================================================================
    // Log Insights Queries
    //=============================================================================================
    const policyErrorQuery = new QueryDefinition(
      this,
      "PolicyManagerErrorQuery",
      {
        queryDefinitionName: "FMS-Policy_Manager_Errors",
        logGroups: [lg],
        queryString: new QueryString({
          fields: ["@timestamp", "@level"],
          sort: "@timestamp desc",
          filterStatements: ['level = "ERROR"'],
        }),
      }
    );

    const policySuccessQuery = new QueryDefinition(
      this,
      "PolicyManagerSuccessQuery",
      {
        queryDefinitionName: "FMS-Policy_Manager_Success",
        logGroups: [lg],
        queryString: new QueryString({
          fields: ["@timestamp", "@message"],
          sort: "@timestamp desc",
          filterStatements: ['message like "successfully put policy"'],
        }),
      }
    );

    const policyCreateFailureQuery = new QueryDefinition(
      this,
      "PolicyManagerCreateFailureQuery",
      {
        queryDefinitionName: "FMS-Policy_Manager_Create_Failure",
        logGroups: [lg],
        queryString: new QueryString({
          fields: ["@timestamp", "@message"],
          sort: "@timestamp desc",
          filterStatements: ['message like "encountered error putting policy"'],
        }),
      }
    );
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
      guard: {
        SuppressedRules: ["S3_BUCKET_NO_PUBLIC_RW_ACL"],
        Reason: "Public RW access is disabled by default",
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
      guard: {
        SuppressedRules: ["S3_BUCKET_NO_PUBLIC_RW_ACL"],
        Reason: "Public RW access is disabled by default",
      },
    };

    (
      policyManagerIAMPolicy.node.findChild("Resource") as CfnPolicy
    ).cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W12",
            reason:
              "Resource * is required for function to write traces to X-Ray",
          },
        ],
      },
    };

    //Suppress cfn-guard for bucket notification handler
    const bucketNotificationsHandlers = this.node.findAll()
      .filter((node) => node.node.id.includes('BucketNotificationsHandler')) as Function[];

    if (bucketNotificationsHandlers.length !== 1) {
      throw new Error(
        `Expected exactly one BucketNotificationsHandler function, got ${bucketNotificationsHandlers.length}`,
      );
    }

    const bucketNotificationsHandler = bucketNotificationsHandlers[0];
    addCfnGuardSuppression(bucketNotificationsHandler, "LAMBDA_INSIDE_VPC")
    addCfnGuardSuppression(bucketNotificationsHandler, "LAMBDA_CONCURRENCY_CHECK")

    //Suppress cfn-guard for custom resource lambda function
    const customResource = this.node.findAll()
      .filter((resource) => resource instanceof Function && resource.node.id.startsWith('AWS'));

    if (customResource.length !== 1) {
      throw new Error(
        `Expected exactly one custom resource function, got ${customResource.length}`,
      );
    }
    addCfnGuardSuppression(customResource[0], "LAMBDA_INSIDE_VPC")
    addCfnGuardSuppression(customResource[0], "LAMBDA_CONCURRENCY_CHECK")

    //=============================================================================================
    // Output
    //=============================================================================================
    new CfnOutput(this, "Policy Manifest Bucket", {
      description: "S3 Bucket with policy manifest file",
      value: `s3://${policyBucket.bucketName}`,
    });

    new CfnOutput(this, "Policy Manager SNS Topic", {
      description: "SNS Topic for Policy Manager notifications",
      value: policyManagerTopic.topicName,
    });

    new CfnOutput(this, "Policy Manager Error Query", {
      description: "Log Insights query for policy manager function errors",
      value: policyErrorQuery.queryDefinitionId,
    });

    new CfnOutput(this, "Policy Manager Success Query", {
      description: "Log Insights query for policy create successes",
      value: policySuccessQuery.queryDefinitionId,
    });

    new CfnOutput(this, "Policy Manager Failure Query", {
      description: "Log Insights query for policy create failures",
      value: policyCreateFailureQuery.queryDefinitionId,
    });
  }
}
