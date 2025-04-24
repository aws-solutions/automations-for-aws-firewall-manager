# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.3] - 2025-04-24

### Changed

- Updated `aws-cdk-lib` to mitigate vulnerability within Cognito.UserPoolClient. [GHSA ID: qq4x-c6h6-rfxh](https://github.com/advisories/GHSA-qq4x-c6h6-rfxh)
- Updated NodeJS Lambda runtimes from 18.x to 22.x
- Updated `jest`, `ts-jest`, and added overrides for `@babel/helpers` to mitigate CVE-2025-27789

## [2.1.2] - 2025-02-05

### Changed

- Updated all SQS Queue policies to specify a Resource in order to meet new SQS Queue policy validation.

## [2.1.1] - 2024-11-27

### Changed

- Updated dependencies to address cross-spawn CVE-2024-21538

## [2.1.0] - 2024-06-17

### Added

- Support for China regions.
- Support for GovCloud regions.
- Support for Opt-in regions.
- Policies will now update automatically when a new version of policy_manifest.json file is uploaded to the solution's `PolicyManifest` S3 bucket.
- Automations for AWS Shield Advanced subscribers to set up health-based detection and proactive engagement. This includes three new CloudFormation templates: `aws-fms-shield-automations-prereq`, `aws-fms-shield-automations`, and `aws-fms-proactive-event-response`.
- Option to subscribe to SNS topic for error notifications.
- Integration with Amazon X-Ray.
- Lambda layer for utilities shared by solution's lambda functions.
- Snapshots for CDK stacks in `source/resources/__tests__`.
- upload-s3-dist.sh script to the `/deployment` directory to upload solution artifacts directly to S3.

### Changed

- Updated default policy_manifest.json to enable AWS Shield Advanced automatic application-layer DDoS protection in "count" mode for Shield Advanced policies deployed by the solution via Firewall Manager. Currently, AWS Shield supports this feature for CloudFront distributions and Application Load Balancers only.
- General refactor to increase code and unit test clarity.
- `policyUpdateToken` is no longer stored in DynamoDB, instead it is retrieved using FMS GetPolicy API.
- Removed anonymized metrics publishing from PreReqManager Lambda function.
- Removed UUID from the Prerequisite stack.
- Updated wording from "anonymous" to "anonymized" for metric publishing.
- Removed `MetricsQueue` resource & `MetricsManager` Lambda function and consolidated metrics publishing to the `utilsLayer`.
- Enhanced log statements to use Lambda Powertools Logger.
- Enhanced SSM Parameter retrieval to use Lambda Powertools.
- Upgraded dependencies with `npm upgrade`.

### Fixed

- Fixed bug in Prerequisite stack which halted AWS Organizations trusted access with CloudFormation StackSets from being activated.

## [2.0.12] - 2024-09-19

### Security

- Upgrade depdendencies to mitigate [CVE-2024-45296](https://nvd.nist.gov/vuln/detail/CVE-2024-45296)

## [2.0.11] - 2024-08-01

### Security

- Upgrade `fast-xml-parser` to mitigate [CVE-2024-41818](https://nvd.nist.gov/vuln/detail/CVE-2024-41818)

### Changed

- Extended PolicyManager's Log Group retention period to ten years.

## [2.0.10] - 2024-06-19

### Security

- Upgraded `braces` package to mitigate [CVE-2024-4068](https://avd.aquasec.com/nvd/2024/cve-2024-4068/)

### Fixed

- Fixed intermittent deployment failure caused by "CopyManifest" custom resource installing latest SDK version.

## [2.0.9] - 2024-01-07

### Changed

- Update NodeJS runtimes to Nodejs18.x for all the lambda functions in the solution.

## [2.0.8] - 2023-10-31

### Changed

- Update lambda timeout for custom resource PreReqManagerCR.

### Fixed

- Update node dependencies for security vulnerabilities.

## [2.0.7] - 2023-08-10

### Changed

- Update aws-cdk-lib to force CustomResourceProvider and Provider to update lambda runtime to Nodejs18.x.

## [2.0.6] - 2023-06-27

### Fixed

- Fixed dependabot issues for fast-xml-parser, [CVE-2023-34104](https://nvd.nist.gov/vuln/detail/CVE-2023-34104).
- Fixed deployment issue which was limiting the solution to be deployed in only us-east-1.

## [2.0.5] - 2023-06-05

### Changed

- Update parameter names for consistency
- Refactor to reduce code complexity
- Update client configs to latest sdk version
- Fix broken URLs in README

## [2.0.4] - 2023-04-21

### Changed

- Fix npm json5 vulnerabilites [CVE-2022-46175](https://nvd.nist.gov/vuln/detail/CVE-2022-46175)
- Upgrade AWS CDK dependencies to version 2
- Changed the Object Ownership for logging bucket from 'Object writer' to 'Bucket owner enforced' to mitigate the impact caused by new S3 default settings.
- Updated S3 bucket policy to support access logging.

## [2.0.3] - 2022-12-14

### Changed

- Fix npm got vulnerabilites
- Upgrade to node16
- Update solution name

## [2.0.2] - 2022-05-09

### Changed

- Fix: Enforce encrypted access to config S3 buckets

## [2.0.1] - 2022-04-14

### Changed

- Security patching of dependencies
- Upgrade CDK version

## [2.0.0] - 2021-08-31

### Added

- Support Amazon Route 53 Resolver DNS Firewall security policies
- Support for AWS Firewall Manager compliance reports
- Support for multiple policy stack deployments to manage custom policies

### Changed

- Solution re-branding from AWS Centralized WAF & VPC SG Management
- Migrated source code to AWS SDK for JavaScript v3
- Policy manifest file sourced in S3 bucket as compared to packaging with lambda binary earlier, making it easier to customize policy configurations at any time

## [1.0.0] - 2020-09-29

### Added

- Initial version AWS Centralized WAF & VPC SG Management
