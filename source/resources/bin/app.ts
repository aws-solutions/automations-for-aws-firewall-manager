// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { App, DefaultStackSynthesizer } from "aws-cdk-lib";
import { PreReqStack } from "../lib/prereq";
import { DemoStack } from "../lib/demo";
import { CommonResourceStack } from "../lib/common";
const app = new App();

// Prerequisite stack
new PreReqStack(app, "PreReqStack", {
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});

// Common resource stack with nested default policy stack
new CommonResourceStack(app, "CommonResourceStack", {
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});

// Demo Stack
new DemoStack(app, "DemoStack", {
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
