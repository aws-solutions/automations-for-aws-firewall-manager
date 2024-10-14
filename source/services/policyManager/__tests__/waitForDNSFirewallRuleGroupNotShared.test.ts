// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { waitUntilDNSFirewallRuleGroupNotShared } from "../lib/waitForDNSFirewallRuleGroupNotShared";
import {
  Route53ResolverClient,
  ShareStatus,
} from "@aws-sdk/client-route53resolver";

import "jest";

jest.mock("@aws-sdk/client-route53resolver");
const mockRoute53ResolverClient = Route53ResolverClient as jest.MockedClass<
  typeof Route53ResolverClient
>;
const client = new mockRoute53ResolverClient({});
const mock = jest.fn();
client.send = mock;

describe("waiter tests for waitUntilDNSFirewallRuleGroupNotShared", () => {
  beforeEach(() => {
    mock.mockReset();
  });
  test("successful state transition", async () => {
    mock.mockResolvedValue({
      FirewallRuleGroup: { id: "myId", ShareStatus: ShareStatus.NotShared },
    });
    const result = await waitUntilDNSFirewallRuleGroupNotShared(
      {
        client,
        maxWaitTime: 30,
      },
      { FirewallRuleGroupId: "my-rule-group" }
    );
    expect(result.state).toEqual("SUCCESS");
  });
  test("failed with waiter timeout error", async () => {
    mock.mockResolvedValue({
      FirewallRuleGroup: { id: "myId", ShareStatus: ShareStatus.SharedByMe },
    });
    await expect(
      waitUntilDNSFirewallRuleGroupNotShared(
        {
          client,
          maxWaitTime: 30,
        },
        { FirewallRuleGroupId: "my-rule-group" }
      )
    ).rejects.toThrow(/TIMEOUT/);
    // increasing jest default timeout to allow waiter to err with timeout 60000 ms (60 seconds)
  }, 60000);
  test("failed with API error", async () => {
    mock.mockRejectedValue("AccessDenied");
    await expect(
      waitUntilDNSFirewallRuleGroupNotShared(
        {
          client,
          maxWaitTime: 15,
        },
        { FirewallRuleGroupId: "my-rule-group" }
      )
    ).rejects.toThrow(/AccessDenied/);
  });
});
