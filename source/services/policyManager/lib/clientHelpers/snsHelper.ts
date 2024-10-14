// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { customUserAgent } from "../exports";
import { logger, tracer } from "solutions-utils";

export class SNSHelper {
  private readonly client: SNSClient;

  constructor() {
    this.client = tracer.captureAWSv3Client(
      new SNSClient({
        customUserAgent: customUserAgent,
      })
    );
  }

  async publishMessage(
    topicArn: string,
    subject: string,
    message: string
  ): Promise<void> {
    const publishCommand = new PublishCommand({
      TopicArn: topicArn,
      Message: message,
      Subject: subject,
    });

    try {
      await this.client.send(publishCommand);
    } catch (e) {
      logger.error(`Error publishing message to SNS Topic ${topicArn}`, {
        error: e,
        message: message,
        requestId: e.$metadata?.requestId,
      });
    }
  }
}
