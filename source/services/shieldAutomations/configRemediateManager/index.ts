// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Automations for AWS Firewall Manager
 * Shield Automations Microservice to perform resource evaluations
 * for the Organization Config Rule
 * @author aws-solutions
 */

import { logger } from "solutions-utils";
import { ShieldHandler } from "/opt/nodejs/lib/ShieldHandler";
import { Tracer } from "@aws-lambda-powertools/tracer";
import type { LambdaInterface } from "@aws-lambda-powertools/commons/types";
import {
  BatchProcessor,
  EventType,
  processPartialResponse,
} from "@aws-lambda-powertools/batch";
import { Context, SQSEvent, SQSRecord } from "aws-lambda";
import {
  getSNSErrorMessageBody,
  ShieldValidatorResponse,
  RemediationRequest,
  SNS_INCOMPLETE_EIP_REASON,
  SNS_REMEDIATION_ERROR_SUBJECT,
} from "/opt/nodejs/lib/CommonExports";
import { Protection } from "@aws-sdk/client-shield";
import { AssumeRoleCommand, Credentials, STSClient } from "@aws-sdk/client-sts";
import { ShieldRemediator } from "./lib/ShieldRemediator";

export const tracer: Tracer = new Tracer({
  serviceName: "FMS-Shield-ConfigRemediateLambda",
});

const processor = new BatchProcessor(EventType.SQS);

export class ConfigRemediateManager implements LambdaInterface {
  /**
   * The Dataplane of this lambda function.
   */
  public static region = <string>process.env.AWS_REGION;

  @tracer.captureLambdaHandler()
  @logger.injectLambdaContext()
  public async handler(event: SQSEvent, context: Context) {
    return processPartialResponse(
      event,
      ConfigRemediateManager.remediationRecordHandler,
      processor,
      {
        context,
      }
    );
  }

  static async remediationRecordHandler(
    remediationRecord: SQSRecord
  ): Promise<void> {
    const subsegment = tracer
      .getSegment()
      ?.addNewSubsegment("/remediationRecordHandler");
    subsegment?.addAnnotation("messageId", remediationRecord.messageId);

    const remediationRequest: RemediationRequest = JSON.parse(
      remediationRecord.body
    );

    const timestamp: string = remediationRequest.timestamp;
    const shieldProtectionId: string = remediationRequest.shieldProtectionId;
    const accountId: string = remediationRequest.accountId;
    logger.info(`Received remediation request ${remediationRecord.messageId}`, {
      shieldProtectionId: shieldProtectionId,
      accountId: accountId,
      timestamp: timestamp,
    });

    let assumedCredentials: Credentials;
    try {
      assumedCredentials = await ConfigRemediateManager.assumeCrossAccountRole(
        accountId
      );
    } catch (e) {
      logger.warn(
        `Unable to assume credentials is account ${accountId}, please ensure the shield automations prerequisite stack is deployed in the account.`
      );
      return;
    }

    const shieldHandler = new ShieldHandler(assumedCredentials, tracer, logger);

    let shieldValidatorResponse: ShieldValidatorResponse;
    let shieldProtectionDetails: Protection;
    let isCompliant: boolean;
    try {
      shieldProtectionDetails = await shieldHandler.getShieldProtectionDetails(
        shieldProtectionId
      );

      shieldValidatorResponse = await shieldHandler.isValid(
        shieldProtectionDetails
      );
      isCompliant = shieldHandler.isCompliant(shieldProtectionDetails);
    } catch (e) {
      logger.error(
        `Error occurred while retrieving Shield Protection details for protection ${shieldProtectionId}.`,
        {
          error: e,
          shieldProtectionId: shieldProtectionId,
        }
      );
      return;
    }

    if (shieldValidatorResponse.isIncompleteEIP) {
      // An EIP is NON_COMPLIANT by default until it is attached to an instance or Network Load Balancer.
      await shieldHandler.publishShieldTopicMessage(
        SNS_REMEDIATION_ERROR_SUBJECT,
        getSNSErrorMessageBody(
          accountId,
          shieldProtectionId,
          SNS_INCOMPLETE_EIP_REASON
        )
      );
    } else if (!shieldValidatorResponse.isValid) {
      logger.debug(
        `Received remediation request for unsupported protected resource type.`,
        {
          shieldProtectionId: shieldProtectionId,
          protectedResource: shieldProtectionDetails.ResourceArn,
        }
      );
      return;
    } else if (isCompliant) {
      logger.info(`Shield Protection is already compliant.`, {
        shieldProtectionId: shieldProtectionId,
        HealthCheckIds: shieldProtectionDetails.HealthCheckIds,
      });
      return;
    } else {
      const shieldRemediator = new ShieldRemediator(
        shieldHandler,
        shieldProtectionDetails,
        ConfigRemediateManager.region,
        accountId
      );
      await shieldRemediator.executeRemediation(assumedCredentials);
      logger.info(
        `Remediation successful for Shield Protection ${shieldProtectionId}`,
        {
          shieldProtectionAccountId: accountId,
        }
      );
    }
    subsegment?.close();
  }

  /**
   * Assumes the cross-account role for Config Remediation.
   */
  static async assumeCrossAccountRole(accountId: string): Promise<Credentials> {
    const crossAccountRole = process.env.CROSS_ACCOUNT_ROLE;
    const partition = process.env.PARTITION;
    const crossAccountRoleArn = `arn:${partition}:iam::${accountId}:role/${crossAccountRole}`;

    const stsClient = tracer.captureAWSv3Client(new STSClient({}));

    const assumeCommand = new AssumeRoleCommand({
      RoleArn: crossAccountRoleArn,
      RoleSessionName: "FMS-Shield-ConfigRemediateManager",
      DurationSeconds: 900,
    });

    const response = await stsClient.send(assumeCommand);
    if (
      !response.Credentials ||
      !response.Credentials.AccessKeyId ||
      !response.Credentials.SecretAccessKey
    ) {
      logger.debug("AssumeRoleCommand returned undefined credentials", {
        RequestId: response.$metadata?.requestId,
      });
      throw new Error(
        "STS Client returned undefined credentials when assuming cross account role."
      );
    }

    logger.info("assumed cross account role", {
      crossAccountRole: crossAccountRole,
    });
    return response.Credentials;
  }
}

const handlerClass = new ConfigRemediateManager();
export const handler = handlerClass.handler.bind(handlerClass);
