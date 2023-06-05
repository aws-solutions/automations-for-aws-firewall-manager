// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ITag,
  IValidatorObject,
  POLICY_TYPE,
  customUserAgent,
} from "./exports";
import { PolicyHandler } from "./PolicyHandler";
import { logger, serviceLogger } from "./common/logger";
import { Readable } from "stream";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { FMSHelper } from "./PolicyHelper";
import { Metrics } from "./common/metrics";

/**
 * @description class with create/delete calls on different policy types
 * The class methods act as facade for different policy types
 */
export class PolicyEngine {
  private readonly validatorObject: IValidatorObject;
  private readonly regions: string[];
  private readonly policyHandler: PolicyHandler;

  constructor(
    obj: IValidatorObject,
    regions: string[],
    ous: string[],
    tags: ITag,
    table: string,
    manifest: string,
    policyIdentifier: string
  ) {
    this.validatorObject = obj;
    this.regions = regions;
    this.policyHandler = new PolicyHandler(
      table,
      ous,
      tags,
      manifest,
      policyIdentifier
    );
  }

  /**
   * @description method to handle triggering event and create/delete policies
   * @param trigger
   */
  triggerHandler = async (trigger: string): Promise<void> => {
    logger.info({
      label: "PolicyEngine/triggerHandler",
      message: `triggering event: ${trigger}`,
    });
    if (trigger === "Region") {
      await this.handleTriggerRegion();
    } else if (trigger === "OU") {
      await this.handleTriggerOU();
    } else if (trigger === "Tag") {
      if (this.validatorObject.ouDelete) {
        // nothing to do
      } else if (
        this.validatorObject.ouValid &&
        this.validatorObject.regionDelete
      ) {
        // save global policies
        await this.saveAllPolicy(
          [POLICY_TYPE.WAF_GLOBAL, POLICY_TYPE.SHIELD_GLOBAL],
          "Global"
        );
      } else if (
        this.validatorObject.ouValid &&
        this.validatorObject.regionValid
      ) {
        // save global + regional policies
        await this.saveAllPolicy(
          [POLICY_TYPE.WAF_GLOBAL, POLICY_TYPE.SHIELD_GLOBAL],
          "Global"
        );
        await this.saveRegionalPolicy(this.regions);
      }
    }
  };

  /**
   * @description save regional FMS policies
   * @param regions
   */
  private saveRegionalPolicy = async (regions: string[]): Promise<void> => {
    await Promise.allSettled(
      regions.map(async (region) => {
        await this.saveAllPolicy(
          [
            POLICY_TYPE.SG_CONTENT_AUDIT,
            POLICY_TYPE.SG_USAGE_AUDIT,
            POLICY_TYPE.SHIELD_REGIONAL,
            POLICY_TYPE.WAF_REGIONAL,
            POLICY_TYPE.DNS_FIREWALL,
          ],
          region
        );
      })
    );
  };

  /**
   * @description save all FMS policies
   * @param policies
   * @param region
   */
  private saveAllPolicy = async (
    policies: POLICY_TYPE[],
    region: string
  ): Promise<void> => {
    logger.debug({
      label: "PolicyEngine/saveAllPolicy",
      message: `saving policies ${policies} for ${region}`,
    });
    const pm = this.policyHandler;
    await Promise.allSettled(
      policies.map(async (policy) => {
        try {
          const _policy = await pm.createPolicy(policy, region);
          const _e = await pm.savePolicy(_policy, region);
          // send metric
          if (
            process.env.SEND_METRIC === "Yes" &&
            process.env.UUID &&
            process.env.METRICS_QUEUE
          ) {
            const metric = {
              Solution: <string>process.env.SOLUTION_ID,
              UUID: process.env.UUID,
              TimeStamp: new Date()
                .toISOString()
                .replace("T", " ")
                .replace("Z", ""), // Date and time instant in a java.sql.Timestamp compatible format
              Data: {
                OUCount: "" + _policy.IncludeMap?.ORG_UNIT.length,
                Region: region,
                Event: _e, // Create or Update
                Type: <string>policy,
                Version: <string>process.env.SOLUTION_VERSION,
              },
            };
            await Metrics.sendAnonymousMetric(
              process.env.METRICS_QUEUE,
              metric
            );
          }
        } catch (e) {
          logger.warn({
            label: "PolicyEngine/saveAllPolicy",
            message: `failed saving policy ${policy} in ${region}, error : ${e}`,
          });
        }
      })
    );
    logger.info({
      label: "PolicyEngine/saveAllPolicy",
      message: `policies ${policies} saved in ${region}`,
    });
  };

  /**
   * @description delete regional FMS policies
   * @param regions
   */
  private deleteRegionalPolicy = async (
    regions: string[] | "All"
  ): Promise<void> => {
    let _regions: string[];
    if (regions === "All") _regions = await FMSHelper.getRegions();
    else _regions = regions;
    await Promise.allSettled(
      _regions.map(async (region) => {
        await this.deleteAllPolicy(
          [
            POLICY_TYPE.SG_CONTENT_AUDIT,
            POLICY_TYPE.SG_USAGE_AUDIT,
            POLICY_TYPE.SHIELD_REGIONAL,
            POLICY_TYPE.WAF_REGIONAL,
            POLICY_TYPE.DNS_FIREWALL,
          ],
          region
        );
      })
    );
  };

  /**
   * @description delete all FMS policies
   * @param policies
   * @param region
   */
  private deleteAllPolicy = async (
    policies: POLICY_TYPE[],
    region: string
  ): Promise<void> => {
    logger.debug({
      label: "PolicyEngine/deleteAllPolicy",
      message: `deleting policies: ${policies} for ${region}`,
    });
    const pm = this.policyHandler;
    await Promise.allSettled(
      policies.map(async (policy) => {
        try {
          await pm.deletePolicy(policy, region);
          // send metric
          if (
            process.env.SEND_METRIC === "Yes" &&
            process.env.UUID &&
            process.env.METRICS_QUEUE
          ) {
            const metric = {
              Solution: <string>process.env.SOLUTION_ID,
              UUID: process.env.UUID,
              TimeStamp: new Date()
                .toISOString()
                .replace("T", " ")
                .replace("Z", ""), // Date and time instant in a java.sql.Timestamp compatible format
              Data: {
                Region: region,
                Event: "Delete",
                Type: <string>policy,
                Version: <string>process.env.SOLUTION_VERSION,
              },
            };
            await Metrics.sendAnonymousMetric(
              process.env.METRICS_QUEUE,
              metric
            );
          }
        } catch (e) {
          logger.warn({
            label: "PolicyEngine/deleteAllPolicy",
            message: `failed deleting policy ${policy} in ${region}, error: ${e}`,
          });
        }
      })
    );
    logger.info({
      label: "PolicyEngine/deleteAllPolicy",
      message: `policies ${policies} deleted in ${region}`,
    });
  };

  /**
   * @description downloads and returns the policy manifest
   * @returns
   */
  static getManifest = async (): Promise<string> => {
    logger.debug({
      label: "PolicyEngine/getManifest",
      message: `fetching policy manifest ${process.env.POLICY_MANIFEST}`,
    });
    const manifestLocation = <string>process.env.POLICY_MANIFEST;
    const Bucket = manifestLocation.split("|")[0];
    const Key = manifestLocation.split("|")[1];

    const s3 = new S3Client({
      customUserAgent: customUserAgent,
      logger: serviceLogger,
    });

    const streamToString = (stream: Readable) =>
      new Promise((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });

    const command = new GetObjectCommand({
      Bucket,
      Key,
    });

    try {
      const { Body } = await s3.send(command);
      logger.info({
        label: "PolicyEngine/getManifest",
        message: `policy manifest fetched`,
      });
      return <string>await streamToString(Body as Readable);
    } catch (e) {
      logger.error({
        label: "PolicyHandler/getManifest",
        message: `${e}`,
      });
      throw new Error("error getting policy manifest");
    }
  };

  private handleTriggerRegion = async (): Promise<void> => {
    if (!this.validatorObject.ouDelete) {
      if (
        this.validatorObject.ouValid &&
        this.validatorObject.regionDelete
      ) {
        // delete regional policies
        await this.deleteRegionalPolicy("All");
      } else if (
        this.validatorObject.ouValid &&
        this.validatorObject.regionValid
      ) {
        // save regional policies
        const _regions = await FMSHelper.getRegions();
        const delRegions = _regions.filter((r) => !this.regions.includes(r));
        await this.deleteRegionalPolicy(delRegions);
        await this.saveRegionalPolicy(this.regions);
      }
    }
  };

  private handleTriggerOU = async (): Promise<void> => {
    if (this.validatorObject.ouDelete) {
      // delete global + regional policies
      await this.deleteAllPolicy(
        [POLICY_TYPE.WAF_GLOBAL, POLICY_TYPE.SHIELD_GLOBAL],
        "Global"
      );
      await this.deleteRegionalPolicy(this.regions);
    } else if (
      this.validatorObject.ouValid &&
      this.validatorObject.regionValid
    ) {
      // save global + regional policies
      await this.saveAllPolicy(
        [POLICY_TYPE.WAF_GLOBAL, POLICY_TYPE.SHIELD_GLOBAL],
        "Global"
      );
      await this.saveRegionalPolicy(this.regions);
    } else if (
      this.validatorObject.ouValid &&
      (this.validatorObject.regionDelete || !this.validatorObject.regionValid)
    ) {
      // save global policies
      await this.saveAllPolicy(
        [POLICY_TYPE.WAF_GLOBAL, POLICY_TYPE.SHIELD_GLOBAL],
        "Global"
      );
    }
  };
}

