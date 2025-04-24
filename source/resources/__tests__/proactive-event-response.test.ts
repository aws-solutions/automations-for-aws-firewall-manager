// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "@aws-cdk/assert/jest";
import { App } from "aws-cdk-lib";
import { ProactiveEventResponseStack } from "../lib/shieldAutomations/proactive-event-response.stack";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { CfnProactiveEngagement } from "aws-cdk-lib/aws-shield";
import manifest from "../lib/solution_manifest.json";
import { Template } from "aws-cdk-lib/assertions";
import { omitLambdaHash, omitLambdaLayerHash } from "./test-utils";

describe("==Proactive Event Response Stack Tests==", () => {
  const app: App = new App();
  const stack: ProactiveEventResponseStack = new ProactiveEventResponseStack(
    app,
    "ProactiveEventResponseStack"
  );

  describe("Proactive Event Response stack resources", () => {
    test("snapshot test", () => {
      const template = Template.fromStack(stack);

      const templateJSON = template.toJSON();
      omitLambdaHash(template, templateJSON);
      omitLambdaLayerHash(template, templateJSON);

      expect(template).toMatchSnapshot();
    });

    test("has Helper lambda function", () => {
      expect(stack).toCountResources("AWS::Lambda::Function", 2);
    });

    test("lambda function has nodejs22 runtime", () => {
      expect(stack).toHaveResourceLike("AWS::Lambda::Function", {
        Runtime: "nodejs22.x",
      });
    });

    test("lambda function has necessary environment variables", () => {
      const helperLambda = stack.node.findChild(
        "ProactiveEventResponseHelper"
      ) as CfnFunction;
      expect(helperLambda).toHaveProperty("environment", {
        METRICS_ENDPOINT: expect.any(Object),
        SEND_METRIC: expect.any(Object),
        LOG_LEVEL: expect.any(Object),
        USER_AGENT_PREFIX: expect.any(Object),
        SOLUTION_NAME: expect.any(Object),
        SOLUTION_VERSION: expect.any(Object),
        SOLUTION_ID: expect.any(Object),
        SERVICE_NAME: expect.any(Object),
      });
    });

    test("has custom resource for verifying Shield Advanced Subscription", () => {
      expect(stack).toHaveResource("Custom::ShieldSubscriptionCheck");
    });

    test("has custom resource for verifying Support Plan", () => {
      expect(stack).toHaveResource("Custom::SupportPlanCheck");
    });

    test("has resource for enabling Proactive Engagement", () => {
      expect(stack).toHaveResource("AWS::Shield::ProactiveEngagement");

      const proactiveEngagement = stack.node.findChild(
        "ShieldProactiveEngagement"
      ) as CfnProactiveEngagement;
      expect(proactiveEngagement.proactiveEngagementStatus).toEqual("ENABLED");
    });

    test("has IAM role for SRT Access", () => {
      expect(stack).toHaveResourceLike("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Principal: {
                Service: "drt.shield.amazonaws.com",
              },
            },
          ],
          Version: "2012-10-17",
        },
      });
    });

    test("SRT Access Role has necessary service role", () => {
      expect(stack).toHaveResource("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "drt.shield.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            },
          ],
        },
      });
    });

    test("SRT Access Role has necessary policies", () => {
      expect(stack).toHaveResource("AWS::IAM::Role", {
        ManagedPolicyArns: [
          {
            "Fn::Join": [
              "",
              [
                "arn:",
                { Ref: "AWS::Partition" },
                ":iam::aws:policy/" +
                  manifest.proactiveEventResponseStack.srtAccessManagedPolicy,
              ],
            ],
          },
        ],
      });
    });
  });
});
