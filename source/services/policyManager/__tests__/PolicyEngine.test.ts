/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import "jest";
import { IValidatorObject } from "../lib/exports";
import { FMSHelper } from "../lib/PolicyHelper";
import { PolicyEngine } from "../lib/PolicyEngine";

// test object
const mockRegions = ["region-1"];
const mockOUs = [""];
const mockTags = {
  ResourceTags: [{ Key: "myKey", Value: "myValue" }],
  ExcludeResourceTags: false,
};
const mockEC2Regions = ["region-1", "region-2"];
const mockValidatorObj: IValidatorObject = {
  regionDelete: false,
  regionValid: false,
  ouDelete: false,
  ouValid: false,
  tagDelete: false,
  tagValid: false,
};

// creating mocks
const mockCreatePolicy = jest.fn();
const mockSavePolicy = jest.fn();
const mockDeletePolicy = jest.fn();
const mockGetRegions = jest.fn();
const mockS3 = jest.fn();

jest.mock("../lib/PolicyHandler", () => {
  return {
    PolicyHandler: jest.fn(() => ({
      createPolicy: mockCreatePolicy,
      savePolicy: mockSavePolicy,
      deletePolicy: mockDeletePolicy,
    })),
  };
});
jest.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: jest.fn(() => ({
      send: mockS3,
    })),
    GetObjectCommand: jest.fn(),
  };
});

FMSHelper.getRegions = mockGetRegions;

describe("===Policy Engine Test Suite===", () => {
  describe("OU parameter change trigger", () => {
    beforeEach(() => {
      mockCreatePolicy.mockReset();
      mockSavePolicy.mockReset();
      mockDeletePolicy.mockReset();
    });
    test("[BDD] OU set to delete", async () => {
      mockValidatorObj.ouDelete = true;
      mockDeletePolicy
        .mockResolvedValue("default")
        .mockRejectedValueOnce("POLICY_DELETE_ERROR");

      const engine = new PolicyEngine(
        mockValidatorObj,
        mockRegions,
        mockOUs,
        mockTags,
        "my-ddb-table",
        "myManifest",
        "defaultPolicy"
      );
      try {
        await engine.triggerHandler("OU");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
      expect(mockDeletePolicy).toHaveReturnedTimes(mockRegions.length * 5 + 2); // 5 regional polices in each region + 2 global policies
    });
    test("[BDD] valid OU and Region set to delete", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = false;
      mockValidatorObj.regionDelete = true;
      mockCreatePolicy.mockResolvedValue("default");
      mockSavePolicy.mockResolvedValue("default");
      const engine = new PolicyEngine(
        mockValidatorObj,
        mockRegions,
        mockOUs,
        mockTags,
        "my-ddb-table",
        "myManifest",
        "defaultPolicy"
      );
      try {
        await engine.triggerHandler("OU");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
      expect(mockCreatePolicy).toHaveReturnedTimes(2); // 2 global policies
      expect(mockSavePolicy).toHaveReturnedTimes(2); // 2 global policies
    });
    test("[BDD] valid OU and Region", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = true;
      mockValidatorObj.regionDelete = false;
      mockCreatePolicy
        .mockResolvedValue("default")
        .mockRejectedValueOnce("POLICY_CREATE_ERROR");
      mockSavePolicy
        .mockResolvedValue("default")
        .mockRejectedValueOnce("POLICY_SAVE_ERROR");
      const engine = new PolicyEngine(
        mockValidatorObj,
        mockRegions,
        mockOUs,
        mockTags,
        "my-ddb-table",
        "myManifest",
        "defaultPolicy"
      );
      try {
        await engine.triggerHandler("OU");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
      expect(mockCreatePolicy).toHaveReturnedTimes(mockRegions.length * 5 + 2); // 5 regional polices in each region + 2 global policies
      expect(mockSavePolicy).toHaveReturnedTimes(
        mockRegions.length * 5 + 2 - 1
      ); // 5 regional polices in each region + 2 global policies - 1 for create error
    });
  });

  describe("Region parameter change trigger", () => {
    beforeEach(() => {
      mockCreatePolicy.mockReset();
      mockSavePolicy.mockReset();
      mockDeletePolicy.mockReset();
      mockGetRegions.mockReset();
    });
    test("[BDD] OU set to delete", async () => {
      mockValidatorObj.ouDelete = true;
      mockCreatePolicy.mockResolvedValue("");
      mockSavePolicy.mockResolvedValue("");
      const engine = new PolicyEngine(
        mockValidatorObj,
        mockRegions,
        mockOUs,
        mockTags,
        "my-ddb-table",
        "myManifest",
        "defaultPolicy"
      );
      try {
        await engine.triggerHandler("Region");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
      expect(mockCreatePolicy).toHaveBeenCalledTimes(0);
      expect(mockSavePolicy).toHaveBeenCalledTimes(0);
      expect(mockDeletePolicy).toHaveBeenCalledTimes(0);
    });
    test("[BDD] valid OU and Region set to delete", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = false;
      mockValidatorObj.regionDelete = true;
      mockDeletePolicy.mockResolvedValue("");
      mockGetRegions.mockResolvedValue(mockEC2Regions);
      const engine = new PolicyEngine(
        mockValidatorObj,
        mockRegions,
        mockOUs,
        mockTags,
        "my-ddb-table",
        "myManifest",
        "defaultPolicy"
      );
      try {
        await engine.triggerHandler("Region");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
      expect(mockDeletePolicy).toHaveBeenCalledTimes(mockEC2Regions.length * 5); //  5 regional policies in each region
    });
    test("[BDD] valid OU and Region", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = true;
      mockValidatorObj.regionDelete = false;
      mockCreatePolicy.mockResolvedValue("");
      mockSavePolicy.mockResolvedValue("");
      mockDeletePolicy.mockResolvedValue("");
      mockGetRegions.mockResolvedValue(mockEC2Regions);
      const engine = new PolicyEngine(
        mockValidatorObj,
        mockRegions,
        mockOUs,
        mockTags,
        "my-ddb-table",
        "myManifest",
        "defaultPolicy"
      );
      try {
        await engine.triggerHandler("Region");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
      const _r = mockEC2Regions.filter(
        (region) => !mockRegions.includes(region)
      );
      expect(mockDeletePolicy).toHaveBeenCalledTimes(_r.length * 5);
      expect(mockCreatePolicy).toHaveBeenCalledTimes(mockRegions.length * 5); // 5 regional policies in each region
      expect(mockSavePolicy).toHaveBeenCalledTimes(mockRegions.length * 5);
    });
  });

  describe("Tag parameter change trigger", () => {
    beforeEach(() => {
      mockCreatePolicy.mockReset();
      mockSavePolicy.mockReset();
      mockDeletePolicy.mockReset();
    });
    test("[BDD] OU set to delete", async () => {
      mockValidatorObj.ouDelete = true;
      mockCreatePolicy.mockResolvedValue("");
      mockSavePolicy.mockResolvedValue("");
      const engine = new PolicyEngine(
        mockValidatorObj,
        mockRegions,
        mockOUs,
        mockTags,
        "my-ddb-table",
        "myManifest",
        "defaultPolicy"
      );
      try {
        await engine.triggerHandler("Tag");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
      expect(mockCreatePolicy).toHaveBeenCalledTimes(0);
      expect(mockSavePolicy).toHaveBeenCalledTimes(0);
    });
    test("[BDD] valid OU and Region set to delete", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = false;
      mockValidatorObj.regionDelete = true;
      mockCreatePolicy.mockResolvedValue("");
      mockSavePolicy.mockResolvedValue("");
      const engine = new PolicyEngine(
        mockValidatorObj,
        mockRegions,
        mockOUs,
        mockTags,
        "my-ddb-table",
        "myManifest",
        "defaultPolicy"
      );
      try {
        await engine.triggerHandler("Tag");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
      expect(mockCreatePolicy).toHaveBeenCalledTimes(2); // 2 global policies
      expect(mockSavePolicy).toHaveBeenCalledTimes(2);
    });
    test("[BDD] valid OU and Region", async () => {
      mockValidatorObj.ouDelete = false;
      mockValidatorObj.ouValid = true;
      mockValidatorObj.regionValid = true;
      mockValidatorObj.regionDelete = false;
      mockCreatePolicy.mockResolvedValue("");
      mockSavePolicy.mockResolvedValue("");
      const engine = new PolicyEngine(
        mockValidatorObj,
        mockRegions,
        mockOUs,
        mockTags,
        "my-ddb-table",
        "myManifest",
        "defaultPolicy"
      );
      try {
        await engine.triggerHandler("Tag");
      } catch (e) {
        console.log(`negative test: ${e}`);
      }
      expect(mockCreatePolicy).toHaveBeenCalledTimes(
        mockRegions.length * 5 + 2
      ); // 5 regional policies in each region + 2 global policies
      expect(mockSavePolicy).toHaveBeenCalledTimes(mockRegions.length * 5 + 2);
    });
  });

  describe("get policy manifest tests", () => {
    test("[TDD] failure with API error", async () => {
      mockS3.mockRejectedValue("error getting manifest");
      process.env.POLICY_MANIFEST = "mi-bucket|mi-manifest";
      try {
        await PolicyEngine.getManifest();
      } catch (e) {
        expect(e.message).toEqual("error getting policy manifest");
      }
    });
  });
});
