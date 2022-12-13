// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { ComplianceViolator, FMSClient } from "@aws-sdk/client-fms";
import { mockClient } from "aws-sdk-client-mock";
import { ComplianceGenerator } from "../lib/ComplianceGenerator";
import { EC2Client, DescribeRegionsCommand } from "@aws-sdk/client-ec2";
import { handler } from "../../complianceGenerator";
import { S3Client } from "@aws-sdk/client-s3";
import { Metrics } from "../lib/common/metrics";

const firewallManagerClientMock = mockClient(FMSClient);
const mockEC2 = mockClient(EC2Client);
const mockS3 = mockClient(S3Client);

const mockRegions = {
  Regions: [
    {
      Endpoint: "ec2.region-apne3.amazonaws.com",
      RegionName: "ap-northeast-3",
    },
    {
      Endpoint: "ec2.region-b.amazonaws.com",
      RegionName: "region-b",
    },
  ],
};
const mockFilteredRegions = {
  Regions: [
    {
      Endpoint: "ec2.region-b.amazonaws.com",
      RegionName: "region-b",
    },
  ],
};
const mockRegionsArr = mockFilteredRegions.Regions.map((region) => {
  return region.RegionName;
});

describe("ComplianceGenerator", function () {
  beforeEach(() => {
    firewallManagerClientMock.onAnyCommand().resolves({});
  });
  describe("getMemberAccounts", function () {
    it("succeedes getting empty member accounts", async () => {
      const _cg: ComplianceGenerator = new ComplianceGenerator(
        "policyId",
        "region",
        "bucket"
      );
      const data = await _cg.getMemberAccounts();
      expect(data).toEqual([]);
    });
  });

  describe("getComplianceDetails", function () {
    it("succeedes getting empty compliance details", async () => {
      const _cg: ComplianceGenerator = new ComplianceGenerator(
        "policyId",
        "region",
        "bucket"
      );
      const data = await _cg.getComplianceDetails(["memberAccountA"]);
      expect(data).toEqual({
        accountCompliance_records: [],
        resourceViolator_records: [],
      });
    });
    it("succeeds in getting compliance details", async () => {
      firewallManagerClientMock
        .onAnyCommand()
        .resolves({ PolicyComplianceDetail: { Violators: [] } });
      const _cg: ComplianceGenerator = new ComplianceGenerator(
        "policyId",
        "region",
        "bucket"
      );
      const data = await _cg.getComplianceDetails(["memberAccountA"]);
      expect(data).toStrictEqual({
        accountCompliance_records: [
          { compliance_status: undefined, member_account: "memberAccountA" },
        ],
        resourceViolator_records: [],
      });
    });
    it("succeeds in getting compliance violator details", async () => {
      const violator: ComplianceViolator = {
        ResourceId: "rid",
        ResourceType: "rt",
        ViolationReason: "vr",
      };
      firewallManagerClientMock
        .onAnyCommand()
        .resolves({ PolicyComplianceDetail: { Violators: [violator] } });
      const _cg: ComplianceGenerator = new ComplianceGenerator(
        "policyId",
        "region",
        "bucket"
      );
      const data = await _cg.getComplianceDetails(["memberAccountA"]);
      expect(data).toStrictEqual({
        accountCompliance_records: [
          {
            compliance_status: "NOT_COMPLIANT",
            member_account: "memberAccountA",
          },
        ],
        resourceViolator_records: [
          {
            member_account: "memberAccountA",
            resource_id: "rid",
            resource_type: "rt",
            violation_reason: "vr",
          },
        ],
      });
    });
  });

  describe("[getRegions]", () => {
    test("[BDD] successful api call", async () => {
      mockEC2.on(DescribeRegionsCommand).resolves(mockRegions);
      try {
        const data = await ComplianceGenerator.getRegions();
        expect(data).toEqual(expect.arrayContaining(mockRegionsArr));
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      mockEC2
        .on(DescribeRegionsCommand)
        .rejects(new Error("error fetching regions"));
      try {
        await ComplianceGenerator.getRegions();
      } catch (e) {
        expect(e.message).toEqual("error fetching regions");
      }
    });
  });

  describe("[listPolicies]", () => {
    test("[BDD] successful api call", async () => {
      firewallManagerClientMock.onAnyCommand().resolves({});
      const data = await ComplianceGenerator.listPolicies("region");
      expect(data).toEqual([]);
    });
  });

  describe("metrics index", () => {
    test("[BDD] successful send anonymous metric", async () => {
      mockS3.onAnyCommand().resolves({});
      const resp = await Metrics.sendAnonymousMetric("queueUrl", {
        Solution: "",
        UUID: "",
        TimeStamp: "",
        Data: {},
      });
      expect(resp).toBe(undefined);
    });
  });

  describe("index", () => {
    test("[BDD] cron event triggers fails on empty compliance generator return", async () => {
      mockEC2.on(DescribeRegionsCommand).resolves(mockRegions);
      const data = await handler({ source: "aws.events" });
      expect(data).toBe(undefined);
    });
  });
});
