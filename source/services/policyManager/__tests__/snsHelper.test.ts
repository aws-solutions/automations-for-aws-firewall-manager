// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import { SNSHelper } from "../lib/clientHelpers";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

describe("SNS Helper", () => {
  const mockSNSClient = mockClient(SNSClient);
  let snsHelper: SNSHelper;

  beforeEach(() => {
    mockSNSClient.reset();
    snsHelper = new SNSHelper();
  });

  it("publishes a message to the SNS topic", async () => {
    mockSNSClient.on(PublishCommand).resolvesOnce({});

    const testCase = async () => {
      await snsHelper.publishMessage("topicArn", "subject", "message");
    };

    expect(testCase).not.toThrow();

    expect(mockSNSClient).toHaveReceivedCommandTimes(PublishCommand, 1);
  });

  it("does not throw an error when SNS client throws an error", async () => {
    mockSNSClient
      .on(PublishCommand)
      .rejectsOnce({ $metadata: { requestId: "id" } });

    const testCase = async () => {
      await snsHelper.publishMessage("topicArn", "subject", "message");
    };

    expect(testCase).not.toThrow();

    expect(mockSNSClient).toHaveReceivedCommandTimes(PublishCommand, 1);
  });
});
