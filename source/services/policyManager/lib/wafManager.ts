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
import { FMSHelper } from "./fmsHelper";
import { Metrics } from "./common/metrics";
import moment from "moment";

export class WAFManager {
  /**
   * @description create/update WAF global or regional security policies
   */
  static async saveWAFPolicy(
    ous: string[],
    tags: ITags,
    table: string,
    region: string
  ) {
    const WAFRules = manifest.basic.WAF;
    let WAFRule: any;
    if (region === "Global") {
      WAFRule = WAFRules.find((rule) => rule.policyScope === "Global");
      if (!WAFRule) {
        throw new Error("WAF global policy not found");
      }
    } else {
      WAFRule = WAFRules.find((rule) => rule.policyScope === "Regional");
      if (!WAFRule) {
        throw new Error("WAF regional policy not found");
      }
    }

    const policy = {
      PolicyName: WAFRule.policyName,
      RemediationEnabled: WAFRule.remediationEnabled,
      ResourceType: WAFRule.resourceType,
      ResourceTags: tags.ResourceTags,
      ExcludeResourceTags: tags.ExcludeResourceTags,
      SecurityServicePolicyData: {
        Type: WAFRule.policyDetails.type,
        ManagedServiceData: JSON.stringify(WAFRule.policyDetails),
      },
      IncludeMap: {
        ORG_UNIT: ous,
      },
    };
    if (region !== "Global")
      Object.assign(policy, {
        ResourceTypeList: WAFRule.resourceTypeList,
      });

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
          Type: "WAF",
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
   * @description delete WAF global or regional security policies
   * @param table
   * @param region
   */
  static async deleteWAFPolicy(table: string, region: string) {
    const WAFRules = manifest.basic.WAF;
    let WAFRule: any;
    if (region === "Global") {
      WAFRule = WAFRules.find((rule) => rule.policyScope === "Global");
      if (!WAFRule) throw new Error("WAF global policy not found");
    } else {
      WAFRule = WAFRules.find((rule) => rule.policyScope === "Regional");
      if (!WAFRule) throw new Error("WAF regional policy not found");
    }

    await FMSHelper.deletePolicy(WAFRule.policyName, region, table);

    // send metrics
    if (process.env.SEND_METRIC === "Yes") {
      const metric = {
        Solution: process.env.SOLUTION_ID,
        UUID: process.env.UUID,
        TimeStamp: moment.utc().format("YYYY-MM-DD HH:mm:ss.S"),
        Data: {
          Region: region,
          Event: "Delete",
          Type: "WAF",
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
