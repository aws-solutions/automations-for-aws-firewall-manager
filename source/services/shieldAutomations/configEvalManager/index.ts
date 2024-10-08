// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Automations for AWS Firewall Manager
 * Shield Automations Microservice to perform resource evaluations
 * for the Organization Config Rule
 * @author aws-solutions
 */

import { logger } from "solutions-utils";
import {
  ConfigInvokingEvent,
  ConfigEvaluationEvent,
  ShieldValidatorResponse,
  SNS_REMEDIATION_ERROR_SUBJECT,
  getSNSErrorMessageBody,
  SNS_INCOMPLETE_EIP_REASON,
} from "/opt/nodejs/lib/CommonExports";
import { Tracer } from "@aws-lambda-powertools/tracer";
import type { LambdaInterface } from "@aws-lambda-powertools/commons/types";
import {
  ComplianceByResource,
  ComplianceType,
  ConfigServiceClient,
  ConfigurationItem,
  ConfigurationItemStatus,
  DescribeComplianceByResourceCommandOutput,
  DescribeConfigRuleEvaluationStatusCommand,
  paginateDescribeComplianceByResource,
  PutEvaluationsCommand,
} from "@aws-sdk/client-config-service";
import { AssumeRoleCommand, Credentials, STSClient } from "@aws-sdk/client-sts";
import { ShieldHandler } from "/opt/nodejs/lib/ShieldHandler";
import { RemediationRequestHandler } from "./lib/RemediationRequestHandler";
import { Context } from "aws-lambda";
import { Protection } from "@aws-sdk/client-shield";

export const tracer: Tracer = new Tracer({
  serviceName: "FMS-Shield-ConfigEvalLambda",
});

const awsRegion: string = <string>process.env.AWS_REGION;

export class ConfigEvalManager implements LambdaInterface {
  @tracer.captureLambdaHandler()
  @logger.injectLambdaContext()
  async handler(event: ConfigEvaluationEvent, _context: Context) {
    const invokingEvent: ConfigInvokingEvent = JSON.parse(event.invokingEvent);

    logger.info(`Rule Evaluation triggered by ${invokingEvent.messageType}`, {
      event: event,
    });

    let assumedCredentials: Credentials;
    try {
      assumedCredentials = await this.assumeCrossAccountRole(event.accountId);
    } catch (e) {
      logger.warn(
        `Unable to assume credentials is account ${event.accountId}, please ensure the shield automations prerequisite stack is deployed in the account.`
      );
      return;
    }

    const shieldHandler = new ShieldHandler(assumedCredentials, tracer, logger);

    if (invokingEvent.messageType === "ScheduledNotification") {
      await this.handleScheduledNotifications(
        event.configRuleName,
        event.accountId,
        assumedCredentials,
        awsRegion,
        shieldHandler,
        event.resultToken
      );
    } else {
      await this.handleEvaluation(
        <ConfigurationItem>invokingEvent.configurationItem,
        event.accountId,
        event.resultToken,
        shieldHandler,
        assumedCredentials
      );
    }
  }

  /**
   * Triggers Evaluation for non-compliant resources for specified config rule upon
   * receiving a scheduled notification from Config.
   */
  async handleScheduledNotifications(
    ruleName: string,
    accountId: string,
    assumedCredentials: Credentials,
    region: string | undefined,
    shieldHandler: ShieldHandler,
    resultToken: string
  ) {
    if (region === undefined)
      throw new Error("AWS_REGION environment variable is undefined");

    const configClient = this.configServiceClient(assumedCredentials);
    try {
      if (
        await this.shouldSkipPeriodicEval(
          ruleName,
          accountId,
          region,
          configClient
        )
      )
        return;

      const paginatorConfig = {
        client: configClient,
        pageSize: 25,
      };
      const describeComplianceParams = {
        resourceType: "AWS::ShieldRegional::Protection",
        ComplianceTypes: [ComplianceType.Non_Compliant],
      };
      const compliancePaginator = paginateDescribeComplianceByResource(
        paginatorConfig,
        describeComplianceParams
      );

      for await (const page of compliancePaginator) {
        logger.debug("paginator response", {
          page: page,
        });
        if (!page.ComplianceByResources) continue;
        await this.evaluateComplianceByResourcePage(
          page,
          resultToken,
          accountId,
          assumedCredentials,
          shieldHandler
        );
      }
    } catch (e) {
      logger.error(
        "encountered an error evaluating resources from ScheduledNotification event",
        {
          error: e,
          ruleName: ruleName,
          accountId: accountId,
          region: region,
          requestId: e.$metadata?.requestId,
        }
      );
    }
  }

  /**
   * Determines whether the lambda should skip this periodic evaluation to avoid duplicate work
   */
  async shouldSkipPeriodicEval(
    ruleName: string,
    accountId: string,
    region: string,
    configClient: ConfigServiceClient
  ): Promise<boolean> {
    const evaluationStatusCommand =
      new DescribeConfigRuleEvaluationStatusCommand({
        ConfigRuleNames: [ruleName],
      });

    const evaluationStatus = await configClient.send(evaluationStatusCommand);
    if (
      !evaluationStatus.ConfigRulesEvaluationStatus ||
      !evaluationStatus.ConfigRulesEvaluationStatus[0]
    ) {
      logger.error(`could not find status for config rule ${ruleName}`, {
        ruleName: ruleName,
        accountId: accountId,
        region: region,
      });
      throw new Error(
        `could not retrieve status from Config for rule ${ruleName}`
      );
    }

    if (evaluationStatus.ConfigRulesEvaluationStatus[0].FirstActivatedTime) {
      const diffInMilliseconds = Math.abs(
        evaluationStatus.ConfigRulesEvaluationStatus[0].FirstActivatedTime.getTime() -
          Date.now()
      );
      const millisecondsIn24Hours = 24 * 60 * 60 * 1000;

      // Skips first periodic evaluation of the rule to avoid duplicate work when resources are first discovered.
      // Upon rule creation ConfigEvalManager is triggered for existing resources AND periodic evaluation, which overlap.
      if (diffInMilliseconds < millisecondsIn24Hours) {
        logger.info(
          `Rule ${ruleName} was activated in the past 24 hours. Skipping periodic evaluation to avoid duplicate work.`
        );
        return true;
      }
    }
    return false;
  }

  /**
   * Evaluates the resources in a page returned by the ComplianceByResource paginator.
   */
  async evaluateComplianceByResourcePage(
    page: DescribeComplianceByResourceCommandOutput,
    resultToken: string,
    accountId: string,
    assumedCredentials: Credentials,
    shieldHandler: ShieldHandler
  ): Promise<void> {
    for (const complianceByResource of <ComplianceByResource[]>(
      page.ComplianceByResources
    )) {
      try {
        // the endpoint sometimes returns an incorrect resource type, so we must validate it here
        if (
          complianceByResource.ResourceType !==
            "AWS::ShieldRegional::Protection" &&
          complianceByResource.Compliance?.ComplianceType !==
            ComplianceType.Non_Compliant
        )
          continue;
        await this.evaluateComplianceByResourceOutput(
          complianceByResource,
          resultToken,
          accountId,
          assumedCredentials,
          shieldHandler
        );
      } catch (e) {
        logger.warn(
          "encountered an error evaluating resource from ScheduledNotification event",
          {
            error: e,
            complianceByResource: complianceByResource,
            requestId: e.$metadata?.requestId,
          }
        );
      }
    }
  }

  /**
   * Evaluates the non-compliant shield protection resource returned by the
   * ComplianceByResource command
   */
  async evaluateComplianceByResourceOutput(
    complianceByResourceOutput: ComplianceByResource,
    resultToken: string,
    accountId: string,
    assumedCredentials: Credentials,
    shieldHandler: ShieldHandler
  ) {
    const shieldProtectionId = complianceByResourceOutput.ResourceId;

    if (!shieldProtectionId) {
      logger.debug("resourceId undefined in complianceByResource response", {
        complianceByResource: complianceByResourceOutput,
      });
      throw new Error(
        "resourceId undefined in ComplianceByResourceCommandOutput"
      );
    }

    const shieldProtectionDetails: Protection =
      await shieldHandler.getShieldProtectionDetails(shieldProtectionId);

    const shieldValidatorResponse: ShieldValidatorResponse =
      await shieldHandler.isValid(shieldProtectionDetails);

    let complianceType: ComplianceType;
    if (
      !shieldValidatorResponse.isIncompleteEIP &&
      shieldValidatorResponse.isValid
    ) {
      const isCompliant = shieldHandler.isCompliant(shieldProtectionDetails);

      if (!isCompliant) {
        complianceType = ComplianceType.Non_Compliant;
        await this.remediateNonCompliantResource(
          shieldProtectionId,
          resultToken,
          accountId
        );
      } else {
        complianceType = ComplianceType.Compliant;
      }
    } else {
      complianceType = ComplianceType.Non_Compliant;
    }

    await this.setShieldResourceCompliance(
      complianceType,
      shieldProtectionId,
      resultToken,
      this.configServiceClient(assumedCredentials)
    );
  }

  /**
   * @description Performs evaluation for a given Shield resource
   * to determine if it has required Health Checks.
   */
  async handleEvaluation(
    configurationItem: ConfigurationItem,
    accountId: string,
    eventResultToken: string,
    shieldHandler: ShieldHandler,
    assumedCredentials: Credentials
  ) {
    let complianceType: ComplianceType;
    const shieldProtectionId = configurationItem.resourceId;
    const region = configurationItem.awsRegion;

    try {
      if (!region) throw new Error("region is undefined");
      if (!shieldProtectionId)
        throw new Error("configurationItem resourceId is undefined");

      const isValidConfigItem =
        this.isValidConfigurationItem(configurationItem);

      if (!isValidConfigItem) {
        logger.debug("invalid configurationItem", {
          configItem: configurationItem,
        });
        await this.setShieldResourceCompliance(
          ComplianceType.Not_Applicable,
          shieldProtectionId,
          eventResultToken,
          this.configServiceClient(assumedCredentials)
        );
        return;
      }

      const shieldProtectionDetails: Protection =
        await shieldHandler.getShieldProtectionDetails(shieldProtectionId);

      const shieldValidatorResponse: ShieldValidatorResponse =
        await shieldHandler.isValid(shieldProtectionDetails);

      if (shieldValidatorResponse.isIncompleteEIP) {
        // An EIP is non-compliant until it is attached to an instance or Network Load Balancer.
        complianceType = ComplianceType.Non_Compliant;
        await shieldHandler.publishShieldTopicMessage(
          SNS_REMEDIATION_ERROR_SUBJECT,
          getSNSErrorMessageBody(
            accountId,
            shieldProtectionId,
            SNS_INCOMPLETE_EIP_REASON
          )
        );
      } else if (!shieldValidatorResponse.isValid) {
        complianceType = ComplianceType.Not_Applicable;
        logger.info(
          `resource ${shieldProtectionDetails.ResourceArn} is not supported for remediation`,
          {
            accountId: accountId,
            region: region,
            shieldProtectionId: shieldProtectionId,
            protectedResourceId: shieldProtectionDetails.ResourceArn,
          }
        );
      } else {
        const isCompliantResource = shieldHandler.isCompliant(
          shieldProtectionDetails
        );

        complianceType = isCompliantResource
          ? ComplianceType.Compliant
          : ComplianceType.Non_Compliant;

        if (!isCompliantResource)
          await this.remediateNonCompliantResource(
            shieldProtectionId,
            eventResultToken,
            accountId
          );
      }

      await this.setShieldResourceCompliance(
        complianceType,
        shieldProtectionId,
        eventResultToken,
        this.configServiceClient(assumedCredentials)
      );
    } catch (e) {
      logger.error(
        "encountered error evaluating resource from ConfigurationItemChange event",
        {
          error: e,
          accountId: accountId,
          region: region,
          resourceId: shieldProtectionId,
          configurationItem: configurationItem,
          requestId: e.$metadata?.requestId,
        }
      );
    }
  }

  /**
   * Assumes the cross-account role for Config Evaluation.
   */
  async assumeCrossAccountRole(accountId: string): Promise<Credentials> {
    const crossAccountRole = process.env.CROSS_ACCOUNT_ROLE;
    const partition = process.env.PARTITION;
    const crossAccountRoleArn = `arn:${partition}:iam::${accountId}:role/${crossAccountRole}`;

    const stsClient = tracer.captureAWSv3Client(new STSClient({}));

    const assumeCommand = new AssumeRoleCommand({
      RoleArn: crossAccountRoleArn,
      RoleSessionName: "FMS-Shield-ConfigEvalManager",
      DurationSeconds: 900,
    });

    const response = await stsClient.send(assumeCommand);
    if (
      response.Credentials === undefined ||
      response.Credentials.AccessKeyId === undefined ||
      response.Credentials.SecretAccessKey === undefined
    ) {
      logger.debug("AssumeRoleCommand returned undefined credentials", {
        RequestId: response.$metadata?.requestId,
      });
      throw new Error(
        "STS Client returned undefined credentials when assuming cross account role"
      );
    }

    logger.info("assumed cross account role", {
      crossAccountRole: crossAccountRole,
    });
    return response.Credentials;
  }

  private configServiceClient(assumedCredentials: Credentials) {
    return tracer.captureAWSv3Client(
      new ConfigServiceClient({
        credentials: {
          accessKeyId: <string>assumedCredentials.AccessKeyId,
          secretAccessKey: <string>assumedCredentials.SecretAccessKey,
          sessionToken: assumedCredentials.SessionToken,
        },
        maxAttempts: 5,
      })
    );
  }

  /**
   * @description Checks if the configuration item is valid.
   * A configuration item is valid if its status is OK or ResourceDiscovered.
   */
  isValidConfigurationItem(configItem: ConfigurationItem): boolean {
    const status = configItem.configurationItemStatus;

    const isValidConfigurationItem =
      status === ConfigurationItemStatus.OK ||
      status === ConfigurationItemStatus.ResourceDiscovered;

    logger.info("validated configuration item", {
      isValidConfigurationItem: isValidConfigurationItem,
      configurationItemStatus: status,
    });
    return isValidConfigurationItem;
  }

  /**
   * Marks the Shield resource as COMPLIANT/NON_COMPLIANT/NOT_APPLICABLE in AWS Config.
   */
  async setShieldResourceCompliance(
    compliance: ComplianceType,
    resourceId: string,
    resultToken: string,
    configClient: ConfigServiceClient
  ): Promise<void> {
    const putEvaluationsCommand: PutEvaluationsCommand =
      new PutEvaluationsCommand({
        Evaluations: [
          {
            ComplianceType: compliance,
            ComplianceResourceType: "AWS::Shield::Protection",
            ComplianceResourceId: resourceId,
            OrderingTimestamp: new Date(),
          },
        ],
        ResultToken: resultToken,
      });

    const putEvaluationsResponse = await configClient.send(
      putEvaluationsCommand
    );

    const failedEvaluations = putEvaluationsResponse.FailedEvaluations;
    if (failedEvaluations && failedEvaluations.length > 0) {
      logger.error(
        "Failed to put evaluations in AWS config. This action will be automatically retried upon the next evaluation.",
        {
          failedEvaluations: failedEvaluations,
          resourceId: resourceId,
          requestId: putEvaluationsResponse.$metadata?.requestId,
        }
      );
    }
    logger.info("put evaluations in AWS Config", {
      resourceId: resourceId,
      compliance: compliance,
    });
  }

  async remediateNonCompliantResource(
    shieldProtectionId: string,
    resultToken: string,
    accountId: string
  ) {
    const remediationRequestHandler = new RemediationRequestHandler(accountId);
    const request = remediationRequestHandler.buildRemediationRequest(
      shieldProtectionId,
      resultToken
    );
    await remediationRequestHandler.sendRemediationRequest(request);
  }

  /**
   * @description Sleeps for the provided number of milliseconds.
   */
  async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const handlerClass = new ConfigEvalManager();
export const handler = handlerClass.handler.bind(handlerClass);
