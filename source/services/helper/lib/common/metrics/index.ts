// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import got from "got";
import { logger } from "../logger/index";
/**
 * Send metrics to solutions endpoint
 * @class Metrics
 */
export class Metrics {
  /**
   * Sends anonymous metric
   * @param {object} metric - metric JSON data
   */
  static sendAnonymousMetric = async (
    endpoint: string,
    metric: {
      Solution: string;
      UUID: string;
      TimeStamp: string;
      Data: { [key: string]: string };
    }
  ): Promise<string> => {
    logger.debug({
      label: "metrics/sendAnonymousMetric",
      message: `metrics endpoint: ${endpoint}`,
    });
    logger.debug({
      label: "metrics/sendAnonymousMetric",
      message: `sending metric:${JSON.stringify(metric)}`,
    });
    try {
      await got(endpoint, {
        port: 443,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "" + JSON.stringify(metric).length,
        },
        body: JSON.stringify(metric),
      });
      logger.info({
        label: "metrics/sendAnonymousMetric",
        message: `metric sent successfully`,
      });
      return `Metric sent: ${JSON.stringify(metric)}`;
    } catch (error) {
      logger.warn({
        label: "metrics/sendAnonymousMetric",
        message: `Error occurred while sending metric: ${JSON.stringify(
          error
        )}`,
      });
      return `Error occurred while sending metric`;
    }
  };
}
