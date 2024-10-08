// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct } from "constructs";
import {
  IRole,
  Policy,
  PolicyStatement,
  Effect,
  CfnPolicy,
} from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Stack } from "aws-cdk-lib";

interface IIam {
  policyTable: string;
  logGroup: string;
  sqs: string;
  role: IRole;
  accountId: string;
  region: string;
  regionParamArn: string;
  ouParamArn: string;
  tagParamArn: string;
  s3Bucket: Bucket;
  policyIdentifier: string;
}

/**
 * @description
 * This is construct for supplementary IAM resources
 * @author aws-solutions
 */
export class IAMConstruct extends Construct {
  constructor(scope: Construct, id: string, props: IIam) {
    super(scope, id);

    const stack = Stack.of(this);

    /**
     * @description iam policy for lambda role
     */
    const readPolicy: Policy = new Policy(this, "FMSPolicyRead", {
      roles: [props.role],
    });

    /**
     * @description iam policy for lambda role
     */
    const writePolicy: Policy = new Policy(this, "FMSPolicyWrite", {
      roles: [props.role],
    });

    /**
     * @description iam policy statement for general permissions
     * @type {PolicyStatement}
     */
    const po0: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "EC2Read0",
      actions: ["ec2:DescribeRegions"],
      resources: ["*"], // resource level not supported for these IAM actions
    });
    readPolicy.addStatements(po0);

    /**
     * @description iam policy statement for dynamodb permissions
     * @type {PolicyStatement}
     */
    const po1: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "DDBWrite01",
      actions: [
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
      ],
      resources: [
        `arn:${stack.partition}:dynamodb:${props.region}:${props.accountId}:table/${props.policyTable}`,
      ],
    });
    writePolicy.addStatements(po1);

    /**
     * @description iam policy statement for firewall manager put/delete policy permissions
     * @type {PolicyStatement}
     */
    const po2: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "FMSWrite021",
      actions: ["fms:PutPolicy", "fms:GetPolicy", "fms:DeletePolicy"],
      resources: [`arn:${stack.partition}:fms:*:*:policy/*`],
    });
    writePolicy.addStatements(po2);

    /**
     * @description iam policy statement for CloudWatch logs
     * @type {PolicyStatement}
     */
    const po3: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "CloudWatchLogsWrite03",
      actions: [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:CreateLogGroup",
      ],
      resources: [props.logGroup],
    });
    writePolicy.addStatements(po3);

    /**
     * @description iam policy statement for SSM parameter
     * @type {PolicyStatement}
     */
    const po5: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "SSMRead05",
      actions: ["ssm:GetParametersByPath"],
      resources: [
        `arn:${stack.partition}:ssm:${props.region}:${props.accountId}:parameter/FMS/${props.policyIdentifier}*`,
      ],
    });
    readPolicy.addStatements(po5);

    /**
     * @description iam policy statement for S3 get policy manifest
     * @type {PolicyStatement}
     */
    const po6: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "S3Read06",
      actions: ["s3:GetObject"],
      resources: [props.s3Bucket.bucketArn, `${props.s3Bucket.bucketArn}/*`],
    });
    readPolicy.addStatements(po6);

    /**
     * @description iam policy statement for WAF and Shield
     * @type {PolicyStatement}
     */
    const po7: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "WAFWrite07",
      actions: ["wafv2:*", "shield:GetSubscriptionState"],
      resources: ["*"],
    });
    writePolicy.addStatements(po7);

    /**
     * @description iam policy statement for listing DNS Firewall
     * @type {PolicyStatement}
     */
    const po8: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "DNSList08",
      actions: ["route53resolver:ListFirewallRules"],
      resources: ["*"],
    });
    writePolicy.addStatements(po8);

    /**
     * @description iam policy statement for RAM
     * @type {PolicyStatement}
     */
    const po9: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "RAMWrite09",
      actions: ["ram:DeleteResourceShare"],
      resources: ["*"],
      conditions: {
        ["StringEquals"]: {
          "aws:ResourceTag/FMManaged": "true",
        },
      },
    });
    writePolicy.addStatements(po9);

    /**
     * @description iam policy statement for DNS Firewall and RAM
     * @type {PolicyStatement}
     */
    const po10: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "DNSRAMRead10",
      actions: [
        "route53resolver:ListFirewallDomainLists",
        "route53resolver:ListFirewallRuleGroups",
        "ram:ListResources",
      ],
      resources: ["*"], // resource level not supported for these IAM actions
    });
    readPolicy.addStatements(po10);

    /**
     * @description iam policy statement for create/delete/get DNS Firewall
     * @type {PolicyStatement}
     */
    const po11: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "DNSWFirewall11",
      actions: [
        "route53resolver:CreateFirewallRule",
        "route53resolver:CreateFirewallRuleGroup",
        "route53resolver:DeleteFirewallRuleGroup",
        "route53resolver:DeleteFirewallRule",
        "route53resolver:GetFirewallRuleGroup",
      ],
      resources: [
        `arn:${stack.partition}:route53resolver:*:${props.accountId}:firewall-domain-list/*`,
        `arn:${stack.partition}:route53resolver:*:${props.accountId}:firewall-rule-group/*`,
      ],
    });
    writePolicy.addStatements(po11);

    /**
     * cfn_nag suppress rules
     */
    (readPolicy.node.findChild("Resource") as CfnPolicy).cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W12",
            reason:
              "* needed for [ec2:DescribeRegions, route53resolver:ListFirewallDomainLists, route53resolver:ListFirewallRuleGroups, ram:ListResources], does no support resource level permissions",
          },
        ],
      },
    };
    (writePolicy.node.findChild("Resource") as CfnPolicy).cfnOptions.metadata =
      {
        cfn_nag: {
          rules_to_suppress: [
            {
              id: "W12",
              reason:
                "* resource used for fms and route53resolver actions, resources are created/deleted as part of solution",
            },
            {
              id: "F4",
              reason:
                "Read & Write permissions needed to create WAFv2 policies",
            },
          ],
        },
        guard: {
          SuppressedRules: ["IAM_POLICY_NON_COMPLIANT_ARN"],
          Reason:
            "DTAS guard rule incorrectly marks ARNs with wildcard (*) in region/account section as invalid",
        },
      };
  }
}
