// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { ConfigEvalManager } from "../index";
import {
  ComplianceType,
  ConfigServiceClient,
  ConfigurationItem,
  ConfigurationItemStatus,
  DescribeComplianceByResourceCommand,
  DescribeConfigRuleEvaluationStatusCommand,
  PutEvaluationsCommand,
  ResourceType,
} from "@aws-sdk/client-config-service";
import { mockClient } from "aws-sdk-client-mock";
import { ShieldHandler } from "/opt/nodejs/lib/ShieldHandler";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { Logger } from "@aws-lambda-powertools/logger";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { RemediationRequestHandler } from "../lib/RemediationRequestHandler";

const dummyContext = {
  callbackWaitsForEmptyEventLoop: true,
  functionVersion: "$LATEST",
  functionName: "foo-bar-function",
  memoryLimitInMB: "128",
  logGroupName: "/aws/lambda/foo-bar-function-123456abcdef",
  logStreamName: "2021/03/09/[$LATEST]abcdef123456abcdef123456abcdef123456",
  invokedFunctionArn:
    "arn:aws:lambda:eu-west-1:123456789012:function:foo-bar-function",
  awsRequestId: "c6af9ac6-7b61-11e6-9a41-93e812345678",
  getRemainingTimeInMillis: () => 1000,
  done: () => {
    console.log("done");
  },
  fail: () => {
    console.log("fail");
  },
  succeed: () => {
    console.log("succeed");
  },
};
const configurationItem: ConfigurationItem = {
  configurationItemCaptureTime: new Date(),
  configurationStateId: "stateId",
  configurationItemMD5Hash: "hash",
  arn: "arn",
  resourceType: ResourceType.Protection,
  resourceId: "resourceId",
  resourceName: "resourceName",
  awsRegion: "awsRegion",
  availabilityZone: "availabilityZone",
  resourceCreationTime: new Date(),
  tags: {
    key: "value",
  },
  relatedEvents: ["relatedEvent"],
  relationships: [],
  configuration: "configuration",
  supplementaryConfiguration: {},
  accountId: "accountId",
};
const scheduledNotificationEvent = {
  notificationCreationTime: "time",
  messageType: "ScheduledNotification",
  recordVersion: "version",
  resultToken: "token",
  awsAccountId: "accountId",
};

const configurationItemChangeEvent = {
  notificationCreationTime: "time",
  messageType: "ConfigurationItemChange",
  configurationItem: configurationItem,
  recordVersion: "version",
  resultToken: "token",
  awsAccountId: "accountId",
};
const mockCredentials = {
  AccessKeyId: "accessKeyId",
  SecretAccessKey: "secretAccessKey",
  SessionToken: "sessionToken",
  Expiration: new Date(),
};

jest.mock("/opt/nodejs/lib/ShieldHandler");
jest.mock("../lib/RemediationRequestHandler");

describe("ConfigEvalManager tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("handler", () => {
    const configEvalManager = new ConfigEvalManager();
    const mockAssumeCrossAccountRole = jest.fn();
    const mockHandleScheduledNotification = jest.fn();

    configEvalManager.assumeCrossAccountRole = mockAssumeCrossAccountRole;
    configEvalManager.handleScheduledNotifications =
      mockHandleScheduledNotification;

    const mockCredentials = {
      AccessKeyId: "accessKeyId",
      SecretAccessKey: "secretAccessKey",
      SessionToken: "sessionToken",
      Expiration: new Date(),
    };
    mockAssumeCrossAccountRole.mockResolvedValue(mockCredentials);

    it("handles scheduled notifications", async () => {
      const mockHandleScheduledNotifications = jest.fn();
      configEvalManager.handleScheduledNotifications =
        mockHandleScheduledNotifications;

      const event = {
        invokingEvent: JSON.stringify(scheduledNotificationEvent),
        ruleParameters: "ruleParams",
        resultToken: "resultToken",
        eventLeftScope: false,
        executionRoleArn: "roleARN",
        configRuleArn: "ruleARN",
        configRuleName: "configRuleName",
        configRuleId: "configRuleId",
        accountId: "accountId",
        version: "version",
      };

      await expect(
        configEvalManager.handler(event, dummyContext)
      ).resolves.not.toThrow();
      expect(mockHandleScheduledNotifications).toHaveBeenCalled();
    });

    it("handles configuration item change event", async () => {
      const mockHandleEvaluation = jest.fn();
      configEvalManager.handleEvaluation = mockHandleEvaluation;

      const event = {
        invokingEvent: JSON.stringify(configurationItemChangeEvent),
        ruleParameters: "ruleParams",
        resultToken: "resultToken",
        eventLeftScope: false,
        executionRoleArn: "roleARN",
        configRuleArn: "ruleARN",
        configRuleName: "configRuleName",
        configRuleId: "configRuleId",
        accountId: "accountId",
        version: "version",
      };

      await expect(
        configEvalManager.handler(event, dummyContext)
      ).resolves.not.toThrow();
      expect(mockHandleEvaluation).toHaveBeenCalled();
    });

    it("handles error thrown by assumeCredentials", async () => {
      const mockHandleEvaluation = jest.fn();
      configEvalManager.handleEvaluation = mockHandleEvaluation;
      mockAssumeCrossAccountRole.mockRejectedValueOnce(new Error("error"));

      const event = {
        invokingEvent: JSON.stringify(configurationItemChangeEvent),
        ruleParameters: "ruleParams",
        resultToken: "resultToken",
        eventLeftScope: false,
        executionRoleArn: "roleARN",
        configRuleArn: "ruleARN",
        configRuleName: "configRuleName",
        configRuleId: "configRuleId",
        accountId: "accountId",
        version: "version",
      };

      await expect(
        configEvalManager.handler(event, dummyContext)
      ).resolves.not.toThrow();
      expect(mockHandleEvaluation).not.toHaveBeenCalled();
    });
  });

  describe("handleScheduledNotifications", () => {
    const configEvalManager = new ConfigEvalManager();
    const mockShieldHandler = new ShieldHandler(
      mockCredentials,
      new Tracer(),
      new Logger()
    );
    jest.spyOn(mockShieldHandler, "getShieldProtectionDetails");

    const mockConfigClient = mockClient(ConfigServiceClient);

    beforeEach(() => {
      mockConfigClient.reset();
    });

    it("throws an error on undefined region", async () => {
      await expect(
        configEvalManager.handleScheduledNotifications(
          "ruleName",
          "accountId",
          mockCredentials,
          undefined,
          mockShieldHandler,
          "token"
        )
      ).rejects.toThrow(/AWS_REGION environment variable is undefined/);
    });

    it("handles unavailable config rule status", async () => {
      mockConfigClient
        .on(DescribeConfigRuleEvaluationStatusCommand)
        .resolvesOnce({ ConfigRulesEvaluationStatus: [] });

      await expect(
        configEvalManager.handleScheduledNotifications(
          "ruleName",
          "accountId",
          mockCredentials,
          "region",
          mockShieldHandler,
          "token"
        )
      ).resolves.not.toThrow();
    });

    it("catches Config Client Error", async () => {
      mockConfigClient
        .on(DescribeConfigRuleEvaluationStatusCommand)
        .rejectsOnce({ $metadata: { requestId: "requestId" } });

      await expect(
        configEvalManager.handleScheduledNotifications(
          "ruleName",
          "accountId",
          mockCredentials,
          "region",
          mockShieldHandler,
          "token"
        )
      ).resolves.not.toThrow();
    });

    it("skips evaluation when config rule was activated in past 24hrs", async () => {
      mockConfigClient
        .on(DescribeConfigRuleEvaluationStatusCommand)
        .resolvesOnce({
          ConfigRulesEvaluationStatus: [
            {
              FirstActivatedTime: new Date(),
            },
          ],
        });

      await expect(
        configEvalManager.handleScheduledNotifications(
          "ruleName",
          "accountId",
          mockCredentials,
          "region",
          mockShieldHandler,
          "token"
        )
      ).resolves.not.toThrow();
      expect(
        mockShieldHandler.getShieldProtectionDetails
      ).not.toHaveBeenCalled();
    });

    it("does not evaluate when shieldProtectionId is undefined", async () => {
      mockConfigClient
        .on(DescribeConfigRuleEvaluationStatusCommand)
        .resolvesOnce({
          ConfigRulesEvaluationStatus: [
            {
              FirstActivatedTime: new Date(),
            },
          ],
        });
      mockConfigClient.on(DescribeComplianceByResourceCommand).resolvesOnce({
        ComplianceByResources: [
          {
            ResourceId: undefined,
            Compliance: {
              ComplianceType: ComplianceType.Non_Compliant,
            },
          },
        ],
      });

      await expect(
        configEvalManager.handleScheduledNotifications(
          "ruleName",
          "accountId",
          mockCredentials,
          "region",
          mockShieldHandler,
          "token"
        )
      ).resolves.not.toThrow();
      expect(
        mockShieldHandler.getShieldProtectionDetails
      ).not.toHaveBeenCalled();
    });

    it("requests remediation for valid resource", async () => {
      mockConfigClient
        .on(DescribeConfigRuleEvaluationStatusCommand)
        .resolvesOnce({
          ConfigRulesEvaluationStatus: [
            {
              FirstActivatedTime: new Date("1995-12-17T03:24:00"),
            },
          ],
        });
      mockConfigClient.on(DescribeComplianceByResourceCommand).resolvesOnce({
        ComplianceByResources: [
          {
            ResourceId: "resourceId",
            Compliance: {
              ComplianceType: ComplianceType.Non_Compliant,
            },
          },
        ],
      });
      const mockIsValid = jest.fn();
      const mockRemediateNonCompliantResource = jest.fn();
      const mockIsCompliant = jest.fn();

      mockIsValid.mockResolvedValue({
        isValid: true,
        isIncompleteEIP: false,
      });
      mockIsCompliant.mockReturnValue(false);

      mockShieldHandler.isValid = mockIsValid;
      mockShieldHandler.isCompliant = mockIsCompliant;
      configEvalManager.remediateNonCompliantResource =
        mockRemediateNonCompliantResource;

      await expect(
        configEvalManager.handleScheduledNotifications(
          "ruleName",
          "accountId",
          mockCredentials,
          "region",
          mockShieldHandler,
          "token"
        )
      ).resolves.not.toThrow();
      expect(mockRemediateNonCompliantResource).toHaveBeenCalled();
    });

    it("does not request remediation for incomplete Elastic IPs", async () => {
      mockConfigClient
        .on(DescribeConfigRuleEvaluationStatusCommand)
        .resolvesOnce({
          ConfigRulesEvaluationStatus: [
            {
              FirstActivatedTime: new Date("1995-12-17T03:24:00"),
            },
          ],
        });
      mockConfigClient.on(DescribeComplianceByResourceCommand).resolvesOnce({
        ComplianceByResources: [
          {
            ResourceId: "resourceId",
            Compliance: {
              ComplianceType: ComplianceType.Non_Compliant,
            },
          },
        ],
      });
      const mockIsValid = jest.fn();
      const mockRemediateNonCompliantResource = jest.fn();

      mockIsValid.mockResolvedValue({
        isValid: true,
        isIncompleteEIP: true,
      });

      mockShieldHandler.isValid = mockIsValid;
      configEvalManager.remediateNonCompliantResource =
        mockRemediateNonCompliantResource;

      await expect(
        configEvalManager.handleScheduledNotifications(
          "ruleName",
          "accountId",
          mockCredentials,
          "region",
          mockShieldHandler,
          "token"
        )
      ).resolves.not.toThrow();
      expect(mockRemediateNonCompliantResource).not.toHaveBeenCalled();
    });
  });

  describe("handleEvaluation", () => {
    const configEvalManager = new ConfigEvalManager();
    const mockShieldHandler = new ShieldHandler(
      mockCredentials,
      new Tracer(),
      new Logger()
    );
    jest.spyOn(mockShieldHandler, "getShieldProtectionDetails");

    const mockConfigClient = mockClient(ConfigServiceClient);
    const mockIsValid = jest.fn();
    const mockRemediateNonCompliantResource = jest.fn();
    const mockIsCompliant = jest.fn();
    const mockIsValidConfigurationItem = jest.fn();
    const mockPublishShieldTopicMessage = jest.fn();
    const mockSetShieldResourceCompliance = jest.fn();
    const mockGetShieldProtectionDetails = jest.fn();

    mockShieldHandler.isValid = mockIsValid;
    mockShieldHandler.isCompliant = mockIsCompliant;
    mockShieldHandler.publishShieldTopicMessage = mockPublishShieldTopicMessage;
    mockShieldHandler.getShieldProtectionDetails =
      mockGetShieldProtectionDetails;

    configEvalManager.remediateNonCompliantResource =
      mockRemediateNonCompliantResource;
    configEvalManager.isValidConfigurationItem = mockIsValidConfigurationItem;
    configEvalManager.setShieldResourceCompliance =
      mockSetShieldResourceCompliance;

    beforeEach(() => {
      mockConfigClient.reset();
      mockIsValid.mockReset();
      mockRemediateNonCompliantResource.mockReset();
      mockIsCompliant.mockReset();
      mockIsValidConfigurationItem.mockReset();
      mockPublishShieldTopicMessage.mockReset();
      mockSetShieldResourceCompliance.mockReset();
      mockGetShieldProtectionDetails.mockReset();
    });

    it("does not evaluate when region is undefined", async () => {
      const invalidConfigurationItem = {
        ...configurationItem,
        awsRegion: undefined,
      };

      await expect(
        configEvalManager.handleEvaluation(
          invalidConfigurationItem,
          "accountId",
          "token",
          mockShieldHandler,
          mockCredentials
        )
      ).resolves.not.toThrow();
      expect(
        mockShieldHandler.getShieldProtectionDetails
      ).not.toHaveBeenCalled();
    });

    it("does not evaluate when shieldProtectionId is undefined", async () => {
      const invalidConfigurationItem = {
        ...configurationItem,
        resourceId: undefined,
      };

      await expect(
        configEvalManager.handleEvaluation(
          invalidConfigurationItem,
          "region",
          "token",
          mockShieldHandler,
          mockCredentials
        )
      ).resolves.not.toThrow();
      expect(
        mockShieldHandler.getShieldProtectionDetails
      ).not.toHaveBeenCalled();
    });

    it("does not request remediation for invalid resource", async () => {
      mockIsValid.mockResolvedValue({
        isValid: false,
        isIncompleteEIP: false,
      });

      await expect(
        configEvalManager.handleEvaluation(
          configurationItem,
          "region",
          "token",
          mockShieldHandler,
          mockCredentials
        )
      ).resolves.not.toThrow();
      expect(mockRemediateNonCompliantResource).not.toHaveBeenCalled();
    });

    it("does not request remediation for incomplete Elastic IP", async () => {
      mockIsValid.mockResolvedValue({
        isValid: true,
        isIncompleteEIP: true,
      });

      await expect(
        configEvalManager.handleEvaluation(
          configurationItem,
          "region",
          "token",
          mockShieldHandler,
          mockCredentials
        )
      ).resolves.not.toThrow();
      expect(mockRemediateNonCompliantResource).not.toHaveBeenCalled();
    });

    it("requests remediation for valid and noncompliant resource", async () => {
      mockIsValid.mockResolvedValue({
        isValid: true,
        isIncompleteEIP: false,
      });
      mockIsCompliant.mockReturnValue(false);
      mockIsValidConfigurationItem.mockReturnValue(true);

      await expect(
        configEvalManager.handleEvaluation(
          configurationItem,
          "region",
          "token",
          mockShieldHandler,
          mockCredentials
        )
      ).resolves.not.toThrow();
      expect(mockRemediateNonCompliantResource).toHaveBeenCalled();
    });

    it("does not request remediation for valid and compliant resource", async () => {
      mockIsValid.mockResolvedValue({
        isValid: true,
        isIncompleteEIP: false,
      });
      mockIsCompliant.mockReturnValue(true);
      mockIsValidConfigurationItem.mockReturnValue(true);

      await expect(
        configEvalManager.handleEvaluation(
          configurationItem,
          "region",
          "token",
          mockShieldHandler,
          mockCredentials
        )
      ).resolves.not.toThrow();
      expect(mockRemediateNonCompliantResource).not.toHaveBeenCalled();
    });

    it("does not request remediation for invalid resource", async () => {
      mockIsValid.mockResolvedValue({
        isValid: false,
        isIncompleteEIP: false,
      });
      mockIsCompliant.mockReturnValue(false);
      mockIsValidConfigurationItem.mockReturnValue(true);
      mockGetShieldProtectionDetails.mockResolvedValue({
        ResourceArn: "resourceARN",
      });

      await expect(
        configEvalManager.handleEvaluation(
          configurationItem,
          "region",
          "token",
          mockShieldHandler,
          mockCredentials
        )
      ).resolves.not.toThrow();
      expect(mockRemediateNonCompliantResource).not.toHaveBeenCalled();
    });

    it("catches error thrown by getShieldProtectionDetails", async () => {
      mockIsValid.mockResolvedValue({
        isValid: false,
        isIncompleteEIP: false,
      });
      mockIsCompliant.mockReturnValue(false);
      mockIsValidConfigurationItem.mockReturnValue(true);
      mockGetShieldProtectionDetails.mockRejectedValue({
        $metadata: { requestId: "id" },
      });

      await expect(
        configEvalManager.handleEvaluation(
          configurationItem,
          "region",
          "token",
          mockShieldHandler,
          mockCredentials
        )
      ).resolves.not.toThrow();
      expect(mockRemediateNonCompliantResource).not.toHaveBeenCalled();
    });
  });

  describe("assumeCrossAccountRole", () => {
    const configEvalManager = new ConfigEvalManager();

    const mockSTSClient = mockClient(STSClient);

    beforeEach(() => {
      mockSTSClient.reset();
    });

    it("throws an error when credentials is undefined", async () => {
      mockSTSClient.on(AssumeRoleCommand).resolvesOnce({});

      await expect(
        configEvalManager.assumeCrossAccountRole("accountId")
      ).rejects.toThrow(
        /STS Client returned undefined credentials when assuming cross account role/
      );
    });

    it("throws an error when AccessKeyId is undefined", async () => {
      mockSTSClient.on(AssumeRoleCommand).resolvesOnce({
        Credentials: {
          AccessKeyId: undefined,
          SecretAccessKey: "secretAccessKey",
          SessionToken: "sessionToken",
          Expiration: new Date(),
        },
      });

      await expect(
        configEvalManager.assumeCrossAccountRole("accountId")
      ).rejects.toThrow(
        /STS Client returned undefined credentials when assuming cross account role/
      );
    });

    it("throws an error when SecretAccessKey is undefined", async () => {
      mockSTSClient.on(AssumeRoleCommand).resolvesOnce({
        Credentials: {
          AccessKeyId: "keyId",
          SecretAccessKey: undefined,
          SessionToken: "sessionToken",
          Expiration: new Date(),
        },
        $metadata: { requestId: "id" },
      });

      await expect(
        configEvalManager.assumeCrossAccountRole("accountId")
      ).rejects.toThrow(
        /STS Client returned undefined credentials when assuming cross account role/
      );
    });

    it("assumes cross account role", async () => {
      const credentials = {
        AccessKeyId: "keyId",
        SecretAccessKey: "secretKey",
        SessionToken: "sessionToken",
        Expiration: new Date(),
      };
      mockSTSClient.on(AssumeRoleCommand).resolvesOnce({
        Credentials: credentials,
      });

      await expect(
        configEvalManager.assumeCrossAccountRole("accountId")
      ).resolves.toStrictEqual(credentials);
    });
  });

  describe("isValidConfigurationItem", () => {
    const configEvalManager = new ConfigEvalManager();

    it("returns false when configurationItemStatus is undefined", () => {
      const invalidConfigurationItem = {
        ...configurationItem,
        configurationItemStatus: undefined,
      };

      const response = configEvalManager.isValidConfigurationItem(
        invalidConfigurationItem
      );
      expect(response).toBe(false);
    });

    it("returns true when configurationItemStatus is OK", () => {
      const validConfigurationItem = {
        ...configurationItem,
        configurationItemStatus: ConfigurationItemStatus.OK,
      };

      const response = configEvalManager.isValidConfigurationItem(
        validConfigurationItem
      );
      expect(response).toBe(true);
    });

    it("returns true when configurationItemStatus is ResourceDiscovered", () => {
      const validConfigurationItem = {
        ...configurationItem,
        configurationItemStatus: ConfigurationItemStatus.ResourceDiscovered,
      };

      const response = configEvalManager.isValidConfigurationItem(
        validConfigurationItem
      );
      expect(response).toBe(true);
    });
  });

  describe("setShieldResourceCompliance", () => {
    const configEvalManager = new ConfigEvalManager();

    const mockConfigClient = mockClient(ConfigServiceClient);

    beforeEach(() => {
      mockConfigClient.reset();
    });

    it("resolves when there are no failedEvaluations", async () => {
      mockConfigClient.on(PutEvaluationsCommand).resolvesOnce({});

      await expect(
        configEvalManager.setShieldResourceCompliance(
          ComplianceType.Non_Compliant,
          "resourceId",
          "token",
          new ConfigServiceClient()
        )
      ).resolves.not.toThrow();
    });

    it("resolves when there are failedEvaluations", async () => {
      mockConfigClient.on(PutEvaluationsCommand).resolvesOnce({
        FailedEvaluations: [
          {
            ComplianceResourceId: "resourceId",
            ComplianceType: ComplianceType.Non_Compliant,
            ComplianceResourceType: "resourceType",
            OrderingTimestamp: new Date(),
          },
        ],
        $metadata: { requestId: "requestId" },
      });

      await expect(
        configEvalManager.setShieldResourceCompliance(
          ComplianceType.Non_Compliant,
          "resourceId",
          "token",
          new ConfigServiceClient()
        )
      ).resolves.not.toThrow();
    });
  });

  describe("remediateNonCompliantResource", () => {
    const configEvalManager = new ConfigEvalManager();

    jest.spyOn(RemediationRequestHandler.prototype, "buildRemediationRequest");
    jest.spyOn(RemediationRequestHandler.prototype, "sendRemediationRequest");

    it("sends remediation request", async () => {
      await configEvalManager.remediateNonCompliantResource(
        "protectionId",
        "token",
        "accountId"
      );

      expect(
        RemediationRequestHandler.prototype.buildRemediationRequest
      ).toHaveBeenCalled();
      expect(
        RemediationRequestHandler.prototype.sendRemediationRequest
      ).toHaveBeenCalled();
    });
  });
});
