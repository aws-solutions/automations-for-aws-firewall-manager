/**
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
 * AWS Centralized WAF & Security Group Automation
 * Microservice to validate and install pre-requisites for the solution
 * This must be deployed in Organization Master account
 * @author aws-solutions
 */

import { PreReqManager } from "./lib/preReqManager";
import { logger } from "./lib/common/logger";
import { Metrics } from "./lib/common/metrics";
import moment from "moment";

interface IEvent {
  RequestType: string;
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  ResourceProperties: any;
  PhysicalResourceId?: string;
}
/**
 * @description Lambda event handler for pre-requisite manager
 * @param {IEvent} event - invoking event
 */
exports.handler = async (event: IEvent, context: any) => {
  logger.debug({
    label: "PreRegManager",
    message: `event: ${JSON.stringify(event)}`,
  });

  let responseData: any = {
    Data: "NOV",
  };
  let status = "SUCCESS";
  const properties = event.ResourceProperties;
  const metric = {
    Solution: properties.SolutionId,
    UUID: properties.SolutionUuid,
    TimeStamp: "",
    Data: {},
  };

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
        await _pm.orgMasterCheck(); // check for deployment in master
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
          let retry = true;
          let retryCount = 0;
          while (retry && retryCount < 10) {
            await delay(1000 * Math.random());
            await _pm
              .enableConfig()
              .then((_) => {
                retry = false;
              })
              .catch((_) => {
                retryCount++;
              }); // enable config in organization
          }
          if (retryCount === 10)
            logger.warn({
              label: "PreReqManager",
              message: "stack set instance creation failed",
            });
          else
            logger.debug({
              label: "PreReqManager",
              message: "stack set instance creation success",
            });
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
          metric.TimeStamp = moment.utc().format("YYYY-MM-DD HH:mm:ss.S");
          metric.Data = {
            Event: "PreReqsInstalled",
            Stack: "PreReqStack",
            Version: properties.SolutionVersion,
          };
          await Metrics.sendAnonymousMetric(
            <string>process.env.METRICS_ENDPOINT,
            metric
          );
        }
        responseData = {
          PreReqCheck: true,
        };
      } catch (e) {
        // send Metrics
        if (process.env.SEND_METRIC === "Yes") {
          metric.TimeStamp = moment.utc().format("YYYY-MM-DD HH:mm:ss.S");
          metric.Data = {
            Event: "PreReqsInstallFailed",
            Stack: "PreReqStack",
            Version: properties.SolutionVersion,
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
  responseData: any
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

/**
 * @description sleep function
 * @param {number} ms - delay in milliseconds
 */
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
