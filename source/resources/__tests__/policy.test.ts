// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "@aws-cdk/assert/jest";
import {
  objectLike,
  arrayWith,
  anything,
} from "@aws-cdk/assert/lib/assertions/have-resource-matchers";
import { Stack } from "aws-cdk-lib";
import { PolicyStack } from "../lib/nestedStacks/policy.stack";
import { Template } from "aws-cdk-lib/assertions";
import {
  omitCustomResourceHash,
  omitLambdaHash,
  omitLambdaLayerHash,
} from "./test-utils";

describe("==Policy Stack Tests==", () => {
  const stack = new Stack();
  const policyStack: Stack = new PolicyStack(stack, "PolicyStack", {});

  describe("Policy stack resources", () => {
    test("snapshot test", () => {
      const template = Template.fromStack(policyStack);

      const templateJSON = template.toJSON();
      omitLambdaHash(template, templateJSON);
      omitCustomResourceHash(template, templateJSON);
      omitLambdaLayerHash(template, templateJSON);

      expect(template).toMatchSnapshot();
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
        Runtime: "nodejs18.x",
      });
    });

    test("has cloudwatch log group", () => {
      expect(policyStack).toHaveResource("AWS::Logs::LogGroup", {
        RetentionInDays: 3653,
      });
    });

    test("has cloudwatch log group", () => {
      expect(policyStack).toHaveResource("AWS::Logs::LogGroup", {
        RetentionInDays: 3653,
      });
    });

    test("has policy error log query", () => {
      expect(policyStack).toHaveResource("AWS::Logs::QueryDefinition", {
        Name: "FMS-Policy_Manager_Errors",
      });
    });

    test("has policy create success log query", () => {
      expect(policyStack).toHaveResource("AWS::Logs::QueryDefinition", {
        Name: "FMS-Policy_Manager_Success",
      });
    });

    test("has policy create failure log query", () => {
      expect(policyStack).toHaveResource("AWS::Logs::QueryDefinition", {
        Name: "FMS-Policy_Manager_Create_Failure",
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
