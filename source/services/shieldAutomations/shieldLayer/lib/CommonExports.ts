// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ConfigurationItem } from "@aws-sdk/client-config-service";

export interface ConfigEvaluationEvent {
  invokingEvent: string;
  ruleParameters: string;
  resultToken: string;
  eventLeftScope: boolean;
  executionRoleArn: string;
  configRuleArn: string;
  configRuleName: string;
  configRuleId: string;
  accountId: string;
  version: string;
}

export interface ConfigInvokingEvent {
  configurationItemDiff: unknown | undefined;
  configurationItem: ConfigurationItem | undefined;
  notificationCreationTime: string;
  messageType: string;
  recordVersion: string;
  resultToken: string;
  awsAccountId: string | undefined;
}

export enum ShieldResource {
  ApplicationLoadBalancer = "ApplicationLoadBalancer",
  ElasticIP = "ElasticIP",
  IncompleteElasticIP = "IncompleteElasticIP",
  CloudFrontDistribution = "CloudFrontDistribution",
  ClassicLoadBalancer = "ClassicLoadBalancer",
  NetworkLoadBalancer = "NetworkLoadBalancer",
  Unknown = "Unknown",
}

export interface ShieldValidatorResponse {
  isValid: boolean;
  isIncompleteEIP: boolean;
}

export interface ProtectedResourceTypeResponse {
  protectedResourceType: ShieldResource;
  protectedResourceId: string;
}

export interface RemediationRequest {
  accountId: string;
  shieldProtectionId: string;
  resultToken: string;
  timestamp: string;
}

export const SNS_REMEDIATION_ERROR_SUBJECT =
  "[Automations for AWS Firewall Manager] Shield resource could not be auto-remediated";

export const SNS_INCOMPLETE_EIP_REASON =
  "The Elastic IP associated with this Shield Protection must be attached to an EC2 Instance or Network Load Balancer for automatic Health-check creation to occur. \n\n" +
  `To view the Elastic IP associated with this Shield Protection, sign-in to the AWS Config console using the account listed above and navigate to the "Resources" tab. ` +
  `Next, copy & paste the Shield Protection ID from above into the "resource identifier" search bar and select the appropriate resource. The associated Elastic IP will be listed under "Protected resource ARN" in the Details pane. \n\n` +
  "Once you have associated the protected Elastic IP with an EC2 Instance or Network Load Balancer, remediation will continue automatically within 1 day. \n\n" +
  "You may choose to ignore this message if you do not wish for the resource to be included in Shield Health-based detection at this time.";

export const SNS_HEALTH_CHECK_LIMIT_REASON =
  "New Route 53 Health Checks could not be created because your account has reached the service limit for Health Checks. " +
  "Once resolved, remediation will continue automatically.";

export const SNS_CLOUDWATCH_ALARM_LIMIT_REASON =
  "New CloudWatch Metric Alarms could not be created because your account has reached the service limit for Metric Alarms. " +
  "Once resolved, remediation will continue automatically.";

/**
 * @description Generates the body of the email to be sent when a resource could not be auto-remediated.
 */
export function getSNSErrorMessageBody(
  accountId: string,
  resourceId: string,
  reason: string
) {
  return `The Shield Protection ${resourceId} in account ${accountId} could not be auto-remediated for the following reason:\n\n${reason}`;
}
