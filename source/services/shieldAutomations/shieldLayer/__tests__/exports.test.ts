// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { getSNSErrorMessageBody } from "../lib/CommonExports";

import {
  getAlarmConfig,
  getALBAlarmConfig,
  getCFAlarmConfig,
  getCLBAlarmConfig,
  getEIPAlarmConfig,
  getNLBAlarmConfig,
} from "../lib/HealthCheckExports";
import { Statistic } from "@aws-sdk/client-cloudwatch";

describe("ShieldLayer Exports Tests", () => {
  describe("CommonExports tests", () => {
    const accountId = "accountId";
    const resourceId = "resourceId";
    const reason = "reason";

    it("should generate SNS error message body", () => {
      const snsErrorMessageBody = getSNSErrorMessageBody(
        accountId,
        resourceId,
        reason
      );

      expect(snsErrorMessageBody).toEqual(
        `The Shield Protection ${resourceId} in account ${accountId} could not be auto-remediated for the following reason:\n\n${reason}`
      );
    });
  });

  describe("HealthCheckExports tests", () => {
    it("should generate alarm config", () => {
      const alarmConfigInput = "1 ,Average, 2,Sum ";

      const alarmConfig = getAlarmConfig(alarmConfigInput);
      expect(alarmConfig).toStrictEqual({
        metric1Threshold: 1,
        metric1Stat: "Average",
        metric2Threshold: 2,
        metric2Stat: "Sum",
      });
    });

    it("should retrieve EIP alarm config", () => {
      const alarmConfig = getEIPAlarmConfig();
      expect(alarmConfig).toStrictEqual([
        {
          metric: "CPUUtilization",
          statistic: Statistic.Average,
          threshold: 1,
          dimensionName: "InstanceId",
          evaluationPeriods: 20,
          namespace: "AWS/EC2",
        },
        {
          metric: "NetworkIn",
          statistic: Statistic.Sum,
          threshold: 2,
          dimensionName: "InstanceId",
          evaluationPeriods: 20,
          namespace: "AWS/EC2",
        },
      ]);
    });

    it("should retrieve NLB alarm config", () => {
      const alarmConfig = getNLBAlarmConfig();
      expect(alarmConfig).toStrictEqual([
        {
          metric: "ActiveFlowCount",
          statistic: Statistic.Average,
          threshold: 3,
          dimensionName: "LoadBalancer",
          evaluationPeriods: 20,
          namespace: "AWS/NetworkELB",
        },
        {
          metric: "NewFlowCount",
          statistic: Statistic.Sum,
          threshold: 4,
          dimensionName: "LoadBalancer",
          evaluationPeriods: 20,
          namespace: "AWS/NetworkELB",
        },
      ]);
    });

    it("should retrieve CLB alarm config", () => {
      const alarmConfig = getCLBAlarmConfig();
      expect(alarmConfig).toStrictEqual([
        {
          metric: "HTTPCode_ELB_4XX",
          statistic: Statistic.Average,
          threshold: 7,
          dimensionName: "LoadBalancerName",
          evaluationPeriods: 20,
          namespace: "AWS/ELB",
        },
        {
          metric: "HTTPCode_ELB_5XX",
          statistic: Statistic.Sum,
          threshold: 8,
          dimensionName: "LoadBalancerName",
          evaluationPeriods: 20,
          namespace: "AWS/ELB",
        },
      ]);
    });

    it("should retrieve ALB alarm config", () => {
      const alarmConfig = getALBAlarmConfig();
      expect(alarmConfig).toStrictEqual([
        {
          metric: "HTTPCode_ELB_4XX_Count",
          statistic: Statistic.Average,
          threshold: 7,
          dimensionName: "LoadBalancer",
          evaluationPeriods: 20,
          namespace: "AWS/ApplicationELB",
        },
        {
          metric: "HTTPCode_ELB_5XX_Count",
          statistic: Statistic.Sum,
          threshold: 8,
          dimensionName: "LoadBalancer",
          evaluationPeriods: 20,
          namespace: "AWS/ApplicationELB",
        },
      ]);
    });

    it("should retrieve CF alarm config", () => {
      const alarmConfig = getCFAlarmConfig();
      expect(alarmConfig).toStrictEqual([
        {
          metric: "4xxErrorRate",
          statistic: Statistic.Average,
          threshold: 9,
          dimensionName: "DistributionId",
          evaluationPeriods: 20,
          namespace: "AWS/CloudFront",
        },
        {
          metric: "5xxErrorRate",
          statistic: Statistic.Sum,
          threshold: 10,
          dimensionName: "DistributionId",
          evaluationPeriods: 20,
          namespace: "AWS/CloudFront",
        },
      ]);
    });
  });
});
