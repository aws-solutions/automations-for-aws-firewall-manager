/**
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { SQS } from "aws-sdk";
import { logger } from "../logger/index";
import clientConfig from "../../clientConfig.json";

/**
 * Send metrics to solutions queueUrl
 * @class Metrics
 */
export class Metrics {
  /**
   * Sends anonymous metric
   * @param {string} queueURL - sqs queue URL
   * @param {object} metric - metric JSON data
   */
  static async sendAnonymousMetric(queueUrl: string, metric: any) {
    logger.debug({
      label: "metrics/sendAnonymousMetric",
      message: `metrics queueUrl: ${queueUrl}, sending metric:${JSON.stringify(
        metric
      )}`,
    });
    const sqs = new SQS({ apiVersion: clientConfig.sqs });
    try {
      await sqs
        .sendMessage({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(metric),
        })
        .promise();
      logger.info({
        label: "metrics/sendAnonymousMetric",
        message: `metric sent to queue`,
      });
    } catch (error) {
      logger.warn({
        label: "metrics/sendAnonymousMetric",
        message: `Error sending metric: ${error.messsage}`,
      });
    }
  }
}
