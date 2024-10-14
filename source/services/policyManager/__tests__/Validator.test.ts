// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";

import { Validator } from "../lib/Validator";
import { PARAMETER } from "../lib/exports";
import { OUValidator } from "../lib/OUValidator";
import { RegionValidator } from "../lib/RegionValidator";
import { TagValidator } from "../lib/TagValidator";

// creating mocks
const mockOUs = ["ou-1111-22222222", "ou-3333-44444444"];
const mockInvalidOUs = ["my-ou-1"];
const mockRegions = ["my-region-1", "my-region-2"];
const mockInvalidRegions = ["my-region-2", "my-invalid-region"];
const mockValidTag = {
  ResourceTags: [{ Key: "myKey", Value: "myValue" }],
  ExcludeResourceTags: false,
};
const mockInvalidTag = {
  ResourceTags: [{}],
  ExcludeResourceTags: false,
};

const mockGetRegions = jest.fn();

jest.mock("../lib/clientHelpers", () => {
  return {
    EC2Helper: function () {
      return {
        getRegions: mockGetRegions,
      };
    },
  };
});

// test suites
describe("===Validator===", () => {
  beforeAll(() => {
    mockGetRegions
      .mockResolvedValue(["my-region-1", "my-region-2"])
      .mockResolvedValueOnce("");
  });

  describe("check with ou parameter", () => {
    const validator = new Validator(PARAMETER.OU);
    test("validate created object is OUValidator", async () => {
      expect(validator.validator instanceof OUValidator).toEqual(true);
    });

    test("check for ou set to delete", async () => {
      expect(validator.isDelete(["delete"])).toEqual(true);
    });

    test("check for valid ou", async () => {
      expect(await validator.isValid(mockOUs)).toEqual(true);
    });

    test("check for invalid ou", async () => {
      expect(await validator.isValid(mockInvalidOUs)).toEqual(false);
    });
  });

  describe("check with region parameter", () => {
    const validator = new Validator(PARAMETER.REGION);
    test("validate created object is RegionValidator", async () => {
      expect(validator.validator instanceof RegionValidator).toEqual(true);
    });

    test("check for region set to delete", async () => {
      expect(validator.isDelete(["delete"])).toEqual(true);
    });

    test("failed get region call", async () => {
      await expect(validator.isValid("")).rejects.toThrow(/no regions found/);
    });

    test("check for valid region", async () => {
      expect(await validator.isValid(mockRegions)).toEqual(true);
    });

    test("check for invalid region", async () => {
      expect(await validator.isValid(mockInvalidRegions)).toEqual(false);
    });
  });

  describe("check with tag parameter", () => {
    const validator = new Validator(PARAMETER.TAG);
    test("validate created object is TagValidator", () => {
      expect(validator.validator instanceof TagValidator).toEqual(true);
    });

    test("check for tag set to delete", async () => {
      expect(validator.isDelete("delete")).toEqual(true);
    });

    test("check for valid tag", async () => {
      expect(await validator.isValid(JSON.stringify(mockValidTag))).toEqual(
        true
      );
    });

    test("check for invalid tag", async () => {
      expect(await validator.isValid(JSON.stringify(mockInvalidTag))).toEqual(
        false
      );
    });
  });
});
