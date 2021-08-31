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

/**
 * @description
 * AWS Firewall Manager Automations for AWS Organizations
 * Microservice to generate compliance reports for FMS policies
 * @author aws-solutions
 */

import { logger } from "./lib/common/logger";
import { ComplianceGenerator, IMessage } from "./lib/ComplianceGenerator";

exports.handler = async (event: {
  [key: string]: string | string[] | Record<string, unknown>[];
}) => {
  logger.debug({ label: "ComplianceGenerator", message: "Loading event..." });
  logger.debug({
    label: "ComplianceGenerator",
    message: `event : ${JSON.stringify(event)}`,
  });

  // event triggered by sns
  if (
    event.Records &&
    (event.Records[0] as Record<string, unknown>).EventSource === "aws:sns"
  ) {
    const reportBucket = <string>process.env.FMS_REPORT_BUCKET;
    const _sns = (event.Records[0] as Record<string, unknown>).Sns;
    const message: IMessage = JSON.parse(
      (_sns as Record<string, unknown>).Message as string
    );
    logger.debug({
      label: "ComplianceGenerator",
      message: `message: ${message.region} policyId: ${message.policyId}`,
    });
    try {
      const compGenerator = new ComplianceGenerator(
        message.policyId,
        message.region,
        reportBucket
      );
      const member_accounts = await compGenerator.getMemberAccounts();
      if (member_accounts.length != 0) {
        const compliance_details = await compGenerator.getComplianceDetails(
          member_accounts
        );
        await compGenerator.generateComplianceReports(
          compliance_details.accountCompliance_records,
          compliance_details.resourceViolator_records
        );
      } else {
        logger.warn({
          label: "ComplianceGenerator",
          message: `no member accounts found for policy ${message.policyId} in ${message.region}`,
        });
      }
    } catch (e) {
      logger.warn({
        label: "ComplianceGenerator",
        message: `error generating report for ${message.policyId} in ${message.region} ${e}`,
      });
    }
    logger.info({
      label: "ComplianceGenerator",
      message: `reports generated for ${message.policyId} in ${message.region}`,
    });
  }

  // event triggered by cron schedule
  else if (event.source === "aws.events") {
    const topic_arn = <string>process.env.FMS_TOPIC_ARN;
    const topic_region = <string>process.env.FMS_TOPIC_REGION;

    // list policies and send messages to sns
    const regions = await ComplianceGenerator.getRegions();
    await Promise.allSettled(
      regions.map(async (region) => {
        try {
          const policyList = await ComplianceGenerator.listPolicies(region);
          if (policyList.length === 0)
            logger.warn({
              label: "ComplianceGenerator",
              message: `no policies found in ${region}`,
            });
          else if (policyList.length > 0)
            await Promise.allSettled(
              policyList.map(async (policyId) => {
                await ComplianceGenerator.sendSNS(
                  topic_region,
                  { region, policyId },
                  topic_arn
                );
              })
            );
        } catch (e) {
          logger.warn({
            label: "ComplianceGenerator",
            message: `error publishing sns message in ${region} ${e}`,
          });
        }
      })
    );
  }
};
