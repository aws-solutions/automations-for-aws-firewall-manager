// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "@aws-cdk/assert/jest";
import { PreReqStack } from "../lib/prereq.stack";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { omitLambdaHash, omitLambdaLayerHash } from "./test-utils";

describe("==Pre-requisite Stack Tests==", () => {
  const app = new App();
  const stack = new PreReqStack(app, "PreReqStack");

  describe("Pre-requisite stack resources", () => {
    test("snapshot test", () => {
      const template = Template.fromStack(stack);

      const templateJSON = template.toJSON();
      omitLambdaHash(template, templateJSON);
      omitLambdaLayerHash(template, templateJSON);

      expect(template).toMatchSnapshot();
    });

    test("has helper, pre-req and provider lambda functions", () => {
      expect(stack).toCountResources("AWS::Lambda::Function", 4);
    });

    test("lambda function has nodejs18 runtime", () => {
      expect(stack).toHaveResourceLike("AWS::Lambda::Function", {
        Runtime: "nodejs18.x",
      });
    });

    test("has custom resource for PreReqChecker", () => {
      expect(stack).toHaveResource("Custom::PreReqChecker");
    });
  });
});
