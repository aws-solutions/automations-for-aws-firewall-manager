// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Automations for AWS Firewall Manager
 * Microservice to validate and install pre-requisites for the solution
 * This must be deployed in Organization Management account
 * @author aws-solutions
 */

import { IPreReq, PreReqManager } from "./lib/preReqManager";
import { logger } from "./lib/common/logger";
import { Metrics } from "./lib/common/metrics";
import { FirewallManagerAdminSetup } from "./lib/firewallManagerAdminSetup";
import { FMSClient } from "@aws-sdk/client-fms";
import { customUserAgent, dataplane } from "./lib/exports";

export interface IEvent {
  RequestType: string;
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  ResourceProperties: { [key: string]: string };
  PhysicalResourceId?: string;
}

export interface Response {
  Status: string;
  LogicalResourceId: string;
  RequestId: string;
  PhysicalResourceId: string;
  Data: { [p: string]: string } | undefined;
  Reason: string | undefined;
  StackId: string;
}

/**
 * @description Lambda event handler for pre-requisite manager
 * @param {IEvent} event - invoking event
 * @param context - invocation context
 */
export const handler = async (
  event: IEvent,
  context: { [key: string]: string }
) => {
  logger.debug({
    label: "PreRegManager",
    message: `event: ${JSON.stringify(event)}`,
  });

  switch (event.RequestType) {
    case "Create":
    case "Update":
      return handleCreateOrUpdate(event.ResourceProperties, event, context);
    case "Delete":
      return handleDelete(event.ResourceProperties, event, context);
    default:
      return failureResponse(
        event,
        context.logStreamName,
        "Request type must be Create | Update | Delete, but was: " +
          event.RequestType
      );
  }
};

function responseOf(
  status: string,
  reason: string | undefined,
  event: IEvent,
  logStreamName: string,
  data: { [p: string]: string } | undefined
) {
  const response: Response = {
    Status: status,
    Reason: reason,
    PhysicalResourceId: event.PhysicalResourceId || logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: data,
  };
  return response;
}

/**
 * @description create a success response object to send back to cloudformation
 * @param {any} event - Custom Resource event
 * @param {string} logStreamName - CloudWatch logs stream
 * @param {any} responseData - response data
 */
const successResponse = (
  event: IEvent,
  logStreamName: string,
  responseData: { [key: string]: string }
): Response => {
  const response = responseOf(
    "SUCCESS",
    undefined,
    event,
    logStreamName,
    responseData
  );

  logger.debug({
    label: "PreRegManager/successResponse",
    message: `ResponseBody: ${JSON.stringify(response)}`,
  });
  return response;
};

/**
 * @description create a failure response object to send back to cloudformation
 * @param {any} event - Custom Resource event
 * @param {string} logStreamName - CloudWatch logs stream
 * @param {string} reason - description of the reason why the request failed
 */
const failureResponse = (
  event: IEvent,
  logStreamName: string,
  reason: string
): Response => {
  const response = responseOf(
    "FAILED",
    reason,
    event,
    logStreamName,
    undefined
  );

  logger.error({
    label: "PreRegManager/failureResponse",
    message: response.Reason,
  });

  return response;
};

async function sendMetrics(properties: { [p: string]: string }, event: string) {
  if (process.env.SEND_METRIC === "Yes") {
    const metric = {
      Solution: properties.SolutionId,
      UUID: properties.SolutionUuid,
      TimeStamp: new Date().toISOString().replace("T", " ").replace("Z", ""),
      Data: {
        Event: event,
        Stack: "PreReqStack",
        Version: properties.SolutionVersion,
      },
    };
    await Metrics.sendAnonymousMetric(
      <string>process.env.METRICS_ENDPOINT,
      metric
    );
  }
}

async function handleDelete(
  properties: { [p: string]: string },
  event: IEvent,
  context: { [p: string]: string }
) {
  const iPreReqProperties = mapInputProperties(properties);
  const preReqManager = new PreReqManager(iPreReqProperties);

  await preReqManager.deleteConfig().catch((e) => {
    logger.warn({
      label: "PreReqManager/Delete",
      message: e.message,
    });
  });

  return successResponse(event, context.logStreamName, {
    Data: "Delete Config initiated",
  });
}

/**
 * @description maps the generic caller input properties to {IPreReq}
 * @param properties
 */
function mapInputProperties(properties: { [p: string]: string }): IPreReq {
  const missingValues = [];
  if (!properties.AccountId?.trim()) missingValues.push("AccountId");
  if (!properties.Region?.trim()) missingValues.push("Region");
  if (!properties.GlobalStackSetName?.trim())
    missingValues.push("GlobalStackSetName");
  if (!properties.RegionalStackSetName?.trim())
    missingValues.push("RegionalStackSetName");

  if (missingValues.length)
    throw new Error(
      "Non-blank input values required for the following parameters: " +
        missingValues.join(", ")
    );

  return {
    accountId: properties.AccountId,
    region: properties.Region,
    globalStackSetName: properties.GlobalStackSetName,
    regionalStackSetName: properties.RegionalStackSetName,
  };
}

async function handleCreateOrUpdate(
  properties: { [p: string]: string },
  event: IEvent,
  context: { [p: string]: string }
) {
  try {
    const iPreReqProperties = mapInputProperties(properties);
    const _pm: PreReqManager = new PreReqManager(iPreReqProperties);
    const firewallManagerAdminSetup = new FirewallManagerAdminSetup({
      firewallManagerAdminAccountId: properties.FMSAdmin,
      firewallManagerClient: new FMSClient({
        customUserAgent,
        region: dataplane,
        maxAttempts: 3,
      }),
    });

    await _pm.throwIfOrgLacksFullFeatures(); // check for all features enabled
    await _pm.throwIfNotOrgManagementAccount(); // check for deployment in org management account
    await firewallManagerAdminSetup.setUpCurrentAccountAsFirewallManagerAdmin();
    await _pm.enableTrustedAccess(); // enable trusted access

    if (properties.EnableConfig === "Yes") {
      await _pm.enableConfig(); // enable config in organization
    } else {
      if (event.RequestType === "Create") {
        logger.warn({
          label: "PreReqManager/Create",
          message: `skipping AWS Config check`,
        });
      } else if (event.RequestType === "Update") {
        // delete config
        await _pm.deleteConfig().catch((e) => {
          logger.warn({
            label: "PreReqManager/Update",
            message: e.message,
          });
        });
      }
    }
  } catch (e) {
    logger.error({
      label: "PreReqManager",
      message: e.message,
    });

    await sendMetrics(properties, "PreReqsInstallFailed");
    return failureResponse(event, context.logStreamName, e.message);
  }

  logger.info({
    label: "PreRegManager",
    message: `All pre requisites validated & installed`,
  });

  await sendMetrics(properties, "PreReqsInstalled");
  return successResponse(event, context.logStreamName, {
    PreReqCheck: "true",
  });
}
