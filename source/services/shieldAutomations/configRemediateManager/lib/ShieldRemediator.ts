// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ShieldHandler } from "/opt/nodejs/lib/ShieldHandler";
import { Credentials } from "@aws-sdk/client-sts";
import { logger } from "solutions-utils";
import {
  getSNSErrorMessageBody,
  ProtectedResourceTypeResponse,
  ShieldResource,
  SNS_CLOUDWATCH_ALARM_LIMIT_REASON,
  SNS_HEALTH_CHECK_LIMIT_REASON,
  SNS_REMEDIATION_ERROR_SUBJECT,
} from "/opt/nodejs/lib/CommonExports";
import {
  AlarmConfigs,
  AlarmMetricConfig,
} from "/opt/nodejs/lib/HealthCheckExports";
import {
  CloudWatchRegion,
  CreateHealthCheckCommand,
  DeleteHealthCheckCommand,
  HealthCheckConfig,
  HealthCheckType,
  Route53Client,
} from "@aws-sdk/client-route-53";
import { tracer } from "../index";
import {
  CloudWatchClient,
  ComparisonOperator,
  DeleteAlarmsCommand,
  Dimension,
  PutMetricAlarmCommand,
  Statistic,
} from "@aws-sdk/client-cloudwatch";
import * as randomstring from "randomstring";
import { Protection } from "@aws-sdk/client-shield";

export class ShieldRemediator {
  /**
   * @description ID of non-compliant Shield Protection.
   */
  private readonly shieldProtectionId: string;

  /**
   * @description Details of Shield Protection being remediated.
   */
  private readonly shieldProtectionDetails: Protection;

  /**
   * @description The Dataplane of this lambda function.
   */
  public region: string;

  /**
   * @description Account ID where remediation will take place.
   */
  public accountId: string;

  private shieldHandler;

  constructor(
    shieldHandler: ShieldHandler,
    shieldProtectionDetails: Protection,
    region: string,
    accountId: string
  ) {
    this.shieldHandler = shieldHandler;
    this.shieldProtectionId = <string>shieldProtectionDetails.Id;
    this.shieldProtectionDetails = shieldProtectionDetails;
    this.region = region;
    this.accountId = accountId;
  }

  /**
   * @description Executes remediation for a Shield Resource.
   * Remediation involves creating Health Checks and associating them with the Shield Resource.
   */
  async executeRemediation(assumedCredentials: Credentials): Promise<void> {
    const route53Client = this.route53Client(assumedCredentials);
    const cloudWatchClient = this.cloudWatchClient(assumedCredentials);

    let protectedResourceARN: string;
    let protectedAWSResourceTypeResponse: ProtectedResourceTypeResponse;
    try {
      protectedResourceARN = this.shieldHandler.getProtectedResourceARN(
        this.shieldProtectionDetails
      );
      protectedAWSResourceTypeResponse =
        await this.shieldHandler.getProtectedAWSResourceType(
          protectedResourceARN
        );
    } catch (e) {
      logger.error(
        `encountered error while retrieving resource associated with Shield Protection ${this.shieldProtectionId}`,
        {
          error: e,
          shieldProtectionId: this.shieldProtectionId,
        }
      );
      return;
    }

    const protectedResourceId =
      protectedAWSResourceTypeResponse.protectedResourceId;
    const protectedResourceType =
      protectedAWSResourceTypeResponse.protectedResourceType;

    const alarmConfig = AlarmConfigs[protectedResourceType];
    if (protectedResourceType === ShieldResource.IncompleteElasticIP) {
      logger.debug(
        `The Elastic IP protected by Shield Protection ${this.shieldProtectionId} must be attached to an Instance or Network Load Balancer for Health Check creation.`
      );
    } else if (protectedResourceType === ShieldResource.Unknown) {
      logger.debug(
        `The resource type protected by Shield Protection ${this.shieldProtectionId} is not supported for Health Check creation.`
      );
    } else {
      await this.remediateByResourceType(
        cloudWatchClient,
        route53Client,
        protectedResourceId,
        alarmConfig
      );
    }
  }

  private cloudWatchClient(assumedCredentials: Credentials) {
    return tracer.captureAWSv3Client(
      new CloudWatchClient({
        credentials: {
          accessKeyId: <string>assumedCredentials.AccessKeyId,
          secretAccessKey: <string>assumedCredentials.SecretAccessKey,
          sessionToken: assumedCredentials.SessionToken,
        },
      })
    );
  }

  private route53Client(assumedCredentials: Credentials) {
    return tracer.captureAWSv3Client(
      new Route53Client({
        credentials: {
          accessKeyId: <string>assumedCredentials.AccessKeyId,
          secretAccessKey: <string>assumedCredentials.SecretAccessKey,
          sessionToken: assumedCredentials.SessionToken,
        },
      })
    );
  }

  /**
   * @description Creates Route53 Health Check with provided metrics.
   * Returns the ARN of the created Health Check.
   */
  async createHealthCheck(
    route53Client: Route53Client,
    type: HealthCheckType,
    cloudWatchAlarmName: string,
    childHealthChecks: string[]
  ): Promise<string> {
    const uniqueCallerReference = randomstring.generate({
      length: 32,
      charset: "alphabetic",
    });
    const healthCheckConfig: HealthCheckConfig = {
      Type: type,
    };

    if (type === HealthCheckType.CLOUDWATCH_METRIC) {
      healthCheckConfig.AlarmIdentifier = {
        Region: this.region as CloudWatchRegion,
        Name: cloudWatchAlarmName,
      };
    } else if (type === HealthCheckType.CALCULATED) {
      healthCheckConfig.HealthThreshold = childHealthChecks.length - 1;
      healthCheckConfig.ChildHealthChecks = childHealthChecks;
    }

    logger.debug(`creating health check type ${type}`, {
      healthCheckConfig: healthCheckConfig,
      region: this.region,
    });

    const createHealthCheckCommand = new CreateHealthCheckCommand({
      CallerReference: uniqueCallerReference,
      HealthCheckConfig: healthCheckConfig,
    });

    const healthCheck = await route53Client.send(createHealthCheckCommand);

    if (!healthCheck.HealthCheck?.Id) {
      logger.error(
        "Health Check ID is undefined in CreateHealthCheck response",
        {
          CallerReference: uniqueCallerReference,
          requestId: healthCheck.$metadata?.requestId,
        }
      );
      throw new Error("Health Check ID is undefined for created Health Check");
    }

    logger.info("Created Route53 Health Check", {
      CreatedHealthCheckId: healthCheck.HealthCheck.Id,
    });
    return healthCheck.HealthCheck.Id;
  }

  async createCloudWatchAlarm(
    cloudWatchClient: CloudWatchClient,
    metric: string,
    dimension: Dimension,
    evaluationPeriods: number,
    statistic: Statistic,
    threshold: number,
    namespace: string
  ): Promise<string> {
    const uniqueId = randomstring.generate({
      length: 32,
      readable: true,
      charset: "alphabetic",
    });
    const alarmName = `FMS-Shield-${this.shieldProtectionId}-${uniqueId}`;
    const putMetricAlarmCommand = new PutMetricAlarmCommand({
      AlarmName: alarmName,
      AlarmDescription: `Alarm for Health Check associated with Shield Protection ${this.shieldProtectionId} with Metric ${metric}`,
      ActionsEnabled: false,
      ComparisonOperator: ComparisonOperator.GreaterThanOrEqualToThreshold,
      DatapointsToAlarm: 1,
      TreatMissingData: "notBreaching",
      Statistic: statistic,
      EvaluationPeriods: evaluationPeriods,
      Period: 60,
      Threshold: threshold,
      Namespace: namespace,
      MetricName: metric,
      Dimensions: [dimension],
    });

    await cloudWatchClient.send(putMetricAlarmCommand);
    return alarmName;
  }

  /**
   * @description Deletes CloudWatch Alarm with given name.
   */
  async deleteCloudWatchAlarms(
    cloudWatchClient: CloudWatchClient,
    alarmNames: string[]
  ): Promise<void> {
    logger.info("Deleting created CloudWatch alarms", {
      CreatedAlarms: alarmNames,
    });

    const deleteAlarmsCommand = new DeleteAlarmsCommand({
      AlarmNames: alarmNames,
    });

    await cloudWatchClient.send(deleteAlarmsCommand);
  }

  /**
   * @description Deletes Health Check with given name.
   */
  async deleteHealthChecks(
    route53Client: Route53Client,
    healthCheckIds: string[]
  ): Promise<void> {
    await Promise.all(
      healthCheckIds.map(async (healthCheckId) => {
        logger.info("Deleting created Route53 Health Check", {
          CreatedHealthCheckId: healthCheckId,
        });

        const deleteHealthCheckCommand = new DeleteHealthCheckCommand({
          HealthCheckId: healthCheckId,
        });

        await route53Client.send(deleteHealthCheckCommand);
      })
    );
  }

  /**
   * @description Creates CloudWatch Alarms and uses them to create new Health Checks
   * for the provided Shield Resource configuration.
   */
  async remediateByResourceType(
    cloudWatchClient: CloudWatchClient,
    route53Client: Route53Client,
    resourceId: string,
    alarmConfigurations: AlarmMetricConfig[]
  ): Promise<void> {
    const createdHealthCheckIds: string[] = [];
    const createdCloudWatchAlarms: string[] = [];

    try {
      for (const alarmMetricConfig of alarmConfigurations) {
        const dimension: Dimension = {
          Name: alarmMetricConfig.dimensionName,
          Value: resourceId,
        };
        const alarmName: string = await this.createCloudWatchAlarm(
          cloudWatchClient,
          alarmMetricConfig.metric,
          dimension,
          alarmMetricConfig.evaluationPeriods,
          alarmMetricConfig.statistic,
          alarmMetricConfig.threshold,
          alarmMetricConfig.namespace
        );
        createdCloudWatchAlarms.push(alarmName);

        const healthCheckId: string = await this.createHealthCheck(
          route53Client,
          HealthCheckType.CLOUDWATCH_METRIC,
          alarmName,
          []
        );
        createdHealthCheckIds.push(healthCheckId);

        await this.sleep(2000); // Required to avoid breaching Route53 API service limit
      }

      const calculatedHealthCheckId: string = await this.createHealthCheck(
        route53Client,
        HealthCheckType.CALCULATED,
        "",
        createdHealthCheckIds
      );

      await this.shieldHandler.associateHealthCheck(
        this.shieldProtectionId,
        calculatedHealthCheckId
      );
    } catch (e) {
      let reason = "Received Error during Health Check creation.";

      if (e.name === "TooManyHealthChecks") {
        reason = "Route53 Health Check service limit reached.";
        await this.shieldHandler.publishShieldTopicMessage(
          SNS_REMEDIATION_ERROR_SUBJECT,
          getSNSErrorMessageBody(
            this.accountId,
            this.shieldProtectionId,
            SNS_HEALTH_CHECK_LIMIT_REASON
          )
        );
      } else if (e.name === "LimitExceededFault") {
        reason = "CloudWatch Alarm service limit reached.";
        await this.shieldHandler.publishShieldTopicMessage(
          SNS_REMEDIATION_ERROR_SUBJECT,
          getSNSErrorMessageBody(
            this.accountId,
            this.shieldProtectionId,
            SNS_CLOUDWATCH_ALARM_LIMIT_REASON
          )
        );
      }

      logger.error(
        `Error occurred during remediation of resource ${resourceId}`,
        {
          Reason: reason,
          Error: e,
          requestId: e.$metadata?.requestId,
        }
      );

      await this.deleteHealthChecks(route53Client, createdHealthCheckIds);
      await this.deleteCloudWatchAlarms(
        cloudWatchClient,
        createdCloudWatchAlarms
      );

      if (e.name === "TooManyHealthChecks" || e.name === "LimitExceededFault") {
        // avoid throwing error and retrying remediation request
        // since service-limit must be addressed manually
        return;
      }
      throw e; // Error must bubble-up to PowerTools batch processor for retry
    }
  }

  /**
   * @description Sleeps for the provided number of milliseconds.
   */
  async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
