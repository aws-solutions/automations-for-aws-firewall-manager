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

import { RegionValidator } from "./RegionValidator";
import { TagValidator } from "./TagValidator";
import { OUValidator } from "./OUValidator";
import { IValidator, PARAMETER } from "./exports";

/**
 * @description validator class to instantiate needed validator object
 * @pattern facade pattern
 * @implements {IValidator}
 */

export class Validator implements IValidator {
  readonly validator!: RegionValidator | OUValidator | TagValidator;
  /**
   * @description constructor to instantiate needed validator object
   * @param {PARAMETER} parameter
   */
  constructor(param: PARAMETER) {
    if (param === PARAMETER.REGION) this.validator = new RegionValidator();
    if (param === PARAMETER.OU) this.validator = new OUValidator();
    if (param === PARAMETER.TAG) this.validator = new TagValidator();
  }

  /**
   * @description check if parameter value set to delete
   * @param {string | string[]} param region list or ou list or tag value
   * @returns
   */
  isDelete = (param: string | string[]): boolean => {
    if (
      this.validator instanceof RegionValidator ||
      this.validator instanceof OUValidator
    )
      return this.validator.isDelete(<string[]>param);
    else if (this.validator instanceof TagValidator)
      return this.validator.isDelete(<string>param);
    else return false;
  };

  /**
   * @description check if parameter value is valid
   * @param {string | string[]} param region list or ou list or tag value
   * @returns
   */
  isValid = async (param: string | string[]): Promise<boolean> => {
    if (
      this.validator instanceof RegionValidator ||
      this.validator instanceof OUValidator
    )
      return this.validator.isValid(<string[]>param);
    else if (this.validator instanceof TagValidator)
      return this.validator.isValid(<string>param);
    else return false;
  };
}
