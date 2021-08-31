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
import { PreReqStack } from "../lib/prereq";
import { App } from "@aws-cdk/core";

describe("==Pre-requisite Stack Tests==", () => {
  const app = new App();
  const stack = new PreReqStack(app, "PreReqStack");

  describe("Pre-requisite stack resources", () => {
    test("has helper, pre-req and provider lambda functions", () => {
      expect(stack).toCountResources("AWS::Lambda::Function", 4);
    });
    test("lambda function has nodejs12 runtime", () => {
      expect(stack).toHaveResourceLike("AWS::Lambda::Function", {
        Runtime: "nodejs14.x",
      });
    });
    test("has custom resource for launch", () => {
      expect(stack).toHaveResource("Custom::LaunchData");
    });
    test("has custom resource for UUID", () => {
      expect(stack).toHaveResource("Custom::CreateUUID");
    });
    test("has custom resource for UUID", () => {
      expect(stack).toHaveResource("Custom::PreReqChecker");
    });
  });

  describe("Pre-requisite stack outputs", () => {
    test("has output for UUID", () => {
      expect(stack).toHaveOutput({
        outputName: "UUID",
        outputValue: {
          "Fn::GetAtt": ["CreateUUID", "UUID"],
        },
      });
    });
  });
});
