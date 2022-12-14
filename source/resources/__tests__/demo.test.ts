// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "@aws-cdk/assert/jest";
import { Stack, App } from "@aws-cdk/core";
import { DemoStack } from "../lib/demo";

describe("==Policy Stack Tests==", () => {
  const app = new App();
  const demoStack: Stack = new DemoStack(app, "DemoStack");

  describe("Demo stack resources", () => {
    test("snapshot test", () => {
      expect(demoStack).toMatchSnapshot();
    });

    test("has cloudfront distribution for test", () => {
      expect(demoStack).toHaveResource("AWS::CloudFront::Distribution");
    });

    test("has vpc for test", () => {
      expect(demoStack).toHaveResource("AWS::EC2::VPC");
    });
  });
});
