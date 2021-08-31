/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { v4 as uuidv4 } from "uuid";
import { logger } from "./lib/common/logger";
import { Metrics } from "./lib/common/metrics";
import { FMSClient, GetAdminAccountCommand } from "@aws-sdk/client-fms";

interface IEvent {
  RequestType: string;
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  ResourceProperties: { [key: string]: string };
  PhysicalResourceId?: string;
}

exports.handler = async (event: IEvent, context: { [key: string]: string }) => {
  logger.debug({
    label: "helper",
    message: `received event: ${JSON.stringify(event)}`,
  });

  let responseData: { [key: string]: string } = {
    Data: "NOV",
  };

  let status = "SUCCESS";
  const properties = event.ResourceProperties;

  // Generate UUID
  if (
    event.ResourceType === "Custom::CreateUUID" &&
    event.RequestType === "Create"
  ) {
    responseData = {
      UUID: uuidv4(),
    };
    logger.debug({
      label: "helper/UUID",
      message: `uuid create: ${responseData.UUID}`,
    });
  }
  // Send launch metric
  else if (
    event.ResourceType === "Custom::LaunchData" &&
    process.env.SEND_METRIC === "Yes"
  ) {
    logger.debug({
      label: "helper/LaunchData",
      message: `sending launch data`,
    });
    let eventType = "";
    if (event.RequestType === "Create") {
      eventType = "SolutionLaunched";
    } else if (event.RequestType === "Delete") {
      eventType = "SolutionDeleted";
    }

    const metric = {
      Solution: properties.SolutionId,
      UUID: properties.SolutionUuid,
      TimeStamp: new Date().toISOString().replace("T", " ").replace("Z", ""), // Date and time instant in a java.sql.Timestamp compatible format,
      Data: {
        Event: eventType,
        Stack: properties.Stack,
        Version: properties.SolutionVersion,
      },
    };
    await Metrics.sendAnonymousMetric(
      <string>process.env.METRICS_ENDPOINT,
      metric
    );
  }
  // Check deployment account is FMS Admin
  else if (
    event.ResourceType === "Custom::FMSAdminCheck" &&
    event.RequestType === "Create" &&
    properties.Stack === "FMSStack"
  ) {
    logger.debug({
      label: "helper/FMSAdminCheck",
      message: `validating deployment account is FMS Admin`,
    });
    const fms = new FMSClient({
      region: properties.Region,
    });
    try {
      const resp = await fms.send(new GetAdminAccountCommand({}));
      if (resp.AdminAccount != properties.Account) {
        logger.error({
          label: "helper/FMSAdminCheck",
          message: `deploy the stack in FMS Admin account`,
        });
        throw new Error("please deploy the stack in FMS Admin account");
      }
    } catch (e) {
      responseData = {
        Error: e.message,
      };
      status = "FAILED";
    }
  }
  /**
   * Send response back to custom resource
   */
  return sendResponse(event, context.logStreamName, status, responseData);
};

/**
 * Sends a response to custom resource
 * for Create/Update/Delete
 * @param {any} event - Custom Resource event
 * @param {string} logStreamName - CloudWatch logs stream
 * @param {string} responseStatus - response status
 * @param {any} responseData - response data
 */
const sendResponse = async (
  event: IEvent,
  logStreamName: string,
  responseStatus: string,
  responseData: { [key: string]: string }
) => {
  const responseBody = {
    Status: responseStatus,
    Reason: `${JSON.stringify(responseData)}`,
    PhysicalResourceId: event.PhysicalResourceId
      ? event.PhysicalResourceId
      : logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData,
  };

  logger.debug({
    label: "helper/sendResponse",
    message: `Response Body: ${JSON.stringify(responseBody)}`,
  });

  if (responseStatus === "FAILED") {
    logger.error({
      label: "helper/sendResponse",
      message: responseBody.Reason,
    });
    throw new Error(responseBody.Data.Error);
  } else return responseBody;
};
