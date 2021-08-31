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
import {
  objectLike,
  arrayWith,
  anything,
} from "@aws-cdk/assert/lib/assertions/have-resource-matchers";
import { Stack } from "@aws-cdk/core";
import { PolicyStack } from "../lib/policy";

describe("==Policy Stack Tests==", () => {
  const stack = new Stack();
  const policyStack: Stack = new PolicyStack(stack, "PolicyStack", {});

  describe("Policy stack resources", () => {
    test("snapshot test", () => {
      expect(policyStack).toMatchSnapshot();
    });
    test("has 3 SSM parameters for region, OUs, tags", () => {
      expect(policyStack).toCountResources("AWS::SSM::Parameter", 3);
    });
    test("has lambda with dead letter queue", () => {
      expect(policyStack).toHaveResource("AWS::SQS::Queue");
      expect(policyStack).toHaveResourceLike("AWS::Lambda::Function", {
        DeadLetterConfig: objectLike({ TargetArn: objectLike(anything) }),
      });
    });
    test("has events rule for ssm parameter change", () => {
      expect(policyStack).toHaveResourceLike("AWS::Events::Rule", {
        EventPattern: objectLike({
          source: arrayWith("aws.ssm"),
          "detail-type": arrayWith("Parameter Store Change"),
        }),
      });
    });
    test("has policy manager lambda function", () => {
      expect(policyStack).toHaveResource("AWS::Lambda::Function", {
        Runtime: "nodejs12.x",
      });
    });
    test("has cloudwatch log group", () => {
      expect(policyStack).toHaveResource("AWS::Logs::LogGroup", {
        RetentionInDays: 7,
      });
    });
  });

  describe("Policy stack outputs", () => {
    test("has output for policy manifest bucket", () => {
      expect(policyStack).toHaveOutput({
        outputName: "PolicyManifestBucket",
      });
    });
  });
});
