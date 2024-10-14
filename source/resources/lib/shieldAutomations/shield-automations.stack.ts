// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  App,
  Aws,
  CfnCondition,
  RemovalPolicy,
  CfnResource,
  CfnMapping,
  CfnOutput,
  CfnParameter,
  CustomResource,
  Duration,
  Fn,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { CfnFunction, Code, Function, Tracing } from "aws-cdk-lib/aws-lambda";
import { LAMBDA_RUNTIME_NODE, LOG_LEVEL } from "../common/exports";
import * as path from "path";
import manifest from "../solution_manifest.json";
import {
  LogGroup,
  RetentionDays,
  QueryDefinition,
  QueryString,
} from "aws-cdk-lib/aws-logs";
import {
  CfnPolicy,
  Effect,
  ManagedPolicy,
  Policy,
  PolicyStatement,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Provider } from "aws-cdk-lib/custom-resources";
import { CfnQueue, Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { CfnOrganizationConfigRule } from "aws-cdk-lib/aws-config";
import { CfnSubscription, Topic, TracingConfig } from "aws-cdk-lib/aws-sns";
import { Alias } from "aws-cdk-lib/aws-kms";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Layer } from "../common/lambda-layer.construct";

/**
 * @description
 * This is Pre-Req Stack for Shield Automations.
 * The stack should be deployed in Organization management account
 * or delegated admin account as a service-managed StackSet.
 * @author aws-solutions
 */
export class ShieldAutomationsStack extends Stack {
  /**
   * stack deployment aws account
   */
  readonly account: string;
  /**
   * stack deployment aws region
   */
  readonly region: string;

  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);
    const stack = Stack.of(this);

    this.account = stack.account;
    this.region = stack.region;

    //=============================================================================================
    // Parameters
    //=============================================================================================
    const emailAddress = new CfnParameter(this, "EmailAddress", {
      type: "String",
      description:
        "Email address to receive notifications regarding problems that cannot be resolved without manual intervention (e.g., service limits reached).",
      allowedPattern: "^(?:\\S+@\\S+\\.\\S+)?$",
      default: "",
      constraintDescription:
        "Email Address is invalid. Please ensure it is of the form example@example.com",
      maxLength: 150,
    });

    const excludedAccounts = new CfnParameter(this, "ExcludedAccounts", {
      type: "CommaDelimitedList",
      default: "",
      description:
        "List of AWS accounts in your Organization to exclude from automated Health-based detection. Add your Organization Management Account ID " +
        "unless you have deployed the Shield Automations Prerequisite stack in your Management Account and wish to enable Health-based detection there.",
    });

    const eipCPUUtilizationMetricThreshold = new CfnParameter(
      this,
      "EIPCPUUtilizationMetricThreshold",
      {
        type: "Number",
        default: 85,
        description:
          "The CPUUtilization metric threshold (as a percentage) used to evaluate the health of EC2 instances " +
          "associated with an Elastic IP.",
        minValue: 1,
        maxValue: 100,
      }
    );

    const eipCPUUtilizationMetricStat = new CfnParameter(
      this,
      "EIPCPUUtilizationMetricStat",
      {
        type: "String",
        allowedValues: ["Average", "Minimum", "Maximum"],
        default: "Average",
        description:
          "The CPUUtilization metric statistic used to evaluate the health of EC2 instances " +
          "associated with an Elastic IP.",
      }
    );

    const eipNetworkInMetricThreshold = new CfnParameter(
      this,
      "EIPNetworkInMetricThreshold",
      {
        type: "Number",
        default: 1000,
        description:
          "The NetworkIn metric threshold (in Bytes) used to evaluate the health of EC2 instances " +
          "associated with an Elastic IP.",
        minValue: 0,
      }
    );

    const eipNetworkInMetricStat = new CfnParameter(
      this,
      "EIPNetworkInMetricStat",
      {
        type: "String",
        allowedValues: ["Sum", "Average", "Minimum", "Maximum"],
        default: "Sum",
        description:
          "The CPUUtilization metric statistic used to evaluate the health of EC2 instances " +
          "associated with an Elastic IP.",
      }
    );

    const nlbActiveFlowCountMetricThreshold = new CfnParameter(
      this,
      "NLBActiveFlowCountMetricThreshold",
      {
        type: "Number",
        default: 1000,
        description:
          "The ActiveFlowCount metric threshold used to evaluate the health of Network Load Balancers " +
          "associated with an Elastic IP.",
        minValue: 1,
      }
    );

    const nlbActiveFlowCountMetricStat = new CfnParameter(
      this,
      "NLBActiveFlowCountMetricStat",
      {
        type: "String",
        allowedValues: ["Average", "Minimum", "Maximum"],
        default: "Average",
        description:
          "The ActiveFlowCount metric statistic used to evaluate the health of Network Load Balancers " +
          "associated with an Elastic IP.",
      }
    );

    const nlbNewFlowCountMetricThreshold = new CfnParameter(
      this,
      "NLBNewFlowCountMetricThreshold",
      {
        type: "Number",
        default: 1000,
        description:
          "The NewFlowCount metric threshold used to evaluate the health of Network Load Balancers " +
          "associated with an Elastic IP.",
        minValue: 1,
      }
    );

    const nlbNewFlowCountMetricStat = new CfnParameter(
      this,
      "NLBNewFlowCountMetricStat",
      {
        type: "String",
        allowedValues: ["Sum", "Minimum", "Maximum"],
        default: "Sum",
        description:
          "The NewFlowCount metric statistic used to evaluate the health of Network Load Balancers " +
          "associated with an Elastic IP.",
      }
    );

    const elb4xxMetricThreshold = new CfnParameter(
      this,
      "ELB4xxMetricThreshold",
      {
        type: "Number",
        default: 1000,
        description:
          "The HTTPCode_ELB_4XX_Count metric threshold used to evaluate the health of Elastic Load Balancers.",
        minValue: 1,
      }
    );

    const elb4xxMetricStat = new CfnParameter(this, "ELB4xxMetricStat", {
      type: "String",
      allowedValues: ["Sum", "Average", "Minimum", "Maximum"],
      default: "Sum",
      description:
        "The HTTPCode_ELB_4XX_Count metric statistic used to evaluate the health of Elastic Load Balancers.",
    });

    const elb5xxMetricThreshold = new CfnParameter(
      this,
      "ELB5xxMetricThreshold",
      {
        type: "Number",
        default: 1000,
        description:
          "The HTTPCode_ELB_5XX_Count metric threshold used to evaluate the health of Elastic Load Balancers.",
        minValue: 1,
      }
    );

    const elb5xxMetricStat = new CfnParameter(this, "ELB5xxMetricStat", {
      type: "String",
      allowedValues: ["Sum", "Average", "Minimum", "Maximum"],
      default: "Sum",
      description:
        "The HTTPCode_ELB_5XX_Count metric statistic used to evaluate the health of Elastic Load Balancers.",
    });

    const cf4xxMetricThreshold = new CfnParameter(
      this,
      "CF4xxMetricThreshold",
      {
        type: "Number",
        default: 0.05,
        description:
          "The 4xxErrorRate metric threshold (as a percentage) used to evaluate the health of CloudFront Distributions.",
        minValue: 0,
      }
    );

    const cf4xxMetricStat = new CfnParameter(this, "CF4xxMetricStat", {
      type: "String",
      allowedValues: ["Average", "Minimum", "Maximum"],
      default: "Average",
      description:
        "The 4xxErrorRate metric statistic used to evaluate the health of CloudFront Distributions.",
    });

    const cf5xxMetricThreshold = new CfnParameter(
      this,
      "CF5xxMetricThreshold",
      {
        type: "Number",
        default: 0.05,
        description:
          "The 5xxErrorRate metric threshold (as a percentage) used to evaluate the health of CloudFront Distributions.",
        minValue: 0,
      }
    );

    const cf5xxMetricStat = new CfnParameter(this, "CF5xxMetricStat", {
      type: "String",
      allowedValues: ["Average", "Minimum", "Maximum"],
      default: "Average",
      description:
        "The 5xxErrorRate metric statistic used to evaluate the health of CloudFront Distributions.",
    });

    //=============================================================================================
    // Metadata
    //=============================================================================================
    const parameterGroups = [
      {
        Label: {
          default: "Do you want to receive notifications after deployment?",
        },
        Parameters: [emailAddress.logicalId],
      },
      {
        Label: {
          default:
            "Do you want to exclude any accounts from automated Health-based detection?",
        },
        Parameters: [excludedAccounts.logicalId],
      },
      {
        Label: {
          default: "CloudWatch metric configurations for Elastic IPs",
        },
        Parameters: [
          eipCPUUtilizationMetricThreshold.logicalId,
          eipCPUUtilizationMetricStat.logicalId,
          eipNetworkInMetricThreshold.logicalId,
          eipNetworkInMetricStat.logicalId,
        ],
      },
      {
        Label: {
          default:
            "CloudWatch metric configurations for Network Load Balancers",
        },
        Parameters: [
          nlbActiveFlowCountMetricThreshold.logicalId,
          nlbActiveFlowCountMetricStat.logicalId,
          nlbNewFlowCountMetricThreshold.logicalId,
          nlbNewFlowCountMetricStat.logicalId,
        ],
      },
      {
        Label: {
          default:
            "CloudWatch metric configurations for Elastic Load Balancers",
        },
        Parameters: [
          elb4xxMetricThreshold.logicalId,
          elb4xxMetricStat.logicalId,
          elb5xxMetricThreshold.logicalId,
          elb5xxMetricStat.logicalId,
        ],
      },
      {
        Label: {
          default:
            "CloudWatch metric configurations for CloudFront Distributions",
        },
        Parameters: [
          cf4xxMetricThreshold.logicalId,
          cf4xxMetricStat.logicalId,
          cf5xxMetricThreshold.logicalId,
          cf5xxMetricStat.logicalId,
        ],
      },
    ];

    const parameterLabels = {
      [emailAddress.logicalId]: {
        default: "Email Address",
      },
      [excludedAccounts.logicalId]: {
        default: "Excluded Accounts",
      },
      [eipCPUUtilizationMetricThreshold.logicalId]: {
        default: "CPUUtilization Metric Threshold",
      },
      [eipCPUUtilizationMetricStat.logicalId]: {
        default: "CPUUtilization Metric Statistic",
      },
      [eipNetworkInMetricThreshold.logicalId]: {
        default: "NetworkIn Metric Threshold",
      },
      [eipNetworkInMetricStat.logicalId]: {
        default: "NetworkIn Metric Statistic",
      },
      [nlbActiveFlowCountMetricThreshold.logicalId]: {
        default: "ActiveFlowCount Metric Threshold",
      },
      [nlbActiveFlowCountMetricStat.logicalId]: {
        default: "ActiveFlowCount Metric Statistic",
      },
      [nlbNewFlowCountMetricThreshold.logicalId]: {
        default: "NewFlowCount Metric Threshold",
      },
      [nlbNewFlowCountMetricStat.logicalId]: {
        default: "NewFlowCount Metric Statistic",
      },
      [elb4xxMetricThreshold.logicalId]: {
        default: "HTTPCode_ELB_4XX_Count Metric Threshold",
      },
      [elb4xxMetricStat.logicalId]: {
        default: "HTTPCode_ELB_4XX_Count Metric Statistic",
      },
      [elb5xxMetricThreshold.logicalId]: {
        default: "HTTPCode_ELB_5XX_Count Metric Threshold",
      },
      [elb5xxMetricStat.logicalId]: {
        default: "HTTPCode_ELB_5XX_Count Metric Statistic",
      },
      [cf4xxMetricThreshold.logicalId]: {
        default: "4xxErrorRate Metric Threshold",
      },
      [cf4xxMetricStat.logicalId]: {
        default: "4xxErrorRate Metric Statistic",
      },
      [cf5xxMetricThreshold.logicalId]: {
        default: "5xxErrorRate Metric Threshold",
      },
      [cf5xxMetricStat.logicalId]: {
        default: "5xxErrorRate Metric Statistic",
      },
    };

    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: parameterGroups,
        ParameterLabels: parameterLabels,
      },
    };
    this.templateOptions.description = `(${manifest.solution.shieldAutomationsSolutionId}) - The AWS CloudFormation template for deployment of the ${manifest.solution.name}. Version ${manifest.solution.solutionVersion}`;
    this.templateOptions.templateFormatVersion =
      manifest.solution.templateVersion;

    //=============================================================================================
    // Map
    //=============================================================================================
    const map = new CfnMapping(this, "ShieldAutomationsStackMap", {
      mapping: {
        Metric: {
          SendAnonymizedMetric: manifest.solution.sendMetric,
          MetricsEndpoint: manifest.solution.metricsEndpoint, // aws-solutions metrics endpoint
        },
        Solution: {
          SolutionId: manifest.solution.shieldAutomationsSolutionId,
          SolutionName: manifest.solution.name,
          SolutionVersion: manifest.solution.solutionVersion,
          UserAgentPrefix: manifest.solution.userAgentPrefix,
        },
        ShieldAutomationsStack: {
          ConfigRuleEvalPolicy:
            manifest.shieldAutomationsStack.configRuleEvalPolicy,
          ConfigRuleRemediatePolicy:
            manifest.shieldAutomationsStack.configRuleRemediatePolicy,
          OrganizationConfigRule:
            manifest.shieldAutomationsStack.organizationConfigRule,
          ConfigEvalCrossAccountRole:
            manifest.shieldAutomationsPrereqStack
              .configRuleEvalCrossAccountRole,
          ConfigRemediateCrossAccountRole:
            manifest.shieldAutomationsPrereqStack
              .configRuleRemediateCrossAccountRole,
          SNSTopicName: manifest.shieldAutomationsStack.SNSTopicName,
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

    const excludedAccountsExists = new CfnCondition(
      this,
      "excludedAccountsExists",
      {
        expression: Fn.conditionNot(
          Fn.conditionEquals(
            Fn.join(
              "",
              Fn.ref(excludedAccounts.logicalId) as unknown as string[] // excludedAccounts is a CommaDelimitedList
            ),
            ""
          )
        ),
      }
    );

    const conditionalExcludedAccounts = Fn.conditionIf(
      excludedAccountsExists.logicalId,
      excludedAccounts.valueAsList,
      Aws.NO_VALUE
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
     * @description lambda backed custom resource to validate and install pre-reqs
     * @type {Function}
     */
    const helperFunction: Function = new Function(
      this,
      "ShieldAutomationsHelper",
      {
        description: `${map.findInMap(
          "Solution",
          "SolutionId"
        )} - Function to help with FMS solution installation (DO NOT DELETE)`,
        runtime: LAMBDA_RUNTIME_NODE,
        code: Code.fromAsset(
          `${path.dirname(
            __dirname
          )}../../../services/helper/dist/helperFunction.zip`
        ),
        layers: [utilsLayer.layer],
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
      }
    );

    /**
     * @description iam permissions for the helper lambda function
     * @type {Policy}
     */
    const helperPolicy: Policy = new Policy(this, "HelperPolicy", {
      policyName: manifest.shieldAutomationsStack.helperPolicy,
      roles: [helperFunction.role!],
    });

    /**
     * @description iam policy for the helper lambda function
     * to validate Shield Subscription
     * @type {PolicyStatement}
     */
    const helperShieldReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "ShieldRead",
      actions: ["shield:GetSubscriptionState"],
      resources: ["*"],
    });
    helperPolicy.addStatements(helperShieldReadStatement);

    /**
     * @description iam policy for the helper lambda function
     * to retrieve Organization Management Account ID
     * @type {PolicyStatement}
     */
    const helperOrgReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "OrgRead",
      actions: ["organizations:DescribeOrganization"],
      resources: ["*"],
    });
    helperPolicy.addStatements(helperOrgReadStatement);

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
        Stack: "ShieldAutomationsStack",
        Account: this.account,
        Region: this.region,
      },
    });

    /**
     * @description SNS topic for communicating errors during automated Health-based detection
     * @type {Topic}
     */
    const shieldTopic: Topic = new Topic(this, "ShieldAutomationsTopic", {
      displayName: "FMS-Shield-Automations Topic",
      topicName: map.findInMap("ShieldAutomationsStack", "SNSTopicName"),
      masterKey: Alias.fromAliasName(this, "SNSKey", "alias/aws/sns"),
      enforceSSL: true,
      tracingConfig: TracingConfig.ACTIVE,
    });

    const snsDeadLetterQueue = new Queue(this, "ShieldAutomationsSNSDLQ", {
      queueName: "ShieldAutomations-SNS-DLQ",
      retentionPeriod: Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });

    const emailSubscription = shieldTopic.addSubscription(
      new EmailSubscription(emailAddress.valueAsString, {
        deadLetterQueue: snsDeadLetterQueue,
      })
    );

    const rawEmailSubscription = emailSubscription.node
      .defaultChild as CfnSubscription;
    rawEmailSubscription.cfnOptions.condition = emailAddressExists;

    /**
     * @description SQS Queue to invoke ConfigRuleRemediate lambda
     * @type {Queue}
     */
    const remediateQueue: Queue = new Queue(
      this,
      `FMS-ShieldAutomations-Queue`,
      {
        encryption: QueueEncryption.SQS_MANAGED,
        enforceSSL: true,
        queueName: "FMS-Shield-Remediate-Queue.fifo",
        fifo: true,
        contentBasedDeduplication: true,
        visibilityTimeout: Duration.minutes(90), // must be at least 5x the timeout of ConfigRuleRemediate lambda
      }
    );

    /**
     * Lambda layer for common Shield validation utils
     */
    const shieldAutomationsLayer = new Layer(
      this,
      "FMS-ShieldAutomations-Layer",
      `${path.dirname(
        __dirname
      )}../../../services/shieldAutomations/shieldLayer/dist/shieldLayer.zip`
    );

    /**
     * @description Health metric configurations for supported resource types.
     */
    const eipMetricConfig: string = this.zipMetricConfigs(
      [
        eipCPUUtilizationMetricThreshold.valueAsNumber,
        eipNetworkInMetricThreshold.valueAsNumber,
      ],
      [
        eipCPUUtilizationMetricStat.valueAsString,
        eipNetworkInMetricStat.valueAsString,
      ]
    );

    const nlbMetricConfig: string = this.zipMetricConfigs(
      [
        nlbActiveFlowCountMetricThreshold.valueAsNumber,
        nlbNewFlowCountMetricThreshold.valueAsNumber,
      ],
      [
        nlbActiveFlowCountMetricStat.valueAsString,
        nlbNewFlowCountMetricStat.valueAsString,
      ]
    );

    const elbMetricConfig: string = this.zipMetricConfigs(
      [
        elb4xxMetricThreshold.valueAsNumber,
        elb5xxMetricThreshold.valueAsNumber,
      ],
      [elb4xxMetricStat.valueAsString, elb5xxMetricStat.valueAsString]
    );

    const cfMetricConfig: string = this.zipMetricConfigs(
      [cf4xxMetricThreshold.valueAsNumber, cf5xxMetricThreshold.valueAsNumber],
      [cf4xxMetricStat.valueAsString, cf5xxMetricStat.valueAsString]
    );

    /**
     * @description lambda to handle custom evaluation for Organization Config Rule
     * @type {Function}
     */
    const configRuleEval: Function = new Function(
      this,
      "FMS-ShieldAutomations-ConfigRuleEval",
      {
        description: `${map.findInMap(
          "Solution",
          "SolutionId"
        )} - Function to handle custom evaluation for Organization Config Rule`,
        runtime: LAMBDA_RUNTIME_NODE,
        code: Code.fromAsset(
          `${path.dirname(
            __dirname
          )}../../../services/shieldAutomations/configEvalManager/dist/configEvalManager.zip`
        ),
        handler: "index.handler",
        memorySize: 1024,
        tracing: Tracing.ACTIVE,
        layers: [shieldAutomationsLayer.layer, utilsLayer.layer],
        environment: {
          LOG_LEVEL: LOG_LEVEL.INFO, //change as needed
          SOLUTION_NAME: map.findInMap("Solution", "SolutionName"),
          SOLUTION_VERSION: map.findInMap("Solution", "SolutionVersion"),
          SOLUTION_ID: map.findInMap("Solution", "SolutionId"),
          CROSS_ACCOUNT_ROLE: map.findInMap(
            "ShieldAutomationsStack",
            "ConfigEvalCrossAccountRole"
          ),
          TOPIC_ARN: shieldTopic.topicArn,
          REMEDIATION_QUEUE: `https://sqs.${this.region}.amazonaws.com/${this.account}/${remediateQueue.queueName}`,
          EIP_METRIC_CONFIG: eipMetricConfig,
          NLB_METRIC_CONFIG: nlbMetricConfig,
          ELB_METRIC_CONFIG: elbMetricConfig,
          CF_METRIC_CONFIG: cfMetricConfig,
          PARTITION: stack.partition,
          SERVICE_NAME: map.findInMap("Solution", "SolutionName"),
          METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
        },
        timeout: Duration.minutes(15),
      }
    );

    /**
     * @description log group for ConfigRuleEval lambda function
     * @type {LogGroup}
     */
    const configRuleEvalLogs: LogGroup = new LogGroup(
      this,
      "ConfigRuleEvalLogGroup",
      {
        logGroupName: `/aws/lambda/${configRuleEval.functionName}`,
        removalPolicy: RemovalPolicy.DESTROY,
        retention: RetentionDays.ONE_WEEK,
      }
    );

    configRuleEval.grantInvoke(new ServicePrincipal("config.amazonaws.com"));
    configRuleEval.role!.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        manifest.shieldAutomationsStack.AWSConfigManagedRole
      )
    );

    /**
     * @description IAM policy for ConfigRuleEval execution role
     * @type {Policy}
     */
    const configRuleEvalPolicy: Policy = new Policy(
      this,
      manifest.shieldAutomationsStack.configRuleEvalPolicy,
      {
        policyName: map.findInMap(
          "ShieldAutomationsStack",
          "ConfigRuleEvalPolicy"
        ),
        roles: [configRuleEval.role!],
      }
    );

    /**
     * @description IAM permissions for assuming cross-account role
     * @type {PolicyStatement}
     */
    const evalSTSAssumeStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "STSAssume",
      actions: ["sts:AssumeRole"],
      resources: [
        `arn:${stack.partition}:iam::*:role/${manifest.shieldAutomationsPrereqStack.configRuleEvalCrossAccountRole}`,
      ],
    });
    configRuleEvalPolicy.addStatements(evalSTSAssumeStatement);

    /**
     * @description IAM permissions for publishing sqs queue messages
     * @type {PolicyStatement}
     */
    const evalSQSWriteStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "SQSWrite",
      actions: ["sqs:SendMessage"],
      resources: [remediateQueue.queueArn],
    });
    configRuleEvalPolicy.addStatements(evalSQSWriteStatement);

    /**
     * @description lambda to handle remediation for Organization Config Rule
     * @type {Function}
     */
    const configRuleRemediate: Function = new Function(
      this,
      "FMS-ShieldAutomations-ConfigRuleRemediate",
      {
        description: `${map.findInMap(
          "Solution",
          "SolutionId"
        )} - Function to handle custom remediation for Organization Config Rule`,
        runtime: LAMBDA_RUNTIME_NODE,
        code: Code.fromAsset(
          `${path.dirname(
            __dirname
          )}../../../services/shieldAutomations/configRemediateManager/dist/configRemediateManager.zip`
        ),
        handler: "index.handler",
        memorySize: 1024,
        tracing: Tracing.ACTIVE,
        layers: [shieldAutomationsLayer.layer, utilsLayer.layer],
        environment: {
          LOG_LEVEL: LOG_LEVEL.INFO, //change as needed
          SOLUTION_NAME: map.findInMap("Solution", "SolutionName"),
          SOLUTION_VERSION: map.findInMap("Solution", "SolutionVersion"),
          SOLUTION_ID: map.findInMap("Solution", "SolutionId"),
          CROSS_ACCOUNT_ROLE: map.findInMap(
            "ShieldAutomationsStack",
            "ConfigRemediateCrossAccountRole"
          ),
          TOPIC_ARN: shieldTopic.topicArn,
          EIP_METRIC_CONFIG: eipMetricConfig,
          NLB_METRIC_CONFIG: nlbMetricConfig,
          ELB_METRIC_CONFIG: elbMetricConfig,
          CF_METRIC_CONFIG: cfMetricConfig,
          PARTITION: stack.partition,
          SERVICE_NAME: map.findInMap("Solution", "SolutionName"),
          METRICS_ENDPOINT: map.findInMap("Metric", "MetricsEndpoint"),
        },
        timeout: Duration.minutes(15),
      }
    );

    /**
     * @description log group for ConfigRuleRemediate lambda function
     * @type {LogGroup}
     */
    const configRuleRemediateLogs: LogGroup = new LogGroup(
      this,
      "ConfigRuleRemediateLogGroup",
      {
        logGroupName: `/aws/lambda/${configRuleRemediate.functionName}`,
        removalPolicy: RemovalPolicy.DESTROY,
        retention: RetentionDays.ONE_WEEK,
      }
    );

    /**
     * @description IAM policy for ConfigRuleRemediate execution role
     * @type {Policy}
     */
    const configRuleRemediatePolicy: Policy = new Policy(
      this,
      manifest.shieldAutomationsStack.configRuleRemediatePolicy,
      {
        policyName: map.findInMap(
          "ShieldAutomationsStack",
          "ConfigRuleRemediatePolicy"
        ),
        roles: [configRuleRemediate.role!],
      }
    );

    /**
     * @description IAM permissions for assuming cross-account role
     * @type {PolicyStatement}
     */
    const STSAssumeStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "STSAssume",
      actions: ["sts:AssumeRole"],
      resources: [
        `arn:${stack.partition}:iam::*:role/${manifest.shieldAutomationsPrereqStack.configRuleRemediateCrossAccountRole}`,
      ],
    });
    configRuleRemediatePolicy.addStatements(STSAssumeStatement);

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
    configRuleEvalPolicy.addStatements(xrayStatement);
    configRuleRemediatePolicy.addStatements(xrayStatement);

    /**
     * @description iam policy statement for ConfigRuleEval logs
     * @type {PolicyStatement}
     */
    const evalLogsStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "CloudWatchLogsWriteEval",
      actions: [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:CreateLogGroup",
      ],
      resources: [configRuleEvalLogs.logGroupArn],
    });
    configRuleEvalPolicy.addStatements(evalLogsStatement);

    /**
     * @description iam policy statement for ConfigRuleRemediate logs
     * @type {PolicyStatement}
     */
    const remediateLogsStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "CloudWatchLogsWriteRemediate",
      actions: [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:CreateLogGroup",
      ],
      resources: [configRuleRemediateLogs.logGroupArn],
    });
    configRuleRemediatePolicy.addStatements(remediateLogsStatement);

    /**
     * @description IAM permissions for writing to Shield SNS topic
     * @type {PolicyStatement}
     */
    const SNSWriteStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "SNSWrite",
      actions: ["sns:Publish"],
      resources: [shieldTopic.topicArn],
    });
    configRuleRemediatePolicy.addStatements(SNSWriteStatement);
    configRuleEvalPolicy.addStatements(SNSWriteStatement);

    /**
     * @description Event Source Mapping between ConfigRuleRemediate lambda and SQS Queue
     */
    configRuleRemediate.addEventSource(
      new SqsEventSource(remediateQueue, {
        batchSize: 1, // must be 1 to restrict concurrency and avoid breaching route 53 service limit
        reportBatchItemFailures: true,
      })
    );

    const orgConfigRule: CfnOrganizationConfigRule =
      new CfnOrganizationConfigRule(this, "FMS-ShieldAutomations-ConfigRule", {
        organizationConfigRuleName: map.findInMap(
          "ShieldAutomationsStack",
          "OrganizationConfigRule"
        ),
        excludedAccounts: conditionalExcludedAccounts as unknown as string[], // conditionalExcludedAccounts is CommaDelimitedList or AWS::NoValue
        organizationCustomRuleMetadata: {
          description: `${map.findInMap(
            "Solution",
            "SolutionId"
          )} - Organization Config Rule to handle creation of Route53 health checks`,
          lambdaFunctionArn: configRuleEval.functionArn,
          organizationConfigRuleTriggerTypes: [
            "ConfigurationItemChangeNotification",
            "ScheduledNotification",
          ],
          maximumExecutionFrequency: "TwentyFour_Hours",
          resourceTypesScope: [
            "AWS::Shield::Protection",
            "AWS::ShieldRegional::Protection",
          ],
        },
      });
    orgConfigRule.node.addDependency(configRuleEval);
    orgConfigRule.node.addDependency(configRuleRemediate);

    //=============================================================================================
    // Log Insights Queries
    //=============================================================================================
    const configRuleEvalErrorsQuery = new QueryDefinition(
      this,
      "ConfigRuleEvalErrorQuery",
      {
        queryDefinitionName: "FMS-Shield_ConfigRuleEval_Error_Query",
        queryString: new QueryString({
          fields: ["@timestamp", "@level"],
          sort: "@timestamp desc",
          filterStatements: ['level = "ERROR"'],
        }),
        logGroups: [configRuleEvalLogs],
      }
    );

    const configRuleRemediateErrorsQuery = new QueryDefinition(
      this,
      "ConfigRuleRemediateErrorQuery",
      {
        queryDefinitionName: "FMS-Shield_ConfigRuleRemediate_Error_Query",
        queryString: new QueryString({
          fields: ["@timestamp", "@level"],
          sort: "@timestamp desc",
          filterStatements: ['level = "ERROR"'],
        }),
        logGroups: [configRuleRemediateLogs],
      }
    );

    const healthCheckCreateSuccessQuery = new QueryDefinition(
      this,
      "HealthCheckCreateSuccessQuery",
      {
        queryDefinitionName: "FMS-Shield_Health_Check_Create_Success_Query",
        queryString: new QueryString({
          fields: ["@timestamp", "@message"],
          sort: "@timestamp desc",
          filterStatements: ['message like "Created Route53 Health Check" '],
        }),
        logGroups: [configRuleRemediateLogs],
      }
    );

    const remediationSuccessQuery = new QueryDefinition(
      this,
      "RemediationSuccessQuery",
      {
        queryDefinitionName: "FMS-Shield_Remediation_Success_Query",
        queryString: new QueryString({
          fields: ["@timestamp", "@message"],
          sort: "@timestamp desc",
          filterStatements: [
            'message like "Remediation successful for Shield Protection"',
          ],
        }),
        logGroups: [configRuleRemediateLogs],
      }
    );

    const associateHealthCheckSuccessQuery = new QueryDefinition(
      this,
      "AssociateHealthCheckSuccessQuery",
      {
        queryDefinitionName: "FMS-Shield_Associate_Health_Check_Success_Query",
        queryString: new QueryString({
          fields: ["@timestamp", "@message"],
          sort: "@timestamp desc",
          filterStatements: [
            'message like "Associated calculated Health Check"',
          ],
        }),
        logGroups: [configRuleRemediateLogs],
      }
    );

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

    const cfn_nag_w58 = {
      id: "W58",
      reason:
        "CloudWatch logs write permissions added with managed role AWSLambdaBasicExecutionRole",
    };

    const cfnEvalServiceRole = configRuleEval.role?.node.findChild(
      "DefaultPolicy"
    ).node.defaultChild as CfnPolicy;
    cfnEvalServiceRole.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W12",
            reason: "Resource * is required for xray permissions",
          },
        ],
      },
    };

    const cfnRemediateServiceRole = configRuleRemediate.role?.node.findChild(
      "DefaultPolicy"
    ).node.defaultChild as CfnPolicy;
    cfnRemediateServiceRole.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W12",
            reason: "Resource * is required for xray permissions",
          },
        ],
      },
    };

    const cfnHelperFunction = helperFunction.node.findChild(
      "Resource"
    ) as CfnFunction;
    cfnHelperFunction.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [cfn_nag_w58, ...cfn_nag_w89_w92],
      },
    };

    const cfnHelperProvider: CfnFunction =
      helperProvider.node.children[0].node.findChild("Resource") as CfnFunction;
    cfnHelperProvider.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [cfn_nag_w58, ...cfn_nag_w89_w92],
      },
    };

    const cfnEvalFunction: CfnFunction = configRuleEval.node.findChild(
      "Resource"
    ) as CfnFunction;
    cfnEvalFunction.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [cfn_nag_w58, ...cfn_nag_w89_w92],
      },
    };

    const cfnRemediateFunction: CfnFunction =
      configRuleRemediate.node.findChild("Resource") as CfnFunction;
    cfnRemediateFunction.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [cfn_nag_w58, ...cfn_nag_w89_w92],
      },
    };

    const cfnHelperPolicy = helperPolicy.node.findChild(
      "Resource"
    ) as CfnPolicy;
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

    const cfnConfigRuleEvalPolicy = configRuleEvalPolicy.node
      .defaultChild as CfnPolicy;
    cfnConfigRuleEvalPolicy.cfnOptions.metadata = {
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

    const cfnConfigRuleRemediatePolicy = configRuleRemediatePolicy.node
      .defaultChild as CfnPolicy;
    cfnConfigRuleRemediatePolicy.cfnOptions.metadata = {
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

    const cfnSNSDeadLetterQueue = snsDeadLetterQueue.node
      .defaultChild as CfnQueue;
    cfnSNSDeadLetterQueue.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W48",
            reason: "Queue is encrypted using SQS Managed keys",
          },
        ],
      },
    };

    const cfnRemediateQueue = remediateQueue.node.defaultChild as CfnQueue;
    cfnRemediateQueue.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W48",
            reason: "Queue is encrypted using SQS Managed keys",
          },
        ],
      },
    };

    (
      configRuleRemediateLogs.node.findChild("Resource") as CfnResource
    ).cfnOptions.metadata = {
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
      configRuleEvalLogs.node.findChild("Resource") as CfnResource
    ).cfnOptions.metadata = {
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

    //=============================================================================================
    // Output
    //=============================================================================================
    new CfnOutput(this, "Shield Automations SNS Topic", {
      description: "SNS Topic for Shield Automations notifications",
      value: shieldTopic.topicName,
    });

    new CfnOutput(this, "Organization Config Rule", {
      description: "OrgConfigRule for health-based detection automations",
      value: orgConfigRule.organizationConfigRuleName,
    });

    new CfnOutput(this, "ConfigRuleEval Lambda Function", {
      description:
        "Lambda function used by the Organization Config Rule for evaluation",
      value: configRuleEval.functionName,
    });

    new CfnOutput(this, "ConfigRuleRemediate Lambda Function", {
      description: "Lambda function used to create Route53 health checks",
      value: configRuleRemediate.functionName,
    });

    new CfnOutput(this, "ConfigRuleEval Function Error Query", {
      description: "Log Insights Query for ConfigRuleEval function errors",
      value: configRuleEvalErrorsQuery.queryDefinitionId,
    });

    new CfnOutput(this, "ConfigRuleRemediate Function Error Query", {
      description: "Log Insights Query for ConfigRuleRemediate function errors",
      value: configRuleRemediateErrorsQuery.queryDefinitionId,
    });

    new CfnOutput(this, "Health Check Create Success Query", {
      description: "Log Insights Query for Health Check Create Success events",
      value: healthCheckCreateSuccessQuery.queryDefinitionId,
    });

    new CfnOutput(this, "Remediate Success Query", {
      description:
        "Log Insights Query for successful remediation of Shield Protections.",
      value: remediationSuccessQuery.queryDefinitionId,
    });

    new CfnOutput(this, "Associate Health Check Success Query", {
      description:
        "Log Insights Query for successful associations between Health Checks and Shield Protections.",
      value: associateHealthCheckSuccessQuery.queryDefinitionId,
    });
  }

  /**
   * @description Helper function to zip metric configurations
   * from a list of thresholds and statistics. Each threshold in `thresholds`
   * must have an associated statistic in `statistics`.
   * @return Comma delimited list of metric configurations.
   */
  zipMetricConfigs(thresholds: number[], statistics: string[]): string {
    if (thresholds.length !== statistics.length) {
      throw new Error(
        "Number of metric thresholds must match number of metric statistics"
      );
    }

    const zippedMetricConfigs: string[] = thresholds.flatMap(
      (threshold, index) => [threshold.toString(10), statistics[index]]
    );

    return zippedMetricConfigs.join(",");
  }
}
