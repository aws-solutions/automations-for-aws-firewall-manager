// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 *
 */
import { UserAgent, UserAgentPair } from "@aws-sdk/types";

const userAgentPair: UserAgentPair = [
  `${process.env.USER_AGENT_PREFIX}/${process.env.SOLUTION_ID}`,
  `${process.env.SOLUTION_VERSION}`,
];
export const customUserAgent: UserAgent = [userAgentPair];

export enum PARTITION {
  AWS = "aws",
  AWS_CN = "aws-cn",
  AWS_US_GOV = "aws-us-gov",
}

export enum EVENT_SOURCE {
  REGION = "Region",
  OU = "OU",
  TAG = "Tag",
  S3 = "S3",
}

export function getDataplaneForPartition(partition: string): string {
  switch (partition) {
    case PARTITION.AWS_US_GOV:
      return "us-gov-west-1";
    case PARTITION.AWS_CN:
      return "cn-northwest-1";
    default:
      return "us-east-1";
  }
}

/**
 *
 */
export interface ITag {
  ResourceTags: { Key: string; Value: string }[];
  ExcludeResourceTags: boolean;
}

/**
 *
 */
export interface IValidator {
  isDelete(parameter: string[] | string): boolean;
  isValid(parameter: string[] | string): Promise<boolean>;
}

/**
 *
 */
export enum PARAMETER {
  REGION = "region",
  TAG = "tag",
  OU = "ou",
}

/**
 * @description interface for triggering events
 */
export interface IEvent {
  version: string;
  id: string;
  "detail-type": "Parameter Store Change" | "Object Created";
  source: "aws.ssm" | "aws.s3";
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: {
    operation: string;
    name: string;
    type: string;
    description: string;
  };
}

export interface RequiredSSMParameters {
  Ous: string[];
  Regions: string[];
  Tags: string;
}

export interface ValidationResults {
  regionDelete: boolean;
  regionValid: boolean;
  ouDelete: boolean;
  ouValid: boolean;
  tagDelete: boolean;
  tagValid: boolean;
}

export enum POLICY_TYPE {
  WAF_GLOBAL = "WAF_GLOBAL",
  WAF_REGIONAL = "WAF_REGIONAL",
  SHIELD_GLOBAL = "SHIELD_GLOBAL",
  SHIELD_REGIONAL = "SHIELD_REGIONAL",
  SG_USAGE_AUDIT = "SECURITY_GROUPS_USAGE_AUDIT",
  SG_CONTENT_AUDIT = "SECURITY_GROUPS_CONTENT_AUDIT",
  DNS_FIREWALL = "DNS_FIREWALL",
}

export interface IDNSFirewallPolicyDetails {
  type: string;
  preProcessRuleGroups: { ruleGroupId: string; priority: number }[];
  postProcessRuleGroups: { ruleGroupId: string; priority: number }[];
}

export const SNS_PUT_POLICY_ERROR_SUBJECT =
  "[Automations for AWS Firewall Manager] Error Creating Firewall Manager Policies";

export const SNS_S3_ERROR_SUBJECT =
  "[Automations for AWS Firewall Manager] Error Retrieving policy_manifest File From S3";

export const SNS_PUT_POLICY_ERROR_MESSAGE =
  "The following Firewall Manager policies could not be created. Please ensure that you have set up the " +
  "/FMS/OUs and /FMS/Regions Systems Manager parameters with your desired OUs and Regions. \nCheck the CloudWatch log group /aws/lambda/xxxx-PolicyStack-PolicyManager-xxxx for more details.\n\nPolicies: ";

export const SNS_S3_FETCH_ERROR_MESSAGE = `The solution failed to retrieve the policy_manifest.json file from S3 at ${process.env.POLICY_MANIFEST}. \nPlease ensure the file exists in the S3 bucket.`;
