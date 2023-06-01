// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { logger } from "../logger/index";

/**
 * Send metrics to solutions queueUrl
 * @class Metrics
 */
export class Metrics {
  /**
   * Sends anonymized metric
   * @param {string} queueURL - sqs queue URL
   * @param {object} metric - metric JSON data
   */
  static sendAnonymousMetric = async (
    queueUrl: string,
    metric: {
      Solution: string;
      UUID: string;
      TimeStamp: string;
      Data: { [key: string]: string };
    }
  ): Promise<void> => {
    logger.debug({
      label: "metrics/sendAnonymousMetric",
      message: `metrics queueUrl: ${queueUrl}, sending metric:${JSON.stringify(
        metric
      )}`,
    });
    const sqs = new SQSClient({});
    try {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(metric),
        })
      );
      logger.info({
        label: "metrics/sendAnonymousMetric",
        message: `metric sent to queue`,
      });
    } catch (error) {
      logger.warn({
        label: "metrics/sendAnonymousMetric",
        message: `Error sending metric: ${error.message}`,
      });
    }
  };
}
