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
