// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ITag,
  ValidationResults,
  POLICY_TYPE,
  SNS_PUT_POLICY_ERROR_MESSAGE,
  SNS_PUT_POLICY_ERROR_SUBJECT,
  PARTITION,
  EVENT_SOURCE,
} from "./exports";
import { PolicyHelper } from "./policyHelper";
import { EC2Helper, SNSHelper } from "./clientHelpers";
import { IMetric, logger, sendAnonymizedMetric } from "solutions-utils";

export interface PolicyManagerProps {
  validatorObj: ValidationResults;
  regions: string[];
  ous: string[];
  tags: ITag;
  ddbTable: string;
  manifest: string;
  policyIdentifier: string;
  policyTopicArn: string;
  partition: PARTITION;
}

/**
 * @description class with create/delete calls on different policy types
 * The class methods act as facade for different policy types
 */
export class PolicyManager {
  private readonly validatorObject: ValidationResults;
  private readonly regions: string[];
  private readonly policyHelper: PolicyHelper;
  private readonly ec2Helper: EC2Helper;
  private readonly partition: PARTITION;
  private readonly snsHelper: SNSHelper;
  private readonly policyTopicARN: string;

  constructor(props: PolicyManagerProps) {
    this.validatorObject = props.validatorObj;
    this.regions = props.regions;
    this.policyTopicARN = props.policyTopicArn;
    this.partition = props.partition;

    this.policyHelper = new PolicyHelper({
      ddbTable: props.ddbTable,
      ous: props.ous,
      tags: props.tags,
      manifest: props.manifest,
      policyIdentifier: props.policyIdentifier,
      partition: props.partition,
    });

    this.ec2Helper = new EC2Helper();
    this.snsHelper = new SNSHelper();
  }

  /**
   * @description method to handle event and create/delete policies
   * @param source
   */
  async handleEvent(source: EVENT_SOURCE): Promise<void> {
    logger.info("Policy Engine handler received event", {
      event: source,
    });

    switch (source) {
      case EVENT_SOURCE.REGION:
        await this.handleEventRegion();
        break;
      case EVENT_SOURCE.OU:
        await this.handleEventOU();
        break;
      case EVENT_SOURCE.TAG:
      case EVENT_SOURCE.S3:
        await this.handleEventTagOrS3();
        break;
    }
  }

  private async handleEventRegion(): Promise<void> {
    if (this.validatorObject.ouDelete || !this.validatorObject.ouValid) {
      return;
    }

    if (this.validatorObject.regionDelete) {
      await this.deleteRegionalPolicies("All");
    } else if (this.validatorObject.regionValid) {
      const allRegions = await this.ec2Helper.getRegions();
      const regionsToDelete = allRegions.filter(
        (region) => !this.regions.includes(region)
      );

      await this.deleteRegionalPolicies(regionsToDelete);
      await this.createAndSaveRegionalPolicies(this.regions);
    }
  }

  private async handleEventOU(): Promise<void> {
    if (this.validatorObject.ouDelete) {
      await this.deleteGlobalPolicies();
      await this.deleteRegionalPolicies(this.regions);
    } else if (this.validatorObject.ouValid) {
      await this.createAndSaveGlobalPolicies();

      if (this.validatorObject.regionValid) {
        await this.createAndSaveRegionalPolicies(this.regions);
      }
    }
  }

  private async handleEventTagOrS3() {
    if (this.validatorObject.ouDelete) {
      return;
    }

    if (this.validatorObject.ouValid) {
      await this.createAndSaveGlobalPolicies();
    }

    if (this.validatorObject.regionValid) {
      await this.createAndSaveRegionalPolicies(this.regions);
    }
  }

  /**
   * @description save regional FMS policies
   * @param regions
   */
  private async createAndSaveRegionalPolicies(
    regions: string[]
  ): Promise<void> {
    await Promise.allSettled(
      regions.map(async (region) => {
        await this.createAndSavePolicies(
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
  }

  /**
   * @description save global FMS policies
   */
  private async createAndSaveGlobalPolicies() {
    await this.createAndSavePolicies(
      [POLICY_TYPE.WAF_GLOBAL, POLICY_TYPE.SHIELD_GLOBAL],
      "Global"
    );
  }

  /**
   * @description save all FMS policies
   * @param policyTypes
   * @param region
   */
  private async createAndSavePolicies(
    policyTypes: POLICY_TYPE[],
    region: string
  ): Promise<void> {
    const savedPolicies: POLICY_TYPE[] = [];
    const failedPolicies: POLICY_TYPE[] = [];

    await Promise.allSettled(
      policyTypes.map(async (policyType) => {
        if (!this.policyValidForPartition(policyType)) {
          return;
        }

        try {
          const policy = await this.policyHelper.buildPolicy(
            policyType,
            region
          );
          const saveEventType = await this.policyHelper.saveOrUpdatePolicy(
            policy,
            region
          );
          savedPolicies.push(policyType);

          await this.sendMetric({
            OUCount: "" + policy.IncludeMap?.ORG_UNIT?.length,
            Region: region,
            Event: saveEventType, // Create or Update
            Type: <string>policyType,
            Version: <string>process.env.SOLUTION_VERSION,
          });
        } catch (e) {
          logger.warn(`failed to save policy ${policyType}`, {
            error: e,
            region: region,
            policy: policyType,
          });
          failedPolicies.push(policyType);
        }
      })
    );

    if (failedPolicies.length > 0) {
      await this.sendSNSMessage(
        SNS_PUT_POLICY_ERROR_SUBJECT,
        SNS_PUT_POLICY_ERROR_MESSAGE + failedPolicies
      );
    }

    logger.info("finished saving policies", {
      savedPolicies: savedPolicies,
      failedPolicies: failedPolicies,
      region: region,
    });
  }

  /**
   * @description delete regional FMS policies
   * @param regions
   */
  private async deleteRegionalPolicies(
    regions: string[] | "All"
  ): Promise<void> {
    const regionsToDelete =
      regions === "All" ? await this.ec2Helper.getRegions() : regions;
    await Promise.allSettled(
      regionsToDelete.map(async (region) => {
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
  }

  /**
   * @description delete global FMS policies
   */
  private async deleteGlobalPolicies() {
    await this.deleteAllPolicy(
      [POLICY_TYPE.WAF_GLOBAL, POLICY_TYPE.SHIELD_GLOBAL],
      "Global"
    );
  }

  /**
   * @description delete all FMS policies
   * @param policies
   * @param region
   */
  private async deleteAllPolicy(
    policies: POLICY_TYPE[],
    region: string
  ): Promise<void> {
    const deleteSuccessPolicies: POLICY_TYPE[] = [];
    const deleteFailedPolicies: POLICY_TYPE[] = [];

    await Promise.allSettled(
      policies.map(async (policy) => {
        if (!this.policyValidForPartition(policy)) {
          return;
        }

        try {
          await this.policyHelper.deletePolicy(policy, region);
          deleteSuccessPolicies.push(policy);

          await this.sendMetric({
            Region: region,
            Event: "Delete",
            Type: <string>policy,
            Version: <string>process.env.SOLUTION_VERSION,
          });
        } catch (e) {
          logger.warn(`failed to delete policy ${policy}`, {
            error: e,
            region: region,
            policy: policy,
          });
          deleteFailedPolicies.push(policy);
        }
      })
    );
    logger.info("finished deleting all policies", {
      deleteSuccess: deleteSuccessPolicies,
      deleteFailed: deleteFailedPolicies,
      region: region,
    });
  }

  private policyValidForPartition(policy: POLICY_TYPE) {
    // currently, gov-cloud and china do not support the following POLICY_TYPEs
    if ([PARTITION.AWS_US_GOV, PARTITION.AWS_CN].includes(this.partition)) {
      return ![
        POLICY_TYPE.SHIELD_GLOBAL,
        POLICY_TYPE.SHIELD_REGIONAL,
        POLICY_TYPE.WAF_GLOBAL,
      ].includes(policy);
    }

    return true;
  }

  private async sendSNSMessage(subject: string, message: string) {
    await this.snsHelper.publishMessage(this.policyTopicARN, subject, message);
  }

  private async sendMetric(metricData: { [key: string]: string | number }) {
    if (process.env.SEND_METRIC === "Yes" && process.env.UUID) {
      const metric: IMetric = {
        Solution: <string>process.env.SOLUTION_ID,
        UUID: process.env.UUID,
        TimeStamp: new Date().toISOString().replace("T", " ").replace("Z", ""), // Date and time instant in a java.sql.Timestamp compatible format
        Data: metricData,
      };
      await sendAnonymizedMetric(metric);
    }
  }
}
