// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

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
    test("lambda function has nodejs16 runtime", () => {
      expect(stack).toHaveResourceLike("AWS::Lambda::Function", {
        Runtime: "nodejs16.x",
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
