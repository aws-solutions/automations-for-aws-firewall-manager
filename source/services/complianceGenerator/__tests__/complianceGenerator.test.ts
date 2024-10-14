// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import {
  ComplianceViolator,
  FMSClient,
  ViolationReason,
} from "@aws-sdk/client-fms";
import { mockClient } from "aws-sdk-client-mock";
import { ComplianceGenerator } from "../lib/ComplianceGenerator";
import { DescribeRegionsCommand, EC2Client } from "@aws-sdk/client-ec2";
import { handler } from "../index";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import * as csvWriter from "csv-writer";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const firewallManagerClientMock = mockClient(FMSClient);
const mockEC2 = mockClient(EC2Client);
const mockS3 = mockClient(S3Client);
const mockSNS = mockClient(SNSClient);

const mockSendAnonymizedMetric = jest.fn();
jest.mock("solutions-utils", () => {
  return {
    __esModule: true,
    ...jest.requireActual("solutions-utils"),
    sendAnonymizedMetric: function () {
      mockSendAnonymizedMetric();
    },
  };
});

const dummyContext = {
  callbackWaitsForEmptyEventLoop: true,
  functionVersion: "$LATEST",
  functionName: "foo-bar-function",
  memoryLimitInMB: "128",
  logGroupName: "/aws/lambda/foo-bar-function-123456abcdef",
  logStreamName: "2021/03/09/[$LATEST]abcdef123456abcdef123456abcdef123456",
  invokedFunctionArn:
    "arn:aws:lambda:eu-west-1:123456789012:function:foo-bar-function",
  awsRequestId: "c6af9ac6-7b61-11e6-9a41-93e812345678",
};

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
        ViolationReason: ViolationReason.ResourceMissingSecurityGroup,
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
            violation_reason: "RESOURCE_MISSING_SECURITY_GROUP",
          },
        ],
      });
    });

    it("succeeds in getting compliance violator details with empty IssueInfoMap", async () => {
      firewallManagerClientMock.onAnyCommand().resolves({
        PolicyComplianceDetail: { Violators: undefined, IssueInfoMap: {} },
      });
      const _cg: ComplianceGenerator = new ComplianceGenerator(
        "policyId",
        "region",
        "bucket"
      );
      const data = await _cg.getComplianceDetails(["memberAccountA"]);
      expect(data).toStrictEqual({
        accountCompliance_records: [
          {
            compliance_status: "COMPLIANT",
            member_account: "memberAccountA",
          },
        ],
        resourceViolator_records: [],
      });
    });

    it("succeeds in getting compliance violator details with nonempty IssueInfoMap", async () => {
      firewallManagerClientMock.onAnyCommand().resolves({
        PolicyComplianceDetail: {
          Violators: undefined,
          IssueInfoMap: { AWSCONFIG: "val" },
        },
      });
      const _cg: ComplianceGenerator = new ComplianceGenerator(
        "policyId",
        "region",
        "bucket"
      );
      const data = await _cg.getComplianceDetails(["memberAccountA"]);
      expect(data).toStrictEqual({
        accountCompliance_records: [
          {
            compliance_status: '{"AWSCONFIG":"val"}',
            member_account: "memberAccountA",
          },
        ],
        resourceViolator_records: [],
      });
    });

    it("fails in getting compliance violator details with FMS client error", async () => {
      firewallManagerClientMock.onAnyCommand().rejects(new Error("error"));
      const _cg: ComplianceGenerator = new ComplianceGenerator(
        "policyId",
        "region",
        "bucket"
      );
      let response;

      expect(
        async () =>
          (response = await _cg.getComplianceDetails(["memberAccountA"]))
      ).not.toThrow();

      expect(response).toStrictEqual(undefined);
    });

    it("fails in getting compliance violator details with FMS client error with client requestId", async () => {
      firewallManagerClientMock
        .onAnyCommand()
        .rejects({ $metadata: { requestId: "id" } });
      const _cg: ComplianceGenerator = new ComplianceGenerator(
        "policyId",
        "region",
        "bucket"
      );
      let response;

      expect(
        async () =>
          (response = await _cg.getComplianceDetails(["memberAccountA"]))
      ).not.toThrow();

      expect(response).toStrictEqual(undefined);
    });
  });

  describe("[getRegions]", () => {
    test("[BDD] successful api call", async () => {
      mockEC2.on(DescribeRegionsCommand).resolves(mockRegions);
      const data = await ComplianceGenerator.getRegions();
      expect(data).toEqual(expect.arrayContaining(mockRegionsArr));
    });

    it("fails on empty describe regions api call", async () => {
      mockEC2.on(DescribeRegionsCommand).resolves({});
      await expect(ComplianceGenerator.getRegions()).rejects.toThrow(
        "error fetching regions"
      );
    });

    it("fails to get regions on EC2 client error", async () => {
      mockEC2.on(DescribeRegionsCommand).rejects(new Error("error"));

      await expect(ComplianceGenerator.getRegions()).rejects.toThrow(
        /error fetching regions/
      );
    });

    it("fails to get regions on EC2 client error with requestId", async () => {
      mockEC2
        .on(DescribeRegionsCommand)
        .rejects({ $metadata: { requestId: "id" } });

      await expect(ComplianceGenerator.getRegions()).rejects.toThrow(
        /error fetching regions/
      );
    });
  });

  describe("[listPolicies]", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("[BDD] successful api call", async () => {
      firewallManagerClientMock.onAnyCommand().resolves({});
      const data = await ComplianceGenerator.listPolicies("region");
      expect(data).toEqual([]);
    });

    it("fails with FMS client error with client $metadata", async () => {
      firewallManagerClientMock
        .onAnyCommand()
        .rejects({ $metadata: { requestId: "id" } });
      let response;

      expect(
        async () =>
          (response = await ComplianceGenerator.listPolicies("region"))
      ).not.toThrow();
      expect(response).toEqual(undefined);
    });
  });

  describe("index", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("[BDD] cron event triggers fails on empty compliance generator return", async () => {
      mockEC2.on(DescribeRegionsCommand).resolves(mockRegions);
      const data = await handler({ source: "aws.events" }, dummyContext);
      expect(data).toBe(undefined);
    });

    it("fails on listpolicies error for cron event trigger", async () => {
      mockEC2.on(DescribeRegionsCommand).resolves(mockRegions);
      firewallManagerClientMock.onAnyCommand().rejects(new Error("error"));
      const data = await handler({ source: "aws.events" }, dummyContext);
      expect(data).toBe(undefined);
    });

    it("fails on FMS client error for cron events", async () => {
      firewallManagerClientMock
        .onAnyCommand()
        .rejects({ $metadata: { requestId: "id" } });
      expect(
        async () => await handler({ source: "aws.events" }, dummyContext)
      ).not.toThrow();
    });

    it("fails to handle SNS event trigger with FMS client error", async () => {
      firewallManagerClientMock.onAnyCommand().rejects(new Error("error"));
      const data = await handler(
        {
          source: "aws.sns",
          Records: [
            {
              EventSource: "aws:sns",
              Sns: {
                Message: JSON.stringify({ region: "region", policyId: "id" }),
              },
            },
          ],
        },
        dummyContext
      );
      expect(data).toBe(undefined);
    });

    it("fails to handle SNS trigger with FMS client error with client requestId", async () => {
      firewallManagerClientMock
        .onAnyCommand()
        .rejects({ $metadata: { requestId: "id" } });
      const data = await handler(
        {
          source: "aws.sns",
          Records: [
            {
              EventSource: "aws:sns",
              Sns: {
                Message: JSON.stringify({ region: "region", policyId: "id" }),
              },
            },
          ],
        },
        dummyContext
      );
      expect(data).toBe(undefined);
    });

    it("fails on empty member accounts for SNS event trigger", async () => {
      firewallManagerClientMock.onAnyCommand().resolves({});
      const data = await handler(
        {
          source: "aws.sns",
          Records: [
            {
              EventSource: "aws:sns",
              Sns: {
                Message: JSON.stringify({ region: "region", policyId: "id" }),
              },
            },
          ],
        },
        dummyContext
      );
      expect(data).toBe(undefined);
    });

    it("handles unknown event", async () => {
      firewallManagerClientMock.onAnyCommand().resolves({});
      const data = await handler(
        {
          source: "unknown",
        },
        dummyContext
      );
      expect(data).toBe(undefined);
    });
  });

  describe("generateComplianceReports", () => {
    const account_compliance_records = [
      { member_account: "123", compliance_status: "COMPLIANT" },
    ];
    const resource_violator_records = [
      {
        member_account: "456",
        resource_id: "resource1",
        resource_type: "type1",
        violation_reason: "reason1",
      },
    ];

    const complianceGenerator = new ComplianceGenerator(
      "policyId",
      "region",
      "bucket"
    );

    jest.mock("csv-writer");

    beforeEach(() => {
      jest.spyOn(csvWriter, "createObjectCsvWriter");

      mockS3.reset();

      jest.clearAllMocks();
    });

    it("should handle errors from S3 client without client requestId", async () => {
      mockS3.on(PutObjectCommand).rejectsOnce(new Error("error"));

      await complianceGenerator.generateComplianceReports(
        account_compliance_records,
        resource_violator_records
      );

      expect(csvWriter.createObjectCsvWriter).toHaveBeenCalledTimes(2);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(0);
    });

    it("should handle errors from S3 client with client requestId", async () => {
      mockS3
        .on(PutObjectCommand)
        .rejectsOnce({ $metadata: { requestId: "id" } });

      await complianceGenerator.generateComplianceReports(
        account_compliance_records,
        resource_violator_records
      );

      expect(csvWriter.createObjectCsvWriter).toHaveBeenCalledTimes(2);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(0);
    });

    it("should generate compliance reports and upload them to S3", async () => {
      mockS3.on(PutObjectCommand).resolves({});

      await complianceGenerator.generateComplianceReports(
        account_compliance_records,
        resource_violator_records
      );

      expect(csvWriter.createObjectCsvWriter).toHaveBeenCalledTimes(2);
      expect(csvWriter.createObjectCsvWriter).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining("account_compliance"),
          header: expect.arrayContaining([
            { id: "member_account", title: "MEMBER_ACCOUNT" },
            { id: "compliance_status", title: "COMPLIANCE_STATUS" },
          ]),
        })
      );
      expect(csvWriter.createObjectCsvWriter).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining("resource_violator"),
          header: expect.arrayContaining([
            { id: "member_account", title: "MEMBER_ACCOUNT" },
            { id: "resource_id", title: "RESOURCE_ID" },
            { id: "resource_type", title: "RESOURCE_TYPE" },
            { id: "violation_reason", title: "VIOLATION_REASON" },
          ]),
        })
      );

      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(1);
    });
  });

  describe("sendSNS", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should publish message to topic", async () => {
      const message = {
        region: "region",
        policyId: "id",
      };
      mockSNS.on(PublishCommand).resolvesOnce({});

      await ComplianceGenerator.sendSNS("region", message, "topicARN");

      expect(mockSNS.call(0).firstArg).toBeInstanceOf(PublishCommand);
    });

    it("should handle SNS client error", async () => {
      const message = {
        region: "region",
        policyId: "id",
      };
      mockSNS.on(PublishCommand).rejectsOnce(new Error("error"));

      expect(
        async () =>
          await ComplianceGenerator.sendSNS("region", message, "topicARN")
      ).not.toThrow();
    });

    it("should handle SNS client error with client $metadata", async () => {
      const message = {
        region: "region",
        policyId: "id",
      };
      mockSNS.on(PublishCommand).rejects({ $metadata: { requestId: "id" } });

      expect(
        async () =>
          await ComplianceGenerator.sendSNS("region", message, "topicARN")
      ).not.toThrow();
    });
  });
});
