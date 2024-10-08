// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import {
  Action,
  BlockResponse,
  CreateFirewallRuleCommand,
  CreateFirewallRuleGroupCommand,
  DeleteFirewallRuleCommand,
  DeleteFirewallRuleGroupCommand,
  FirewallDomainListMetadata,
  FirewallRule,
  FirewallRuleGroupMetadata,
  ListFirewallDomainListsCommand,
  ListFirewallRuleGroupsCommand,
  ListFirewallRulesCommand,
  Route53ResolverClient,
  Route53ResolverServiceException,
} from "@aws-sdk/client-route53resolver";
import { Route53Helper } from "../lib/clientHelpers";

describe("Route53 Helper", () => {
  const mockRoute53Client = mockClient(Route53ResolverClient);
  let route53Helper: Route53Helper;
  const region = "us-east-1";

  const mockFirewallRuleGroups: FirewallRuleGroupMetadata[] = [
    {
      Id: "testId1",
      Name: "testName",
    },
    {
      Id: "testId2",
      Name: "testName",
    },
    {
      Id: "testId3",
      Name: "notTestName",
    },
  ];

  const mockFirewallDomainLists: FirewallDomainListMetadata[] = [
    {
      Id: "testId1",
      Name: "testName1",
    },
    {
      Id: "testId2",
      Name: "testName2",
    },
    {
      Id: "testId3",
      Name: "notTestName",
    },
  ];

  const mockFirewallRules: FirewallRule[] = [
    {
      FirewallDomainListId: "testId1",
      Name: "testName",
    },
    {
      FirewallDomainListId: "testId2",
      Name: "testName",
    },
  ];

  const mockFirewallRule = {
    Action: Action.BLOCK,
    BlockResponse: BlockResponse.NODATA,
    FirewallRuleGroupId: "rulegrpId",
    Priority: 1,
    FirewallDomainListId: "domainId",
    Name: "Block-domainName",
  };

  const mockFirewallRuleGroup = {
    Id: "rulegrpId",
    Name: "rulegrpName",
  };

  beforeEach(() => {
    mockRoute53Client.reset();

    mockRoute53Client.on(ListFirewallRuleGroupsCommand).resolves({
      FirewallRuleGroups: mockFirewallRuleGroups,
    });

    mockRoute53Client.on(ListFirewallDomainListsCommand).resolves({
      FirewallDomainLists: mockFirewallDomainLists,
    });

    mockRoute53Client.on(ListFirewallRulesCommand).resolves({
      FirewallRules: mockFirewallRules,
    });

    mockRoute53Client.on(CreateFirewallRuleCommand).resolves({
      FirewallRule: mockFirewallRule,
    });

    mockRoute53Client.on(CreateFirewallRuleGroupCommand).resolves({
      FirewallRuleGroup: mockFirewallRuleGroup,
    });

    route53Helper = new Route53Helper(region);
  });

  it("should list the firewall rule group with matching name", async () => {
    const result = await route53Helper.listFirewallRuleGroups("testName");

    expect(result).toEqual([
      {
        Id: "testId1",
        Name: "testName",
      },
      {
        Id: "testId2",
        Name: "testName",
      },
    ]);
  });

  it("should throw an exception if Route53Client returns an error during listFirewallRuleGroups", async () => {
    mockRoute53Client.on(ListFirewallRuleGroupsCommand).rejectsOnce(
      new Route53ResolverServiceException({
        name: "Route53ResolverServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await route53Helper.listFirewallRuleGroups("testName");
    };

    await expect(testCase).rejects.toThrow(
      /error listing firewall rule groups/
    );
  });

  it("should list the firewall domains with matching names", async () => {
    const result = await route53Helper.listFirewallDomainLists([
      "testName1",
      "testName2",
    ]);

    expect(result).toEqual([
      {
        Id: "testId1",
        Name: "testName1",
      },
      {
        Id: "testId2",
        Name: "testName2",
      },
    ]);
  });

  it("should throw an exception if Route53Client returns an error during listFirewallDomainLists", async () => {
    mockRoute53Client.on(ListFirewallDomainListsCommand).rejectsOnce(
      new Route53ResolverServiceException({
        name: "Route53ResolverServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await route53Helper.listFirewallDomainLists(["testName1", "testName2"]);
    };

    await expect(testCase).rejects.toThrow(
      /error listing firewall domain lists/
    );
  });

  it("should delete firewall rule groups", async () => {
    const testCase = async () => {
      await route53Helper.deleteFirewallRuleGroup("ruleGroupId");
    };

    await expect(testCase).not.toThrow();
  });

  it("should throw an exception if Route53Client returns an error during deleteFirewallRuleGroup", async () => {
    mockRoute53Client.on(DeleteFirewallRuleGroupCommand).rejectsOnce(
      new Route53ResolverServiceException({
        name: "Route53ResolverServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await route53Helper.deleteFirewallRuleGroup("ruleGroupId");
    };

    await expect(testCase).rejects.toThrow(
      /error deleting firewall rule group/
    );
  });

  it("should delete firewwall rules for a rule group", async () => {
    const testCase = async () => {
      await route53Helper.deleteFirewallRulesForRuleGroup("ruleGroupId");
    };

    await expect(testCase).not.toThrow();
  });

  it("should not throw an exception if listing firewall rules returns no rules", async () => {
    mockRoute53Client.on(ListFirewallRulesCommand).resolvesOnce({
      FirewallRules: [],
    });
    const testCase = async () => {
      await route53Helper.deleteFirewallRulesForRuleGroup("ruleGroupId");
    };

    await expect(testCase).not.toThrow();
  });

  it("should throw an exception if Route53Client returns an error when listing firewall rules", async () => {
    mockRoute53Client.on(ListFirewallRulesCommand).rejectsOnce(
      new Route53ResolverServiceException({
        name: "Route53ResolverServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await route53Helper.deleteFirewallRulesForRuleGroup("ruleGroupId");
    };

    await expect(testCase).rejects.toThrow(
      /error deleting firewall rules for rule group/
    );
  });

  it("should throw an exception if Route53Client returns an error when deleting firewall rule", async () => {
    mockRoute53Client.on(DeleteFirewallRuleCommand).rejectsOnce(
      new Route53ResolverServiceException({
        name: "Route53ResolverServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await route53Helper.deleteFirewallRulesForRuleGroup("ruleGroupId");
    };

    await expect(testCase).rejects.toThrow(
      /error deleting firewall rules for rule group/
    );
  });

  it("should create firewall rule group", async () => {
    const result = await route53Helper.createFirewallRuleGroup("ruleGroupName");

    expect(result).toEqual({
      FirewallRuleGroup: mockFirewallRuleGroup,
    });
  });

  it("should throw an exception if Route53Client returns an error during createFirewallRuleGroup", async () => {
    mockRoute53Client.on(CreateFirewallRuleGroupCommand).rejectsOnce(
      new Route53ResolverServiceException({
        name: "Route53ResolverServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await route53Helper.createFirewallRuleGroup("ruleGroupName");
    };

    await expect(testCase).rejects.toThrow(
      /error creating firewall rule group/
    );
  });

  it("should create a firewall rule", async () => {
    const testCase = async () => {
      await route53Helper.createFirewallRule(mockFirewallRule);
    };

    await expect(testCase).not.toThrow();
  });

  it("should throw an exception if Route53Client returns an error during createFirewallRule", async () => {
    mockRoute53Client.on(CreateFirewallRuleCommand).rejectsOnce(
      new Route53ResolverServiceException({
        name: "Route53ResolverServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await route53Helper.createFirewallRule(mockFirewallRule);
    };

    await expect(testCase).rejects.toThrow(/error creating firewall rule/);
  });
});
