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
import { SecurityGroupManager } from "../lib/securitygroupManager";
import { FMSHelper } from "../lib/fmsHelper";
import { PolicyManager } from "../lib/policyManager";

const mockTags = {
  ResourceTags: [{ Key: "Environment", Value: "Dev" }],
  ExcludeResourceTags: false,
};
const mockOus = ["ou-xxxxx", "ou-yyyyy"];
const mockRegion = "region-a";
const mockRegionG = "Global";
const mockTable = "table-1";
type mockPolicy = "USAGE_AUDIT" | "CONTENT_AUDIT";

describe("==Security Group Policy Manager Tests==", () => {
  describe("[saveSecGrpPolicy]", () => {
    beforeEach(() => {
      jest.fn().mockReset()();
    });
    test("[TDD] successful save", async () => {
      PolicyManager.workflowProcessor = jest.fn().mockResolvedValue("");
      try {
        await SecurityGroupManager.saveSecGrpPolicy(
          mockOus,
          mockTags,
          mockRegion,
          mockTable,
          <mockPolicy>"CONTENT_AUDIT"
        );
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] successful save", async () => {
      PolicyManager.workflowProcessor = jest.fn().mockResolvedValue("");
      try {
        await SecurityGroupManager.saveSecGrpPolicy(
          mockOus,
          mockTags,
          mockRegionG,
          mockTable,
          <mockPolicy>"USAGE_AUDIT"
        );
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed save, invalid security group policy type", async () => {
      PolicyManager.workflowProcessor = jest.fn().mockRejectedValue("");

      try {
        await SecurityGroupManager.saveSecGrpPolicy(
          mockOus,
          mockTags,
          mockRegion,
          mockTable,
          ""
        );
      } catch (e) {
        expect(e.message).toEqual("Security Group Audit policy not found");
      }
    });
    test("[TDD] failed save", async () => {
      PolicyManager.workflowProcessor = jest
        .fn()
        .mockRejectedValue({ message: "error in running workflow processor" });

      try {
        await SecurityGroupManager.saveSecGrpPolicy(
          mockOus,
          mockTags,
          mockRegion,
          mockTable,
          <mockPolicy>"CONTENT_AUDIT"
        );
      } catch (e) {
        expect(e.message).toEqual("error in running workflow processor");
      }
    });
  });

  describe("[deleteWAFPolicy]", () => {
    beforeEach(() => {
      jest.fn().mockReset();
    });
    test("[TDD] successful deletion", async () => {
      FMSHelper.deletePolicy = jest.fn().mockResolvedValue("");
      try {
        await SecurityGroupManager.deleteSecGrpPolicy(
          mockTable,
          mockRegion,
          <mockPolicy>"CONTENT_AUDIT"
        );
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] successful deletion", async () => {
      FMSHelper.deletePolicy = jest.fn().mockResolvedValue("");
      try {
        await SecurityGroupManager.deleteSecGrpPolicy(
          mockTable,
          mockRegion,
          <mockPolicy>"USAGE_AUDIT"
        );
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed deletion", async () => {
      FMSHelper.deletePolicy = jest
        .fn()
        .mockRejectedValue({ message: "failed to delete policy" });
      try {
        await SecurityGroupManager.deleteSecGrpPolicy(
          mockTable,
          mockRegion,
          <mockPolicy>"CONTENT_AUDIT"
        );
      } catch (e) {
        expect(e.message).toEqual("failed to delete policy");
      }
    });
  });
});
