/**
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import {
  objectLike,
  arrayWith,
  anything,
} from "@aws-cdk/assert/lib/assertions/have-resource-matchers";
import { FMSStack } from "../lib/fms";
import { Stack } from "@aws-cdk/core";

describe("==FMS Stack Tests==", () => {
  const mstack = new Stack();
  const stack: Stack = new FMSStack(mstack, "FMSStack");

  describe("Test resources", () => {
    test("snapshot test", () => {
      expect(stack).toMatchSnapshot();
    });
    test("has 3 SSM paramters for region, OUs, tags", () => {
      expect(stack).toCountResources("AWS::SSM::Parameter", 3);
    });
    test("has lambda with dead letter queue", () => {
      expect(stack).toHaveResource("AWS::SQS::Queue");
      expect(stack).toHaveResourceLike("AWS::Lambda::Function", {
        DeadLetterConfig: objectLike({ TargetArn: objectLike(anything) }),
      });
    });
    test("has events rule for ssm parameter change", () => {
      expect(stack).toHaveResourceLike("AWS::Events::Rule", {
        EventPattern: objectLike({
          source: arrayWith("aws.ssm"),
          "detail-type": arrayWith("Parameter Store Change"),
        }),
      });
    });
    test("has policy manager lambda function", () => {
      expect(stack).toHaveResource("AWS::Lambda::Function", {
        Runtime: "nodejs12.x",
      });
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
    test("has cloudwatch log group", () => {
      expect(stack).toHaveResource("AWS::Logs::LogGroup", {
        RetentionInDays: 7,
      });
    });
  });
});
