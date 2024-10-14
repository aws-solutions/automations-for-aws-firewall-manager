// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Automations for AWS Firewall Manager
 * Microservice to trigger policy updates
 * @author aws-solutions
 */

import { logger, tracer } from "solutions-utils";
import {
  IEvent,
  ValidationResults,
  PARAMETER,
  RequiredSSMParameters,
  PARTITION,
  EVENT_SOURCE,
} from "./lib/exports";
import { Validator } from "./lib/Validator";
import { PolicyManager } from "./lib/policyManager";
import { Context } from "aws-lambda";
import type { LambdaInterface } from "@aws-lambda-powertools/commons/types";
import { SSMHelper } from "./lib/clientHelpers";
import { ManifestHelper } from "./lib/manifestHelper";

class PolicyManagerLambda implements LambdaInterface {
  private regionsParameterPath = "";
  private ousParameterPath = "";
  private tagsParameterPath = "";
  private ssmParameterPrefix = "";
  private policyTable = "";
  private partition: PARTITION = PARTITION.AWS;
  private policyIdentifier = "";
  private topicArn = "";
  private manifestPath = "";

  @tracer.captureLambdaHandler()
  @logger.injectLambdaContext()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async handler(event: IEvent, _context: Context) {
    logger.info("handler received event ", {
      source: event.source,
      accountId: event.account,
      region: event.region,
      type: event["detail-type"],
    });

    this.getEnvironmentVariables();

    const { regionsParameter, ousParameter, tagsParameter } =
      await this.retrieveSSMParameters();

    const validationResults = await this.validateParameters(
      regionsParameter,
      ousParameter,
      tagsParameter
    );

    // throw error if ou is not set to delete and is not valid
    if (!validationResults.ouDelete && !validationResults.ouValid) {
      throw new Error("Invalid OU value");
    }

    // policies will be updated with NO tags if provided tags are invalid or set to 'delete'
    let tags;
    if (!validationResults.tagValid || validationResults.tagDelete) {
      tags = {
        ResourceTags: [],
        ExcludeResourceTags: false,
      };
    } else {
      tags = JSON.parse(tagsParameter);
    }

    const manifestHelper = new ManifestHelper(this.topicArn);
    const manifest = await manifestHelper.fetchManifest(this.manifestPath);

    const engine = new PolicyManager({
      validatorObj: validationResults,
      regions: regionsParameter,
      ous: ousParameter,
      tags: tags,
      ddbTable: this.policyTable,
      manifest: manifest,
      policyIdentifier: this.policyIdentifier,
      policyTopicArn: this.topicArn,
      partition: this.partition,
    });

    const eventType = event.source === "aws.s3" ? "s3" : event.detail.name;

    switch (eventType) {
      case this.regionsParameterPath:
        if (!validationResults.regionDelete && !validationResults.regionValid) {
          throw new Error("Invalid region value");
        }
        await engine.handleEvent(EVENT_SOURCE.REGION);
        break;
      case this.ousParameterPath:
        await engine.handleEvent(EVENT_SOURCE.OU);
        break;
      case this.tagsParameterPath:
        await engine.handleEvent(EVENT_SOURCE.TAG);
        break;
      case "s3":
        await engine.handleEvent(EVENT_SOURCE.S3);
        break;
    }
  }

  private getEnvironmentVariables() {
    this.regionsParameterPath = <string>process.env.FMS_REGION;
    this.ousParameterPath = <string>process.env.FMS_OU;
    this.tagsParameterPath = <string>process.env.FMS_TAG;
    this.ssmParameterPrefix = <string>process.env.SSM_PARAM_PREFIX;
    this.policyTable = <string>process.env.FMS_TABLE;
    this.partition = (<string>process.env.PARTITION) as PARTITION;
    this.policyIdentifier = <string>process.env.POLICY_IDENTIFIER;
    this.topicArn = <string>process.env.TOPIC_ARN;
    this.manifestPath = <string>process.env.POLICY_MANIFEST;

    logger.debug("fetched environment variables", {
      regionParameter: this.regionsParameterPath,
      ouParameter: this.ousParameterPath,
      tagParameter: this.tagsParameterPath,
      policyTable: this.policyTable,
    });
  }

  private async retrieveSSMParameters() {
    try {
      const ssmHelper = new SSMHelper();

      const ssmParameters = await ssmHelper.getParametersByPath(
        this.ssmParameterPrefix
      );
      const requiredSSMParameters = this.extractSSMParameters(
        ssmParameters,
        this.ousParameterPath,
        this.regionsParameterPath,
        this.tagsParameterPath
      );

      const ousParameter = requiredSSMParameters.Ous;
      const regionsParameter = requiredSSMParameters.Regions;
      const tagsParameter = requiredSSMParameters.Tags;

      logger.debug("fetched parameters", {
        ou: ousParameter,
        region: regionsParameter,
        tag: tagsParameter,
      });

      return { ousParameter, regionsParameter, tagsParameter };
    } catch (e) {
      throw new Error(`Failed to fetch SSM parameters: ${e.message}`);
    }
  }

  private async validateParameters(
    regions: string[],
    ous: string[],
    tags: string
  ): Promise<ValidationResults> {
    try {
      // setting up region validators
      const regionValidator = new Validator(PARAMETER.REGION);
      const regionDelete = regionValidator.isDelete(regions);
      const regionValid = await regionValidator.isValid(regions);

      // setting up ou validators
      const ouValidator = new Validator(PARAMETER.OU);
      const ouDelete = ouValidator.isDelete(ous);
      const ouValid = await ouValidator.isValid(ous);

      // setting up tag validators
      const tagValidator = new Validator(PARAMETER.TAG);
      const tagDelete = tagValidator.isDelete(tags);
      const tagValid = await tagValidator.isValid(tags);

      logger.info("validated parameters", {
        ouDelete: ouDelete,
        ouValid: ouValid,
        regionDelete: regionDelete,
        regionValid: regionValid,
        tagValid: tagValid,
        tagDelete: tagDelete,
      });

      return {
        regionDelete,
        regionValid,
        ouDelete,
        ouValid,
        tagDelete,
        tagValid,
      };
    } catch (e) {
      throw new Error(`Failed to validate SSM parameter: ${e.message}`);
    }
  }

  /**
   * Extracts the OUs, Regions, and Tags parameters from {Key:Value} object of fetched SSM parameters
   */
  private extractSSMParameters(
    ssmParameters: {
      [key: string]: string;
    },
    ousParameterPath: string,
    regionsParameterPath: string,
    tagsParameterPath: string
  ): RequiredSSMParameters {
    // extract the unique name of each parameter from the path /FMS/PolicyIdentifier/UNIQUE_PARAM_NAME
    const ousParameterName = ousParameterPath.substring(
      ousParameterPath.lastIndexOf("/") + 1
    );
    const regionsParameterName = regionsParameterPath.substring(
      regionsParameterPath.lastIndexOf("/") + 1
    );
    const tagsParameterName = tagsParameterPath.substring(
      tagsParameterPath.lastIndexOf("/") + 1
    );

    if (
      !(regionsParameterName in ssmParameters) ||
      !(tagsParameterName in ssmParameters) ||
      !(ousParameterName in ssmParameters)
    ) {
      logger.error(
        "missing one or more of required SSM parameters from fetched parameters",
        {
          fetchedParameters: ssmParameters,
          requiredParameters: [
            ousParameterName,
            regionsParameterName,
            tagsParameterName,
          ],
        }
      );
      throw new Error("Required SSM parameters not found");
    }

    return {
      Ous: ssmParameters[ousParameterName].split(","),
      Regions: ssmParameters[regionsParameterName].split(","),
      Tags: ssmParameters[tagsParameterName],
    };
  }
}

const handlerClass = new PolicyManagerLambda();
export const handler = handlerClass.handler.bind(handlerClass);
