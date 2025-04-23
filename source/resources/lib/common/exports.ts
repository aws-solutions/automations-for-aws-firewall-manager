// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Runtime } from "aws-cdk-lib/aws-lambda";

export enum LOG_LEVEL {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

export const PolicyIdentifiers = [
  "DefaultPolicy",
  /**  add more for custom policies
   * @example
   * "CustomPolicy-01"
   */
];

export const LAMBDA_RUNTIME_NODE = Runtime.NODEJS_22_X;
