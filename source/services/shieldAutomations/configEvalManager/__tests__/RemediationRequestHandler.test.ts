// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { mockClient } from "aws-sdk-client-mock";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { RemediationRequestHandler } from "../lib/RemediationRequestHandler";

const sqsClientMock = mockClient(SQSClient);

describe("RemediationRequestHandler tests", () => {
  const remediationRequestHandler = new RemediationRequestHandler("accountId");

  beforeEach(() => {
    sqsClientMock.reset();
  });

  describe("sendRemediationRequest", () => {
    it("sends remediation request to SQS queue", async () => {
      sqsClientMock.on(SendMessageCommand).resolvesOnce({});

      expect(
        async () =>
          await remediationRequestHandler.sendRemediationRequest("messageBody")
      ).not.toThrow();
    });

    it("fails to send SQS message on client error", async () => {
      sqsClientMock.on(SendMessageCommand).rejectsOnce({});

      await expect(async () =>
        remediationRequestHandler.sendRemediationRequest("messageBody")
      ).rejects.toThrow();
    });
  });

  describe("buildRemediationRequest", () => {
    it("builds remediation request", () => {
      const response = remediationRequestHandler.buildRemediationRequest(
        "protectionId",
        "token"
      );

      const result = JSON.parse(response);
      expect(result.resultToken).toBe("token");
      expect(result.shieldProtectionId).toBe("protectionId");
      expect(result.accountId).toBe("accountId");
      expect(result.timestamp).toBeDefined();
    });
  });
});
