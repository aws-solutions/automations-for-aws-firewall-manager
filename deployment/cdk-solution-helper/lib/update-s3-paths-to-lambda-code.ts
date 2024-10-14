// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CfnTemplate } from "../model/CfnTemplate";

export function updateLambdaS3References(template: CfnTemplate) {
  const lambdaFunctionNames = getResourceNamesOfType(template, [
    "AWS::Lambda::Function",
    "AWS::Lambda::LayerVersion",
  ]);

  lambdaFunctionNames.forEach((lambdaFunction) => {
    const fn = template.Resources[lambdaFunction];

    const assetProperty = fn.Properties.Code
      ? fn.Properties.Code
      : fn.Properties.Content;

    if (assetProperty.hasOwnProperty("S3Bucket")) {
      // Set the S3 key reference
      assetProperty.S3Key = `%%SOLUTION_NAME%%/%%VERSION%%/asset${assetProperty.S3Key}`;
      // Set the S3 bucket reference
      assetProperty.S3Bucket = {
        "Fn::Sub": "%%BUCKET_NAME%%-${AWS::Region}",
      };
    }
  });
}

function getResourceNamesOfType(
  template: CfnTemplate,
  resourceTypes: string[]
): string[] {
  const resources = template.Resources || {};
  return Object.keys(resources).filter((key) =>
    resourceTypes.includes(resources[key].Type)
  );
}
