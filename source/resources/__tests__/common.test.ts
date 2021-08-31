/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import "@aws-cdk/assert/jest";
import { App, Stack } from "@aws-cdk/core";
import { CommonResourceStack } from "../lib/common";

describe("==Common Resources Stack Tests==", () => {
  const app = new App();
  const stack: Stack = new CommonResourceStack(app, "CommonStack");

  describe("Common stack resources", () => {
    test("snapshot test", () => {
      expect(stack).toMatchSnapshot();
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

  describe("Common stack outputs", () => {
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
    test("has output for metrics queue", () => {
      expect(stack).toHaveOutput({
        outputName: "MetricsSQSQueue",
      });
    });
  });
});
