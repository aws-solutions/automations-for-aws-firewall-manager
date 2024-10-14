// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Automations for AWS Firewall Manager
 * Microservice to generate compliance reports for FMS policies
 * @author aws-solutions
 */

import { logger, tracer } from "solutions-utils";
import { ComplianceGenerator, IMessage } from "./lib/ComplianceGenerator";
import { Context } from "aws-lambda";
import type { LambdaInterface } from "@aws-lambda-powertools/commons/types";

class ComplianceGeneratorLambda implements LambdaInterface {
  @tracer.captureLambdaHandler()
  @logger.injectLambdaContext()
  async handler(
    event: { [key: string]: string | string[] | Record<string, unknown>[] },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: Context
  ): Promise<void> {
    if (
      event.Records &&
      (event.Records[0] as Record<string, unknown>).EventSource === "aws:sns"
    ) {
      await this.handleSNSEvent(event);
    } else if (event.source === "aws.events") {
      await this.handleCronScheduleEvent();
    } else {
      logger.debug("handler received unrecognized event", {
        event: event,
      });
    }
  }

  async handleSNSEvent(event: {
    [key: string]: string | string[] | Record<string, unknown>[];
  }): Promise<void> {
    const reportBucket = <string>process.env.FMS_REPORT_BUCKET;
    const _sns = (event.Records[0] as Record<string, unknown>).Sns;
    const message: IMessage = JSON.parse(
      (_sns as Record<string, unknown>).Message as string
    );

    logger.info("handler received SNS event", {
      region: message.region,
      policyId: message.policyId,
    });

    try {
      const compGenerator = new ComplianceGenerator(
        message.policyId,
        message.region,
        reportBucket
      );
      const member_accounts = await compGenerator.getMemberAccounts();
      if (member_accounts.length != 0) {
        const compliance_details =
          await compGenerator.getComplianceDetails(member_accounts);
        await compGenerator.generateComplianceReports(
          compliance_details.accountCompliance_records,
          compliance_details.resourceViolator_records
        );
      } else {
        logger.warn("no member accounts found for policy", {
          policyId: message.policyId,
          region: message.region,
        });
      }
    } catch (e) {
      logger.error("encountered error while generating report for policy", {
        error: e,
        policyId: message.policyId,
        region: message.region,
      });
    }
  }

  async handleCronScheduleEvent(): Promise<void> {
    logger.info("handler received event triggered by cron schedule");

    const topic_arn = <string>process.env.FMS_TOPIC_ARN;
    const topic_region = <string>process.env.FMS_TOPIC_REGION;

    // list policies and send messages to sns
    const regions = await ComplianceGenerator.getRegions();
    await Promise.allSettled(
      regions.map(async (region) => {
        try {
          const policyList = await ComplianceGenerator.listPolicies(region);
          if (policyList.length === 0)
            logger.info("no policies found in region", {
              region: region,
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
          logger.error("encountered error sending policies to SNS", {
            error: e,
            region: region,
          });
        }
      })
    );
  }
}

const handlerClass = new ComplianceGeneratorLambda();
export const handler = handlerClass.handler.bind(handlerClass);
