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

import {
  GetFirewallRuleGroupCommand,
  GetFirewallRuleGroupCommandInput,
  GetFirewallRuleGroupCommandOutput,
  Route53ResolverClient,
  ShareStatus,
} from "@aws-sdk/client-route53resolver";
import {
  WaiterConfiguration,
  WaiterResult,
  WaiterState,
  checkExceptions,
  createWaiter,
} from "@aws-sdk/util-waiter";

const checkState = async (
  client: Route53ResolverClient,
  input: GetFirewallRuleGroupCommandInput
): Promise<WaiterResult> => {
  let reason;
  try {
    const result: GetFirewallRuleGroupCommandOutput = await client.send(
      new GetFirewallRuleGroupCommand(input)
    );
    reason = result;
    if (result.FirewallRuleGroup?.ShareStatus === ShareStatus.NotShared)
      return { state: WaiterState.SUCCESS, reason };
    else return { state: WaiterState.RETRY, reason };
  } catch (exception) {
    reason = exception;
    return { state: WaiterState.FAILURE, reason };
  }
};

/**
 * @description waiter function to check DNS firewall share status set to NOT_SHARED
 * @param {WaiterConfiguration<Route53ResolverClient>} params - Waiter configuration options.
 * @param {GetFirewallRuleGroupCommandInput} input - The input to GetFirewallRuleGroup for polling.
 */
export const waitUntilDNSFirewallRuleGroupNotShared = async (
  params: WaiterConfiguration<Route53ResolverClient>,
  input: GetFirewallRuleGroupCommandInput
): Promise<WaiterResult> => {
  const serviceDefaults = { minDelay: 1, maxDelay: 10 };
  const result = await createWaiter(
    { ...serviceDefaults, ...params },
    input,
    checkState
  );
  return checkExceptions(result);
};
