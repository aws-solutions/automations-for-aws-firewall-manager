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
import { FMSHelper } from "./PolicyHelper";

/**
 * @description class with methods for region parameter check
 */
export class RegionValidator implements IValidator {
  /**
   * @description check if region value set to delete
   * @param {string[]} regions list of aws regions for creating policy
   * @returns
   */
  isDelete = (regions: string[]): boolean => {
    logger.debug({
      label: "RegionValidator/isDelete",
      message: `checking if region is set to delete`,
    });
    if (regions.length === 1 && regions[0].toLowerCase() === "delete") {
      logger.debug({
        label: "RegionValidator/isRegionDelete",
        message: `region is set to delete`,
      });
      return true;
    } else {
      logger.debug({
        label: "RegionValidator/isDelete",
        message: `region is not set to delete`,
      });
      return false;
    }
  };

  /**
   * @description check if region value is valid
   * @param {string[]} regions list of aws regions for creating policy
   * @returns
   */
  isValid = async (regions: string[]): Promise<boolean> => {
    logger.debug({
      label: "RegionValidator/isValid",
      message: `checking if region parameter is valid`,
    });
    const ec2Regions = await FMSHelper.getRegions();
    if (!(ec2Regions instanceof Array)) throw new Error("no regions found");
    try {
      await Promise.all(
        regions.map((region) => {
          if (!ec2Regions.includes(region))
            throw new Error("invalid region provided");
        })
      );
      return true;
    } catch (e) {
      logger.error({
        label: "RegionValidator/isValid",
        message: `${e.message}`,
      });
      return false;
    }
  };
}
