// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { UserAgent, UserAgentPair } from "@aws-sdk/types";

const userAgentPair : UserAgentPair = [`${process.env.USER_AGENT_PREFIX}/${process.env.SOLUTION_ID}`, `${process.env.SOLUTION_VERSION}`]
export const customUserAgent : UserAgent = [userAgentPair];
export const dataplane = "us-east-1";
