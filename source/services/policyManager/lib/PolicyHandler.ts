// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Policy } from "@aws-sdk/client-fms";
import {
  Route53ResolverClient,
  paginateListFirewallDomainLists,
  CreateFirewallRuleGroupCommand,
  CreateFirewallRuleCommand,
  FirewallDomainListMetadata,
  Action,
  DeleteFirewallRuleGroupCommand,
  paginateListFirewallRuleGroups,
  BlockResponse,
  ListFirewallRulesCommand,
  DeleteFirewallRuleCommand,
  FirewallRuleGroupMetadata,
} from "@aws-sdk/client-route53resolver";
import {
  RAMClient,
  DeleteResourceShareCommand,
  ListResourcesCommand,
  ResourceOwner,
} from "@aws-sdk/client-ram";
import {
  ITag,
  POLICY_TYPE,
  IDNSFirewallPolicyDetails,
  customUserAgent,
} from "./exports";
import { FMSHelper } from "./PolicyHelper";
import { logger, serviceLogger } from "./common/logger";
import { waitUntilDNSFirewallRuleGroupNotShared } from "./waitForDNSFirewallRuleGroupNotShared";

/**
 * @description class to handle create/delete for policies
 */
export class PolicyHandler {
  /**
   * @description dynamodb table for policy metadata
   */
  private table: string;
  /**
   * @description ou list to scope policies
   */
  private ous: string[];
  /**
   * @description tags to scope policies
   */
  private tags: ITag;
  /**
   * @description policy manifest
   */
  private manifest: string;
  /**
   * @description policy identifier
   */
  private policyIdentifier: string;
  /**
   * @constructor
   * @param ddbTable
   * @param ous
   * @param tags
   * @param manifest
   */
  constructor(
    ddbTable: string,
    ous: string[],
    tags: ITag,
    manifest: string,
    policyIdentifier: string
  ) {
    this.table = ddbTable;
    this.ous = ous;
    this.tags = tags;
    this.manifest = manifest;
    this.policyIdentifier = policyIdentifier;
  }

  /**
   * @description generic method to create policy object
   * @param {POLICY_TYPE} type enum for supported policy types
   * @returns
   */
  createPolicy = async (type: POLICY_TYPE, region: string): Promise<Policy> => {
    logger.debug({
      label: "PolicyHandler/createPolicy",
      message: `creating FMS policy ${type} in ${region}`,
    });
    const manifest = JSON.parse(this.manifest);
    const rule = manifest["default"][type];
    if (!rule) throw new Error(`${type} policy does not exist`);
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
    if (rule.policyDetails.type === POLICY_TYPE.DNS_FIREWALL) {
      policy.SecurityServicePolicyData.ManagedServiceData = JSON.stringify(
        await this.DNSFirewallPlugin(
          policy.SecurityServicePolicyData.ManagedServiceData,
          region
        )
      );
    }
    if (
      type === POLICY_TYPE.WAF_REGIONAL ||
      type === POLICY_TYPE.SHIELD_REGIONAL ||
      type === POLICY_TYPE.SG_CONTENT_AUDIT
    ) {
      Object.assign(policy, {
        ResourceTypeList: rule.resourceTypeList,
      });
    }
    logger.debug({
      label: "PolicyHandler/createPolicy",
      message: `Policy: ${JSON.stringify(policy)}`,
    });
    return policy;
  };

  /**
   * @description generic method to perform put policy and save metadata in dynamodb
   * @param {Policy} policy object to save
   * @param {string} region where the policy has to be created
   * @returns
   */
  savePolicy = async (policy: Policy, region: string): Promise<string> => {
    /**
     * Step 1. get dynamodb policy item
     * Step 2. put fms security policy
     * Step 3. update dynamodb item with new policy update token
     */
    let event = "Update";
    // Step 1. Get DDB item
    try {
      await FMSHelper.getDDBItem(`${policy.PolicyName}`, region, this.table)
        .then((data) => {
          Object.assign(policy, {
            PolicyUpdateToken: data.PolicyUpdateToken.S,
            PolicyId: data.PolicyId.S,
          });
        })
        .catch((e) => {
          logger.debug({
            label: "PolicyHandler/savePolicy",
            message: `error in get item ${e}`,
          });
          if (e.message === "ResourceNotFound") {
            delete policy.PolicyUpdateToken;
            delete policy.PolicyId;
            event = "Create";
          } else throw new Error(e.message);
        });

      // Step 2. Save Policy
      const resp = await FMSHelper.putPolicy(policy, region);

      // Step 3. Update DDB Item
      if (!resp.Policy) throw new Error("error creating policy");
      if (!resp.Policy.PolicyUpdateToken || !resp.Policy.PolicyId)
        throw new Error("policy update token not found");
      await FMSHelper.saveDDBItem(
        <string>policy.PolicyName,
        region,
        {
          updateToken: resp.Policy.PolicyUpdateToken,
          policyId: resp.Policy.PolicyId,
        },
        this.table
      );

      // Step 4. Response
      return event;
    } catch (e) {
      logger.error({
        label: "PolicyHandler/savePolicy",
        message: `${e.message}`,
      });
      throw new Error(`${e.message}`);
    }
  };

  /**
   * @description generic method to delete policy
   * @param {POLICY_TYPE} type enum for supported policy types
   * @param {string} region where delete policy action has to be performed
   */
  deletePolicy = async (type: POLICY_TYPE, region: string): Promise<void> => {
    const manifest = JSON.parse(this.manifest);
    const name = manifest.default[type].policyName;
    await FMSHelper.deletePolicy(
      `${name}-${this.policyIdentifier}`,
      region,
      this.table
    );
    if (type === POLICY_TYPE.DNS_FIREWALL)
      await this.deleteDNSFirewallRuleGroup(region);
  };

  private deleteDNSFirewallRuleGroup = async (
    region: string
  ): Promise<void> => {
    logger.debug({
      label: "PolicyHandler/deleteDNSFirewallRuleGroup",
      message: `deleting DNS firewall rule group for AWSManagedDomains list in ${region}`,
    });
    const route53Client = new Route53ResolverClient({
      customUserAgent,
      region,
      logger: serviceLogger,
    });
    const paginatorConfig = {
      client: route53Client,
      pageSize: 10,
    };
    const paginator = paginateListFirewallRuleGroups(paginatorConfig, {});
    const ruleGroups: FirewallRuleGroupMetadata[] = [];
    for await (const page of paginator) {
      const list = page.FirewallRuleGroups?.filter(
        (ruleGroup) =>
          ruleGroup.Name ===
          `DNS-Block-AWSManagedBadDomains-${this.policyIdentifier}`
      );
      if (list) ruleGroups.push(...list);
    }
    try {
      if (ruleGroups.length === 0)
        throw new Error(
          `DNS-Block-AWSManagedBadDomains-${this.policyIdentifier} not found in ${region}`
        );
      await Promise.all(
        ruleGroups.map(async (ruleGrp) => {
          const rules = await route53Client.send(
            new ListFirewallRulesCommand({
              FirewallRuleGroupId: ruleGrp.Id,
            }) // only 2 rules in rule group
          );
          if (rules.FirewallRules) {
            await Promise.all(
              rules.FirewallRules.map(async (rule) => {
                await route53Client.send(
                  new DeleteFirewallRuleCommand({
                    FirewallRuleGroupId: ruleGrp.Id,
                    FirewallDomainListId: rule.FirewallDomainListId,
                  })
                );
              })
            );
          }

          // delete RAM resource share
          logger.debug({
            label: "PolicyHandler/deleteDNSFirewallRuleGroup",
            message: `deleting resource share in ${region}`,
          });
          const ramClient = new RAMClient({
            customUserAgent,
            region,
            logger: serviceLogger,
          });
          const ramResources = await ramClient.send(
            new ListResourcesCommand({
              resourceArns: [ruleGrp.Arn as string],
              resourceOwner: ResourceOwner.SELF,
            })
          );
          if (ramResources.resources)
            await Promise.all(
              ramResources.resources.map(async (resource) => {
                await ramClient.send(
                  new DeleteResourceShareCommand({
                    resourceShareArn: resource.resourceShareArn,
                  })
                );
              })
            );

          // waiting for rule group share status to change to NOT_SHARED
          await waitUntilDNSFirewallRuleGroupNotShared(
            { client: route53Client, maxWaitTime: 600 }, // aggressive timeout, as there can be delay in deleting RAM resource share
            { FirewallRuleGroupId: ruleGrp.Id }
          );

          await route53Client.send(
            new DeleteFirewallRuleGroupCommand({
              FirewallRuleGroupId: ruleGrp.Id,
            })
          );
        })
      );
      logger.debug({
        label: "PolicyHandler/deleteDNSFirewallRuleGroup",
        message: `DNS firewall rule group deleted in ${region}`,
      });
    } catch (e) {
      logger.warn({
        label: "PolicyHandler/deleteDNSFirewallRuleGroup",
        message: `DNS firewall rule group for AWSManagedDomains list, delete failed in ${region}, error: ${e}`,
      });
    }
  };

  /**
   * @description creates DNS firewall rule group with AWS Managed Domain list
   */
  private createDNSFirewallRuleGroup = async (
    region: string
  ): Promise<string> => {
    logger.debug({
      label: "PolicyHandler/createDNSFirewallRuleGroup",
      message: `creating DNS firewall rule group for AWSManagedDomains list in ${region}`,
    });
    // get AWS Managed domain list
    const route53Client = new Route53ResolverClient({
      customUserAgent,
      region,
      logger: serviceLogger,
    });
    const paginatorConfig = {
      client: route53Client,
      pageSize: 10,
    };
    const domains: FirewallDomainListMetadata[] = [];
    const paginator = paginateListFirewallDomainLists(paginatorConfig, {});
    for await (const page of paginator) {
      const list = page.FirewallDomainLists?.filter(
        (domainList) =>
          domainList.Name === "AWSManagedDomainsMalwareDomainList" ||
          domainList.Name === "AWSManagedDomainsBotnetCommandandControl"
      );
      if (!list) return "NOP";
      domains.push(...list);
    }
    logger.debug({
      label: "PolicyHandler/createDNSFirewallRuleGroup",
      message: `AWSManagedDomain list: ${JSON.stringify(domains)}`,
    });

    // create DNS Firewall rule group
    const resp = await route53Client.send(
      new CreateFirewallRuleGroupCommand({
        Name: `DNS-Block-AWSManagedBadDomains-${this.policyIdentifier}`,
      })
    );
    if (!resp.FirewallRuleGroup || !resp.FirewallRuleGroup.Id) return "NOP";
    const rulegrpId = resp.FirewallRuleGroup.Id;

    // create Firewall rules for the rule group with AWS managed domains
    await Promise.allSettled(
      domains.map(async (domain, index) =>
        route53Client
          .send(
            new CreateFirewallRuleCommand({
              Action: Action.BLOCK,
              BlockResponse: BlockResponse.NODATA,
              FirewallRuleGroupId: rulegrpId,
              Priority: index + 1,
              FirewallDomainListId: domain.Id,
              Name: `Block-${domain.Name}`,
            })
          )
          .catch((e) => {
            logger.warn({
              label: "PolicyHandler/createDNSFirewallRuleGroup",
              message: `DNS firewall rule create fail ${e}`,
            });
          })
      )
    );
    logger.debug({
      label: "PolicyHandler/createDNSFirewallRuleGroup",
      message: `DNS firewall rule group ${rulegrpId} created in ${region}`,
    });
    return rulegrpId; // return rule group id
  };

  /**
   *
   * @param {Policy} policy
   * @returns
   */
  private DNSFirewallPlugin = async (
    policyDetails: string,
    region: string
  ): Promise<IDNSFirewallPolicyDetails> => {
    const _policyDetails: IDNSFirewallPolicyDetails = JSON.parse(policyDetails);
    await Promise.allSettled(
      _policyDetails.preProcessRuleGroups.map(async (ruleGrp, index) => {
        if (ruleGrp.ruleGroupId === "%%AWS_MANAGED%%") {
          await this.createDNSFirewallRuleGroup(region)
            .then((ruleGrpId) => {
              _policyDetails.preProcessRuleGroups[index].ruleGroupId =
                ruleGrpId;
            })
            .catch((e) => {
              logger.warn({
                label: "PolicyHandler/DNSFirewallPlugin",
                message: `preProcessRuleGroup create failed in ${region} error ${JSON.stringify(
                  e
                )}`,
              });
            });
        }
      })
    );
    await Promise.allSettled(
      _policyDetails.postProcessRuleGroups.map(async (ruleGrp, index) => {
        if (ruleGrp.ruleGroupId === "%%AWS_MANAGED%%") {
          await this.createDNSFirewallRuleGroup(region)
            .then((ruleGrpId) => {
              _policyDetails.postProcessRuleGroups[index].ruleGroupId =
                ruleGrpId;
            })
            .catch((e) => {
              logger.warn({
                label: "PolicyHandler/DNSFirewallPlugin",
                message: `postProcessRuleGroup create failed in ${region} error ${JSON.stringify(
                  e
                )}`,
              });
            });
        }
      })
    );
    logger.debug({
      label: "PolicyHandler/DNSFirewallPlugin",
      message: `policy details: ${JSON.stringify(_policyDetails)}`,
    });
    return _policyDetails;
  };
}
