/**
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { PolicyManager } from "../lib/policyManager";
import { FMSHelper } from "../lib/fmsHelper";

const mockInvalidOus = ["ou-xxxxx", "ou-yyyyy"];
const mockValidOus = ["ou-xxxx-xxxxxx99"];
const mockRegions = ["region-a", "region-b"];
const mockTags = {
  ResourceTags: [
    {
      Key: "Environment",
      Value: "Dev",
    },
    { Key: "Application", Value: "App-01" },
  ],
  ExcludeResourceTags: false,
};

const mockPolicy = {
  PolicyName: "P1",
  RemediationEnabled: false,
  ResourceType: "fmsResourceTyp",
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

describe("==Policy Manager Tests==", () => {
  describe("[isOUValid]", () => {
    beforeEach(() => {
      jest.fn().mockReset();
    });
    test("invalid ou", async () => {
      expect(await PolicyManager.isOUValid(mockInvalidOus)).toEqual(false);
    });
    test("valid ou", async () => {
      expect(await PolicyManager.isOUValid(mockValidOus)).toEqual(true);
    });
  });

  describe("[isOUDelete]", () => {
    beforeEach(() => {
      jest.fn().mockReset();
    });
    test("delete false", async () => {
      expect(await PolicyManager.isOUValid(mockRegions)).toEqual(false);
    });
    test("delete true", async () => {
      expect(await PolicyManager.isOUDelete(["DeLeTE"])).toEqual(true);
    });
  });

  describe("[isRegionValid]", () => {
    beforeEach(() => {
      jest.fn().mockReset();
    });
    test("invalid region", async () => {
      FMSHelper.getRegions = jest.fn().mockResolvedValue(mockRegions);
      expect(
        await PolicyManager.isRegionValid(["region-a", "region-c"])
      ).toEqual(false);
    });
    test("valid region", async () => {
      FMSHelper.getRegions = jest.fn().mockResolvedValue(mockRegions);
      expect(
        await PolicyManager.isRegionValid(["region-a", "region-b"])
      ).toEqual(true);
    });
    test("failed get region call", async () => {
      FMSHelper.getRegions = jest
        .fn()
        .mockRejectedValue({ message: "failed to fetch ec2 regions" });
      try {
        await PolicyManager.isRegionValid(["region-a", "region-b"]);
      } catch (e) {
        expect(e.message).toEqual("failed to fetch ec2 regions");
      }
    });
    test("invalid response from get region call", async () => {
      FMSHelper.getRegions = jest.fn().mockResolvedValue("region-a");
      try {
        await PolicyManager.isRegionValid(["region-a", "region-b"]);
      } catch (e) {
        expect(e.message).toEqual("no regions found");
      }
    });
  });

  describe("[isRegionDelete]", () => {
    beforeEach(() => {
      jest.fn().mockReset();
    });
    test("delete false", async () => {
      expect(await PolicyManager.isRegionDelete(mockRegions)).toEqual(false);
    });
    test("delete true", async () => {
      expect(await PolicyManager.isRegionDelete(["delete"])).toEqual(true);
    });
  });

  describe("[isTagValid]", () => {
    beforeEach(() => {
      jest.fn().mockReset();
    });
    test("invalid tag", async () => {
      expect(
        await PolicyManager.isTagValid(
          JSON.stringify({
            ResouceTags: [
              { Key: "Environment", Value: "Test" },
              { Key: "Application" },
            ],
            ExcludeResourceTags: true,
          })
        )
      ).toEqual(false);
    });
    test("valid tag", async () => {
      expect(await PolicyManager.isTagValid(JSON.stringify(mockTags))).toEqual(
        true
      );
    });
  });

  describe("[workflowProcessor]", () => {
    beforeEach(() => {
      jest.fn().mockReset();
    });
    test("successfull call", async () => {
      FMSHelper.getDDBItem = jest.fn().mockResolvedValue("");
      FMSHelper.putPolicy = jest.fn().mockResolvedValue({
        Policy: {
          PolicyUpdateToken: "updateToken",
          PolicyId: "policyId",
        },
      });
      FMSHelper.updateDDBItem = jest.fn().mockResolvedValue("");
      try {
        await PolicyManager.workflowProcessor("", "", mockPolicy);
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("failed call, with get ddb item failure", async () => {
      FMSHelper.getDDBItem = jest
        .fn()
        .mockRejectedValue({ message: "error in fetching ddb item" });

      try {
        await PolicyManager.workflowProcessor("", "", mockPolicy);
      } catch (e) {
        expect(e.message).toEqual("error in fetching ddb item");
      }
    });
    test("failed call, with update ddb item failure", async () => {
      FMSHelper.getDDBItem = jest.fn().mockResolvedValue("");
      FMSHelper.putPolicy = jest.fn().mockResolvedValue({
        Policy: {
          PolicyUpdateToken: "updateToken",
          PolicyId: "policyId",
        },
      });
      FMSHelper.updateDDBItem = jest
        .fn()
        .mockRejectedValue({ message: "error updating ddb item" });
      try {
        await PolicyManager.workflowProcessor("", "", mockPolicy);
      } catch (e) {
        expect(e.message).toEqual("error updating ddb item");
      }
    });
    test("failed call, with put policy failure", async () => {
      FMSHelper.getDDBItem = jest
        .fn()
        .mockRejectedValue({ message: "error in putting fms policy" });

      try {
        await PolicyManager.workflowProcessor("", "", mockPolicy);
      } catch (e) {
        expect(e.message).toEqual("error in putting fms policy");
      }
    });
    test("failed call, with put policy invalid response", async () => {
      FMSHelper.getDDBItem = jest.fn().mockResolvedValue("");
      FMSHelper.putPolicy = jest.fn().mockResolvedValue("");
      FMSHelper.updateDDBItem = jest.fn().mockResolvedValue("");
      try {
        await PolicyManager.workflowProcessor("", "", mockPolicy);
      } catch (e) {
        expect(e.message).toEqual("error creating policy");
      }
    });
  });
});
