// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { logger } from "solutions-utils";
import { IValidator } from "./exports";

/**
 * @description class with methods for ou parameter check
 */
export class OUValidator implements IValidator {
  /**
   * @description check if ou value set to delete
   * @param {string[]} ous
   * @returns
   */
  isDelete(ous: string[]): boolean {
    const isDelete = ous.length === 1 && ous[0].toLowerCase() === "delete";

    logger.debug("checked if ou parameter is delete", {
      ouIsDelete: isDelete,
      ous: ous,
    });
    return isDelete;
  }

  /**
   * @description check if ou value is valid
   * @param {string[]} ous
   * @returns
   */
  async isValid(ous: string[]): Promise<boolean> {
    const regex = "^ou-([0-9a-z]{4,32})-([0-9a-z]{8,32})$";
    let isValid: boolean;

    try {
      await Promise.all(
        ous.map((ou) => {
          if (!ou.match(regex)) throw new Error("invalid OU Id provided");
        })
      );
      isValid = true;
    } catch (e) {
      logger.warn("encountered error validating OU parameter", {
        error: e,
        ous: ous,
      });
      isValid = false;
    }

    logger.debug("validated ou parameter", {
      ouIsValid: isValid,
      ous: ous,
    });
    return isValid;
  }
}
