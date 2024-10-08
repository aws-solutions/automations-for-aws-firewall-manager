// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { App, DefaultStackSynthesizer } from "aws-cdk-lib";
import { PreReqStack } from "../lib/prereq.stack";
import { DemoStack } from "../lib/demo.stack";
import { FirewallManagerAutomationsStack } from "../lib/aws-fms-automations.stack";
import { ShieldAutomationsPrereqStack } from "../lib/shieldAutomations/shield-automations-prereq.stack";
import { ProactiveEventResponseStack } from "../lib/shieldAutomations/proactive-event-response.stack";
import { ShieldAutomationsStack } from "../lib/shieldAutomations/shield-automations.stack";

const app = new App();

// Prerequisite stack
new PreReqStack(app, "PreReqStack", {
  analyticsReporting: false, // CDK::Metadata breaks deployment in some regions
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});

// Common resource stack with nested default policy stack
new FirewallManagerAutomationsStack(app, "CommonResourceStack", {
  analyticsReporting: false, // CDK::Metadata breaks deployment in some regions
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});

// Shield Automations Prerequisite Stack
new ShieldAutomationsPrereqStack(app, "ShieldAutomationsPrereqStack", {
  analyticsReporting: false, // CDK::Metadata breaks deployment in some regions
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});

// Shield Automations Prerequisite Stack
new ShieldAutomationsStack(app, "ShieldAutomationsStack", {
  analyticsReporting: false, // CDK::Metadata breaks deployment in some regions
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});

// Proactive Event Response stack
new ProactiveEventResponseStack(app, "ProactiveEventResponseStack", {
  analyticsReporting: false, // CDK::Metadata breaks deployment in some regions
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
