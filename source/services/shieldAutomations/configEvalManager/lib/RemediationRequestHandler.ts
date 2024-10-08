// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { logger } from "solutions-utils";
import { tracer } from "../index";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { RemediationRequest } from "/opt/nodejs/lib/CommonExports";

export class RemediationRequestHandler {
  /**
   * @description AWS Account where the ShieldProtection resides
   * @private
   */
  private readonly accountId: string;

  /**
   * @description Remediate Queue URL where remediation requests are sent.
   */
  private readonly queueUrl = <string>process.env.REMEDIATION_QUEUE;

  /**
   * @description Remediate Queue URL where remediation requests are sent.
   * This value must remain constant to enforce strict concurrency of 1.
   */
  private readonly messageGroupId: string = "FMS-Shield-Remediation";

  private sqsClient: SQSClient;

  constructor(accountId: string) {
    this.accountId = accountId;

    this.sqsClient = tracer.captureAWSv3Client(new SQSClient({}));
  }

  /**
   * @description Sends remediation request to remediate SQS Queue.
   */
  async sendRemediationRequest(request: string): Promise<void> {
    const sendMessageCommand = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: request,
      MessageGroupId: this.messageGroupId,
    });

    const sendMessageResponse = await this.sqsClient.send(sendMessageCommand);
    logger.info("Remediation message sent", {
      messageId: sendMessageResponse.MessageId,
      MessageBody: request,
    });
  }

  /**
   * @description Builds remediation request for Shield Protection `shieldProtectionId`.
   */
  buildRemediationRequest(
    shieldProtectionId: string,
    resultToken: string
  ): string {
    const request: RemediationRequest = {
      accountId: this.accountId,
      shieldProtectionId: shieldProtectionId,
      resultToken: resultToken,
      timestamp: new Date().toISOString(),
    };
    return JSON.stringify(request);
  }
}
