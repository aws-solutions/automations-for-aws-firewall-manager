// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  CreateFirewallRuleCommand,
  CreateFirewallRuleCommandInput,
  CreateFirewallRuleGroupCommand,
  DeleteFirewallRuleCommand,
  DeleteFirewallRuleGroupCommand,
  FirewallDomainListMetadata,
  FirewallRuleGroupMetadata,
  ListFirewallRulesCommand,
  Route53ResolverClient,
  paginateListFirewallDomainLists,
  paginateListFirewallRuleGroups,
} from "@aws-sdk/client-route53resolver";

import { customUserAgent } from "../exports";
import { logger, tracer } from "solutions-utils";

export class Route53Helper {
  readonly route53Client: Route53ResolverClient;

  constructor(region: string) {
    this.route53Client = tracer.captureAWSv3Client(
      new Route53ResolverClient({
        customUserAgent: customUserAgent,
        region,
      })
    );
  }

  async listFirewallRuleGroups(ruleGroupName: string) {
    const paginatorConfig = {
      client: this.route53Client,
      pageSize: 10,
    };
    const paginator = paginateListFirewallRuleGroups(paginatorConfig, {});
    const ruleGroups: FirewallRuleGroupMetadata[] = [];
    try {
      for await (const page of paginator) {
        const list = page.FirewallRuleGroups?.filter(
          (ruleGroup) => ruleGroup.Name === ruleGroupName
        );
        if (list) ruleGroups.push(...list);
      }

      logger.debug(`successfully listed firewall rule groups`, {
        ruleGroups,
      });

      return ruleGroups;
    } catch (e) {
      logger.error(`error listing firewall rule groups`, {
        error: e,
      });
      throw new Error("error listing firewall rule groups");
    }
  }

  async listFirewallDomainLists(domainListNames: string[]) {
    const paginatorConfig = {
      client: this.route53Client,
      pageSize: 10,
    };
    const domains: FirewallDomainListMetadata[] = [];
    const paginator = paginateListFirewallDomainLists(paginatorConfig, {});

    try {
      for await (const page of paginator) {
        const list = page.FirewallDomainLists?.filter((domainList) =>
          domainListNames.includes(domainList.Name as string)
        );
        if (list) domains.push(...list);
      }

      logger.debug(`successfully listed firewall domain lists`, {
        domains,
      });

      return domains;
    } catch (e) {
      logger.error(`error listing firewall domain lists`, {
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error("error listing firewall domain lists");
    }
  }

  async deleteFirewallRuleGroup(ruleGroupId: string) {
    try {
      await this.route53Client.send(
        new DeleteFirewallRuleGroupCommand({
          FirewallRuleGroupId: ruleGroupId,
        })
      );
      logger.debug(`successfully deleted firewall rule group`, {
        ruleGroupId,
      });
    } catch (e) {
      logger.error(`error deleting firewall rule group`, {
        ruleGroupId,
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error("error deleting firewall rule group");
    }
  }

  async deleteFirewallRulesForRuleGroup(ruleGroupId: string) {
    try {
      const rules = await this.listFirewallRules(ruleGroupId);

      if (rules.FirewallRules) {
        await Promise.all(
          rules.FirewallRules.map(async (rule) => {
            await this.deleteFirewallRule(
              ruleGroupId,
              rule.FirewallDomainListId
            );
          })
        );

        logger.debug(`successfully deleted firewall rules for rule group`, {
          ruleGroupId,
        });
      } else {
        logger.debug(`no rules found for rule group`, {
          ruleGroupId,
        });
      }
    } catch (e) {
      logger.error(`error deleting firewall rules for rule group`, {
        ruleGroupId,
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error("error deleting firewall rules for rule group");
    }
  }

  private async listFirewallRules(ruleGroupId: string) {
    try {
      const rules = await this.route53Client.send(
        new ListFirewallRulesCommand({
          FirewallRuleGroupId: ruleGroupId,
        })
      );

      logger.debug(`successfully listed firewall rules`, {
        ruleGroupId,
        rules,
      });

      return rules;
    } catch (e) {
      logger.error(`error listing firewall rules`, {
        ruleGroupId,
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error("error listing firewall rules`");
    }
  }

  private async deleteFirewallRule(
    ruleGroupId: string,
    firewallDomainListId?: string
  ) {
    try {
      await this.route53Client.send(
        new DeleteFirewallRuleCommand({
          FirewallRuleGroupId: ruleGroupId,
          FirewallDomainListId: firewallDomainListId,
        })
      );

      logger.debug(`successfully deleted firewall rule`, {
        ruleGroupId,
        firewallDomainListId,
      });
    } catch (e) {
      logger.error(`error deleting firewall rule`, {
        ruleGroupId,
        firewallDomainListId,
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error("error deleting firewall rule");
    }
  }

  async createFirewallRuleGroup(ruleGroupName: string) {
    try {
      const ruleGroupResponse = await this.route53Client.send(
        new CreateFirewallRuleGroupCommand({
          Name: ruleGroupName,
        })
      );

      logger.debug(`successfully created firewall rule group`, {
        ruleGroupName,
        ruleGroupResponse,
      });

      return ruleGroupResponse;
    } catch (e) {
      logger.error(`error creating firewall rule group`, {
        ruleGroupName,
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error("error creating firewall rule group");
    }
  }

  async createFirewallRule(firewallRule: CreateFirewallRuleCommandInput) {
    try {
      await this.route53Client.send(
        new CreateFirewallRuleCommand(firewallRule)
      );

      logger.debug(`successfully created firewall rule`, {
        firewallRule,
      });
    } catch (e) {
      logger.error(`error creating firewall rule`, {
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error("error creating firewall rule");
    }
  }
}
