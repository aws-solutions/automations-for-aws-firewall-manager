// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { EVENT_SOURCE, PARTITION, ValidationResults } from "../lib/exports";
import { PolicyManager } from "../lib/policyManager";

// test object
const mockRegions = ["region-1"];
const mockOUs = [""];
const mockTags = {
  ResourceTags: [{ Key: "myKey", Value: "myValue" }],
  ExcludeResourceTags: false,
};
const mockEC2Regions = ["region-1", "region-2"];
const mockValidatorObj: ValidationResults = {
  regionDelete: false,
  regionValid: false,
  ouDelete: false,
  ouValid: false,
  tagDelete: false,
  tagValid: false,
};

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

const mockBuildPolicy = jest.fn();
const mockSaveOrUpdatePolicy = jest.fn();
const mockDeletePolicy = jest.fn();

const globalPolicyCount = 2;
const regionalPolicyCount = 5;
const regionalGovCloudPolicyCount = 4;

jest.mock("../lib/policyHelper", () => {
  return {
    PolicyHelper: function () {
      return {
        buildPolicy: mockBuildPolicy,
        saveOrUpdatePolicy: mockSaveOrUpdatePolicy,
        deletePolicy: mockDeletePolicy,
      };
    },
  };
});

const mockGetRegions = jest.fn();
const mockPublishMessage = jest.fn();
jest.mock("../lib/clientHelpers", () => {
  return {
    EC2Helper: function () {
      return {
        getRegions: mockGetRegions,
      };
    },
    SNSHelper: function () {
      return {
        publishMessage: mockPublishMessage,
      };
    },
  };
});

describe("===Policy Mananger Test Suite===", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    process.env.SEND_METRIC = "Yes";
    process.env.UUID = "uuid";

    mockGetRegions.mockResolvedValue(mockEC2Regions);
    mockBuildPolicy.mockResolvedValue("default");
    mockSaveOrUpdatePolicy.mockResolvedValue("default");
    mockDeletePolicy.mockResolvedValue("default");
  });

  describe("OU parameter change event", () => {
    it("should delete all policies when ou set to delete", async () => {
      mockValidatorObj.ouDelete = true;

      mockDeletePolicy.mockRejectedValueOnce("POLICY_DELETE_ERROR");

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.OU);

      const expectedPolicyCount =
        mockRegions.length * regionalPolicyCount + globalPolicyCount;

      expect(mockDeletePolicy).toHaveReturnedTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount - 1 // subtract 1 for policy delete error
      );
    });

    it("should only delete policies that are valid for gov cloud", async () => {
      mockValidatorObj.ouDelete = true;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS_US_GOV,
      });

      await engine.handleEvent(EVENT_SOURCE.OU);

      const expectedPolicyCount =
        mockRegions.length * regionalGovCloudPolicyCount;

      expect(mockDeletePolicy).toHaveReturnedTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });

    it("should only delete policies that are valid for china regions", async () => {
      mockValidatorObj.ouDelete = true;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS_CN,
      });

      await engine.handleEvent(EVENT_SOURCE.OU);

      const expectedPolicyCount =
        mockRegions.length * regionalGovCloudPolicyCount;

      expect(mockDeletePolicy).toHaveReturnedTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });

    it("should save only global policies with valid OU and Region set to delete", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = false;
      mockValidatorObj.regionDelete = true;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.OU);

      const expectedPolicyCount = globalPolicyCount;

      expect(mockBuildPolicy).toHaveReturnedTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveReturnedTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });

    it("should save global and regional policies with valid OU and Region", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = true;
      mockValidatorObj.regionDelete = false;

      mockBuildPolicy.mockRejectedValueOnce("POLICY_CREATE_ERROR");
      mockSaveOrUpdatePolicy.mockRejectedValueOnce("POLICY_SAVE_ERROR");

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.OU);

      const expectedPolicyCount =
        mockRegions.length * regionalPolicyCount + globalPolicyCount;

      expect(mockBuildPolicy).toHaveReturnedTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveReturnedTimes(
        expectedPolicyCount - 1
      ); // subtract 1 for create error
      expect(mockPublishMessage).toHaveBeenCalled();
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount - 2 // subtract 2, for create and save errors
      );
    });

    it("should only save policies that are valid for gov cloud regions", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = true;
      mockValidatorObj.regionDelete = false;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS_US_GOV,
      });

      await engine.handleEvent(EVENT_SOURCE.OU);

      const expectedPolicyCount =
        mockRegions.length * regionalGovCloudPolicyCount;

      expect(mockBuildPolicy).toHaveReturnedTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveReturnedTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });

    it("should only save policies that are valid for china regions", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = true;
      mockValidatorObj.regionDelete = false;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS_CN,
      });

      await engine.handleEvent(EVENT_SOURCE.OU);

      const expectedPolicyCount =
        mockRegions.length * regionalGovCloudPolicyCount;

      expect(mockBuildPolicy).toHaveReturnedTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveReturnedTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });
  });

  describe("Region parameter change event", () => {
    it("should not save any policies when OU set to delete", async () => {
      mockValidatorObj.ouDelete = true;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.REGION);

      const expectedPolicyCount = 0;

      expect(mockBuildPolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockDeletePolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });

    it("should delete regional policies with valid OU and Region set to delete", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = false;
      mockValidatorObj.regionDelete = true;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.REGION);

      const expectedPolicyCount = mockEC2Regions.length * regionalPolicyCount;

      expect(mockDeletePolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });

    it("should delete unincluded regional policies and save included regional policies if valid OU and Region", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = true;
      mockValidatorObj.regionDelete = false;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.REGION);

      const regionsToDelete = mockEC2Regions.filter(
        (region) => !mockRegions.includes(region)
      );

      const expectedDeletedPolicyCount =
        regionsToDelete.length * regionalPolicyCount;
      const expectedPolicyCount = mockRegions.length * regionalPolicyCount;

      expect(mockDeletePolicy).toHaveBeenCalledTimes(
        expectedDeletedPolicyCount
      );
      expect(mockBuildPolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedDeletedPolicyCount + expectedPolicyCount
      );
    });
  });

  describe("Tag parameter change event", () => {
    it("should not save any policies if OU set to delete", async () => {
      mockValidatorObj.ouDelete = true;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.TAG);

      const expectedPolicyCount = 0;

      expect(mockBuildPolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });

    it("should save global policies if valid OU and Region set to delete", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = false;
      mockValidatorObj.regionDelete = true;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.TAG);

      const expectedPolicyCount = globalPolicyCount;

      expect(mockBuildPolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });

    it("should save all global and regional policies if valid OU and Region", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = true;
      mockValidatorObj.regionDelete = false;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.TAG);

      const expectedPolicyCount =
        mockRegions.length * regionalPolicyCount + globalPolicyCount;

      expect(mockBuildPolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });
  });

  describe("S3 parameter change event", () => {
    it("should do nothing if all parameters are false", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = false;
      mockValidatorObj.regionValid = false;
      mockValidatorObj.regionDelete = false;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.S3);

      const expectedPolicyCount = 0;

      expect(mockBuildPolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });

    it("should do nothing if ou is set to delete", async () => {
      mockValidatorObj.ouDelete = true;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.S3);

      const expectedPolicyCount = 0;

      expect(mockBuildPolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });

    it("should only create the global policies if ou is valid and region is delete", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = false;
      mockValidatorObj.regionDelete = true;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.S3);

      const expectedPolicyCount = globalPolicyCount;

      expect(mockBuildPolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });

    it("should create all policies if ou and region are valid", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = true;
      mockValidatorObj.regionDelete = false;

      const engine = new PolicyManager({
        validatorObj: mockValidatorObj,
        regions: mockRegions,
        ous: mockOUs,
        tags: mockTags,
        ddbTable: "my-ddb-table",
        manifest: "myManifest",
        policyIdentifier: "defaultPolicy",
        policyTopicArn: "topicArn",
        partition: PARTITION.AWS,
      });

      await engine.handleEvent(EVENT_SOURCE.S3);

      // 5 regional policies in each region + 2 global policies
      const expectedPolicyCount =
        mockRegions.length * regionalPolicyCount + globalPolicyCount;

      expect(mockBuildPolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSaveOrUpdatePolicy).toHaveBeenCalledTimes(expectedPolicyCount);
      expect(mockSendAnonymizedMetric).toHaveBeenCalledTimes(
        expectedPolicyCount
      );
    });
  });
});
