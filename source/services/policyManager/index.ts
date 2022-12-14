// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Automations for AWS Firewall Manager
 * Microservice to trigger policy updates
 * @author aws-solutions
 */

import { FMSHelper } from "./lib/PolicyHelper";
import { logger } from "./lib/common/logger";
import { IEvent, ITag, PARAMETER } from "./lib/exports";
import { Validator } from "./lib/Validator";
import { PolicyEngine } from "./lib/PolicyEngine";

export const handler = async (event: IEvent) => {
  logger.debug({ label: "PolicyManager", message: "Loading event..." });
  logger.debug({
    label: "PolicyManager",
    message: `event : ${JSON.stringify(event)}`,
  });

  // fetching environment variables
  const regionParameter = <string>process.env.FMS_REGION;
  const ouParameter = <string>process.env.FMS_OU;
  const tagParameter = <string>process.env.FMS_TAG;
  const policyTable = <string>process.env.FMS_TABLE;
  logger.debug({
    label: "PolicyManager",
    message: `${JSON.stringify({
      regionParameter,
      ouParameter,
      tagParameter,
      policyTable,
    })} `,
  });

  let regionDelete: boolean;
  let regionValid: boolean;
  let ouDelete: boolean;
  let ouValid: boolean;
  let tagDelete: boolean;
  let tagValid: boolean;
  let _ous: string[], _regions: string[], _tags: string, tags: ITag;

  try {
    _ous = <string[]>await FMSHelper.getSSMParameter(ouParameter);
    _regions = <string[]>await FMSHelper.getSSMParameter(regionParameter);
    _tags = <string>await FMSHelper.getSSMParameter(tagParameter);
    logger.debug({
      label: "PolicyManager",
      message: `fetched parameters: ${JSON.stringify({
        region: _regions,
        ou: _ous,
        tag: _tags,
      })} `,
    });
  } catch (e) {
    throw new Error(`Failed to fetch SSM parameter: ${e.message}`);
  }

  try {
    // setting up region validators
    const regionValidator = new Validator(PARAMETER.REGION);
    regionDelete = regionValidator.isDelete(_regions);
    regionValid = await regionValidator.isValid(_regions);

    // setting up ou validators
    const ouValidator = new Validator(PARAMETER.OU);
    ouDelete = ouValidator.isDelete(_ous);
    ouValid = await ouValidator.isValid(_ous);

    // setting up tag validators
    const tagValidator = new Validator(PARAMETER.TAG);
    tagDelete = tagValidator.isDelete(_tags);
    tagValid = await tagValidator.isValid(_tags);

    logger.info({
      label: "PolicyManager",
      message: JSON.stringify({
        ouDelete,
        ouValid,
        regionDelete,
        regionValid,
        tagValid,
        tagDelete,
      }),
    });
  } catch (e) {
    throw new Error(`Failed to validate SSM parameter: ${e.message}`);
  }

  // throw error if ou is not set to delete and is not valid
  if (!ouDelete && !ouValid) throw new Error("Invalid OU value");

  // policies will be updated with NO tags if provided tags are invalid or set to 'delete'
  if (!tagValid || tagDelete) {
    tags = {
      ResourceTags: [],
      ExcludeResourceTags: false,
    };
  } else {
    tags = JSON.parse(_tags);
  }

  const triggerEvent = event.detail.name;

  let manifest: string;
  try {
    manifest = await PolicyEngine.getManifest();
  } catch (e) {
    throw new Error(e.message);
  }
  const engine = new PolicyEngine(
    {
      regionDelete,
      regionValid,
      ouDelete,
      ouValid,
      tagDelete,
      tagValid,
    },
    _regions,
    _ous,
    tags,
    policyTable,
    manifest,
    <string>process.env.POLICY_IDENTIFIER
  );

  if (triggerEvent === regionParameter) {
    if (!regionDelete && !regionValid) throw new Error("Invalid region value");
    else await engine.triggerHandler("Region");
  } else if (triggerEvent === ouParameter) await engine.triggerHandler("OU");
  else if (triggerEvent === tagParameter) await engine.triggerHandler("Tag");
};
