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
/**
 * @description
 * AWS Centralized WAF & Security Group Management
 * Microservice to publish metrics to aws-solutions
 * @author aws-solutions
 */

import got from "got";
import moment from "moment";
import { logger } from "./logger";
interface IEvent {
  Records: [
    {
      messageId: string;
      receiptHandle: string;
      body: string;
      attributes: any;
      messageAttributes: any;
      md5OfBody: string;
      eventSource: "aws:sqs";
      eventSourceARN: string;
      awsRegion: string;
    }
  ];
}
exports.handler = async (event: IEvent) => {
  logger.debug({
    label: "metricsManager",
    message: `received event: ${JSON.stringify(event)}`,
  });
  const endpoint = <string>process.env.METRICS_ENDPOINT;
  const message = event.Records;
  const _message = JSON.parse(message[0].body);
  await delay(1000); // sleep for 1s
  _message.TimeStamp = moment.utc().format("YYYY-MM-DD HH:mm:ss.S");
  try {
    await got(endpoint, {
      port: 443,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "" + JSON.stringify(_message).length,
      },
      body: JSON.stringify(_message),
    });
    logger.info({
      label: "metricsManager",
      message: `metric sent successfully`,
    });
  } catch (error) {
    logger.warn({
      label: "metricsManager",
      message: `Error occurred while sending metric: ${error.message}`,
    });
  }
};

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
