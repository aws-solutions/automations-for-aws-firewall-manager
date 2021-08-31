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

/**
 * @description
 * AWS Firewall Manager Automations for AWS Organizations
 * Microservice to validate and install pre-requisites for the solution
 * This must be deployed in Organization Management account
 * @author aws-solutions
 */

import { PreReqManager } from "./lib/preReqManager";
import { logger } from "./lib/common/logger";
import { Metrics } from "./lib/common/metrics";

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
/**
 * @description Lambda event handler for pre-requisite manager
 * @param {IEvent} event - invoking event
 */
exports.handler = async (event: IEvent, context: { [key: string]: string }) => {
  logger.debug({
    label: "PreRegManager",
    message: `event: ${JSON.stringify(event)}`,
  });

  let responseData: { [key: string]: string } = {
    Data: "NOV",
  };
  let status = "SUCCESS";
  const properties = event.ResourceProperties;

  // pre-req checker custom resource CREATE event
  if (event.ResourceType === "Custom::PreReqChecker") {
    const _pm = new PreReqManager({
      fmsAdmin: properties.FMSAdmin,
      accountId: properties.AccountId,
      region: properties.Region,
      globalStackSetName: properties.GlobalStackSetName,
      regionalStackSetName: properties.RegionalStackSetName,
    });
    if (event.RequestType === "Create" || event.RequestType === "Update") {
      try {
        await _pm.orgFeatureCheck(); // check for all features enabled
        await _pm.orgMgmtCheck(); // check for deployment in org management account
        await _pm.fmsAdminCheck(); // configure fms admin
        await _pm.enableTrustedAccess(); // enable trusted access

        if (
          properties.EnableConfig === "No" &&
          event.RequestType === "Create"
        ) {
          logger.warn({
            label: "PreReqManager",
            message: `skipping AWS Config check`,
          });
        } else if (properties.EnableConfig === "Yes") {
          await _pm.enableConfig(); // enable config in organization
        } else if (
          properties.EnableConfig === "No" &&
          event.RequestType === "Update"
        ) {
          // delete config
          await _pm.deleteConfig().catch((e) => {
            logger.warn({
              label: "PreReqManager",
              message: e.message,
            });
          });
        }

        logger.info({
          label: "PreRegManager",
          message: `All pre requisites validated & installed`,
        });

        // send Metrics
        if (process.env.SEND_METRIC === "Yes") {
          const metric = {
            Solution: properties.SolutionId,
            UUID: properties.SolutionUuid,
            TimeStamp: new Date()
              .toISOString()
              .replace("T", " ")
              .replace("Z", ""),
            Data: {
              Event: "PreReqsInstalled",
              Stack: "PreReqStack",
              Version: properties.SolutionVersion,
            },
          };
          await Metrics.sendAnonymousMetric(
            <string>process.env.METRICS_ENDPOINT,
            metric
          );
        }
        responseData = {
          PreReqCheck: "true",
        };
      } catch (e) {
        logger.error({
          label: "PreReqManager",
          message: e.message,
        });
        // send Metrics
        if (process.env.SEND_METRIC === "Yes") {
          const metric = {
            Solution: properties.SolutionId,
            UUID: properties.SolutionUuid,
            TimeStamp: new Date()
              .toISOString()
              .replace("T", " ")
              .replace("Z", ""),
            Data: {
              Event: "PreReqsInstallFailed",
              Stack: "PreReqStack",
              Version: properties.SolutionVersion,
            },
          };
          await Metrics.sendAnonymousMetric(
            <string>process.env.METRICS_ENDPOINT,
            metric
          );
        }
        responseData = {
          Error: e.message,
        };
        status = "FAILED";
      }
    }
    if (event.RequestType === "Delete") {
      await _pm.deleteConfig().catch((e) => {
        logger.warn({
          label: "PreReqManager",
          message: e.message,
        });
      });

      responseData = {
        Data: "Delete Config initiated",
      };
    }
  }

  /**
   * Send response back to custom resource
   */
  return await sendResponse(event, context.logStreamName, status, responseData);
};

/**
 * @description sends a response to custom resource
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
    label: "PreRegManager/sendResponse",
    message: `ResponseBody: ${JSON.stringify(responseBody)}`,
  });
  if (responseStatus === "FAILED") {
    logger.error({
      label: "PreRegManager/sendResponse",
      message: responseBody.Reason,
    });
    throw new Error(responseBody.Data.Error);
  } else return responseBody;
};
