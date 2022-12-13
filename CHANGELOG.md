# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
