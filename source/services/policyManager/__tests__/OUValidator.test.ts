// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { OUValidator } from "../lib/OUValidator";

/**
 * mock setup
 */
const ou_delete = ["delete"];
const ou_valid = ["ou-xxxx-a00000aa", "ou-yyyy-b00000aa"];
const ou_not_valid = ["my-new-ou"];
const ov = new OUValidator();

/**
 * Test suite for OU Validator class
 */
describe("===OUValidator===", () => {
  test("invalid ou list", async () => {
    const resp = await ov.isValid(ou_not_valid);

    expect(resp).toBeFalsy();
  });

  test("ou list is valid", async () => {
    const resp = await ov.isValid(ou_valid);
    expect(resp).toEqual(true);
  });

  test("ou list is not valid", async () => {
    const resp = await ov.isValid([...ou_valid, ...ou_not_valid]);
    expect(resp).toEqual(false);
  });

  test("ou is set to delete", () => {
    const resp = ov.isDelete(ou_delete);
    expect(resp).toEqual(true);
  });

  test("ou is not set to delete", () => {
    const resp = ov.isDelete(ou_valid);
    expect(resp).toEqual(false);
  });
});
