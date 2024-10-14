// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import got from "got";
import { logger } from "./logger";

/**
 * @description interface for metrics
 */
export interface IMetric {
  Solution: string;
  UUID: string;
  TimeStamp: string;
  Data: { [key: string]: string | number };
}

export async function sendAnonymizedMetric(metric: IMetric) {
  if (!process.env.METRICS_ENDPOINT) {
    logger.warn("no metrics endpoint provided");
    return;
  }

  const endpoint = process.env.METRICS_ENDPOINT;

  try {
    await got.post(endpoint, {
      port: 443,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "" + JSON.stringify(metric).length,
      },
      body: JSON.stringify(metric),
    });
    logger.info("metric sent successfully");
  } catch (error) {
    logger.warn("error occurred while sending metric", {
      error,
      metric,
    });
  }
}
