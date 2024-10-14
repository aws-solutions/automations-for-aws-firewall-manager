// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { logger } from "solutions-utils";
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
    const isDelete = tags.toLowerCase() === "delete";

    logger.debug("checked if tag parameter is set to delete", {
      tagIsDelete: isDelete,
      tags: tags,
    });
    return isDelete;
  };

  /**
   * @description check if tag value is valid
   * @param {string} tags
   * @returns
   */
  isValid = async (tags: string): Promise<boolean> => {
    let isValid: boolean;

    try {
      const _tag = JSON.parse(tags);
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
        isValid = true;
      } else return false;
    } catch (e) {
      logger.warn("encountered error validating tag parameter", {
        error: e,
        tags: tags,
      });
      isValid = false;
    }

    logger.debug("validated tag parameter", {
      tagIsValid: isValid,
      tags: tags,
    });

    return isValid;
  };
}
