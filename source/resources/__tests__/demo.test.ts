// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "@aws-cdk/assert/jest";
import { Stack, App } from "aws-cdk-lib";
import { DemoStack } from "../lib/demo.stack";
import { Template } from "aws-cdk-lib/assertions";

describe("==Policy Stack Tests==", () => {
  const app = new App();
  const demoStack: Stack = new DemoStack(app, "DemoStack");

  describe("Demo stack resources", () => {
    test("snapshot test", () => {
      const template = Template.fromStack(demoStack);
      expect(template).toMatchSnapshot();
    });

    test("has cloudfront distribution for test", () => {
      expect(demoStack).toHaveResource("AWS::CloudFront::Distribution");
    });

    test("has vpc for test", () => {
      expect(demoStack).toHaveResource("AWS::EC2::VPC");
    });
  });
});
