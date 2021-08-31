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
  test("[BDD] invalid ou list", async () => {
    try {
      await ov.isValid(ou_not_valid);
    } catch (e) {
      expect(e.message).toEqual("no ous found");
    }
  });

  test("[BDD] ou list is valid", async () => {
    const resp = await ov.isValid(ou_valid);
    expect(resp).toEqual(true);
  });

  test("[BDD] ou list is not valid", async () => {
    const resp = await ov.isValid([...ou_valid, ...ou_not_valid]);
    expect(resp).toEqual(false);
  });

  test("[BDD] ou is set to delete", () => {
    const resp = ov.isDelete(ou_delete);
    expect(resp).toEqual(true);
  });

  test("[BDD] ou is not set to delete", () => {
    const resp = ov.isDelete(ou_valid);
    expect(resp).toEqual(false);
  });
});
