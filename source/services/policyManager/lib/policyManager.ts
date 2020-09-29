/**
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { FMSHelper } from "./fmsHelper";
import { Policy } from "aws-sdk/clients/fms";
import { logger } from "./common/logger";

export type T = {
  Key: string;
  Value: string;
};

export interface ITags {
  ResourceTags: Array<T>;
  ExcludeResourceTags: boolean;
}

export interface IPolicyManager {
  orgUnits: string;
  tier?: string;
  region: string;
  table: string;
  tags: string;
  loglevel: string;
}

export class PolicyManager {
  static async workflowProcessor(
    table: string,
    region: string,
    policy: Policy
  ) {
    /**
     * Step 1. get dynamodb policy item
     * Step 2. get PolicyUpdateToken
     * Step 3. put fms security policy
     * Step 4. update dynamodb item with new policy update token
     */

    let event = "Update";
    // Step 1. Get DDB item
    try {
      let item: any;
      await FMSHelper.getDDBItem(policy.PolicyName, region, table)
        .then((data) => {
          item = data;
        })
        .catch((e) => {
          if (e.message === "ResourceNotFound") {
            item = "";
          } else throw new Error(e.message);
        });

      // Step 2. Update item for region
      if (item) {
        Object.assign(policy, {
          PolicyUpdateToken: item.PolicyUpdateToken.S,
          PolicyId: item.PolicyId.S,
        });
      }
      if (!item) {
        delete policy.PolicyUpdateToken;
        delete policy.PolicyId;
        event = "Create";
      }

      // Step 3. Save Policy
      const resp = await FMSHelper.putPolicy(policy, region);

      // Step 4. Update DDB Item
      if (!resp.Policy) throw new Error("error creating policy");
      if (!resp.Policy.PolicyUpdateToken || !resp.Policy.PolicyId)
        throw new Error("policy update token not found");
      await FMSHelper.updateDDBItem(
        policy.PolicyName,
        region,
        {
          updateToken: resp.Policy.PolicyUpdateToken,
          policyId: resp.Policy.PolicyId,
        },
        table
      );

      // Step 5. Response
      logger.info({
        label: "PolicyManagaer/workflowProcessor",
        message: `FMS policy saved successfully`,
      });
      return event;
    } catch (e) {
      throw new Error(e.message);
    }
  }

  /**
   * @description check if OUs are valid
   * @param {string[]} ous
   * @returns {Promise<boolean>}
   */
  static async isOUValid(ous: string[]): Promise<boolean> {
    logger.debug({
      label: "PolicyManagaer/isOUValid",
      message: `checking if OUs are valid`,
    });
    const regex = "^ou-([0-9a-z]{4,32})-([0-9a-z]{8,32})$";
    try {
      await Promise.all(
        ous.map((ou) => {
          if (!ou.match(regex)) throw new Error("invalid OU Id provided");
        })
      );
      return true;
    } catch (e) {
      logger.error({
        label: "PolicyManagaer/isOUValid",
        message: `${e.message}`,
      });
      return false;
    }
  }

  /**
   * @description check if regions are valid
   * @param {string[]} regions
   * @returns {Promise<boolean>}
   */
  static async isRegionValid(regions: string[]): Promise<boolean> {
    logger.debug({
      label: "PolicyManagaer/isRegionValid",
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
        label: "PolicyManagaer/isRegionValid",
        message: `${e.message}`,
      });
      return false;
    }
  }

  /**
   * @description check if OUs is set to delete
   * @param {string[]} ous
   * @returns {Promise<boolean>}
   */
  static async isOUDelete(ous: string[]): Promise<boolean> {
    logger.debug({
      label: "PolicyManagaer/isOUDelete",
      message: `checking if OU is set to delete`,
    });
    if (ous.length === 1 && ous[0].toLowerCase() === "delete") {
      logger.debug({
        label: "PolicyManagaer/isOUDelete",
        message: `OU set to delete`,
      });
      return true;
    } else {
      logger.debug({
        label: "PolicyManagaer/isOUDelete",
        message: `OU not set to delete`,
      });
      return false;
    }
  }

  /**
   * @description check if region list is set to delete
   * @param {string[]} regions[]
   * @returns {Promise<boolean>}
   */
  static async isRegionDelete(regions: string[]): Promise<boolean> {
    logger.debug({
      label: "PolicyManagaer/isRegionDelete",
      message: `checking if region is set to delete`,
    });
    if (regions.length === 1 && regions[0].toLowerCase() === "delete") {
      logger.debug({
        label: "PolicyManagaer/isRegionDelete",
        message: `region is set to delete`,
      });
      return true;
    } else {
      logger.debug({
        label: "PolicyManagaer/isRegionDelete",
        message: `region is not set to delete`,
      });
      return false;
    }
  }

  /**
   * @description check if tags are valid
   * @param {string[]} tags[]
   * @returns {Promise<boolean>}
   * @example {"ResourceTags":[{"Key":"Environment","Value":"Prod"}],"ExcludeResourceTags":false}
   */
  static async isTagValid(tags: string): Promise<boolean> {
    logger.info({
      label: "PolicyManagaer/isTagValid",
      message: `checking if tag is valid`,
    });

    try {
      const t = JSON.parse(tags);
      logger.debug({
        label: "PolicyManagaer/isTagValid",
        message: `tag: ${JSON.stringify(tags)}`,
      });
      if (
        Object.prototype.hasOwnProperty.call(t, "ResourceTags") &&
        Object.prototype.hasOwnProperty.call(t, "ExcludeResourceTags") &&
        typeof t.ExcludeResourceTags === "boolean"
      ) {
        await Promise.all(
          t.ResourceTags.map((rt: ITags) => {
            if (
              !Object.prototype.hasOwnProperty.call(rt, "Key") ||
              !Object.prototype.hasOwnProperty.call(rt, "Value")
            )
              throw new Error("invalid tag");
            if (Object.keys(rt).length > 2) throw new Error("invalid tag");
          })
        );
        logger.debug({
          label: "PolicyManagaer/isTagValid",
          message: `tag is valid`,
        });
        return true;
      } else throw new Error("invalid tag");
    } catch (e) {
      logger.error({
        label: "PolicyManagaer/isTagValid",
        message: `${e.message}`,
      });
      return false;
    }
  }

  /**
   * @description check if Tag parameter is set to delete
   * @param {string} tags
   * @returns {Promise<boolean>}
   */
  static async isTagDelete(tags: string): Promise<boolean> {
    logger.debug({
      label: "PolicyManagaer/isTagDelete",
      message: `checking if Tag is set to delete`,
    });
    if (tags.toLowerCase() === "delete") {
      logger.debug({
        label: "PolicyManagaer/isTagDelete",
        message: `Tags set to delete`,
      });
      return true;
    } else {
      logger.debug({
        label: "PolicyManagaer/isTagDelete",
        message: `Tags not set to delete`,
      });
      return false;
    }
  }
}
