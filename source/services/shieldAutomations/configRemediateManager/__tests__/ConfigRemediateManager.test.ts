// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { ConfigRemediateManager } from "../index";
import { ShieldHandler } from "/opt/nodejs/lib/ShieldHandler";
import { ShieldRemediator } from "../lib/ShieldRemediator";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";

jest.mock("/opt/nodejs/lib/ShieldHandler");
jest.mock("../lib/ShieldRemediator");

const remediationRequest = {
  accountId: "accountId",
  shieldProtectionId: "protectionId",
  resultToken: "token",
  timestamp: "timestamp",
};
const sqsRecord = {
  messageId: "messageId",
  receiptHandle: "receipt",
  body: JSON.stringify(remediationRequest),
  attributes: {
    ApproximateReceiveCount: "count",
    SentTimestamp: "SentTimestamp",
    SenderId: "id",
    ApproximateFirstReceiveTimestamp: "RecieveTimestamp",
  },
  messageAttributes: {
    name: {
      dataType: "String",
    },
  },
  md5OfBody: "md5OfBody",
  eventSource: "eventSource",
  eventSourceARN: "sourceARN",
  awsRegion: "region",
};

describe("ConfigRemediateManager tests", () => {
  const originalAssumeCrossAccountRole =
    ConfigRemediateManager.assumeCrossAccountRole;
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("assumeCrossAccountRole", () => {
    const mockSTSClient = mockClient(STSClient);

    beforeEach(() => {
      mockSTSClient.reset();
    });

    it("throws an error when credentials is undefined", async () => {
      mockSTSClient.on(AssumeRoleCommand).resolvesOnce({});
      ConfigRemediateManager.assumeCrossAccountRole =
        originalAssumeCrossAccountRole;

      await expect(
        ConfigRemediateManager.assumeCrossAccountRole("accountId")
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
      ConfigRemediateManager.assumeCrossAccountRole =
        originalAssumeCrossAccountRole;

      await expect(
        ConfigRemediateManager.assumeCrossAccountRole("accountId")
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
      ConfigRemediateManager.assumeCrossAccountRole =
        originalAssumeCrossAccountRole;

      await expect(
        ConfigRemediateManager.assumeCrossAccountRole("accountId")
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
      ConfigRemediateManager.assumeCrossAccountRole =
        originalAssumeCrossAccountRole;

      await expect(
        ConfigRemediateManager.assumeCrossAccountRole("accountId")
      ).resolves.toStrictEqual(credentials);
    });
  });

  describe("remediationRecordHandler", () => {
    const mockAssumeCrossAccountRole = jest.fn();
    const mockGetShieldProtectionDetails = jest.fn();
    const mockIsValid = jest.fn();
    const mockIsCompliant = jest.fn();
    const mockPublishShieldTopicMessage = jest.fn();

    ConfigRemediateManager.assumeCrossAccountRole = mockAssumeCrossAccountRole;
    ShieldHandler.prototype.getShieldProtectionDetails =
      mockGetShieldProtectionDetails;
    ShieldHandler.prototype.isCompliant = mockIsCompliant;
    ShieldHandler.prototype.isValid = mockIsValid;
    ShieldHandler.prototype.publishShieldTopicMessage =
      mockPublishShieldTopicMessage;

    jest.spyOn(ShieldRemediator.prototype, "executeRemediation");
    mockGetShieldProtectionDetails.mockResolvedValue({
      Id: "protectionId",
      ResourceArn: "resourceArn",
    });

    beforeAll(() => {
      ConfigRemediateManager.assumeCrossAccountRole =
        mockAssumeCrossAccountRole;
    });

    it("does not execute remediation if resource is incomplete Elastic IP", async () => {
      mockIsValid.mockResolvedValue({
        isValid: false,
        isIncompleteEIP: true,
      });

      await ConfigRemediateManager.remediationRecordHandler(sqsRecord);
      expect(mockPublishShieldTopicMessage).toHaveBeenCalled();
      expect(
        ShieldRemediator.prototype.executeRemediation
      ).not.toHaveBeenCalled();
    });

    it("does not execute remediation if resource is invalid", async () => {
      mockIsValid.mockResolvedValue({
        isValid: false,
        isIncompleteEIP: false,
      });

      await ConfigRemediateManager.remediationRecordHandler(sqsRecord);
      expect(
        ShieldRemediator.prototype.executeRemediation
      ).not.toHaveBeenCalled();
    });

    it("does not execute remediation if resource is compliant", async () => {
      mockIsValid.mockResolvedValue({
        isValid: true,
        isIncompleteEIP: false,
      });
      mockIsCompliant.mockReturnValue(true);

      await ConfigRemediateManager.remediationRecordHandler(sqsRecord);
      expect(
        ShieldRemediator.prototype.executeRemediation
      ).not.toHaveBeenCalled();
    });

    it("executes remediation if resource is valid and noncompliant", async () => {
      mockIsValid.mockResolvedValue({
        isValid: true,
        isIncompleteEIP: false,
      });
      mockIsCompliant.mockReturnValue(false);

      await ConfigRemediateManager.remediationRecordHandler(sqsRecord);
      expect(ShieldRemediator.prototype.executeRemediation).toHaveBeenCalled();
    });

    it("handles error thrown by assumeCrossAcountRole", async () => {
      mockAssumeCrossAccountRole.mockRejectedValueOnce(new Error("error"));

      await expect(
        ConfigRemediateManager.remediationRecordHandler(sqsRecord)
      ).resolves.not.toThrow();
      expect(
        ShieldRemediator.prototype.executeRemediation
      ).not.toHaveBeenCalled();
    });
  });
});
