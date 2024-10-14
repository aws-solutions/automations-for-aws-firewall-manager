// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "@aws-cdk/assert/jest";
import { App, Stack } from "aws-cdk-lib";
import { FirewallManagerAutomationsStack } from "../lib/aws-fms-automations.stack";
import { Template } from "aws-cdk-lib/assertions";
import {
  omitLambdaHash,
  omitLambdaLayerHash,
  omitNestedStackHash,
} from "./test-utils";

describe("==Firewall Manager Automations Stack Tests==", () => {
  const app = new App();
  const stack: Stack = new FirewallManagerAutomationsStack(app, "CommonStack");

  describe("Firewall Manager Automations stack resources", () => {
    test("snapshot test", () => {
      const template = Template.fromStack(stack);

      const templateJSON = template.toJSON();
      omitLambdaHash(template, templateJSON);
      omitNestedStackHash(template, templateJSON);
      omitLambdaLayerHash(template, templateJSON);

      expect(templateJSON).toMatchSnapshot();
    });
    test("has policy dynamodb table", () => {
      expect(stack).toHaveResource("AWS::DynamoDB::Table", {
        SSESpecification: {
          SSEEnabled: true,
        },
      });
    });
    test("has dynamodb table with given schema", () => {
      expect(stack).toHaveResource("AWS::DynamoDB::Table", {
        KeySchema: [
          {
            AttributeName: "PolicyName",
            KeyType: "HASH",
          },
          {
            AttributeName: "Region",
            KeyType: "RANGE",
          },
        ],
        AttributeDefinitions: [
          {
            AttributeName: "PolicyName",
            AttributeType: "S",
          },
          {
            AttributeName: "Region",
            AttributeType: "S",
          },
        ],
      });
    });
  });

  describe("Firewall Manager Automations stack outputs", () => {
    test("has output for UUID", () => {
      expect(stack).toHaveOutput({
        outputName: "UUID",
      });
    });
    test("has output for DynamoDB table", () => {
      expect(stack).toHaveOutput({
        outputName: "PolicyTable",
      });
    });
    test("has output for compliance reporting", () => {
      expect(stack).toHaveOutput({
        outputName: "ComplianceReporting",
      });
    });
  });
});
