// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

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
