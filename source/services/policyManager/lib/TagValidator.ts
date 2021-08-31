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
 * @description class with methods for tag parameter check
 */
export class TagValidator implements IValidator {
  /**
   * @description check if tag value set to delete
   * @param {string} tags
   * @returns
   */
  isDelete = (tags: string): boolean => {
    logger.debug({
      label: "TagValidator/isTagDelete",
      message: `checking if Tag is set to delete`,
    });
    if (tags.toLowerCase() === "delete") {
      logger.debug({
        label: "TagValidator/isDelete",
        message: `Tags set to delete`,
      });
      return true;
    } else {
      logger.debug({
        label: "TagValidator/isDelete",
        message: `Tags not set to delete`,
      });
      return false;
    }
  };

  /**
   * @description check if tag value is valid
   * @param {string} tags
   * @returns
   */
  isValid = async (tags: string): Promise<boolean> => {
    logger.info({
      label: "TagValidator/isTagValid",
      message: `checking if tag is valid`,
    });
    try {
      const _tag = JSON.parse(tags);
      logger.info({
        label: "TagValidator/isTagValid",
        message: `tag: ${JSON.stringify(tags)} `,
      });
      if (
        _tag.ResourceTags instanceof Array &&
        typeof _tag.ExcludeResourceTags === "boolean"
      ) {
        _tag.ResourceTags.forEach((ResourceTag: { [key: string]: string }) => {
          if (
            !(
              Object.keys(ResourceTag).length === 2 &&
              ["Key", "Value"].includes(Object.keys(ResourceTag)[0]) &&
              ["Key", "Value"].includes(Object.keys(ResourceTag)[1]) &&
              typeof ResourceTag.Key === "string" &&
              typeof ResourceTag.Value === "string"
            )
          )
            throw new Error("invalid tag");
        });
        return true;
      } else return false;
    } catch (e) {
      logger.warn({
        label: "TagValidator/isValid",
        message: `${e.message}`,
      });
      return false;
    }
  };
}
