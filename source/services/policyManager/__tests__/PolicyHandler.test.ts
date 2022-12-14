// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { PolicyHandler } from "../lib/PolicyHandler";
import { POLICY_TYPE } from "../lib/exports";
import { FMSHelper } from "../lib/PolicyHelper";
import manifest from "./policy_manifest.test.json";
import { waitUntilDNSFirewallRuleGroupNotShared } from "../lib/waitForDNSFirewallRuleGroupNotShared";
import "jest";
import { WaiterState } from "@aws-sdk/util-waiter";

const mockR53 = jest.fn();
const mockRAM = jest.fn();
const mockSaveDDBItem = jest.fn();
const mockGetDDBItem = jest.fn();
const mockPutPolicy = jest.fn();
const mockDeletePolicy = jest.fn();

// test object
const mockTag = {
  ResourceTags: [{ Key: "myKey", Value: "myValue" }],
  ExcludeResourceTags: false,
};

const mockOUs = ["ou-xxxx-a00000aa", "ou-yyyy-b00000aa"];
const ddbItemResp = {
  PolicyUpdateToken: { S: "updateToken-xxx" },
  PolicyId: { S: "policyId-xxx" },
};

const mockPolicy = {
  PolicyName: "P1",
  RemediationEnabled: false,
  ResourceType: "fmsResourceType",
  ResourceTags: [{ Key: "", Value: "" }],
  ExcludeResourceTags: false,
  SecurityServicePolicyData: {
    Type: "fmsType",
    ManagedServiceData: "PolicyData",
  },
  IncludeMap: {
    ORG_UNIT: [],
  },
};

const putPolicyResp = {
  Policy: {
    ...mockPolicy,
    PolicyUpdateToken: "updateToken-xxx",
    PolicyId: "policyId-xxx",
  },
};

// setting up mocks
jest.mock("@aws-sdk/client-route53resolver", () => {
  return {
    Route53ResolverClient: jest.fn(() => ({
      send: mockR53,
    })),
    // create APIs
    paginateListFirewallDomainLists: jest
      .fn()
      .mockImplementation(async function* () {
        yield {
          FirewallDomainLists: [
            {
              // id of domain list
              Id: "id01",
              // name of domain list
              Name: "AWSManagedDomainsMalwareDomainList",
            },
            {
              Id: "id02",
              Name: "AWSManagedDomainsBotnetCommandandControl",
            },
          ],
          NextToken: undefined,
        };
      }),
    CreateFirewallRuleGroupCommand: jest.fn(),
    CreateFirewallRuleCommand: jest.fn(),
    // delete APIs
    paginateListFirewallRuleGroups: jest
      .fn()
      .mockImplementation(async function* () {
        yield {
          FirewallRuleGroups: [
            {
              // id of domain list
              Id: "id01",
              // name of domain list
              Name: "DNS-Block-AWSManagedBadDomains-myPolicyId",
            },
          ],
          NextToken: undefined,
        };
      }),
    ListFirewallRulesCommand: jest.fn(),
    DeleteFirewallRuleCommand: jest.fn(),
    DeleteFirewallRuleGroupCommand: jest.fn(),
  };
});
jest.mock("@aws-sdk/client-ram", () => {
  return {
    RAMClient: jest.fn(() => ({
      send: mockRAM,
    })),
    ListResourcesCommand: jest.fn(),
    DeleteResourceShareCommand: jest.fn(),
    ResourceOwner: jest.fn(),
  };
});

FMSHelper.getDDBItem = mockGetDDBItem;
FMSHelper.putPolicy = mockPutPolicy;
FMSHelper.saveDDBItem = mockSaveDDBItem;
FMSHelper.deletePolicy = mockDeletePolicy;
jest.mock("../lib/waitForDNSFirewallRuleGroupNotShared");
const mockwaitUntilDNSFirewallRuleGroupNotShared =
  waitUntilDNSFirewallRuleGroupNotShared as jest.MockedFunction<
    typeof waitUntilDNSFirewallRuleGroupNotShared
  >;

const ph = new PolicyHandler(
  "My-DDB-Table",
  mockOUs,
  mockTag,
  JSON.stringify(manifest),
  "myPolicyId"
);

// test suites
describe("===Policy Handler Test Suite for **Default** policies", () => {
  describe("[createPolicy]", () => {
    test("[BDD] validate Default WAF Global policy type", async () => {
      try {
        const policy = await ph.createPolicy(
          POLICY_TYPE.WAF_GLOBAL,
          "myRegion"
        );
        expect(policy.IncludeMap?.ORG_UNIT).toEqual(mockOUs);
        expect(policy.ResourceTags).toEqual(mockTag.ResourceTags);
        expect(policy.ExcludeResourceTags).toEqual(mockTag.ExcludeResourceTags);
        expect(policy.ResourceType).toEqual("AWS::CloudFront::Distribution");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
    });
    test("[BDD] validate Default WAF Regional policy type", async () => {
      try {
        const policy = await ph.createPolicy(
          POLICY_TYPE.WAF_REGIONAL,
          "myRegion"
        );
        expect(policy.IncludeMap?.ORG_UNIT).toEqual(mockOUs);
        expect(policy.ResourceTags).toEqual(mockTag.ResourceTags);
        expect(policy.ExcludeResourceTags).toEqual(mockTag.ExcludeResourceTags);
        expect(policy.ResourceTypeList).toEqual([
          "AWS::ApiGateway::Stage",
          "AWS::ElasticLoadBalancingV2::LoadBalancer",
        ]);
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
    });
    test("[BDD] validate Default SG Usage Audit policy type", async () => {
      try {
        const policy = await ph.createPolicy(
          POLICY_TYPE.SG_USAGE_AUDIT,
          "myRegion"
        );
        expect(policy.IncludeMap?.ORG_UNIT).toEqual(mockOUs);
        expect(policy.ResourceTags).toEqual(mockTag.ResourceTags);
        expect(policy.ExcludeResourceTags).toEqual(mockTag.ExcludeResourceTags);
        expect(policy.ResourceType).toEqual("AWS::EC2::SecurityGroup");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
    });
    test("[BDD] validate Default SG Content Audit policy type", async () => {
      try {
        const policy = await ph.createPolicy(
          POLICY_TYPE.SG_CONTENT_AUDIT,
          "myRegion"
        );
        expect(policy.IncludeMap?.ORG_UNIT).toEqual(mockOUs);
        expect(policy.ResourceTags).toEqual(mockTag.ResourceTags);
        expect(policy.ExcludeResourceTags).toEqual(mockTag.ExcludeResourceTags);
        expect(policy.ResourceTypeList).toEqual([
          "AWS::EC2::Instance",
          "AWS::EC2::NetworkInterface",
          "AWS::EC2::SecurityGroup",
        ]);
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
    });
    test("[BDD] validate Default Shield Global policy type", async () => {
      try {
        const policy = await ph.createPolicy(
          POLICY_TYPE.SHIELD_GLOBAL,
          "myRegion"
        );
        expect(policy.IncludeMap?.ORG_UNIT).toEqual(mockOUs);
        expect(policy.ResourceTags).toEqual(mockTag.ResourceTags);
        expect(policy.ExcludeResourceTags).toEqual(mockTag.ExcludeResourceTags);
        expect(policy.ResourceType).toEqual("AWS::CloudFront::Distribution");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
    });
    test("[BDD] validate Default Shield Regional policy type", async () => {
      try {
        const policy = await ph.createPolicy(
          POLICY_TYPE.SHIELD_REGIONAL,
          "myRegion"
        );
        expect(policy.IncludeMap?.ORG_UNIT).toEqual(mockOUs);
        expect(policy.ResourceTags).toEqual(mockTag.ResourceTags);
        expect(policy.ExcludeResourceTags).toEqual(mockTag.ExcludeResourceTags);
        expect(policy.ResourceTypeList).toEqual([
          "AWS::ElasticLoadBalancingV2::LoadBalancer",
          "AWS::ElasticLoadBalancing::LoadBalancer",
          "AWS::EC2::EIP",
        ]);
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
    });
    test("[BDD] validate Default DNS Firewall policy type", async () => {
      mockR53.mockReset();
      mockR53.mockResolvedValue("default").mockResolvedValueOnce({
        FirewallRuleGroup: {
          // id of DNS firewall rule group
          Id: "my-rule-group-id",
        },
      });
      try {
        const policy = await ph.createPolicy(
          POLICY_TYPE.DNS_FIREWALL,
          "myRegion"
        );
        expect(policy.IncludeMap?.ORG_UNIT).toEqual(mockOUs);
        expect(policy.ResourceTags).toEqual(mockTag.ResourceTags);
        expect(policy.ExcludeResourceTags).toEqual(mockTag.ExcludeResourceTags);
        expect(policy.ResourceType).toEqual("AWS::EC2::VPC");
        const msd = JSON.parse(
          <string>policy.SecurityServicePolicyData?.ManagedServiceData
        );
        expect(msd.preProcessRuleGroups[0].ruleGroupId).toEqual(
          "my-rule-group-id"
        );
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
    });
  });

  describe("[savePolicy]", () => {
    beforeEach(() => {
      mockGetDDBItem.mockReset();
      mockPutPolicy.mockReset();
      mockSaveDDBItem.mockReset();
    });
    test("[TDD] successful put policy for update", async () => {
      mockGetDDBItem.mockResolvedValue(ddbItemResp);
      mockPutPolicy.mockResolvedValue(putPolicyResp);
      mockSaveDDBItem.mockResolvedValue("");
      try {
        const resp = await ph.savePolicy(mockPolicy, "");
        expect(resp).toEqual("Update");
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] successful put policy for create", async () => {
      mockGetDDBItem.mockRejectedValue({ message: "ResourceNotFound" });
      mockPutPolicy.mockResolvedValue(putPolicyResp);
      mockSaveDDBItem.mockResolvedValue("");
      try {
        const resp = await ph.savePolicy(mockPolicy, "");
        expect(resp).toEqual("Create");
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed put policy with get item failure", async () => {
      mockGetDDBItem.mockRejectedValue({ message: "error in getting item" });

      try {
        await ph.savePolicy(mockPolicy, "");
      } catch (e) {
        expect(e.message).toEqual("error in getting item");
      }
    });
  });

  describe("[deletePolicy]", () => {
    beforeEach(() => {
      mockDeletePolicy.mockReset();
    });
    test("[TDD] successful delete policy", async () => {
      mockDeletePolicy.mockResolvedValue("");
      await ph.deletePolicy(POLICY_TYPE.WAF_GLOBAL, "");
    });
    test("[TDD] failed delete policy", async () => {
      mockDeletePolicy.mockRejectedValue("error deleting policy");
      try {
        await ph.deletePolicy(POLICY_TYPE.WAF_GLOBAL, "");
      } catch (e) {
        expect(e).toEqual("error deleting policy");
      }
    });
    test("[BDD] successful delete DNS firewall policy", async () => {
      mockDeletePolicy.mockResolvedValue("");
      mockR53.mockResolvedValue("default").mockResolvedValueOnce({
        FirewallRules: [{ FirewallDomainListId: "DomainListId-01" }],
      });
      mockRAM.mockResolvedValue("default").mockResolvedValueOnce({
        resources: [
          { resourceArn: "resourceArn", resourceShareArn: "resourceShareArn" },
        ],
      });
      mockwaitUntilDNSFirewallRuleGroupNotShared.mockResolvedValue({
        state: WaiterState.SUCCESS,
        reason: "success",
      });
      try {
        await ph.deletePolicy(POLICY_TYPE.DNS_FIREWALL, "my-region");
      } catch (e) {
        console.log("negative test");
      }
    });
    test("[BDD] failed delete DNS firewall policy with DeleteFirewallRuleCommand error", async () => {
      mockDeletePolicy.mockResolvedValue("");
      mockR53
        .mockRejectedValue("error deleting firewall rule")
        .mockResolvedValueOnce({
          FirewallRules: [{ FirewallDomainListId: "DomainListId-01" }],
        });
      try {
        await ph.deletePolicy(POLICY_TYPE.DNS_FIREWALL, "my-region");
      } catch (e) {
        console.log("negative test");
      }
    });
    test("[BDD] failed delete DNS firewall policy with DeleteResourceShareCommand error", async () => {
      mockDeletePolicy.mockResolvedValue("");
      mockR53.mockResolvedValue("").mockResolvedValueOnce({
        FirewallRules: [{ FirewallDomainListId: "DomainListId-01" }],
      });
      mockRAM
        .mockRejectedValue("error deleting resource share")
        .mockResolvedValueOnce({
          resources: [
            {
              resourceArn: "resourceArn",
              resourceShareArn: "resourceShareArn",
            },
          ],
        });
      try {
        await ph.deletePolicy(POLICY_TYPE.DNS_FIREWALL, "my-region");
      } catch (e) {
        console.log("negative test");
      }
    });
    test("[BDD] failed delete DNS firewall policy with waiter timeout", async () => {
      mockDeletePolicy.mockResolvedValue("");
      mockR53.mockResolvedValue("default").mockResolvedValueOnce({
        FirewallRules: [{ FirewallDomainListId: "DomainListId-01" }],
      });
      mockRAM.mockResolvedValue("default").mockResolvedValueOnce({
        resources: [
          { resourceArn: "resourceArn", resourceShareArn: "resourceShareArn" },
        ],
      });
      mockwaitUntilDNSFirewallRuleGroupNotShared.mockRejectedValue({
        state: WaiterState.FAILURE,
        reason: "WaiterTimeout",
      });
      try {
        await ph.deletePolicy(POLICY_TYPE.DNS_FIREWALL, "my-region");
      } catch (e) {
        console.log("negative test");
      }
    });
    test("[BDD] failed delete DNS firewall policy with DeleteFirewallRuleGroupCommand error", async () => {
      mockDeletePolicy.mockResolvedValue("");
      mockR53
        .mockRejectedValue("error deleting dns rule group")
        .mockResolvedValueOnce({
          FirewallRules: [{ FirewallDomainListId: "DomainListId-01" }],
        })
        .mockResolvedValueOnce("");
      mockRAM.mockResolvedValue("default").mockResolvedValueOnce({
        resources: [
          { resourceArn: "resourceArn", resourceShareArn: "resourceShareArn" },
        ],
      });
      mockwaitUntilDNSFirewallRuleGroupNotShared.mockResolvedValue({
        state: WaiterState.SUCCESS,
        reason: "success",
      });
      try {
        await ph.deletePolicy(POLICY_TYPE.DNS_FIREWALL, "my-region");
      } catch (e) {
        console.log("negative test");
      }
    });
  });
});
