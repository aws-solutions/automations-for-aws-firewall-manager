// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";

import { RegionValidator } from "../lib/RegionValidator";
import { FMSHelper } from "../lib/PolicyHelper";

/**
 * mock setup
 */
const mockEC2regions = jest.fn();
const region_is_delete = ["delete"];
const region_is_valid = ["us-east-1", "us-east-2"];
const ec2_regions = region_is_valid;
const region_not_valid = ["my-new-region"];

FMSHelper.getRegions = mockEC2regions;
const rv = new RegionValidator();

/**
 * Test suite for Region Validator class
 */
describe("===RegionValidator===", () => {
  beforeEach(() => {
    mockEC2regions.mockReset();
  });

  test("[TDD] invalid ec2 region list", async () => {
    mockEC2regions.mockReturnValue(Promise.resolve(""));
    try {
      await rv.isValid(region_is_valid);
    } catch (e) {
      expect(e.message).toEqual("no regions found");
    }
  });

  test("[BDD] region list is valid", async () => {
    mockEC2regions.mockReturnValue(Promise.resolve(ec2_regions));
    const resp = await rv.isValid(region_is_valid);
    expect(resp).toEqual(true);
  });

  test("[BDD] region list is not valid", async () => {
    mockEC2regions.mockReturnValue(Promise.resolve(ec2_regions));
    const resp = await rv.isValid([...region_is_valid, ...region_not_valid]);
    expect(resp).toEqual(false);
  });

  test("[BDD] region is set to delete", () => {
    const resp = new RegionValidator().isDelete(region_is_delete);
    expect(resp).toEqual(true);
  });

  test("[BDD] region is not set to delete", () => {
    const resp = new RegionValidator().isDelete(region_is_valid);
    expect(resp).toEqual(false);
  });
});
