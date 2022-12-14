// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

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
