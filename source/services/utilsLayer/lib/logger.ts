// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 DEBUG	8
 INFO	12
 WARN	16
 ERROR	20
 CRITICAL	24
 SILENT	28
 */

import { Logger } from "@aws-lambda-powertools/logger";
import { LogLevel } from "@aws-lambda-powertools/logger/types";

export const logger = new Logger({
  serviceName: process.env.SERVICE_NAME,
  logLevel: process.env.LOG_LEVEL as LogLevel,
  persistentLogAttributes: {
    solutionId: process.env.SOLUTION_ID,
  },
});
