# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
