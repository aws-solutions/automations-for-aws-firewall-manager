// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CfnTemplate } from "../model/CfnTemplate";

interface NestedStackProperties {
  name: string;
  templateName: string;
}

export function updateComplianceStackNameAndS3Reference(template: CfnTemplate) {
  const nestedStackProperties = {
    name: "ComplianceStack",
    templateName: "aws-fms-compliance",
  };

  updateNestedStackNameAndS3Reference(template, nestedStackProperties);
}

export function updatePolicyStackNameAndS3Reference(template: CfnTemplate) {
  const nestedStackProperties = {
    name: "PolicyStack",
    templateName: "aws-fms-policy",
  };

  updateNestedStackNameAndS3Reference(template, nestedStackProperties);
}

function updateNestedStackNameAndS3Reference(
  template: CfnTemplate,
  properties: NestedStackProperties
) {
  const resources = template.Resources ? template.Resources : {};

  const nestedStacks = Object.keys(resources).filter(function (key) {
    return resources[key].Type === "AWS::CloudFormation::Stack";
  });

  template.Resources[properties.name] = template.Resources[nestedStacks[0]];
  delete template.Resources[nestedStacks[0]];
  template.Resources[
    properties.name
  ].Properties.TemplateURL = `https://%%TEMPLATE_BUCKET%%.s3.amazonaws.com/%%SOLUTION_NAME%%/%%VERSION%%/${properties.templateName}.template`;
}
