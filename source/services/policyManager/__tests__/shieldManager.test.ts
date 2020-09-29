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
import { ShieldManager } from "../lib/shieldManager";
import { FMSHelper } from "../lib/fmsHelper";
import { PolicyManager } from "../lib/policyManager";

const mockTags = {
  ResourceTags: [{ Key: "Environment", Value: "Dev" }],
  ExcludeResourceTags: false,
};
const mockOus = ["ou-xxxxx", "ou-yyyyy"];
const mockRegion = "region-a";
const mockTable = "table-1";

const mockShield = jest.fn();
jest.mock("aws-sdk", () => {
  return {
    Shield: jest.fn(() => ({
      getSubscriptionState: mockShield,
    })),
  };
});

describe("==Shield Policy Manager Tests==", () => {
  describe("[saveShieldPolicy]", () => {
    beforeEach(() => {
      mockShield.mockReset();
      jest.fn().mockReset();
    });
    test("[TDD] successful save", async () => {
      mockShield.mockImplementation(() => {
        return {
          promise() {
            return "";
          },
        };
      });
      PolicyManager.workflowProcessor = jest.fn().mockResolvedValue("");
      try {
        await ShieldManager.saveShieldPolicy(
          mockOus,
          mockTags,
          mockRegion,
          mockTable
        );
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] Shield subscription not active", async () => {
      mockShield.mockImplementation(() => {
        return {
          promise() {
            return { SubscriptionState: "INACTIVE" };
          },
        };
      });
      // PolicyManager.workflowProcessor = jest.fn().mockResolvedValue("");
      try {
        await ShieldManager.saveShieldPolicy(
          mockOus,
          mockTags,
          mockRegion,
          mockTable
        );
      } catch (e) {
        expect(e.message).toEqual("Shield Advanced subscription not active");
      }
    });
    test("[TDD] failed workflow processor call", async () => {
      mockShield.mockImplementation(() => {
        return {
          promise() {
            return { SubscriptionState: "ACTIVE" };
          },
        };
      });
      PolicyManager.workflowProcessor = jest
        .fn()
        .mockRejectedValue({ message: "error running workflow processor" });

      try {
        await ShieldManager.saveShieldPolicy(
          mockOus,
          mockTags,
          mockRegion,
          mockTable
        );
      } catch (e) {
        expect(e.message).toEqual("error running workflow processor");
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
        await ShieldManager.deleteShieldPolicy(mockTable, mockRegion);
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed deletion", async () => {
      FMSHelper.deletePolicy = jest
        .fn()
        .mockRejectedValue({ message: "failed to delete policy" });
      try {
        await ShieldManager.deleteShieldPolicy(mockTable, mockRegion);
      } catch (e) {
        expect(e.message).toEqual("failed to delete policy");
      }
    });
  });
});
