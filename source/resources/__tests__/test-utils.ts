// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { Template } from "aws-cdk-lib/assertions";

/**
 * Omits the function hash from the template snapshot for testing
 */
export function omitLambdaHash(
  template: Template,
  templateJSON: { [p: string]: any }
) {
  const lambdaResources = template.findResources("AWS::Lambda::Function");

  for (const lambdaFunction in lambdaResources) {
    templateJSON["Resources"][lambdaFunction]["Properties"]["Code"] =
      "Omitted to remove snapshot dependency on code hash";
  }
}

/**
 * Omits the nested stack URL hash from the template snapshot for testing
 */
export function omitNestedStackHash(
  template: Template,
  templateJSON: { [p: string]: any }
) {
  const stackResources = template.findResources("AWS::CloudFormation::Stack");

  for (const nestedStack in stackResources) {
    templateJSON["Resources"][nestedStack]["Properties"]["TemplateURL"] =
      "Omitted to remove snapshot dependency on URL hash";
  }
}

/**
 * Omits the custom resource Create hash from the template snapshot for testing
 */
export function omitCustomResourceHash(
  template: Template,
  templateJSON: { [p: string]: any }
) {
  const customResources = template.findResources("Custom::AWS");

  for (const customResource in customResources) {
    templateJSON["Resources"][customResource]["Properties"]["Create"] =
      "Omitted to remove snapshot dependency on Create hash";
  }
}

/**
 * Omits the Lambda Layer resource S3 hash from the template snapshot for testing
 */
export function omitLambdaLayerHash(
  template: Template,
  templateJSON: { [p: string]: any }
) {
  const lambdaLayerResources = template.findResources(
    "AWS::Lambda::LayerVersion"
  );

  for (const lambdaLayer in lambdaLayerResources) {
    templateJSON["Resources"][lambdaLayer]["Properties"]["Content"]["S3Key"] =
      "Omitted to remove snapshot dependency on S3 hash";
  }
}
