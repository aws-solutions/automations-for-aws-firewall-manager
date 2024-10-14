// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Statistic } from "@aws-sdk/client-cloudwatch";
import { ShieldResource } from "./CommonExports";

export interface AlarmMetricConfig {
  metric: string;
  statistic: Statistic;
  threshold: number;
  dimensionName: string;
  evaluationPeriods: number;
  namespace: string;
}

/**
 * @description Mapping of string to its associated Alarm Statistic
 */
export const AlarmStatistics: Record<string, Statistic> = {
  ["Average"]: Statistic.Average,
  ["Sum"]: Statistic.Sum,
  ["Minimum"]: Statistic.Minimum,
  ["Maximum"]: Statistic.Maximum,
};

/**
 * @description Retrieves CloudWatch Alarm configuration from comma delimited string.
 * `commaDelimitedList` should be one of the ALARM_CONFIG environment variables set by the Shield Automations stack.
 */
export function getAlarmConfig(input: string) {
  const configAsString = input.replace(/\s/g, "").split(",");

  return {
    metric1Threshold: Number(configAsString[0]),
    metric1Stat: AlarmStatistics[configAsString[1]],
    metric2Threshold: Number(configAsString[2]),
    metric2Stat: AlarmStatistics[configAsString[3]],
  };
}

/**
 * @description Retrieves CloudWatch Metrics used to monitor EIP health
 */
export function getEIPAlarmConfig(): AlarmMetricConfig[] {
  const alarmConfig = getAlarmConfig(<string>process.env.EIP_METRIC_CONFIG);
  return [
    {
      metric: "CPUUtilization",
      statistic: alarmConfig.metric1Stat,
      threshold: alarmConfig.metric1Threshold,
      dimensionName: "InstanceId",
      evaluationPeriods: 20,
      namespace: "AWS/EC2",
    },
    {
      metric: "NetworkIn",
      statistic: alarmConfig.metric2Stat,
      threshold: alarmConfig.metric2Threshold,
      dimensionName: "InstanceId",
      evaluationPeriods: 20,
      namespace: "AWS/EC2",
    },
  ];
}

/**
 * @description Retrieves CloudWatch Metrics used to monitor NLB health
 */
export function getNLBAlarmConfig(): AlarmMetricConfig[] {
  const alarmConfig = getAlarmConfig(<string>process.env.NLB_METRIC_CONFIG);
  return [
    {
      metric: "ActiveFlowCount",
      statistic: alarmConfig.metric1Stat,
      threshold: alarmConfig.metric1Threshold,
      dimensionName: "LoadBalancer",
      evaluationPeriods: 20,
      namespace: "AWS/NetworkELB",
    },
    {
      metric: "NewFlowCount",
      statistic: alarmConfig.metric2Stat,
      threshold: alarmConfig.metric2Threshold,
      dimensionName: "LoadBalancer",
      evaluationPeriods: 20,
      namespace: "AWS/NetworkELB",
    },
  ];
}

/**
 * @description Retrieves CloudWatch Metrics used to monitor CLB health
 */
export function getCLBAlarmConfig(): AlarmMetricConfig[] {
  const alarmConfig = getAlarmConfig(<string>process.env.ELB_METRIC_CONFIG);
  return [
    {
      metric: "HTTPCode_ELB_4XX",
      statistic: alarmConfig.metric1Stat,
      threshold: alarmConfig.metric1Threshold,
      dimensionName: "LoadBalancerName",
      evaluationPeriods: 20,
      namespace: "AWS/ELB",
    },
    {
      metric: "HTTPCode_ELB_5XX",
      statistic: alarmConfig.metric2Stat,
      threshold: alarmConfig.metric2Threshold,
      dimensionName: "LoadBalancerName",
      evaluationPeriods: 20,
      namespace: "AWS/ELB",
    },
  ];
}

/**
 * @description Retrieves CloudWatch Metrics used to monitor ALB health
 */
export function getALBAlarmConfig(): AlarmMetricConfig[] {
  const alarmConfig = getAlarmConfig(<string>process.env.ELB_METRIC_CONFIG);
  return [
    {
      metric: "HTTPCode_ELB_4XX_Count",
      statistic: alarmConfig.metric1Stat,
      threshold: alarmConfig.metric1Threshold,
      dimensionName: "LoadBalancer",
      evaluationPeriods: 20,
      namespace: "AWS/ApplicationELB",
    },
    {
      metric: "HTTPCode_ELB_5XX_Count",
      statistic: alarmConfig.metric2Stat,
      threshold: alarmConfig.metric2Threshold,
      dimensionName: "LoadBalancer",
      evaluationPeriods: 20,
      namespace: "AWS/ApplicationELB",
    },
  ];
}

/**
 * @description Retrieves CloudWatch Metrics used to monitor CloudFront Distribution health
 */
export function getCFAlarmConfig(): AlarmMetricConfig[] {
  const alarmConfig = getAlarmConfig(<string>process.env.CF_METRIC_CONFIG);
  return [
    {
      metric: "4xxErrorRate",
      statistic: alarmConfig.metric1Stat,
      threshold: alarmConfig.metric1Threshold,
      dimensionName: "DistributionId",
      evaluationPeriods: 20,
      namespace: "AWS/CloudFront",
    },
    {
      metric: "5xxErrorRate",
      statistic: alarmConfig.metric2Stat,
      threshold: alarmConfig.metric2Threshold,
      dimensionName: "DistributionId",
      evaluationPeriods: 20,
      namespace: "AWS/CloudFront",
    },
  ];
}

/**
 * @description Mapping of Shield Resource Type to its associated Alarm configuration
 */
export const AlarmConfigs: Record<ShieldResource, AlarmMetricConfig[]> = {
  [ShieldResource.ApplicationLoadBalancer]: getALBAlarmConfig(),
  [ShieldResource.ElasticIP]: getEIPAlarmConfig(),
  [ShieldResource.CloudFrontDistribution]: getCFAlarmConfig(),
  [ShieldResource.ClassicLoadBalancer]: getCLBAlarmConfig(),
  [ShieldResource.NetworkLoadBalancer]: getNLBAlarmConfig(),
  IncompleteElasticIP: [],
  Unknown: [],
};
