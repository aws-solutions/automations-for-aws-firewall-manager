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

import { logger } from "./common/logger";
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
    logger.debug({
      label: "OUValidator/isOUDelete",
      message: `checking if OU is set to delete`,
    });
    if (ous.length === 1 && ous[0].toLowerCase() === "delete") {
      logger.debug({
        label: "OUValidator/isDelete",
        message: `OU set to delete`,
      });
      return true;
    } else {
      logger.debug({
        label: "OUValidator/isDelete",
        message: `OU not set to delete`,
      });
      return false;
    }
  }

  /**
   * @description check if ou value is valid
   * @param {string[]} ous
   * @returns
   */
  isValid = async (ous: string[]): Promise<boolean> => {
    logger.debug({
      label: "OUValidator/isValid",
      message: `checking if OUs are valid`,
    });
    const regex = "^ou-([0-9a-z]{4,32})-([0-9a-z]{8,32})$";
    try {
      await Promise.all(
        ous.map((ou) => {
          logger.debug({
            label: "OUValidator/isValid",
            message: `validating OU Id ${ou}`,
          });
          if (!ou.match(regex)) throw new Error("invalid OU Id provided");
        })
      );
      return true;
    } catch (e) {
      logger.warn({
        label: "OUValidator/isValid",
        message: `${e.message}`,
      });
      return false;
    }
  };
}
