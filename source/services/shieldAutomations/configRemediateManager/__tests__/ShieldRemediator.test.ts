// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { Protection } from "@aws-sdk/client-shield";
import { ShieldHandler } from "/opt/nodejs/lib/ShieldHandler";
import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { ShieldResource } from "/opt/nodejs/lib/CommonExports";
import { ShieldRemediator } from "../lib/ShieldRemediator";
import { mockClient } from "aws-sdk-client-mock";
import {
  CreateHealthCheckCommand,
  DeleteHealthCheckCommand,
  HealthCheckType,
  Route53Client,
} from "@aws-sdk/client-route-53";
import {
  CloudWatchClient,
  DeleteAlarmsCommand,
  PutMetricAlarmCommand,
  Statistic,
} from "@aws-sdk/client-cloudwatch";
import { AlarmConfigs } from "/opt/nodejs/lib/HealthCheckExports";

jest.mock("/opt/nodejs/lib/ShieldHandler");

const shieldProtectionDetails: Protection = {
  Id: "mockProtectionId",
  Name: "mockProtectionName",
  ResourceArn: "mockResourceArn",
};
const mockCredentials = {
  AccessKeyId: "accessKeyId",
  SecretAccessKey: "secretAccessKey",
  SessionToken: "sessionToken",
  Expiration: new Date(),
};

describe("ShieldRemediator tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("executeRemediation", () => {
    const mockShieldHandler = new ShieldHandler(
      mockCredentials,
      new Tracer(),
      new Logger()
    );
    const shieldRemediator = new ShieldRemediator(
      mockShieldHandler,
      shieldProtectionDetails,
      "region",
      "accountId"
    );

    const mockGetProtectedAWSResourceType = jest.fn();
    const mockRemediateByResourceType = jest.fn();

    mockShieldHandler.getProtectedAWSResourceType =
      mockGetProtectedAWSResourceType;
    shieldRemediator.remediateByResourceType = mockRemediateByResourceType;

    it("does not remediate incomplete Elastic IP", async () => {
      mockGetProtectedAWSResourceType.mockResolvedValue({
        protectedResourceType: ShieldResource.IncompleteElasticIP,
        protectedResourceId: "resourceId",
      });

      await shieldRemediator.executeRemediation(mockCredentials);
      expect(mockRemediateByResourceType).not.toHaveBeenCalled();
    });

    it("does not remediate unknown resource type", async () => {
      mockGetProtectedAWSResourceType.mockResolvedValue({
        protectedResourceType: ShieldResource.Unknown,
        protectedResourceId: "resourceId",
      });

      await shieldRemediator.executeRemediation(mockCredentials);
      expect(mockRemediateByResourceType).not.toHaveBeenCalled();
    });

    it("remediates valid resource type", async () => {
      mockGetProtectedAWSResourceType.mockResolvedValue({
        protectedResourceType: ShieldResource.ApplicationLoadBalancer,
        protectedResourceId: "resourceId",
      });

      await shieldRemediator.executeRemediation(mockCredentials);
      expect(mockRemediateByResourceType).toHaveBeenCalled();
    });
  });

  describe("createHealthCheck", () => {
    const mockShieldHandler = new ShieldHandler(
      mockCredentials,
      new Tracer(),
      new Logger()
    );
    const shieldRemediator = new ShieldRemediator(
      mockShieldHandler,
      shieldProtectionDetails,
      "region",
      "accountId"
    );

    const mockRoute53Client = mockClient(Route53Client);

    beforeEach(() => {
      mockRoute53Client.reset();
    });

    it("creates CloudWatch Metric health check", async () => {
      mockRoute53Client.on(CreateHealthCheckCommand).resolvesOnce({
        HealthCheck: {
          Id: "mockHealthCheckId",
          HealthCheckConfig: {
            Type: "CLOUDWATCH_METRIC",
          },
          HealthCheckVersion: 1,
          CallerReference: "mockCallerReference",
        },
      });

      await expect(
        shieldRemediator.createHealthCheck(
          new Route53Client({}),
          HealthCheckType.CLOUDWATCH_METRIC,
          "alarmName",
          []
        )
      ).resolves.toEqual("mockHealthCheckId");
    });

    it("creates Calculated health check", async () => {
      mockRoute53Client.on(CreateHealthCheckCommand).resolvesOnce({
        HealthCheck: {
          Id: "mockHealthCheckId",
          HealthCheckConfig: {
            Type: "CLOUDWATCH_METRIC",
          },
          HealthCheckVersion: 1,
          CallerReference: "mockCallerReference",
        },
      });

      await expect(
        shieldRemediator.createHealthCheck(
          new Route53Client({}),
          HealthCheckType.CALCULATED,
          "alarmName",
          ["childId"]
        )
      ).resolves.toEqual("mockHealthCheckId");
    });

    it("throws an error if route53 client returns undefined HealthCheck", async () => {
      mockRoute53Client.on(CreateHealthCheckCommand).resolvesOnce({});

      await expect(
        shieldRemediator.createHealthCheck(
          new Route53Client({}),
          HealthCheckType.CALCULATED,
          "alarmName",
          ["childId"]
        )
      ).rejects.toThrow(
        /Health Check ID is undefined for created Health Check/
      );
    });

    it("throws an error if route53 client returns undefined HealthCheck Id", async () => {
      mockRoute53Client.on(CreateHealthCheckCommand).resolvesOnce({
        HealthCheck: {
          Id: undefined,
          HealthCheckConfig: {
            Type: "CLOUDWATCH_METRIC",
          },
          HealthCheckVersion: 1,
          CallerReference: "mockCallerReference",
        },
      });

      await expect(
        shieldRemediator.createHealthCheck(
          new Route53Client({}),
          HealthCheckType.CALCULATED,
          "alarmName",
          ["childId"]
        )
      ).rejects.toThrow(
        /Health Check ID is undefined for created Health Check/
      );
    });
  });

  describe("createCloudWatchAlarm", () => {
    const mockShieldHandler = new ShieldHandler(
      mockCredentials,
      new Tracer(),
      new Logger()
    );
    const shieldRemediator = new ShieldRemediator(
      mockShieldHandler,
      shieldProtectionDetails,
      "region",
      "accountId"
    );

    const mockCloudWatchClient = mockClient(CloudWatchClient);

    beforeEach(() => {
      mockCloudWatchClient.reset();
    });

    it("puts a new cloudwatch metric alarm", async () => {
      mockCloudWatchClient.on(PutMetricAlarmCommand).resolvesOnce({});
      const dimension = {
        Name: "name",
        Value: "resourceId",
      };

      await expect(
        shieldRemediator.createCloudWatchAlarm(
          new CloudWatchClient({}),
          "metric",
          dimension,
          1,
          Statistic.Average,
          1,
          "namespace"
        )
      ).resolves.toMatch(/FMS-Shield-/);
    });
  });

  describe("deleteCloudWatchAlarms", () => {
    const mockShieldHandler = new ShieldHandler(
      mockCredentials,
      new Tracer(),
      new Logger()
    );
    const shieldRemediator = new ShieldRemediator(
      mockShieldHandler,
      shieldProtectionDetails,
      "region",
      "accountId"
    );

    const mockCloudWatchClient = mockClient(CloudWatchClient);

    beforeEach(() => {
      mockCloudWatchClient.reset();
    });

    it("deletes cloudwatch metric alarms", async () => {
      mockCloudWatchClient.on(DeleteAlarmsCommand).resolvesOnce({});

      await expect(
        shieldRemediator.deleteCloudWatchAlarms(new CloudWatchClient({}), [
          "alarmName",
        ])
      ).resolves.not.toThrow();
    });
  });

  describe("deleteHealthChecks", () => {
    const mockShieldHandler = new ShieldHandler(
      mockCredentials,
      new Tracer(),
      new Logger()
    );
    const shieldRemediator = new ShieldRemediator(
      mockShieldHandler,
      shieldProtectionDetails,
      "region",
      "accountId"
    );

    const mockRoute53Client = mockClient(Route53Client);

    beforeEach(() => {
      mockRoute53Client.reset();
    });

    it("deletes cloudwatch metric alarms", async () => {
      mockRoute53Client.on(DeleteHealthCheckCommand).resolvesOnce({});

      await expect(
        shieldRemediator.deleteHealthChecks(new Route53Client({}), [
          "healthCheckId",
        ])
      ).resolves.not.toThrow();
    });
  });

  describe("remediateByResourceType", () => {
    const mockShieldHandler = new ShieldHandler(
      mockCredentials,
      new Tracer(),
      new Logger()
    );
    const shieldRemediator = new ShieldRemediator(
      mockShieldHandler,
      shieldProtectionDetails,
      "region",
      "accountId"
    );

    const mockCreateHealthCheck = jest.fn();
    const mockCreateCloudWatchAlarm = jest.fn();
    const mockAssociateHealthCheck = jest.fn();
    const mockDeleteCloudWatchAlarms = jest.fn();
    const mockDeleteHealthChecks = jest.fn();
    const mockPublishShieldTopicMessage = jest.fn();

    shieldRemediator.createHealthCheck = mockCreateHealthCheck;
    shieldRemediator.createCloudWatchAlarm = mockCreateCloudWatchAlarm;
    shieldRemediator.deleteCloudWatchAlarms = mockDeleteCloudWatchAlarms;
    shieldRemediator.deleteHealthChecks = mockDeleteHealthChecks;
    mockShieldHandler.associateHealthCheck = mockAssociateHealthCheck;
    mockShieldHandler.publishShieldTopicMessage = mockPublishShieldTopicMessage;

    jest.spyOn(shieldRemediator, "sleep");

    beforeEach(() => {
      mockCreateHealthCheck.mockReset();
      mockCreateCloudWatchAlarm.mockReset();
      mockAssociateHealthCheck.mockReset();
      mockDeleteCloudWatchAlarms.mockReset();
      mockDeleteHealthChecks.mockReset();
    });

    it("remediates noncompliant shield resource", async () => {
      const alarmConfig = AlarmConfigs[ShieldResource.ApplicationLoadBalancer];

      await expect(
        shieldRemediator.remediateByResourceType(
          new CloudWatchClient({}),
          new Route53Client({}),
          "resourceId",
          alarmConfig
        )
      ).resolves.not.toThrow();
      expect(mockCreateHealthCheck).toHaveBeenCalledTimes(3);
      expect(mockCreateCloudWatchAlarm).toHaveBeenCalledTimes(2);
      expect(shieldRemediator.sleep).toHaveBeenCalledTimes(2);
      expect(mockAssociateHealthCheck).toHaveBeenCalledTimes(1);
    });

    it("handles TooManyHealthChecks exception", async () => {
      const alarmConfig = AlarmConfigs[ShieldResource.ApplicationLoadBalancer];
      mockCreateHealthCheck.mockRejectedValueOnce({
        name: "TooManyHealthChecks",
        $metadata: { requestId: "requestId" },
      });
      shieldRemediator.sleep = jest.fn();

      await expect(
        shieldRemediator.remediateByResourceType(
          new CloudWatchClient({}),
          new Route53Client({}),
          "resourceId",
          alarmConfig
        )
      ).resolves.not.toThrow();
      expect(mockPublishShieldTopicMessage).toHaveBeenCalled();
      expect(mockDeleteCloudWatchAlarms).toHaveBeenCalled();
      expect(mockDeleteHealthChecks).toHaveBeenCalled();
    });

    it("handles LimitExceeded exception", async () => {
      const alarmConfig = AlarmConfigs[ShieldResource.ApplicationLoadBalancer];
      mockCreateCloudWatchAlarm.mockRejectedValueOnce({
        name: "LimitExceededFault",
        $metadata: { requestId: "requestId" },
      });
      shieldRemediator.sleep = jest.fn();

      await expect(
        shieldRemediator.remediateByResourceType(
          new CloudWatchClient({}),
          new Route53Client({}),
          "resourceId",
          alarmConfig
        )
      ).resolves.not.toThrow();
      expect(mockPublishShieldTopicMessage).toHaveBeenCalled();
      expect(mockDeleteCloudWatchAlarms).toHaveBeenCalled();
      expect(mockDeleteHealthChecks).toHaveBeenCalled();
    });

    it("throws an error when a general exception is caught", async () => {
      const alarmConfig = AlarmConfigs[ShieldResource.ApplicationLoadBalancer];
      mockCreateCloudWatchAlarm.mockRejectedValueOnce(
        new Error("general error")
      );
      shieldRemediator.sleep = jest.fn();

      await expect(
        shieldRemediator.remediateByResourceType(
          new CloudWatchClient({}),
          new Route53Client({}),
          "resourceId",
          alarmConfig
        )
      ).rejects.toThrow();
      expect(mockPublishShieldTopicMessage).not.toHaveBeenCalled();
      expect(mockDeleteCloudWatchAlarms).toHaveBeenCalled();
      expect(mockDeleteHealthChecks).toHaveBeenCalled();
    });
  });
});
