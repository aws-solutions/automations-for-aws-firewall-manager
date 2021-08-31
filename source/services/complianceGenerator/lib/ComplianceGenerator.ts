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

import { EC2Client, DescribeRegionsCommand } from "@aws-sdk/client-ec2";
import {
  FMSClient,
  paginateListComplianceStatus,
  paginateListPolicies,
  ComplianceViolator,
  GetComplianceDetailCommand,
} from "@aws-sdk/client-fms";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { RETRY_MODES } from "@aws-sdk/middleware-retry";
import { createObjectCsvWriter } from "csv-writer";
import fs from "fs";
import { logger, serviceLogger } from "./common/logger";
import { Metrics } from "./common/metrics";

const customUserAgent = <string>process.env.CUSTOM_SDK_USER_AGENT;

export interface IMessage {
  /**
   * region where policy is created
   */
  region: string;
  /**
   * policy id for the policy
   */
  policyId: string;
}

/**
 * @description class to help with generating compliance reports for accounts and policies
 */
export class ComplianceGenerator {
  /**
   * policy for which compliance report has to be generated
   */
  policyId: string;
  /**
   * region where policy is deployed
   */
  region: string;
  /**
   *  bucket to upload compliance reports
   */
  bucket: string;

  /**
   * @constructor
   * @param policyId
   * @param region
   */
  constructor(policyId: string, region: string, bucket: string) {
    this.policyId = policyId;
    this.region = region;
    this.bucket = bucket;
  }

  /**
   * @description get member accounts in scope for policy
   * @param {string} policyId unique id for the policy
   * @param {string} region aws region policy is created
   */
  getMemberAccounts = async (): Promise<string[]> => {
    logger.debug({
      label: "ComplianceGenerator/getMemberAccounts",
      message: `getting member accounts for ${this.policyId}`,
    });
    const fms = new FMSClient({
      region: this.region,
      customUserAgent,
      logger: serviceLogger,
    });
    const paginatorConfig = {
      client: fms,
      pageSize: 25,
    };
    const paginator = paginateListComplianceStatus(paginatorConfig, {
      PolicyId: this.policyId,
    });
    const memberAccounts: string[] = [];
    for await (const page of paginator) {
      if (page.PolicyComplianceStatusList) {
        let members = <string[]>page.PolicyComplianceStatusList.map((list) => {
          return list.MemberAccount;
        });
        members = members.filter(
          (member) => typeof member === "string" && member.length > 0
        );
        memberAccounts.push(...members);
      }
    }
    return memberAccounts;
  };

  /**
   * @description get compliance details for accounts
   * @param {string[]} memberAccounts member accounts under a policy
   */
  getComplianceDetails = async (
    memberAccounts: string[]
  ): Promise<{
    accountCompliance_records: { [key: string]: string }[];
    resourceViolator_records: { [key: string]: string }[];
  }> => {
    logger.debug({
      label: "ComplianceGenerator/getComplianceDetails",
      message: `getting compliance details on member accounts`,
    });
    const fms = new FMSClient({
      region: this.region,
      customUserAgent,
      logger: serviceLogger,
      maxAttempts: +(process.env.MAX_ATTEMPTS as string), // to avoid throttling exceptions
      retryMode: RETRY_MODES.STANDARD, // retry mode for SDK
    });
    const accountCompliance_records: { [key: string]: string }[] = [];
    const resourceViolator_records: { [key: string]: string }[] = [];

    await Promise.allSettled(
      memberAccounts.map(async (member) => {
        try {
          const complianceDetail = await fms.send(
            new GetComplianceDetailCommand({
              PolicyId: this.policyId,
              MemberAccount: member,
            })
          );
          if (!complianceDetail.PolicyComplianceDetail)
            throw new Error("failure in getting compliance details");
          const violators = <ComplianceViolator[]>(
            complianceDetail.PolicyComplianceDetail.Violators
          );
          if (!violators || violators.length === 0) {
            if (
              complianceDetail.PolicyComplianceDetail.IssueInfoMap &&
              Object.keys(complianceDetail.PolicyComplianceDetail.IssueInfoMap)
                .length === 0
            )
              accountCompliance_records.push({
                member_account: member,
                compliance_status: "COMPLIANT",
              });
            else
              accountCompliance_records.push({
                member_account: member,
                compliance_status: JSON.stringify(
                  complianceDetail.PolicyComplianceDetail.IssueInfoMap
                ),
              });
          } else {
            accountCompliance_records.push({
              member_account: member,
              compliance_status: "NOT_COMPLIANT",
            });
            violators.forEach((violator) => {
              resourceViolator_records.push({
                member_account: member,
                resource_id: <string>violator.ResourceId,
                resource_type: <string>violator.ResourceType,
                violation_reason: <string>violator.ViolationReason,
              });
            });
          }
        } catch (e) {
          logger.error({
            label: "ComplianceGenerator/getComplianceDetails",
            message: e,
          });
        }
      })
    );
    return {
      accountCompliance_records,
      resourceViolator_records,
    };
  };

  /**
   * @description generate csv audit reports and upload to s3
   * @param account_compliance_records
   * @param resource_violator_records
   */
  generateComplianceReports = async (
    account_compliance_records: { [key: string]: string }[],
    resource_violator_records: { [key: string]: string }[]
  ): Promise<void> => {
    try {
      logger.debug({
        label: "ComplianceGenerator/generateComplianceReports",
        message: `generating compliance reports`,
      });
      // using date object to create S3 file key
      const date = new Date();
      const _date = date.toISOString();
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const day = date.getUTCDate();

      // creating csv writer objects
      const accountComplianceWriter = createObjectCsvWriter({
        path: `/tmp/${_date}_account_compliance_${this.policyId}.csv`,
        header: [
          { id: "member_account", title: "MEMBER_ACCOUNT" },
          { id: "compliance_status", title: "COMPLIANCE_STATUS" },
        ],
      });
      const resourceViolatorWriter = createObjectCsvWriter({
        path: `/tmp/${_date}_resource_violator_${this.policyId}.csv`,
        header: [
          { id: "member_account", title: "MEMBER_ACCOUNT" },
          { id: "resource_id", title: "RESOURCE_ID" },
          { id: "resource_type", title: "RESOURCE_TYPE" },
          { id: "violation_reason", title: "VIOLATION_REASON" },
        ],
      });

      let reportsGenerated = 0;
      // writing account compliance records to files
      await accountComplianceWriter.writeRecords(account_compliance_records);
      // uploading account compliance reports to s3
      let content = fs.readFileSync(
        `/tmp/${_date}_account_compliance_${this.policyId}.csv`
      );
      await this.uploadToS3(
        this.bucket,
        `${year}/${month}/${day}/${_date}_account_compliance_${this.policyId}.csv`,
        content
      );
      reportsGenerated++;

      // writing resource violator records to files
      if (resource_violator_records.length > 0) {
        await resourceViolatorWriter.writeRecords(resource_violator_records);
        // uploading resource violators reports to s3
        content = fs.readFileSync(
          `/tmp/${_date}_resource_violator_${this.policyId}.csv`
        );
        await this.uploadToS3(
          this.bucket,
          `${year}/${month}/${day}/${_date}_resource_violator_${this.policyId}.csv`,
          content
        );
        reportsGenerated++;
      }

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
            CountOfReportsGenerated: "" + reportsGenerated,
            Event: "ComplianceReports", // Create or Update
            Version: <string>process.env.SOLUTION_VERSION,
          },
        };
        await Metrics.sendAnonymousMetric(process.env.METRICS_QUEUE, metric);
      }
    } catch (e) {
      logger.error({
        label: "ComplianceGenerator/generateComplianceReports",
        message: e,
      });
    }
  };

  /**
   * @description upload csv report to S3 bucket
   * @param {string} Bucket S3 bucket to upload reports
   * @param {string} Key filename
   */
  private uploadToS3 = async (
    Bucket: string,
    Key: string,
    Body: Buffer
  ): Promise<void> => {
    try {
      logger.debug({
        label: "ComplianceGenerator/uploadToS3",
        message: `uploading report to ${Bucket}`,
      });
      const s3 = new S3Client({
        customUserAgent,
        logger: serviceLogger,
      });
      await s3.send(new PutObjectCommand({ Bucket, Key, Body }));
    } catch (e) {
      logger.error({
        label: "ComplianceGenerator/uploadToS3",
        message: `${JSON.stringify(e)}`,
      });
      throw new Error("upload failed");
    }
  };

  /**
   * @description returns ec2 regions list
   * @returns
   */
  static getRegions = async (): Promise<string[]> => {
    logger.debug({
      label: "ComplianceGenerator/getRegions",
      message: `getting ec2 regions`,
    });
    try {
      const ec2 = new EC2Client({
        customUserAgent,
        logger: serviceLogger,
      });

      const _r = await ec2.send(
        new DescribeRegionsCommand({ AllRegions: true })
      );

      if (!_r.Regions) throw new Error("failed to describe regions");
      const regions = <string[]>_r.Regions.filter((region) => {
        return region.RegionName !== "ap-northeast-3";
      }).map((region) => {
        return region.RegionName;
      });
      logger.debug({
        label: "ComplianceGenerator/getRegions",
        message: `${JSON.stringify({ regions: regions })}`,
      });
      return regions;
    } catch (e) {
      logger.error({
        label: "ComplianceGenerator/getRegions",
        message: JSON.stringify(e),
      });
      throw new Error("error fetching regions");
    }
  };

  /**
   * @description list policies in a region
   * @param region
   * @returns
   */
  static listPolicies = async (region: string): Promise<string[]> => {
    logger.debug({
      label: "ComplianceGenerator/listPolicies",
      message: `listing policies in ${region}`,
    });
    const policies: string[] = [];
    try {
      const fms = new FMSClient({
        region,
        customUserAgent,
        logger: serviceLogger,
      });
      const paginatorConfig = {
        client: fms,
        pageSize: 25,
      };
      const paginator = paginateListPolicies(paginatorConfig, {});
      for await (const page of paginator) {
        const _policies = <string[]>(
          page.PolicyList?.map((list) => list.PolicyId)
        );
        policies.push(..._policies);
      }
    } catch (e) {
      logger.error({
        label: "ComplianceGenerator/listPolicies",
        message: `error listing policies in ${region}: ${e}`,
      });
    }
    return policies;
  };

  /**
   * @description publish message to SNS topic
   * @param region
   * @param Message
   * @param TopicArn
   */
  static sendSNS = async (
    region: string,
    Message: IMessage,
    TopicArn: string
  ): Promise<void> => {
    logger.debug({
      label: "ComplianceGenerator/sendSNS",
      message: `sending sns message in ${Message.region} for policyId: ${Message.policyId}`,
    });
    try {
      const sns = new SNSClient({
        region,
        customUserAgent,
        logger: serviceLogger,
      });
      await sns.send(
        new PublishCommand({ Message: JSON.stringify(Message), TopicArn })
      );
    } catch (e) {
      logger.error({
        label: "ComplianceGenerator/sendSNS",
        message: e,
      });
    }
  };
}
