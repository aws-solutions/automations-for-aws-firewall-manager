/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

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
    try {
      const result = await waitUntilDNSFirewallRuleGroupNotShared(
        {
          client,
          maxWaitTime: 30,
        },
        { FirewallRuleGroupId: "my-rule-group" }
      );
      expect(result).toEqual({
        state: "SUCCESS",
      });
    } catch (e) {
      console.log(`negative test ${e}`);
    }
  });
  test("failed with waiter timeout error", async () => {
    jest.setTimeout(60000); // increasing jest default timeout to allow waiter to err with timeout
    mock.mockResolvedValue({
      FirewallRuleGroup: { id: "myId", ShareStatus: ShareStatus.SharedByMe },
    });
    try {
      await waitUntilDNSFirewallRuleGroupNotShared(
        {
          client,
          maxWaitTime: 30,
        },
        { FirewallRuleGroupId: "my-rule-group" }
      );
    } catch (e) {
      expect(e.name).toEqual("TimeoutError");
      expect(e.message).toEqual(
        JSON.stringify({
          state: "TIMEOUT",
          reason: "Waiter has timed out",
        })
      );
    }
  });
  test("failed with API error", async () => {
    mock.mockRejectedValue("AccessDenied");
    try {
      await waitUntilDNSFirewallRuleGroupNotShared(
        {
          client,
          maxWaitTime: 15,
        },
        { FirewallRuleGroupId: "my-rule-group" }
      );
    } catch (e) {
      expect(e.message).toEqual(
        JSON.stringify({
          result: { state: "FAILURE" },
        })
      );
    }
  });
});
