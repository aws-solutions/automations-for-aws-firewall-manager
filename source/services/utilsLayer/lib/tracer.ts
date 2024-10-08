// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Tracer } from "@aws-lambda-powertools/tracer";

export const tracer = new Tracer({ serviceName: process.env.SERVICE_NAME });
