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
