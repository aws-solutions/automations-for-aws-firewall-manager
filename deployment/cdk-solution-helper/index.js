/**
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

// Imports
const fs = require("fs");

// Paths
const global_s3_assets = "../global-s3-assets";

// For each template in global_s3_assets ...
fs.readdirSync(global_s3_assets).forEach((file) => {
  // Import and parse template file
  const raw_template = fs.readFileSync(`${global_s3_assets}/${file}`);
  let template = JSON.parse(raw_template);

  // Clean-up Lambda function code dependencies
  const resources = template.Resources ? template.Resources : {};
  const lambdaFunctions = Object.keys(resources).filter(function (key) {
    return resources[key].Type === "AWS::Lambda::Function";
  });
  lambdaFunctions.forEach(function (f) {
    const fn = template.Resources[f];
    if (fn.Properties.Code.hasOwnProperty("S3Bucket")) {
      // Set the S3 key reference
      let artifactHash = Object.assign(fn.Properties.Code.S3Bucket.Ref);
      if (
        file === "aws-fms-policy.template" ||
        file === "aws-fms-compliance.template"
      ) {
        artifactHash = artifactHash.replace(
          "referencetoCommonResourceStackAssetParameters",
          ""
        );
      } else {
        artifactHash = artifactHash.replace("AssetParameters", "");
      }
      artifactHash = artifactHash.substring(
        0,
        artifactHash.indexOf("S3Bucket")
      );
      const assetPath = `asset${artifactHash}`;
      fn.Properties.Code.S3Key = `%%SOLUTION_NAME%%/%%VERSION%%/${assetPath}.zip`;
      // Set the S3 bucket reference
      fn.Properties.Code.S3Bucket = {
        "Fn::Sub": "%%BUCKET_NAME%%-${AWS::Region}",
      };
    }
  });

  // Nested Stack clean-up
  if (file === "aws-fms-automations.template") {
    const nestedStack = Object.keys(resources).filter(function (key) {
      return resources[key].Type === "AWS::CloudFormation::Stack";
    });
    // Cleaning up Compliance Stack
    template.Resources["ComplianceStack"] = template.Resources[nestedStack[0]];
    delete template.Resources[nestedStack[0]];
    template.Resources[
      "ComplianceStack"
    ].Properties.TemplateURL = `https://%%TEMPLATE_BUCKET%%.s3.amazonaws.com/%%SOLUTION_NAME%%/%%VERSION%%/aws-fms-compliance.template`;
    Object.keys(
      template.Resources["ComplianceStack"].Properties.Parameters
    ).forEach((parameterKey) => {
      if (parameterKey != "UUID" && parameterKey != "MetricsQueue") {
        delete template.Resources["ComplianceStack"].Properties.Parameters[
          parameterKey
        ];
      }
    });

    // Cleaning up Policy Stack
    template.Resources["PolicyStack"] = template.Resources[nestedStack[1]];
    delete template.Resources[nestedStack[1]];
    template.Resources[
      "PolicyStack"
    ].Properties.TemplateURL = `https://%%TEMPLATE_BUCKET%%.s3.amazonaws.com/%%SOLUTION_NAME%%/%%VERSION%%/aws-fms-policy.template`;
    Object.keys(
      template.Resources["PolicyStack"].Properties.Parameters
    ).forEach((parameterKey) => {
      if (
        parameterKey != "PolicyTable" &&
        parameterKey != "UUID" &&
        parameterKey != "MetricsQueue" &&
        parameterKey != "PolicyIdentifier"
      ) {
        delete template.Resources["PolicyStack"].Properties.Parameters[
          parameterKey
        ];
      }
    });
  }

  // adding cfn_nag here, due to
  // reference: https://github.com/aws/aws-cdk/issues/15611
  if (file === "aws-fms-policy.template") {
    const lambdas = Object.keys(resources).filter(function (key) {
      return resources[key].Type === "AWS::Lambda::Function";
    });
    lambdas.forEach((functionKey) => {
      template.Resources[functionKey].Metadata = {
        cfn_nag: {
          rules_to_suppress: [
            {
              id: "W58",
              reason:
                "CloudWatch logs write permissions added with managed role AWSLambdaBasicExecutionRole",
            },
            {
              id: "W89",
              reason:
                "Not a valid use case for Lambda functions to be deployed inside a VPC",
            },
            {
              id: "W92",
              reason: "Lambda ReservedConcurrentExecutions not needed",
            },
          ],
        },
      };
    });
  }

  // Clean-up parameters section
  const parameters = template.Parameters ? template.Parameters : {};
  const assetParameters = Object.keys(parameters).filter(function (key) {
    return key.includes("AssetParameters");
  });
  assetParameters.forEach(function (a) {
    template.Parameters[a] = undefined;
  });

  // Output modified template file
  const output_template = JSON.stringify(template, null, 2);
  fs.writeFileSync(`${global_s3_assets}/${file}`, output_template);
});
