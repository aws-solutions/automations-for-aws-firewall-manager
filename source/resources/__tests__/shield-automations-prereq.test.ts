// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "@aws-cdk/assert/jest";
import { App, Stack } from "aws-cdk-lib";
import { ShieldAutomationsPrereqStack } from "../lib/shieldAutomations/shield-automations-prereq.stack";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { Template } from "aws-cdk-lib/assertions";
import { omitLambdaHash, omitLambdaLayerHash } from "./test-utils";

describe("==ShieldAutomationsPrereq Stack Tests==", () => {
  const app: App = new App();
  const stack: Stack = new ShieldAutomationsPrereqStack(
    app,
    "ShieldAutomationsPrereqStack"
  );

  describe("ShieldAutomationsPrereqStack resources", () => {
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

    test("lambda function has nodejs18 runtime", () => {
      expect(stack).toHaveResourceLike("AWS::Lambda::Function", {
        Runtime: "nodejs18.x",
      });
    });

    test("lambda function has necessary environment variables", () => {
      const helperLambda = stack.node.findChild(
        "ShieldAutomationsPrereqHelper"
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

    test("has cross-account IAM role for ConfigRuleEval lambda", () => {
      expect(stack).toHaveResource("AWS::IAM::Role", {
        RoleName: {
          "Fn::FindInMap": [
            "ShieldAutomationsPrereqStackMap",
            "ShieldAutomationsPrereq",
            "ConfigRuleEvalCrossAccountRole",
          ],
        },
      });
    });

    test("has cross-account IAM role for ConfigRuleRemediate lambda", () => {
      expect(stack).toHaveResource("AWS::IAM::Role", {
        RoleName: {
          "Fn::FindInMap": [
            "ShieldAutomationsPrereqStackMap",
            "ShieldAutomationsPrereq",
            "ConfigRuleRemediateCrossAccountRole",
          ],
        },
      });
    });
  });

  describe("ShieldAutomationsPrereqStack IAM permissions", () => {
    test("has necessary policies for ConfigRuleEval lambda", () => {
      expect(stack).toHaveResourceLike("AWS::IAM::Policy", {
        PolicyName: {
          "Fn::FindInMap": [
            "ShieldAutomationsPrereqStackMap",
            "ShieldAutomationsPrereq",
            "ConfigRuleEvalCrossAccountPolicy",
          ],
        },
      });
    });

    test("has necessary policies for ConfigRuleRemediate lambda", () => {
      expect(stack).toHaveResourceLike("AWS::IAM::Policy", {
        PolicyName: {
          "Fn::FindInMap": [
            "ShieldAutomationsPrereqStackMap",
            "ShieldAutomationsPrereq",
            "ConfigRuleRemediateCrossAccountPolicy",
          ],
        },
      });
    });
  });
});
