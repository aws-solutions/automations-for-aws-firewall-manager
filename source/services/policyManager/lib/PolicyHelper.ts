// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Policy } from "@aws-sdk/client-fms";
import {
  ITag,
  POLICY_TYPE,
  IDNSFirewallPolicyDetails,
  PARTITION,
} from "./exports";
import { logger } from "solutions-utils";
import { waitUntilDNSFirewallRuleGroupNotShared } from "./waitForDNSFirewallRuleGroupNotShared";
import {
  DynamoDBHelper,
  FMSHelper,
  RAMHelper,
  Route53Helper,
} from "./clientHelpers";
import { Action, BlockResponse } from "@aws-sdk/client-route53resolver";

export interface PolicyHelperProps {
  ddbTable: string;
  ous: string[];
  tags: ITag;
  manifest: string;
  policyIdentifier: string;
  partition: PARTITION;
}

/**
 * @description class to handle create/delete for policies
 */
export class PolicyHelper {
  private ddbTable: string;
  private ous: string[];
  private tags: ITag;
  private manifest: string;
  private policyIdentifier: string;
  private partition: PARTITION;
  private ddbHelper: DynamoDBHelper;
  private fmsHelper: FMSHelper;

  constructor(props: PolicyHelperProps) {
    this.ddbTable = props.ddbTable;
    this.ous = props.ous;
    this.tags = props.tags;
    this.manifest = props.manifest;
    this.policyIdentifier = props.policyIdentifier;
    this.partition = props.partition;

    this.ddbHelper = new DynamoDBHelper();
    this.fmsHelper = new FMSHelper({
      maxAttempts: +(process.env.MAX_ATTEMPTS as string),
      partition: this.partition,
    });
  }

  /**
   * @description generic method to create policy object
   * @param {POLICY_TYPE} policyType enum for supported policy types
   * @returns
   */
  async buildPolicy(policyType: POLICY_TYPE, region: string): Promise<Policy> {
    const manifest = JSON.parse(this.manifest);
    const rule = manifest["default"][policyType];
    if (!rule) throw new Error(`${policyType} policy does not exist`);

    const policy = {
      PolicyName: `${rule.policyName}-${this.policyIdentifier}`,
      RemediationEnabled: rule.remediationEnabled,
      ResourceType: rule.resourceType,
      ResourceTags: this.tags.ResourceTags,
      ExcludeResourceTags: this.tags.ExcludeResourceTags,
      SecurityServicePolicyData: {
        Type: rule.policyDetails.type,
        ManagedServiceData: JSON.stringify(rule.policyDetails),
      },
      IncludeMap: {
        ORG_UNIT: this.ous,
      },
    };

    // dns firewall plugin
    if (policyType === POLICY_TYPE.DNS_FIREWALL) {
      policy.SecurityServicePolicyData.ManagedServiceData = JSON.stringify(
        await this.buildDNSFirewallManagedServiceData(
          policy.SecurityServicePolicyData.ManagedServiceData,
          region
        )
      );
    }

    if (
      [
        POLICY_TYPE.WAF_REGIONAL,
        POLICY_TYPE.SHIELD_REGIONAL,
        POLICY_TYPE.SG_CONTENT_AUDIT,
      ].includes(policyType)
    ) {
      Object.assign(policy, {
        ResourceTypeList: rule.resourceTypeList,
      });
    }

    logger.debug("created new policy object", {
      policyType: policyType,
      policy: policy,
    });
    return policy;
  }

  /**
   * @description generic method to perform put policy and save metadata in dynamodb
   * @param {Policy} policy object to save
   * @param {string} region where the policy has to be created
   * @returns
   */
  async saveOrUpdatePolicy(policy: Policy, region: string): Promise<string> {
    let event = "Update";
    try {
      const policyData = await this.ddbHelper.getDDBItem(
        <string>policy.PolicyName,
        region,
        this.ddbTable
      );

      const existingPolicy = await this.fmsHelper.getPolicy(
        <string>policyData.PolicyId.S,
        region
      );

      Object.assign(policy, {
        PolicyUpdateToken: existingPolicy.PolicyUpdateToken,
        PolicyId: policyData.PolicyId.S,
      });
    } catch (e) {
      if (e.message === "ResourceNotFound") {
        delete policy.PolicyUpdateToken;
        delete policy.PolicyId;
        event = "Create";
      } else {
        throw new Error(e.message);
      }
    }

    try {
      const resp = await this.fmsHelper.putPolicy(policy, region);

      if (!resp.Policy) {
        throw new Error("error creating policy");
      }

      if (!resp.Policy.PolicyUpdateToken) {
        throw new Error("policy update token not found");
      }

      if (!resp.Policy.PolicyId) {
        throw new Error("policy id not found");
      }

      await this.ddbHelper.saveDDBItem(
        <string>policy.PolicyName,
        region,
        {
          updateToken: resp.Policy.PolicyUpdateToken,
          policyId: resp.Policy.PolicyId,
        },
        this.ddbTable
      );

      return event;
    } catch (e) {
      throw new Error(`${e.message}`);
    }
  }

  /**
   * @description generic method to delete policy
   * @param {POLICY_TYPE} policyType enum for supported policy types
   * @param {string} region where delete policy action has to be performed
   */
  async deletePolicy(policyType: POLICY_TYPE, region: string): Promise<void> {
    const manifest = JSON.parse(this.manifest);
    const name = manifest.default[policyType].policyName;

    // verify that the policy was created by the solution
    const response = await this.ddbHelper.getDDBItem(
      `${name}-${this.policyIdentifier}`,
      region,
      this.ddbTable
    );

    if (!response.PolicyId.S) {
      return;
    }

    await this.fmsHelper.deletePolicy(response.PolicyId.S, region);

    await this.ddbHelper.deleteDDBItem(
      `${name}-${this.policyIdentifier}`,
      region,
      this.ddbTable
    );

    if (policyType === POLICY_TYPE.DNS_FIREWALL) {
      await this.deleteDNSFirewallRuleGroup(region);
    }
  }

  private async deleteDNSFirewallRuleGroup(region: string): Promise<void> {
    const route53Helper = new Route53Helper(region);

    const ruleGroups = await route53Helper.listFirewallRuleGroups(
      `DNS-Block-AWSManagedBadDomains-${this.policyIdentifier}`
    );

    try {
      if (ruleGroups.length === 0)
        throw new Error(
          `DNS-Block-AWSManagedBadDomains-${this.policyIdentifier} not found in ${region}`
        );
      await Promise.all(
        ruleGroups.map(async (ruleGrp) => {
          if (!ruleGrp.Id) {
            return;
          }

          await route53Helper.deleteFirewallRulesForRuleGroup(ruleGrp.Id);

          // delete RAM resource share
          const ramHelper = new RAMHelper(region);
          await ramHelper.deleteResourcesForRuleGroup(ruleGrp.Arn as string);

          // waiting for rule group share status to change to NOT_SHARED
          await waitUntilDNSFirewallRuleGroupNotShared(
            { client: route53Helper.route53Client, maxWaitTime: 600 }, // aggressive timeout, as there can be delay in deleting RAM resource share
            { FirewallRuleGroupId: ruleGrp.Id }
          );

          await route53Helper.deleteFirewallRuleGroup(ruleGrp.Id);
          logger.debug("DNS firewall rule group deleted", {
            region: region,
            FirewallRuleGroupId: ruleGrp.Id,
          });
        })
      );
    } catch (e) {
      logger.warn(
        "failed to delete DNS firewall rule group for AWSManagedDomains list",
        {
          error: e,
          region: region,
          requestId: e.$metadata?.requestId,
        }
      );
    }
  }

  /**
   * @description creates DNS firewall rule group with AWS Managed Domain list
   */
  private async createDNSFirewallRuleGroup(region: string): Promise<string> {
    const route53Helper = new Route53Helper(region);

    const domains = await route53Helper.listFirewallDomainLists([
      "AWSManagedDomainsMalwareDomainList",
      "AWSManagedDomainsBotnetCommandandControl",
    ]);

    logger.debug("fetched AWSManagedDomain list", {
      domainList: domains,
      region: region,
    });

    const resp = await route53Helper.createFirewallRuleGroup(
      `DNS-Block-AWSManagedBadDomains-${this.policyIdentifier}`
    );

    if (!resp.FirewallRuleGroup || !resp.FirewallRuleGroup.Id) {
      return "NOP";
    }

    const rulegrpId = resp.FirewallRuleGroup.Id;

    logger.debug("created DNS firewall rule group", {
      region: region,
      FirewallRuleGroupId: rulegrpId,
    });

    // create Firewall rules for the rule group with AWS managed domains
    await Promise.allSettled(
      domains.map(async (domain, index) => {
        try {
          await route53Helper.createFirewallRule({
            Action: Action.BLOCK,
            BlockResponse: BlockResponse.NODATA,
            FirewallRuleGroupId: rulegrpId,
            Priority: index + 1,
            FirewallDomainListId: domain.Id,
            Name: `Block-${domain.Name}`,
          });
        } catch (e) {
          logger.warn("failed to create DNS firewall rule", {
            error: e,
            region: region,
            ruleGroup: rulegrpId,
            requestId: e.$metadata?.requestId,
          });
        }
      })
    );

    return rulegrpId;
  }

  private async buildDNSFirewallManagedServiceData(
    policyDetailsString: string,
    region: string
  ): Promise<IDNSFirewallPolicyDetails> {
    const policyDetails: IDNSFirewallPolicyDetails =
      JSON.parse(policyDetailsString);

    await Promise.allSettled(
      policyDetails.preProcessRuleGroups.map(async (ruleGroup, index) => {
        if (ruleGroup.ruleGroupId !== "%%AWS_MANAGED%%") {
          return;
        }

        try {
          const ruleGroupId = await this.createDNSFirewallRuleGroup(region);
          policyDetails.preProcessRuleGroups[index].ruleGroupId = ruleGroupId;
        } catch (e) {
          logger.warn(`create failed for preProcessRuleGroup in ${region}`, {
            error: e,
            region: region,
            ruleGroupId: ruleGroup.ruleGroupId,
            requestId: e.$metadata?.requestId,
          });
        }
      })
    );

    await Promise.allSettled(
      policyDetails.postProcessRuleGroups.map(async (ruleGroup, index) => {
        if (ruleGroup.ruleGroupId !== "%%AWS_MANAGED%%") {
          return;
        }

        try {
          const ruleGroupId = await this.createDNSFirewallRuleGroup(region);
          policyDetails.preProcessRuleGroups[index].ruleGroupId = ruleGroupId;
        } catch (e) {
          logger.warn(`create failed for postProcessRuleGroup in ${region}`, {
            error: e,
            region: region,
            ruleGroupId: ruleGroup.ruleGroupId,
            requestId: e.$metadata?.requestId,
          });
        }
      })
    );
    logger.debug("finished processing DNS Firewall rule groups", {
      region: region,
      policyDetails: policyDetails,
    });
    return policyDetails;
  }
}
