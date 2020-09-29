/**
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { PolicyManager, ITags } from "./policyManager";
import manifest from "./manifest.json";
import awsClient from "./clientConfig.json";
import { FMSHelper } from "./fmsHelper";
import { Shield } from "aws-sdk";
import { Metrics } from "./common/metrics";
import moment from "moment";

export class ShieldManager {
  /**
   * @description
   * @param ous
   * @param tags
   * @param region
   * @param table
   */
  static async saveShieldPolicy(
    ous: string[],
    tags: ITags,
    table: string,
    region: string
  ) {
    const shield = new Shield({
      apiVersion: awsClient.shield,
      region: awsClient.dataPlane,
    });
    const sub = await shield.getSubscriptionState().promise();
    if (sub.SubscriptionState !== "ACTIVE")
      throw new Error("Shield Advanced subscription not active");

    const shieldRules = manifest.advanced.Shield;
    let shieldRule: any;
    if (region === "Global") {
      shieldRule = shieldRules.find((rule) => rule.policyScope === "Global");
      if (!shieldRule) throw new Error("Shield global policy not found");
    } else {
      shieldRule = shieldRules.find((rule) => rule.policyScope === "Regional");
      if (!shieldRule) throw new Error("Shield global policy not found");
    }

    const policy = {
      PolicyName: shieldRule.policyName,
      RemediationEnabled: shieldRule.remediationEnabled,
      ResourceTags: tags.ResourceTags,
      ExcludeResourceTags: tags.ExcludeResourceTags,
      ResourceType: shieldRule.resourceType,
      IncludeMap: {
        ORG_UNIT: ous,
      },
      SecurityServicePolicyData: {
        Type: shieldRule.policyDetails.type,
        ManagedServiceData: JSON.stringify(shieldRule.policyDetails),
      },
    };
    if (region !== "Global") {
      Object.assign(policy, {
        ResourceTypeList: shieldRule.resourceTypeList,
      });
    }

    const _e = await PolicyManager.workflowProcessor(table, region, policy);

    // send metrics
    if (process.env.SEND_METRIC === "Yes") {
      const metric = {
        Solution: process.env.SOLUTION_ID,
        UUID: process.env.UUID,
        TimeStamp: moment.utc().format("YYYY-MM-DD HH:mm:ss.S"),
        Data: {
          OUCount: ous.length,
          Region: region,
          Event: _e,
          Type: "Shield",
          Version: process.env.SOLUTION_VERSION,
        },
      };
      await Metrics.sendAnonymousMetric(
        <string>process.env.METRICS_QUEUE,
        metric
      );
    }
  }

  /**
   * @description delete shield security policies
   * @param table
   * @param region
   */
  static async deleteShieldPolicy(table: string, region: string) {
    const shieldRules = manifest.advanced.Shield;
    let shieldRule: any;
    if (region === "Global") {
      shieldRule = shieldRules.find((rule) => rule.policyScope === "Global");
      if (!shieldRule) throw new Error("Shield global policy not found");
    } else {
      shieldRule = shieldRules.find((rule) => rule.policyScope === "Regional");
      if (!shieldRule) throw new Error("Shield regional policy not found");
    }

    await FMSHelper.deletePolicy(shieldRule.policyName, region, table);

    // send metrics
    if (process.env.SEND_METRIC === "Yes") {
      const metric = {
        Solution: process.env.SOLUTION_ID,
        UUID: process.env.UUID,
        TimeStamp: moment.utc().format("YYYY-MM-DD HH:mm:ss.S"),
        Data: {
          Region: region,
          Event: "Delete",
          Type: "Shield",
          Version: process.env.SOLUTION_VERSION,
        },
      };
      await Metrics.sendAnonymousMetric(
        <string>process.env.METRICS_QUEUE,
        metric
      );
    }
  }
}
