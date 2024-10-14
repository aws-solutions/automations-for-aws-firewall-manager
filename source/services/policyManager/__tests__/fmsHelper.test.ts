// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import { FMSHelper } from "../lib/clientHelpers";
import {
  DeletePolicyCommand,
  FMSClient,
  FMSServiceException,
  GetPolicyCommand,
  ListPoliciesCommand,
  Policy,
  PolicySummary,
  PutPolicyCommand,
} from "@aws-sdk/client-fms";

describe("FMS Helper", () => {
  const mockFMSClient = mockClient(FMSClient);
  let fmsHelper: FMSHelper;

  const mockPolicy: Policy = {
    PolicyName: "P1",
    RemediationEnabled: false,
    ResourceType: "fmsResourceType",
    ResourceTags: [{ Key: "", Value: "" }],
    ExcludeResourceTags: false,
    SecurityServicePolicyData: {
      Type: "DNS_FIREWALL",
      ManagedServiceData: "PolicyData",
    },
    IncludeMap: {
      ORG_UNIT: [],
    },
  };

  const mockPolicySummary: PolicySummary = {
    PolicyName: "P1",
    PolicyId: "policyId1",
    ResourceType: "fmsResourceType",
  };

  const mockPolicySummary2: PolicySummary = {
    PolicyName: "P2",
    PolicyId: "policyId2",
    ResourceType: "fmsResourceType",
  };

  const mockPolicySummaries = [mockPolicySummary, mockPolicySummary2];

  const region = "mockRegion";
  const mockArn = "mockArn";
  const mockPolicyId = "mockPolicyId";

  const mockPolicyResponse = {
    PolicyUpdateToken: "token",
    Policy: mockPolicy,
    PolicyArn: mockArn,
  };

  const mockEmptyPolicyResonse = {};

  beforeEach(() => {
    mockFMSClient.reset();
    fmsHelper = new FMSHelper({});

    mockFMSClient.on(GetPolicyCommand).resolves(mockPolicyResponse);
    mockFMSClient.on(PutPolicyCommand).resolves(mockPolicyResponse);
    mockFMSClient
      .on(ListPoliciesCommand)
      .resolves({ PolicyList: mockPolicySummaries });
  });

  describe("PutPolicy", () => {
    it("should successfully put a valid policy", async () => {
      const response = await fmsHelper.putPolicy(mockPolicy, region);

      expect(mockFMSClient).toHaveReceivedCommandTimes(PutPolicyCommand, 1);
      expect(response).toBe(mockPolicyResponse);
    });

    it("should throw an exception if PutPolicyCommand fails", async () => {
      mockFMSClient.rejectsOnce(
        new FMSServiceException({
          name: "FMSServiceException",
          $fault: "server",
          $metadata: {},
        })
      );

      const testCase = async () => {
        await fmsHelper.putPolicy(mockPolicy, region);
      };

      await expect(testCase).rejects.toThrow(/failed to save policy/);
    });
  });

  describe("DeletePolicy", () => {
    it("should successfully delete a valid policy", async () => {
      const testCase = async () => {
        await fmsHelper.deletePolicy(mockPolicyId, region);
      };

      await expect(testCase).not.toThrow();

      expect(mockFMSClient).toHaveReceivedCommandTimes(DeletePolicyCommand, 1);
    });

    it("should throw an exception if PutPolicyCommand fails", async () => {
      mockFMSClient.rejectsOnce(
        new FMSServiceException({
          name: "FMSServiceException",
          $fault: "server",
          $metadata: {},
        })
      );

      const testCase = async () => {
        await fmsHelper.deletePolicy(mockPolicyId, region);
      };

      expect(mockFMSClient).toHaveReceivedCommandTimes(DeletePolicyCommand, 0);
      await expect(testCase).rejects.toThrow(/error deleting policy/);
    });
  });

  describe("GetPolicy", () => {
    it("should get a policy by policyId", async () => {
      const result = await fmsHelper.getPolicy(mockPolicyId, region);

      expect(result).toEqual(mockPolicy);
    });

    it("should throw an exception if GetPolicyCommand fails", async () => {
      mockFMSClient.on(GetPolicyCommand).rejectsOnce(
        new FMSServiceException({
          name: "FMSServiceException",
          $fault: "server",
          $metadata: {},
        })
      );

      const testCase = async () => {
        await fmsHelper.getPolicy(mockPolicyId, region);
      };

      await expect(testCase).rejects.toThrow(/error getting policy/);
    });

    it("should throw an exception if it returns no policy", async () => {
      mockFMSClient.on(GetPolicyCommand).resolves(mockEmptyPolicyResonse);
      const testCase = async () => {
        await fmsHelper.getPolicy(mockPolicyId, region);
      };

      await expect(testCase).rejects.toThrow(/error getting policy/);
    });
  });
});
