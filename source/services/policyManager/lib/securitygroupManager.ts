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
import moment from "moment";
import { Metrics } from "./common/metrics";

export class SecurityGroupManager {
  /**
   * @description save Security Group usage audit security policies
   */
  static async saveSecGrpPolicy(
    ous: string[],
    tags: ITags,
    table: string,
    region: string,
    type: string
  ) {
    const sgRules = manifest.basic.SecurityGroup;
    let sgAudit: any;
    if (type === "USAGE_AUDIT")
      sgAudit = sgRules.find(
        (rule) => rule.policyDetails.type === "SECURITY_GROUPS_USAGE_AUDIT"
      );
    if (type === "CONTENT_AUDIT")
      sgAudit = sgRules.find(
        (rule) => rule.policyDetails.type === "SECURITY_GROUPS_CONTENT_AUDIT"
      );
    if (!sgAudit) throw new Error("Security Group Audit policy not found");

    const policy = {
      PolicyName: sgAudit.policyName,
      ResourceTags: tags.ResourceTags,
      ExcludeResourceTags: tags.ExcludeResourceTags,
      RemediationEnabled: sgAudit.remediationEnabled,
      ResourceType: sgAudit.resourceType,
      SecurityServicePolicyData: {
        Type: sgAudit.policyDetails.type,
        ManagedServiceData: JSON.stringify(sgAudit.policyDetails),
      },
      IncludeMap: {
        ORG_UNIT: ous,
      },
    };
    if (type === "CONTENT_AUDIT")
      Object.assign(policy, {
        ResourceTypeList: sgAudit.resourceTypeList,
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
          Type: `SG_` + type,
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
   * @description delete Security Group usage audit security policies
   * @param table
   * @param region
   */
  static async deleteSecGrpPolicy(table: string, region: string, type: string) {
    const sgRules = manifest.basic.SecurityGroup;
    let sgAudit: any;
    if (type === "USAGE_AUDIT")
      sgAudit = sgRules.find(
        (rule) => rule.policyDetails.type === "SECURITY_GROUPS_USAGE_AUDIT"
      );
    if (type === "CONTENT_AUDIT")
      sgAudit = sgRules.find(
        (rule) => rule.policyDetails.type === "SECURITY_GROUPS_CONTENT_AUDIT"
      );
    if (!sgAudit) throw new Error("Security Group Audit policy not found");

    await FMSHelper.deletePolicy(sgAudit.policyName, region, table);

    // send metrics
    if (process.env.SEND_METRIC === "Yes") {
      const metric = {
        Solution: process.env.SOLUTION_ID,
        UUID: process.env.UUID,
        TimeStamp: moment.utc().format("YYYY-MM-DD HH:mm:ss.S"),
        Data: {
          Region: region,
          Event: "Delete",
          Type: `SG_` + type,
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
