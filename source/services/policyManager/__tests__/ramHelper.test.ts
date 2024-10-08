// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  DeleteResourceShareCommand,
  ListResourcesCommand,
  RAMClient,
  RAMServiceException,
} from "@aws-sdk/client-ram";
import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import { RAMHelper } from "../lib/clientHelpers";

describe("RAM Helper", () => {
  const mockRAMClient = mockClient(RAMClient);
  let ramHelper: RAMHelper;
  const region = "us-east-1";
  const ruleGroupArn = "ruleGroupArn";

  beforeEach(() => {
    mockRAMClient.reset();

    ramHelper = new RAMHelper(region);

    mockRAMClient.on(ListResourcesCommand).resolves({
      resources: [
        {
          resourceShareArn: "arn1",
        },
        {
          resourceShareArn: "arn2",
        },
      ],
    });

    mockRAMClient.on(DeleteResourceShareCommand).resolves({});
  });

  it("should delete resources for rule group", async () => {
    await ramHelper.deleteResourcesForRuleGroup(ruleGroupArn);

    expect(mockRAMClient).toHaveReceivedCommandTimes(ListResourcesCommand, 1);
    expect(mockRAMClient).toHaveReceivedCommandTimes(
      DeleteResourceShareCommand,
      2
    );
  });

  it("should throw an exception if ListResourcesCommand fails", async () => {
    mockRAMClient.on(ListResourcesCommand).rejectsOnce(
      new RAMServiceException({
        name: "RAMServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await ramHelper.deleteResourcesForRuleGroup(ruleGroupArn);
    };

    await expect(testCase).rejects.toThrow(
      /error deleting resources for rule group/
    );

    expect(mockRAMClient).toHaveReceivedCommandTimes(ListResourcesCommand, 1);
    expect(mockRAMClient).toHaveReceivedCommandTimes(
      DeleteResourceShareCommand,
      0
    );
  });

  it("should throw an exception if DeleteResourceShareCommand fails", async () => {
    mockRAMClient.on(DeleteResourceShareCommand).rejects(
      new RAMServiceException({
        name: "RAMServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await ramHelper.deleteResourcesForRuleGroup(ruleGroupArn);
    };

    await expect(testCase).rejects.toThrow(
      /error deleting resources for rule group/
    );

    expect(mockRAMClient).toHaveReceivedCommandTimes(ListResourcesCommand, 1);
    expect(mockRAMClient).toHaveReceivedCommandTimes(
      DeleteResourceShareCommand,
      2
    );
  });
});
