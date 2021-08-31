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
import { TagValidator } from "../lib/TagValidator";

/**
 * mock setup
 */
const tag_delete = "delete";
const tag_valid = JSON.stringify({
  ResourceTags: [{ Key: "my_key", Value: "my_value" }],
  ExcludeResourceTags: false,
});
const tag_not_valid_1 = JSON.stringify({
  ResourceTags: { Key: "my_key", Value: "my_value" },
  ExcludeResourceTags: false,
});
const tag_not_valid_2 = JSON.stringify({
  ResourceTags: [{ Key: "my_key", Value: "my_value" }],
});
const tag_not_valid_3 = JSON.stringify({
  ResourceTags: [{ Key: "my_key", Value: "my_value", RandomKey: "random_key" }],
  ExcludeResourceTags: false,
});
const tv = new TagValidator();

/**
 * Test suite for Tag Validator class
 */
describe("===TagValidator===", () => {
  test("[BDD] invalid tag, resource tag not an array", async () => {
    const resp = await tv.isValid(tag_not_valid_1);
    expect(resp).toEqual(false);
  });

  test("[BDD] invalid tag, resource tag missing ExcludeResourceTags property", async () => {
    const resp = await tv.isValid(tag_not_valid_2);
    expect(resp).toEqual(false);
  });

  test("[BDD] invalid tag, resource tag with invalid property", async () => {
    const resp = await tv.isValid(tag_not_valid_3);
    expect(resp).toEqual(false);
  });

  test("[BDD] tag is valid", async () => {
    const resp = await tv.isValid(tag_valid);
    expect(resp).toEqual(true);
  });

  test("[BDD] tag is set to delete", () => {
    const resp = tv.isDelete(tag_delete);
    expect(resp).toEqual(true);
  });

  test("[BDD] tag is not set to delete", () => {
    const resp = tv.isDelete(tag_valid);
    expect(resp).toEqual(false);
  });
});
