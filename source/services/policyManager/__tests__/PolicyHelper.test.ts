// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { PolicyHelper } from "../lib/policyHelper";
import { PARTITION, POLICY_TYPE } from "../lib/exports";
import manifest from "./policy_manifest.test.json";
import { waitUntilDNSFirewallRuleGroupNotShared } from "../lib/waitForDNSFirewallRuleGroupNotShared";
import "jest";
import { WaiterState } from "@smithy/util-waiter";
import { Policy, SecurityServiceType } from "@aws-sdk/client-fms";

// test object
const mockTag = {
  ResourceTags: [{ Key: "myKey", Value: "myValue" }],
  ExcludeResourceTags: false,
};

const mockOUs = ["ou-xxxx-a00000aa", "ou-yyyy-b00000aa"];
const ddbItemResp = {
  PolicyId: { S: "policyId-xxx" },
};

const mockPolicy: Policy = {
  PolicyName: "P1",
  RemediationEnabled: false,
  ResourceType: "fmsResourceType",
  ResourceTags: [{ Key: "", Value: "" }],
  ExcludeResourceTags: false,
  SecurityServicePolicyData: {
    Type: SecurityServiceType.DNS_FIREWALL,
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

const getPolicyResp = {
  Policy: {
    ...mockPolicy,
    PolicyUpdateToken: "updateToken-xxx",
    PolicyId: "policyId-xxx",
  },
};

const mockSaveDDBItem = jest.fn();
const mockGetDDBItem = jest.fn();
const mockDeleteDDBItem = jest.fn();

const mockGetPolicy = jest.fn();
const mockPutPolicy = jest.fn();
const mockDeletePolicy = jest.fn();

const mockListFirewallRuleGroups = jest.fn();
const mockListFirewallDomainLists = jest.fn();
const mockDeleteFirewallRuleGroup = jest.fn();
const mockDeleteirewallRulesForRuleGroup = jest.fn();
const mockCreateFirewallRuleGroup = jest.fn();
const mockCreateFirewallRule = jest.fn();

const mockDeleteResourcesForRuleGroup = jest.fn();

jest.mock("../lib/clientHelpers", () => {
  return {
    DynamoDBHelper: function () {
      return {
        getDDBItem: mockGetDDBItem,
        saveDDBItem: mockSaveDDBItem,
        deleteDDBItem: mockDeleteDDBItem,
      };
    },
    FMSHelper: function () {
      return {
        getPolicy: mockGetPolicy,
        putPolicy: mockPutPolicy,
        deletePolicy: mockDeletePolicy,
      };
    },
    Route53Helper: function () {
      return {
        listFirewallRuleGroups: mockListFirewallRuleGroups,
        listFirewallDomainLists: mockListFirewallDomainLists,
        deleteFirewallRuleGroup: mockDeleteFirewallRuleGroup,
        deleteFirewallRulesForRuleGroup: mockDeleteirewallRulesForRuleGroup,
        createFirewallRuleGroup: mockCreateFirewallRuleGroup,
        createFirewallRule: mockCreateFirewallRule,
      };
    },
    RAMHelper: function () {
      return {
        deleteResourcesForRuleGroup: mockDeleteResourcesForRuleGroup,
      };
    },
  };
});

jest.mock("../lib/waitForDNSFirewallRuleGroupNotShared");
const mockwaitUntilDNSFirewallRuleGroupNotShared =
  waitUntilDNSFirewallRuleGroupNotShared as jest.MockedFunction<
    typeof waitUntilDNSFirewallRuleGroupNotShared
  >;

const mockPolicyHelperProps = {
  ddbTable: "My-DDB-Table",
  ous: mockOUs,
  tags: mockTag,
  manifest: JSON.stringify(manifest),
  policyIdentifier: "myPolicyId",
  partition: PARTITION.AWS,
};

let policyHelper: PolicyHelper;

// test suites
describe("===Policy Helper Test Suite for **Default** policies", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    mockGetDDBItem.mockResolvedValue(ddbItemResp);
    mockPutPolicy.mockResolvedValue(putPolicyResp);
    mockGetPolicy.mockResolvedValue(getPolicyResp);

    mockListFirewallDomainLists.mockResolvedValue([
      {
        Id: "my-domain-list-id",
        Name: "my-domain-list-name",
      },
    ]);

    mockCreateFirewallRuleGroup.mockResolvedValue({
      FirewallRuleGroup: {
        Id: "my-rule-group-id",
      },
    });

    policyHelper = new PolicyHelper(mockPolicyHelperProps);
  });

  describe("[buildPolicy]", () => {
    it("should validate Default WAF Global policy type", async () => {
      const policy = await policyHelper.buildPolicy(
        POLICY_TYPE.WAF_GLOBAL,
        "myRegion"
      );
      expect(policy.IncludeMap?.ORG_UNIT).toEqual(mockOUs);
      expect(policy.ResourceTags).toEqual(mockTag.ResourceTags);
      expect(policy.ExcludeResourceTags).toEqual(mockTag.ExcludeResourceTags);
      expect(policy.ResourceType).toEqual("AWS::CloudFront::Distribution");
    });

    it("should throw an exception if it fails to retrieve policy manifest rule", async () => {
      const handler = new PolicyHelper({
        ...mockPolicyHelperProps,
        manifest: JSON.stringify({ default: {} }),
      });

      await expect(
        handler.buildPolicy(POLICY_TYPE.WAF_GLOBAL, "myRegion")
      ).rejects.toThrow(/policy does not exist/);
    });

    it("should validate Default WAF Regional policy type", async () => {
      const policy = await policyHelper.buildPolicy(
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
    });

    it("should validate Default SG Usage Audit policy type", async () => {
      const policy = await policyHelper.buildPolicy(
        POLICY_TYPE.SG_USAGE_AUDIT,
        "myRegion"
      );
      expect(policy.IncludeMap?.ORG_UNIT).toEqual(mockOUs);
      expect(policy.ResourceTags).toEqual(mockTag.ResourceTags);
      expect(policy.ExcludeResourceTags).toEqual(mockTag.ExcludeResourceTags);
      expect(policy.ResourceType).toEqual("AWS::EC2::SecurityGroup");
    });

    it("should validate Default SG Content Audit policy type", async () => {
      const policy = await policyHelper.buildPolicy(
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
    });

    it("should validate Default Shield Global policy type", async () => {
      const policy = await policyHelper.buildPolicy(
        POLICY_TYPE.SHIELD_GLOBAL,
        "myRegion"
      );
      expect(policy.IncludeMap?.ORG_UNIT).toEqual(mockOUs);
      expect(policy.ResourceTags).toEqual(mockTag.ResourceTags);
      expect(policy.ExcludeResourceTags).toEqual(mockTag.ExcludeResourceTags);
      expect(policy.ResourceType).toEqual("AWS::CloudFront::Distribution");
    });

    it("should validate Default Shield Regional policy type", async () => {
      const policy = await policyHelper.buildPolicy(
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
    });

    it("should validate Default DNS Firewall policy type", async () => {
      const policy = await policyHelper.buildPolicy(
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
    });

    it("should still create the policy on route53 client error", async () => {
      mockListFirewallDomainLists.mockRejectedValueOnce({
        $metadata: { requestId: "id" },
      });

      const result = await policyHelper.buildPolicy(
        POLICY_TYPE.DNS_FIREWALL,
        "myRegion"
      );

      expect(result).toStrictEqual({
        ExcludeResourceTags: false,
        IncludeMap: { ORG_UNIT: ["ou-xxxx-a00000aa", "ou-yyyy-b00000aa"] },
        PolicyName: "FMS-DNS-01-myPolicyId",
        RemediationEnabled: false,
        ResourceTags: [{ Key: "myKey", Value: "myValue" }],
        ResourceType: "AWS::EC2::VPC",
        SecurityServicePolicyData: {
          ManagedServiceData:
            '{"type":"DNS_FIREWALL","preProcessRuleGroups":[{"ruleGroupId":"%%AWS_MANAGED%%","priority":1}],"postProcessRuleGroups":[]}',
          Type: "DNS_FIREWALL",
        },
      });
    });
  });

  describe("[saveOrUpdatePolicy]", () => {
    it("should successfully put policy for update", async () => {
      const resp = await policyHelper.saveOrUpdatePolicy(mockPolicy, "");

      expect(resp).toEqual("Update");
    });

    it("should successfully put policy for create", async () => {
      mockGetDDBItem.mockRejectedValue({ message: "ResourceNotFound" });

      const resp = await policyHelper.saveOrUpdatePolicy(mockPolicy, "");
      expect(resp).toEqual("Create");
    });

    it("should throw an exception if putPolicy returns an empty response", async () => {
      mockPutPolicy.mockResolvedValue({ Policy: undefined });

      await expect(
        policyHelper.saveOrUpdatePolicy(mockPolicy, "")
      ).rejects.toThrow();
    });

    it("should throw an exception if putPolicy returns an empty PolicyId", async () => {
      mockPutPolicy.mockResolvedValue({ Policy: { PolicyId: "" } });

      await expect(
        policyHelper.saveOrUpdatePolicy(mockPolicy, "")
      ).rejects.toThrow();
    });

    it("should throw an exception if DynamoDB failed to get the policy item", async () => {
      mockGetDDBItem.mockRejectedValue({ message: "error in getting item" });

      await expect(
        policyHelper.saveOrUpdatePolicy(mockPolicy, "")
      ).rejects.toThrow(/error in getting item/);
    });
  });

  describe("[deletePolicy]", () => {
    beforeEach(() => {
      mockDeletePolicy.mockReset();
    });

    it("should successfully delete a policy", async () => {
      mockDeletePolicy.mockResolvedValue("");

      const testCase = async () => {
        policyHelper.deletePolicy(POLICY_TYPE.WAF_GLOBAL, "");
      };

      await expect(testCase).not.toThrow();
    });

    it("should throw an exception if it failed to delete a policy", async () => {
      mockDeletePolicy.mockRejectedValue(new Error("error deleting policy"));

      await expect(
        policyHelper.deletePolicy(POLICY_TYPE.WAF_GLOBAL, "")
      ).rejects.toThrow(/error deleting policy/);
    });

    it("should successfully delete DNS firewall policies", async () => {
      mockDeletePolicy.mockResolvedValue("");
      mockListFirewallRuleGroups
        .mockResolvedValue("default")
        .mockResolvedValueOnce({
          FirewallRules: [{ FirewallDomainListId: "DomainListId-01" }],
        });

      mockwaitUntilDNSFirewallRuleGroupNotShared.mockResolvedValue({
        state: WaiterState.SUCCESS,
        reason: "success",
      });

      const testCase = async () => {
        policyHelper.deletePolicy(POLICY_TYPE.DNS_FIREWALL, "my-region");
      };

      await expect(testCase).not.toThrow();
    });

    it("should fail to delete DNS firewall policy with DeleteFirewallRuleCommand error", async () => {
      mockDeletePolicy.mockResolvedValue("");
      mockListFirewallRuleGroups
        .mockRejectedValue("error deleting firewall rule")
        .mockResolvedValueOnce({
          FirewallRules: [{ FirewallDomainListId: "DomainListId-01" }],
        });

      const testCase = async () => {
        policyHelper.deletePolicy(POLICY_TYPE.DNS_FIREWALL, "my-region");
      };

      await expect(testCase).not.toThrow();
    });

    it("should fail to delete DNS firewall policy on DeleteFirewallRuleCommand error with requestId", async () => {
      mockDeletePolicy.mockResolvedValue("");
      mockListFirewallRuleGroups
        .mockRejectedValue({ $metadata: { requestId: "id" } })
        .mockResolvedValueOnce({
          FirewallRules: [{ FirewallDomainListId: "DomainListId-01" }],
        });

      const testCase = async () => {
        policyHelper.deletePolicy(POLICY_TYPE.DNS_FIREWALL, "my-region");
      };

      await expect(testCase).not.toThrow();
    });

    it("should silently fail to delete DNS firewall policy with DeleteResourceShareCommand error", async () => {
      mockDeletePolicy.mockResolvedValue("");
      mockListFirewallRuleGroups.mockResolvedValue("").mockResolvedValueOnce({
        FirewallRules: [{ FirewallDomainListId: "DomainListId-01" }],
      });

      const testCase = async () => {
        policyHelper.deletePolicy(POLICY_TYPE.DNS_FIREWALL, "my-region");
      };

      await expect(testCase).not.toThrow();
    });

    it("should silently fail to delete DNS firewall policy with waiter timeout", async () => {
      mockDeletePolicy.mockResolvedValue("");
      mockListFirewallRuleGroups
        .mockResolvedValue("default")
        .mockResolvedValueOnce({
          FirewallRules: [{ FirewallDomainListId: "DomainListId-01" }],
        });
      mockwaitUntilDNSFirewallRuleGroupNotShared.mockRejectedValue({
        state: WaiterState.FAILURE,
        reason: "WaiterTimeout",
      });

      const testCase = async () => {
        policyHelper.deletePolicy(POLICY_TYPE.DNS_FIREWALL, "my-region");
      };

      await expect(testCase).not.toThrow();
    });

    it("should silently fail to delete DNS firewall policy with DeleteFirewallRuleGroupCommand error", async () => {
      mockDeletePolicy.mockResolvedValue("");
      mockListFirewallRuleGroups
        .mockRejectedValue("error deleting dns rule group")
        .mockResolvedValueOnce({
          FirewallRules: [{ FirewallDomainListId: "DomainListId-01" }],
        })
        .mockResolvedValueOnce("");
      mockwaitUntilDNSFirewallRuleGroupNotShared.mockResolvedValue({
        state: WaiterState.SUCCESS,
        reason: "success",
      });

      const testCase = async () => {
        policyHelper.deletePolicy(POLICY_TYPE.DNS_FIREWALL, "my-region");
      };

      await expect(testCase).not.toThrow();
    });
  });
});
