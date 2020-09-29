# AWS Centralized WAF and VPC Security Group Management

The AWS Centralized WAF and VPC Security Group Management solution is intended for customers looking to easily manage consistent security posture across their entire AWS Organization. The solution uses AWS Firewall Manager Service.

Additionally, solution eases the installation process required to fulfill Firewall Manager prerequisites so customers can focus more on their organization security posture.

_Note:_ For any relavant information outside the scope of this readme, please refer to the solution landing page and implementation guide.

**[🚀Solution Landing Page](https://aws.amazon.com/solutions/implementations/aws-centralized-waf-and-vpc-security-group-management)** | **[🚧Feature request](https://github.com/awslabs/aws-centralized-waf-and-vpc-security-group-management/issues/new?assignees=&labels=feature-request%2C+enhancement&template=feature_request.md&title=)** | **[🐛Bug Report](https://github.com/awslabs/aws-centralized-waf-and-vpc-security-group-management/issues/new?assignees=&labels=bug%2C+triage&template=bug_report.md&title=)** | **[📜Documentation Improvement](https://github.com/awslabs/aws-centralized-waf-and-vpc-security-group-management/issues/new?assignees=&labels=document-update&template=documentation_improvements.md&title=)**

## Table of content

- [Installation](#installing-pre-packaged-solution-template)
  - [Parameters](#parameters-for-prerequisite-template)
- [Customization](#customization)
  - [Setup](#setup)
  - [Changes](#changes)
  - [Unit Test](#unit-test)
  - [Build](#build)
  - [Deploy](#deploy)
- [Sample Scenario](#sample-scenario)
- [File Structure](#file-structure)
- [License](#license)

## Installing pre-packaged solution template

- If you are already using Firewall Manager: [FMSStack.template](https://solutions-reference.s3.amazonaws.com/aws-centralized-waf-and-vpc-sg-management/latest/aws-centralized-waf-and-vpc-security-group-management.template)

- If you are new to Firewall Manager: [PreReqStack.template](https://solutions-reference.s3.amazonaws.com/aws-centralized-waf-and-vpc-sg-management/latest/aws-fms-prereq.template)

- If you want to create demo resources: [Demo.template](https://solutions-reference.s3.amazonaws.com/aws-centralized-waf-and-vpc-sg-management/latest/aws-fms-demo.template)

#### Parameters for prerequisite template

- **Firewall Admin:** Provide the account-id to be used for Firewall Manager admin account. If you have already configured Firewall Manager admin, provide that account-id.
- **Enable Config:** Do you want to enable AWS Config across your Organization as part of pre requisite installation. You may chose 'No' if you already have Config enabled.

## Customization

- Prerequisite: Node.js>10

### Setup

Clone the repository and run the following commands to install dependencies, format and lint as per the project standards

```
npm i
npm run prettier-format
npm run lint
```

### Changes

You may make any needed change as per your requirement. If you want to customize the Firewall Manager policy defaults, you can modify the [manifest file](./source/services/policyManager/lib/manifest.json).

Addtionally, you can customize the code and add any extensibity to the solution. Please review our [feature request guidelines](./.github/ISSUE_TEMPLATE/feature_request.md), if you want to submit a PR.

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

Run the following command from the root of the project

```
cd source/resources
npm i
```

The solution has 3 CDK Stacks

- Primary FMS Stack: this stack deploys all the primary solution components needed to manage Firewall Manager security policies. **Deploy in Firewall Manager Admin Account**

```
cdk synth FMSStack
cdk deploy FMSStack --profile <PROFILE_NAME>
```

- Prerequisite Stack: this stack can be used to fulfill solution prerequisites. **Deploy in Organizations Master Account**

```
cdk synth PreReqStack
cdk deploy PreReqStack --parameters FMSAdmin=<ACCOUNT_ID> --parameters EnableConfig=<Yes|No> --profile <PROFILE_NAME>
```

- Demo Stack: this stack can be used to provision minimal resources for demo purposes. You may deploy this stack in any account. **Deploy in us-east-1 only**

```
cdk synth DemoStack
cdk deploy DemoStack --profile <PROFILE_NAME>
```

_Note:_ for PROFILE_NAME, substitute the name of an AWS CLI profile that contains appropriate credentials for deploying in your preferred region.

## Sample Scenario

The default deployment uses opinionated values as setup in [policy manifest file](./source/services/policyManager/lib/manifest.json). In this scenario let's say we want to update the global WAF policies default and turn-off the auto-remediation behavior. We can make the change as seen below and turn **remediationEnabled** to _false_.

```
 "policyName": "FMS-WAF-01",
 "policyScope": "Global",
 "resourceType": "AWS::CloudFront::Distribution",
 "remediationEnabled": false,
```

Additionally, if you want to control sending solution usage metrics to aws-solutions, you can refer to [solution manifest file](./source/resources/lib/manifest.json).

```
"solutionVersion": "%%VERSION%%", #provide a valid value eg. v1.0
"sendMetric": "Yes",
```

## File structure

AWS Centralized WAF & Security Group Management solution consists of:

- cdk constructs to generate needed resources
- prereq manager to validate and install Firewall Manager prerequisites
- policy manager to install FMS security policies
- metrics manager to publish metrics to aws-solutions

<pre>
|-deployment/
  |build-scripts/                 [ build scripts ]
|-source/
  |-resources
    |-bin/
      |-app.ts                    [ entry point for CDK app ]
    |-__tests__/                  [ unit tests for CDK constructs ] 
    |-lib/
      |-fms.ts                    [ CDK construct for FMS stack and related resources ]
      |-iam.ts                    [ CDK construct for iam resources]
      |-prereq.ts                 [ CDK construct for Prerequisite stack and related resources ]  
      |-manifest.json             [ manifest file for CDK resources ]
    |-config_files                [ tsconfig, jest.config.js, package.json etc. ]
  |-services/
    |-helper/                     [ lambda backed helper custom resource to help with solution launch/update/delete ]
    |-policyManager/              [ microservice to manage FMS security policies ]
      |-__tests/                  [ unit tests for all policy managers ]   
      |-lib/
        |-clientConfig.json       [ config for AWS service clients ]
        |-manifest.json           [ manifest file for FMS policy configurations ]
        |-wafManager.ts           [ class for WAF policy CRUD operations]
        |-shieldManager.ts        [ class for Shield policy CRUD operations]
        |-securitygroupManager.ts [ class for Security Group policy CRUD operations]
        |-fmsHelper.ts            [ helper functions for FMS policy]
        |-policyManager.ts        [ entry point to process FMS policies]
      |-index.ts                  [ entry point for lambda function]     
      |-config_files              [ tsconfig, jest.config.js, package.json etc. ]
    |-preReqManager
      |-__tests/                  [ unit tests for pre req manager ] 
      |-lib/ 
        |-clientConfig.json       [ config for AWS service clients ]
        |-preReqManager.ts        [ class for FMS pre-requisites validaion and installation ]
      |-index.ts                  [ entry point for lambda function]     
      |-config_files              [ tsconfig, jest.config.js, package.json etc. ]   
    |-metricsManager
      |-index.ts                  [ entry point for lambda function]     
      |-config_files    
  |-config_files                  [ eslint, prettier, tsconfig, jest.config.js, package.json etc. ]  
</pre>

## License

See license [here](./LICENSE.txt)
