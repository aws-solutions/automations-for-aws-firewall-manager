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
 * This is construct for supplementary IAM resources
 * @author @aws-solutions
 */
import { Construct } from "@aws-cdk/core";
import {
  IRole,
  Policy,
  PolicyStatement,
  Effect,
  CfnPolicy,
} from "@aws-cdk/aws-iam";
import manifest from "./manifest.json";

interface IIam {
  dynamodb: string;
  logGroup: string;
  sqs: string;
  role: IRole;
  accountId: string;
  region: string;
  metricsQueue: string;
}

export class IAMConstruct extends Construct {
  readonly dynamodb: string;
  readonly sqs: string;
  readonly logGroup: string;
  readonly role: IRole;
  readonly accountId: string;
  readonly region: string;
  readonly metricsQueue: string;
  constructor(scope: Construct, id: string, props: IIam) {
    super(scope, id);

    this.dynamodb = props.dynamodb;
    this.logGroup = props.logGroup;
    this.sqs = props.sqs;
    this.role = props.role;
    this.accountId = props.accountId;
    this.region = props.region;
    this.metricsQueue = props.metricsQueue;

    /**
     * @description iam policy for lambda role
     * @type {iam.Policy}
     */
    const po: Policy = new Policy(this, "policyManagerPolicy", {
      policyName: manifest.managerPolicy,
      roles: [this.role],
    });

    /**
     * @description iam policy statement for general permissions
     * @type {PolicyStatement}
     */
    const po0: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "FMSEC2Read0",
      actions: [
        "ec2:DescribeRegions",
        "wafv2:*",
        "shield:GetSubscriptionState",
      ],
      resources: ["*"],
    });

    /**
     * @description iam policy statement for dynamodb permissions
     * @type {PolicyStatement}
     */
    const po1: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "FMSDDBWrite01",
      actions: [
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
      ],
      resources: [this.dynamodb],
    });

    /**
     * @description iam policy statement for firewall manager permissions
     * @type {PolicyStatement}
     */
    const po2: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "FMSSecurityPolicyWrite02",
      actions: ["fms:PutPolicy", "fms:DeletePolicy"],
      resources: ["arn:aws:fms:*:*:policy/*"],
    });

    /**
     * @description iam policy statement for CloudWatch logs
     * @type {PolicyStatement}
     */
    const po3: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "FMSCloudWatchLogsWrite03",
      actions: [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:CreateLogGroup",
      ],
      resources: [this.logGroup],
    });

    /**
     * @description iam policy statement for sqs permissions
     * @type {iam.PolicyStatement}
     */
    const po4: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "FMSSQSWrite04",
      actions: ["sqs:SendMessage"],
      resources: [this.sqs, this.metricsQueue],
    });

    /**
     * @description iam policy statement for SSM parameter
     * @type {PolicyStatement}
     */
    const po5: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      sid: "FMSSecurityPolicyRead05",
      actions: ["ssm:GetParameter"],
      resources: [
        `arn:aws:ssm:${this.region}:${this.accountId}:parameter${manifest.ssmParameters.OUs}`,
        `arn:aws:ssm:${this.region}:${this.accountId}:parameter${manifest.ssmParameters.Region}`,
        `arn:aws:ssm:${this.region}:${this.accountId}:parameter${manifest.ssmParameters.Tags}`,
      ],
    });

    po.addStatements(po0);
    po.addStatements(po1);
    po.addStatements(po2);
    po.addStatements(po3);
    po.addStatements(po4);
    po.addStatements(po5);

    /**
     * cfn_nag suppress rules
     */
    const pm = po.node.findChild("Resource") as CfnPolicy;
    pm.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W12",
            reason:
              "* needed for ec2:DescribeRegions, does no support resource level permissions",
          },
          {
            id: "F4",
            reason: "Read & Write permissions needed to create WAFv2 policies",
          },
        ],
      },
    };
  }
}
