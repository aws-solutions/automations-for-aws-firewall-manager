/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
 *
 */
export const dataplane = "us-east-1";
export const customUserAgent = <string>process.env.CUSTOM_SDK_USER_AGENT;

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
  "detail-type": "Parameter Store Change";
  source: "aws.ssm";
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

export interface IValidatorObject {
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
