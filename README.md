# Automations for AWS Firewall Manager

:grey_exclamation: Notice: This solution supersedes AWS Centralized WAF & VPC SG Management solution.
|-----------------------------------------|

**[🚀Solution Landing Page](https://aws.amazon.com/solutions/implementations/aws-firewall-mgr-automations-for-aws-orgs)** | **[🚧Feature request](https://github.com/aws-solutions/automations-for-aws-firewall-manager/issues/new?assignees=&labels=feature-request%2C+enhancement&template=feature_request.md&title=)** | **[🐛Bug Report](https://github.com/aws-solutions/automations-for-aws-firewall-manager/issues/new?assignees=&labels=bug%2C+triage&template=bug_report.md&title=)** | **[📜Documentation Improvement](https://github.com/aws-solutions/automations-for-aws-firewall-manager/issues/new?assignees=&labels=document-update&template=documentation_improvements.md&title=)**

_Note:_ For any relevant information outside the scope of this readme, please refer to the solution landing page and implementation guide.

## Table of contents

- [Solution Overview](#solution-overview)
- [Architecture](#architecture)
- [Installation](#installing-pre-packaged-solution-template)
  - [Parameters](#parameters-for-prerequisite-template)
  - [Custom Policy](#custom-policy-stack)
- [Customization](#customization)
  - [Setup](#setup)
  - [Changes](#changes)
  - [Unit Test](#unit-test)
  - [Build](#build)
  - [Deploy](#deploy)
  - [Sample Customization Scenario](#sample-scenario)
- [File Structure](#file-structure)
- [License](#license)

## Solution Overview

The Automations for AWS Firewall Manager solution is intended for customers looking to easily manage consistent security posture across their entire AWS Organization. The solution uses AWS Firewall Manager Service.

By deploying the Prerequisite stack, you can easily install all requirements needed to fulfill Firewall Manager service prerequisites, so that you can focus on your organization's security posture.

With the release of v2.1.0, AWS Shield Advanced customers have the option to deploy additional CloudFormation templates to automatically setup [health-based detection](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-advanced-health-checks.html) and [proactive engagement](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-srt-proactive-engagement.html) across their organization in 1-click. This solution does not automatically subscribe to Shield Advanced for you.


## Architecture

The default deployment of solution pre-packaged template deploys following infrastructure in your account. The architecture can be grouped into two separate workflows: **Policy manager** and **Compliance report generator**.

<img src="architecture.pdf" width="600" height="350">

**Policy Manager**: The component is responsible for CRUD operations on the Firewall Manager security policies.

**Compliance Report Generator**: The component is responsible for generating compliance reports on your Firewall Manager security policies, in csv format.

## Architecture with Automations for AWS Shield Advanced (Optional)

If you are an AWS Shield Advanced subscriber and choose to deploy the `aws-fms-shield-automations` CloudFormation template, the following resources will be automatically created in your deployment account.

<img src="./shield-architecture.png" width="600" height="338">

**Policy Manager**: Deployed by the Primary solution stack. This component is responsible for CRUD operations on the Firewall Manager security policies.

**Automated Health-based Detection**: Deployed by the Shield Automations stack. Resources include two Lambda functions (`ConfigRuleEval`, `ConfigRuleRemediate`), an SQS Queue, and an Organizational Config Rule. These components do the following:
- ConfigRuleEval: This Lambda function is triggered by the Organizational Config Rule and handles custom evaluation of resources by validating the AWS Shield Advanced Protection and determining whether it has Route 53 Health Checks associated with it.
- ConfigRuleRemediate: This Lambda function reads messages published to the SQS Queue by `ConfigRuleEval` and creates Route 53 Health Checks, then associates them with Shield Advanced Protections.
- SQS Queue: Queue for holding messages to trigger remediation of Shield Advanced Protections.
- Organizational Config Rule: Captures existing AWS Shield Advanced Protections in the AWS Organization and evaluates their compliance using the `ConfigRuleEval` Lambda function. 

## Installing pre-packaged solution templates

- **[Optional]** If you are new to Firewall Manager: [aws-fms-prereq.template](https://solutions-reference.s3.amazonaws.com/automations-for-aws-firewall-manager/latest/aws-fms-prereq.template)

- If you have already installed Firewall Manager prerequisites: [aws-fms-automations.template](https://solutions-reference.s3.amazonaws.com/automations-for-aws-firewall-manager/latest/aws-fms-automations.template)

- If you want to manage custom policies: [Policy.template](https://solutions-reference.s3.amazonaws.com/automations-for-aws-firewall-manager/latest/aws-fms-policy.template)

- If you want to create demo resources: [Demo.template](https://solutions-reference.s3.amazonaws.com/automations-for-aws-firewall-manager/latest/aws-fms-demo.template)

- **[Optional]** If you are an existing AWS Shield Advanced subscriber:
  - To automate health-based detection setup:
    - [aws-fms-shield-automations-prereq.template](https://solutions-reference.s3.amazonaws.com/automations-for-aws-firewall-manager/latest/aws-fms-shield-automations-prereq.template)
    - [aws-fms-shield-automations.template](https://solutions-reference.s3.amazonaws.com/automations-for-aws-firewall-manager/latest/aws-fms-shield-automations.template)
  - To automate proactive engagement setup:
    - [aws-fms-proactive-event-response.template](https://solutions-reference.s3.amazonaws.com/automations-for-aws-firewall-manager/latest/aws-fms-proactive-event-response.template)

#### Parameters for Primary (aws-fms-automations) template

- **Email Address:** Do you want to receive notifications about policy deployment errors? Enter the Email Address you would like to use to subscribe to the solution's SNS topic.
- **Compliance Reporting:** Do you want to generate compliance reports in csv format for your Firewall Manager policies? The reports are uploaded in a S3 bucket in your account and can be used for audit purposes.

#### *[Optional]* Parameters for Prerequisite (aws-fms-prereq) template

- **Firewall Admin:** Provide the account-id to be used for Firewall Manager admin account. If you have already configured Firewall Manager admin, provide that account-id.
- **Enable Config:** Do you want to enable AWS Config across your Organization as part of pre-requisite installation? You may choose 'No' if you already have Config enabled.

#### *[Optional]* Parameters for Shield Automations (aws-fms-shield-automations) template

- **Email Address:** Do you want to receive notifications about errors encountered while setting up health-based detection? Enter the Email Address you would like to use to subscribe to the solution's SNS topic.
- **Excluded Accounts:** A comma delimited list of accounts which you would like to exclude from having health-based detection enabled.
- **CloudWatch metric configurations:** Metric configurations for the Route 53 Health Checks to be created for your AWS Shield Advanced Protections. For more information on these metric configuration parameters, see the [Implementation Guide](https://docs.aws.amazon.com/solutions/latest/automations-for-aws-firewall-manager/deploy-the-solution.html)

#### *[Optional]* Parameters for Proactive Event Response (aws-fms-proactive-event-response) template

- **Emergency Contact Phone Number:** The phone number you would like to use to allow the Shield Response Team (SRT) to contact you in case of emergencies.
- **Emergency Contact Email Address:** The email address you would like to use to allow the Shield Response Team (SRT) to contact you in case of emergencies.
- **Grant SRT (Shield Response Team) Account Access:** Choose if you would like to grant Shield Response Team (SRT) access to accounts where this stack is deployed. This allows the SRT to make AWS Shield Advanced and AWS WAF API calls on your behalf and to access your AWS WAF logs.

### Custom Policy Stack

There may be situations where you want to manage multiple Firewall Manager policy configurations. Let's say you want to apply policy configuration A to Organizational Units A1,A2,A3 in Region R1 and you want to apply policy configuration B to Organizational Units B1,B2,B3 in Region R2. To achieve this you may use nested [policy template](https://solutions-reference.s3.amazonaws.com/automations-for-aws-firewall-manager/latest/aws-fms-policy.template) packaged with the solution.

- Step 1: deploy the [primary template](https://solutions-reference.s3.amazonaws.com/automations-for-aws-firewall-manager/latest/aws-fms-automations.template)
- Step 2: deploy the [policy template](https://solutions-reference.s3.amazonaws.com/automations-for-aws-firewall-manager/latest/aws-fms-policy.template) as many times as per the permutation and combination of Policy configuration, Organization Units and AWS Regions where you want to create the policies.
- Step 3: update the default policy_manifest.json file that gets staged in the `PolicyManifest` S3 bucket created with stack deployment from Step 2. Once you upload the modified policy_manifest.json file into the `PolicyManifest` S3 bucket, the associated Firewall Manager policies will be automatically updated.

The policy template requires following parameters:

- Policy Identifier: A unique string identifier for the policies, eg. ProductionPolicy

_Value for other parameters **Policy Table**, **Metric Queue** and **UUID** can be found out from output section of primary FMS automations stack_

For more details on custom policy template, read here in the [implementation guide](https://docs.aws.amazon.com/solutions/latest/automations-for-aws-firewall-manager/customize-policies.html)

## Customization

- Prerequisite: Node.js=18

### Setup

Clone the repository and run the following commands to install dependencies, format and lint as per the project standards

```
npm i
npm run prettier-format
npm run lint
```

### Changes

You may make any needed change in the source code as per your requirement. (E.g. [Sample Scenario](#sample-scenario))

You can customize the code and add any extensibility to the solution. Please review our [feature request guidelines](./.github/ISSUE_TEMPLATE/feature_request.md), if you want to submit a PR.

### Unit Test

You can run unit tests with the following command from the root of the project

```
 npm run test
```

### Build

You can build lambda binaries with the following command from the root of the project

```
 npm run build
```

### Deploy

AWS Solutions use two buckets: a bucket for global access to templates, which is accessed via HTTPS, and regional
buckets for access to assets within the region, such as Lambda code. You will need:

- One global bucket that is accessed via the http end point. AWS CloudFormation templates are stored here. It must end
  with "-reference. Ex. "mybucket-reference"
- One regional bucket for each region where you plan to deploy using the name of the global bucket as the root, and
  suffixed with the region name. Ex. "mybucket-us-east-1"
- Your buckets should be encrypted and disallow public access

**Note**: When creating your buckets, ensure they are not publicly accessible. Use random bucket names. Disable public
access. Use KMS encryption. And verify bucket ownership before uploading.

#### Build the solution

First ensure that you've run `npm install` in the _source_ folder.

Next from the _deployment_ folder in your cloned repo, run build-s3-dist.sh, passing the root name of your bucket (ex.
mybucket) and the version you are building (ex. v1.0.0). We recommend using a semver version based on the version
downloaded from GitHub (ex. GitHub: v1.0.0, your build: v1.0.0.mybuild)

```bash
chmod +x build-s3-dist.sh
build-s3-dist.sh -b <bucketname> -v <version>
```

#### Run Unit Tests

Run and confirm that all unit tests pass.

```bash
cd ./deployment
chmod +x ./run-unit-tests.sh
./run-unit-tests.sh
```

### Upload to your buckets

**Note**: Verify bucket ownership before uploading.

From the _deployment_ folder, run upload-s3-dist.sh, passing the region (e.g. `us-east-1`) where you would like to deploy the solution.
```bash
chmod +x upload-s3-dist.sh
upload-s3-dist.sh <region>
```

### Deploy

See the [Automations for AWS Firewall Manager Implementation Guide](https://docs.aws.amazon.com/solutions/latest/automations-for-aws-firewall-manager/solution-overview.html) for
deployment instructions, using the S3 link to the template in your bucket, rather than the one for AWS Solutions. Ex.https://mybucket-reference.s3.amazonaws.com/automations-for-aws-firewall-manager/v2.1.0.mybuild/aws-fms-automations.template

### Sample Scenario

The default deployment uses opinionated values as setup in [policy manifest file](./source/resources/lib/policy_manifest.json). In this scenario let's say we want to update the global WAF policies default and turn-off the auto-remediation behavior. We can make the change as seen below and turn **remediationEnabled** to _false_.

```
 "policyName": "FMS-WAF-01",
 "policyScope": "Global",
 "resourceType": "AWS::CloudFront::Distribution",
 "remediationEnabled": false,
```

After making needed changes in the policy manifest, we need to update [policy stack](source/resources/lib/nestedStacks/policy.stack.ts) so that the solution uses our customized local copy of policy manifest. For this, you can un-comment the following snippet in policy.stack.ts; And comment-out/remove the AWSCustomResource('CopyManifest') code block that downloads policy manifest from aws-solutions S3 bucket.

```
new BucketDeployment(this, "CopyManifest", {
  sources: [
    Source.asset(`${path.dirname(__dirname)}/lib`, {
      exclude: ["**", "!policy_manifest.json"],
    }),
  ],
  destinationBucket: policyBucket,
  prune: true,
});

```

Additionally, if you want to control sending solution usage metrics to aws-solutions, you can refer to [solution manifest file](./source/resources/lib/solution_manifest.json).

```
"solutionVersion": "%%VERSION%%", #provide a valid value eg. v1.0
"sendMetric": "Yes",
```

## File structure

Automations for AWS Firewall Manager solution consists of:

- cdk constructs to generate needed resources
- prereq manager to validate and install Firewall Manager prerequisites
- policy manager to install FMS security policies
- metrics manager to publish metrics to aws-solutions
- compliance generator to generate compliance reports on FMS policies
- config eval manager to evaluate shield resources from config
- config remediate manager to remediate non-compliant shield resources

<pre>
|-deployment/
  |build-scripts/                 [ build scripts ]
|-source/
  |-resources
    |-bin/
      |-app.ts                    [ entry point for CDK app ]
    |-__tests__/                  [ unit tests for CDK constructs ] 
    |-lib/
      |-shieldAutomations/
        |-proactive-event-response.stack.ts       [ CDK stack for proactive event response resources]
        |-shield-automations-prereq.stack.ts      [ CDK stack for shield automations prerequisite resources]
        |-shield-automations.stack.ts                   [ CDK stack for shield automations resources ]
      |-nestedStacks/
        |-compliance.stack.ts                     [ CDK stack for compliance generator resources]
        |-policy.stack.ts                         [ CDK stack for policy management and related resources ]
      |-common/
        |-exports.ts                              [ exports for CDK constructs ]
        |-iam.construct.ts                        [ CDK construct for iam permissions for policy manager microservice ]
      |-aws-fms-automations.stack.ts    [ CDK stack for common shared resources ]
      |-prereq.stack.ts                 [ CDK stack for FMS pre-requisite installation and validation related resources ]
      |-demo.stack.ts                   [ CDK stack for demo resources ]
      |-policy_manifest.json            [ manifest file with default policy configuration ]
      |-solution_manifest.json          [ manifest file with solution configurations ]
    |-config_files                      [ tsconfig, jest.config.js, package.json etc. ]
  |-services/
    |-helper/                     [ lambda backed helper custom resource to help with solution launch/update/delete ]
    |-policyManager/              [ microservice to manage FMS security policies ]
      |-__tests/                  [ unit tests for all policy managers ]   
      |-clientHelpers/
        |-dynamoDBHelper.ts       [ class to perform operations using DynamoDB ]
        |-ec2Helper.ts            [ class to perform operations using EC2 ]
        |-fmsHelper.ts            [ class to perform operations using FMS ]
        |-index.ts                [ exports all Helpers ]
        |-ramHelper.ts            [ class to perform operations using RAM ]
        |-route53Helper.ts        [ class to perform operations using Route53 ]
        |-s3Helper.ts             [ class to perform operations using S3 ]
        |-snsHelper.ts            [ class to perform operations using SNS ]
        |-ssmHelper.ts            [ class to perform operations using SSM ]
      |-lib/
        |-exports.ts              [ exports for Policy Manager class ]
        |-manifestHelper.ts       [ class to handle fetching the manifest from s3 ]
        |-Validator.ts            [ class implementing facade patter for different validator classes ]
        |-OUValidator.ts          [ validator class to validator organizational units ]
        |-RegionValidator.ts      [ validator class to validate regions ]
        |-TagValidator.ts         [ validator class to validate tags ]
        |-policyManager.ts        [ entry class to trigger policy handler workflows ]
        |-policyHelper.ts         [ class to perform CRUD operations on FMS policies ]
        |-waitForDNSFirewallR.ts  [ waiter to wait for DNS Firewall rule group state transition to NOT_SHARED ]
      |-index.ts                  [ entry point for lambda function]     
      |-config_files              [ tsconfig, jest.config.js, package.json etc. ]
    |-preReqManager
      |-__tests/                  [ unit tests for pre req manager ] 
      |-lib/ 
        |-clientConfig.json       [ config for AWS service clients ]
        |-preReqManager.ts        [ class for FMS pre-requisites validation and installation ]
      |-index.ts                  [ entry point for lambda function]     
      |-config_files              [ tsconfig, jest.config.js, package.json etc. ]   
    |-complianceGenerator
      |-lib/
        |-complianceGenerator.ts  [ class for FMS compliance generator ]
      |-index.ts                  [ entry point for lambda function]
      |-config_files
    |-shieldAutomations/
      |-configEvalManager/        [lambda microservice for evaluating shield resources from config]
      |-configRemediateManager/   [lambda microservice for remediating shield resources]
      |-shieldLayer/              [lambda layer for logic shared between shieldAutomations lambdas]
    |-utilsLayer/                 [lambda layer for logging, metric publishing, and X-Ray tracing shared between solution lambdas]
  |-config_files                  [ eslint, prettier, tsconfig, jest.config.js, package.json etc. ]  
</pre>

## Collection of operational metrics

This solution collects anonymized operational metrics to help AWS improve the quality and features of the solution. For more information, including how to disable this capability, please see the [implementation guide](https://docs.aws.amazon.com/solutions/latest/automations-for-aws-firewall-manager/solution-overview.html).

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

```
http://www.apache.org/licenses/
```

or in the ["license"](./LICENSE.txt) file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
