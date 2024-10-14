// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  Stack,
  App,
  StackProps,
  CustomResource,
  CfnMapping,
  Duration,
} from "aws-cdk-lib";
import { Code, Function, CfnFunction } from "aws-cdk-lib/aws-lambda";
import { LAMBDA_RUNTIME_NODE, LOG_LEVEL } from "../common/exports";
import * as path from "path";
import manifest from "../solution_manifest.json";
import {
  AnyPrincipal,
  CfnPolicy,
  CfnRole,
  Effect,
  ManagedPolicy,
  Policy,
  PolicyStatement,
  PrincipalWithConditions,
  Role,
} from "aws-cdk-lib/aws-iam";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Layer } from "../common/lambda-layer.construct";

/**
 * @description
 * This is Pre-Req Stack for Shield Automations.
 * The stack should be deployed in Organization management account
 * or delegated admin account as a service-managed StackSet.
 * @author aws-solutions
 */
export class ShieldAutomationsPrereqStack extends Stack {
  /**
   * stack deployment aws account
   */
  readonly account: string;

  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const stack = Stack.of(this);

    this.account = stack.account;

    //=============================================================================================
    // Metadata
    //=============================================================================================

    this.templateOptions.description = `(${manifest.solution.shieldAutomationsPrereqSolutionId}) - The AWS CloudFormation template for deployment of the ${manifest.solution.name}. Version ${manifest.solution.solutionVersion}`;
    this.templateOptions.templateFormatVersion =
      manifest.solution.templateVersion;

    //=============================================================================================
    // Map
    //=============================================================================================
    const map = new CfnMapping(this, "ShieldAutomationsPrereqStackMap", {
      mapping: {
        Metric: {
          SendAnonymizedMetric: manifest.solution.sendMetric,
          MetricsEndpoint: manifest.solution.metricsEndpoint, // aws-solutions metrics endpoint
        },
        Solution: {
          SolutionId: manifest.solution.secondarySolutionId,
          SolutionName: manifest.solution.name,
          SolutionVersion: manifest.solution.solutionVersion,
          UserAgentPrefix: manifest.solution.userAgentPrefix,
        },
        ShieldAutomationsPrereq: {
          ConfigRuleEvalCrossAccountRole:
            manifest.shieldAutomationsPrereqStack
              .configRuleEvalCrossAccountRole,
          ConfigRuleEvalExecutionRole:
            manifest.shieldAutomationsStack.configRuleEvalExecutionRole,
          ConfigRuleEvalCrossAccountPolicy:
            manifest.shieldAutomationsPrereqStack
              .configRuleEvalCrossAccountPolicy,
          ConfigRuleRemediateCrossAccountRole:
            manifest.shieldAutomationsPrereqStack
              .configRuleRemediateCrossAccountRole,
          ConfigRuleRemediateExecutionRole:
            manifest.shieldAutomationsStack.configRuleRemediateExecutionRole,
          ConfigRuleRemediateCrossAccountPolicy:
            manifest.shieldAutomationsPrereqStack
              .configRuleRemediateCrossAccountPolicy,
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
      "ShieldAutomationsPrereqHelper",
      {
        description: `${map.findInMap(
          "Solution",
          "SolutionId"
        )} - Function to help with ShieldAutomationsPrereq installation (DO NOT DELETE)`,
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
      policyName: manifest.shieldAutomationsPrereqStack.helperPolicy,
      roles: [helperFunction.role!],
    });

    const helperOrgReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "OrgRead",
      actions: ["organizations:DescribeOrganization"],
      resources: ["*"],
    });
    helperPolicy.addStatements(helperOrgReadStatement);

    /**
     * @description custom resource for helper functions
     * @type {Provider}
     */
    const helperProvider = new Provider(this, "HelperProvider", {
      onEventHandler: helperFunction,
    });

    /**
     * Get Organization ID for deployment
     */
    const organizationId = new CustomResource(this, "DescribeOrganization", {
      resourceType: "Custom::DescribeOrganization",
      serviceToken: helperProvider.serviceToken,
    });

    /**
     * @description IAM role to be assumed by ConfigRuleEval lambda
     * in Organization's member accounts.
     * @type {Role}
     */
    const configRuleEvalRole: Role = new Role(
      this,
      manifest.shieldAutomationsPrereqStack.configRuleEvalCrossAccountRole,
      {
        assumedBy: new PrincipalWithConditions(new AnyPrincipal(), {
          StringEquals: {
            "aws:PrincipalOrgID": organizationId.getAttString("organizationId"),
          },
        }),
        description:
          "IAM Role to be assumed by the ConfigRuleEval lambda created by ShieldAutomations stack.",
        roleName: map.findInMap(
          "ShieldAutomationsPrereq",
          "ConfigRuleEvalCrossAccountRole"
        ),
      }
    );
    configRuleEvalRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        manifest.shieldAutomationsPrereqStack.AWSConfigManagedRole
      )
    );

    /**
     * @description IAM policy for ConfigRuleEval cross account role
     * @type {Policy}
     */
    const configRuleEvalPolicy: Policy = new Policy(
      this,
      manifest.shieldAutomationsPrereqStack.configRuleEvalCrossAccountPolicy,
      {
        policyName: map.findInMap(
          "ShieldAutomationsPrereq",
          "ConfigRuleEvalCrossAccountPolicy"
        ),
        roles: [configRuleEvalRole],
      }
    );

    /**
     * @description IAM role to be assumed by ConfigRuleRemediate lambda
     * in Organization's member accounts.
     * @type {Role}
     */
    const configRuleRemediateRole: Role = new Role(
      this,
      manifest.shieldAutomationsPrereqStack.configRuleRemediateCrossAccountRole,
      {
        assumedBy: new PrincipalWithConditions(new AnyPrincipal(), {
          StringEquals: {
            "aws:PrincipalOrgID": organizationId.getAttString("organizationId"),
          },
        }),
        description:
          "IAM Role to be assumed by the ConfigRuleRemediate lambda created by ShieldAutomations stack.",
        roleName: map.findInMap(
          "ShieldAutomationsPrereq",
          "ConfigRuleRemediateCrossAccountRole"
        ),
      }
    );

    /**
     * @description IAM policy for ConfigRuleRemediate cross account role
     * @type {Policy}
     */
    const configRuleRemediatePolicy: Policy = new Policy(
      this,
      manifest.shieldAutomationsPrereqStack.configRuleRemediateCrossAccountPolicy,
      {
        policyName: map.findInMap(
          "ShieldAutomationsPrereq",
          "ConfigRuleRemediateCrossAccountPolicy"
        ),
        roles: [configRuleRemediateRole],
      }
    );

    /**
     * @description IAM permissions for writing to shield
     * @type {PolicyStatement}
     */
    const remediateShieldWriteStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "ShieldWrite",
      actions: ["shield:AssociateHealthCheck"],
      resources: [
        `arn:${stack.partition}:shield::${this.account}:protection/*`,
      ],
    });
    configRuleRemediatePolicy.addStatements(remediateShieldWriteStatement);

    /**
     * @description IAM permissions for writing to Route53
     * @type {PolicyStatement}
     */
    const remediateRoute53CreateStatement: PolicyStatement =
      new PolicyStatement({
        effect: Effect.ALLOW,
        sid: "Route53Create",
        actions: ["route53:CreateHealthCheck"],
        resources: ["*"],
      });
    configRuleRemediatePolicy.addStatements(remediateRoute53CreateStatement);

    /**
     * @description IAM permissions for ELB resources
     * @type {PolicyStatement}
     */
    const remediateELBReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "ELBRead",
      actions: ["elasticloadbalancing:DescribeLoadBalancers"],
      resources: ["*"],
    });
    configRuleRemediatePolicy.addStatements(remediateELBReadStatement);

    /**
     * @description IAM permissions for CloudFront resources
     * @type {PolicyStatement}
     */
    const remediateCFReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "CFRead",
      actions: ["cloudfront:GetDistribution"],
      resources: [
        `arn:${stack.partition}:cloudfront::${this.account}:distribution/*`,
      ],
    });
    configRuleRemediatePolicy.addStatements(remediateCFReadStatement);

    /**
     * @description IAM permissions for CloudWatch Alarm
     * @type {PolicyStatement}
     */
    const remediateCWWriteStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "CloudWatchWrite",
      actions: ["cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms"],
      resources: [
        `arn:${stack.partition}:cloudwatch:*:${this.account}:alarm:*`,
      ],
    });
    configRuleRemediatePolicy.addStatements(remediateCWWriteStatement);

    /**
     * @description IAM permissions for reading Route53
     * @type {PolicyStatement}
     */
    const remediateRoute53ReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "Route53Read",
      actions: ["route53:GetHealthCheck"],
      resources: [`arn:${stack.partition}:route53:::healthcheck/*`],
    });
    configRuleRemediatePolicy.addStatements(remediateRoute53ReadStatement);

    /**
     * @description IAM permissions for writing to Route53
     * @type {PolicyStatement}
     */
    const remediateRoute53WriteStatement: PolicyStatement = new PolicyStatement(
      {
        effect: Effect.ALLOW,
        sid: "Route53Write",
        actions: ["route53:UpdateHealthCheck", "route53:DeleteHealthCheck"],
        resources: [`arn:${stack.partition}:route53:::healthcheck/*`],
      }
    );
    configRuleRemediatePolicy.addStatements(remediateRoute53WriteStatement);

    /**
     * @description IAM permissions for CloudWatch Alarm
     * @type {PolicyStatement}
     */
    const remediateCWReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "CloudWatchRead",
      actions: ["cloudwatch:DescribeAlarms"],
      resources: [
        `arn:${stack.partition}:cloudwatch:*:${this.account}:alarm:*`,
      ],
    });
    configRuleRemediatePolicy.addStatements(remediateCWReadStatement);

    const evalConfigReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "ConfigRead",
      actions: [
        "config:DescribeConfigRuleEvaluationStatus",
        "config:DescribeComplianceByResource",
      ],
      resources: ["*"],
    });
    configRuleEvalPolicy.addStatements(evalConfigReadStatement);

    /**
     * @description IAM permissions for reading shield resources
     * @type {PolicyStatement}
     */
    const shieldReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "ShieldRead",
      actions: ["shield:DescribeProtection"],
      resources: [
        `arn:${stack.partition}:shield::${this.account}:protection/*`,
      ],
    });
    configRuleEvalPolicy.addStatements(shieldReadStatement);
    configRuleRemediatePolicy.addStatements(shieldReadStatement);

    /**
     * @description IAM permissions for EC2 resources
     * @type {PolicyStatement}
     */
    const ec2ReadStatement: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "EC2Read",
      actions: ["ec2:DescribeAddresses", "ec2:DescribeNetworkInterfaces"],
      resources: ["*"],
    });
    configRuleEvalPolicy.addStatements(ec2ReadStatement);
    configRuleRemediatePolicy.addStatements(ec2ReadStatement);

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

    const cfnEvalPolicy = configRuleEvalPolicy.node.findChild(
      "Resource"
    ) as CfnPolicy;
    cfnEvalPolicy.cfnOptions.metadata = {
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

    const cfnRemediatePolicy = configRuleRemediatePolicy.node.findChild(
      "Resource"
    ) as CfnPolicy;
    cfnRemediatePolicy.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W12",
            reason:
              "Resource * is required for IAM actions that do not support resource level permissions",
          },
          {
            id: "W76",
            reason: "All permissions required for lambda execution",
          },
        ],
      },
    };

    const cfnEvalRole = configRuleEvalRole.node.findChild(
      "Resource"
    ) as CfnRole;
    cfnEvalRole.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W28",
            reason: "Role name is required for cross-account role assumption",
          },
        ],
      },
      guard: {
        SuppressedRules: ["CFN_NO_EXPLICIT_RESOURCE_NAMES"],
      },
    };

    const cfnRemediateRole = configRuleRemediateRole.node.findChild(
      "Resource"
    ) as CfnRole;
    cfnRemediateRole.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W28",
            reason: "Role name is required for cross-account role assumption",
          },
        ],
      },
      guard: {
        SuppressedRules: ["CFN_NO_EXPLICIT_RESOURCE_NAMES"],
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
  }
}
