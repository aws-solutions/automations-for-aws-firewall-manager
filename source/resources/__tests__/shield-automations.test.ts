// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "@aws-cdk/assert/jest";
import { App } from "aws-cdk-lib";
import { ShieldAutomationsStack } from "../lib/shieldAutomations/shield-automations.stack";
import { Template } from "aws-cdk-lib/assertions";
import { omitLambdaHash, omitLambdaLayerHash } from "./test-utils";

describe("==ShieldAutomations Stack Tests==", () => {
  const app = new App();
  const shieldAutomationsStack = new ShieldAutomationsStack(
    app,
    "ShieldAutomationsStack",
    {}
  );

  describe("ShieldAutomations stack resources", () => {
    test("snapshot test", () => {
      const template = Template.fromStack(shieldAutomationsStack);

      const templateJSON = template.toJSON();
      omitLambdaHash(template, templateJSON);
      omitLambdaLayerHash(template, templateJSON);

      expect(template).toMatchSnapshot();
    });

    test("has helper, configEval, configRemediate, shieldLayer lambdas", () => {
      expect(shieldAutomationsStack).toCountResources(
        "AWS::Lambda::Function",
        4
      );
    });

    test("has ConfigRuleRemediate lambda", () => {
      expect(shieldAutomationsStack).toHaveResource("AWS::Lambda::Function", {
        Description: {
          "Fn::Join": [
            "",
            [
              {
                "Fn::FindInMap": [
                  "ShieldAutomationsStackMap",
                  "Solution",
                  "SolutionId",
                ],
              },
              " - Function to handle custom remediation for Organization Config Rule",
            ],
          ],
        },
      });
    });

    test("has ConfigRuleEval lambda", () => {
      expect(shieldAutomationsStack).toHaveResource("AWS::Lambda::Function", {
        Description: {
          "Fn::Join": [
            "",
            [
              {
                "Fn::FindInMap": [
                  "ShieldAutomationsStackMap",
                  "Solution",
                  "SolutionId",
                ],
              },
              " - Function to handle custom evaluation for Organization Config Rule",
            ],
          ],
        },
      });
    });

    test("has lambda event source mapping", () => {
      expect(shieldAutomationsStack).toHaveResource(
        "AWS::Lambda::EventSourceMapping"
      );
    });

    test("has organization config rule", () => {
      expect(shieldAutomationsStack).toHaveResource(
        "AWS::Config::OrganizationConfigRule"
      );
    });

    test("has SNS topic", () => {
      expect(shieldAutomationsStack).toHaveResource("AWS::SNS::Topic");
    });

    test("has FIFO SQS queue", () => {
      expect(shieldAutomationsStack).toHaveResource("AWS::SQS::Queue", {
        FifoQueue: true,
      });
    });

    test("has ConfigRuleEval errors log query", () => {
      expect(shieldAutomationsStack).toHaveResource(
        "AWS::Logs::QueryDefinition",
        {
          Name: "FMS-Shield_ConfigRuleEval_Error_Query",
        }
      );
    });

    test("has ConfigRuleRemediate errors log query", () => {
      expect(shieldAutomationsStack).toHaveResource(
        "AWS::Logs::QueryDefinition",
        {
          Name: "FMS-Shield_ConfigRuleRemediate_Error_Query",
        }
      );
    });

    test("has health check create success log query", () => {
      expect(shieldAutomationsStack).toHaveResource(
        "AWS::Logs::QueryDefinition",
        {
          Name: "FMS-Shield_Health_Check_Create_Success_Query",
        }
      );
    });

    test("has remediation success log query", () => {
      expect(shieldAutomationsStack).toHaveResource(
        "AWS::Logs::QueryDefinition",
        {
          Name: "FMS-Shield_Remediation_Success_Query",
        }
      );
    });

    test("has associate health check success log query", () => {
      expect(shieldAutomationsStack).toHaveResource(
        "AWS::Logs::QueryDefinition",
        {
          Name: "FMS-Shield_Associate_Health_Check_Success_Query",
        }
      );
    });
  });

  describe("ShieldAutomations stack outputs", () => {
    test("has output for SNS topic", () => {
      expect(shieldAutomationsStack).toHaveOutput({
        outputName: "ShieldAutomationsSNSTopic",
      });
    });

    test("has output for org config rule", () => {
      expect(shieldAutomationsStack).toHaveOutput({
        outputName: "OrganizationConfigRule",
      });
    });

    test("has output for org config rule", () => {
      expect(shieldAutomationsStack).toHaveOutput({
        outputName: "ConfigRuleEvalLambdaFunction",
      });
    });

    test("has output for org config rule", () => {
      expect(shieldAutomationsStack).toHaveOutput({
        outputName: "ConfigRuleRemediateLambdaFunction",
      });
    });
  });

  describe("ZipMetricConfigs", () => {
    it("zips thresholds and statistics", () => {
      const thresholds = [1, 2, 3];
      const statistics = ["Average", "Sum", "Minimum"];

      const response = shieldAutomationsStack.zipMetricConfigs(
        thresholds,
        statistics
      );
      expect(response).toEqual("1,Average,2,Sum,3,Minimum");
    });
  });
});
