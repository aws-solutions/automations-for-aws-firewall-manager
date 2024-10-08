// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { logger } from "solutions-utils";
import { EC2Helper } from "./clientHelpers";
import { IValidator } from "./exports";

/**
 * @description class with methods for region parameter check
 */
export class RegionValidator implements IValidator {
  private ec2Helper: EC2Helper;

  constructor() {
    this.ec2Helper = new EC2Helper();
  }

  /**
   * @description check if region value set to delete
   * @param {string[]} regions list of aws regions for creating policy
   * @returns
   */
  isDelete(regions: string[]): boolean {
    const isDelete =
      regions.length === 1 && regions[0].toLowerCase() === "delete";

    logger.debug("checked if region parameter is set to delete", {
      isDelete: isDelete,
      regions: regions,
    });

    return isDelete;
  }

  /**
   * @description check if region value is valid
   * @param {string[]} regions list of aws regions for creating policy
   * @returns
   */
  async isValid(regions: string[]): Promise<boolean> {
    let isValid: boolean;
    const ec2Regions = await this.ec2Helper.getRegions();

    if (!(ec2Regions instanceof Array)) throw new Error("no regions found");
    try {
      await Promise.all(
        regions.map((region) => {
          if (!ec2Regions.includes(region))
            throw new Error("invalid region provided");
        })
      );
      isValid = true;
    } catch (e) {
      logger.error("encountered error validating region parameter", {
        error: e,
        regions: regions,
      });
      isValid = false;
    }

    logger.debug("validated region parameter", {
      regionIsValid: isValid,
      regions: regions,
    });

    return isValid;
  }
}
