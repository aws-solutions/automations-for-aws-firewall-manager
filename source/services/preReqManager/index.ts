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
import { logger, tracer } from "solutions-utils";
import { FirewallManagerAdminSetup } from "./lib/firewallManagerAdminSetup";
import { FMSClient } from "@aws-sdk/client-fms";
import { customUserAgent, getDataplaneForPartition } from "./lib/exports";
import { Context } from "aws-lambda";
import type { LambdaInterface } from "@aws-lambda-powertools/commons/types";

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
class PreReqManagerLambda implements LambdaInterface {
  @tracer.captureLambdaHandler()
  @logger.injectLambdaContext()
  async handler(event: IEvent, context: Context) {
    logger.debug("PreReqManager recieved event", {
      event: event,
    });

    const dataplane = getDataplaneForPartition(process.env.PARTITION ?? "aws");
    const properties = {
      ...event.ResourceProperties,
      dataplane,
    };

    switch (event.RequestType) {
      case "Create":
      case "Update":
        return this.handleCreateOrUpdate(properties, event, context);
      case "Delete":
        return this.handleDelete(properties, event, context);
      default:
        return this.failureResponse(
          event,
          context.logStreamName,
          "Request type must be Create | Update | Delete, but was: " +
            event.RequestType
        );
    }
  }

  responseOf(
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
  successResponse(
    event: IEvent,
    logStreamName: string,
    responseData: { [key: string]: string }
  ) {
    const response = this.responseOf(
      "SUCCESS",
      undefined,
      event,
      logStreamName,
      responseData
    );

    logger.debug("created success response", {
      response: response,
    });
    return response;
  }

  /**
   * @description create a failure response object to send back to cloudformation
   * @param {any} event - Custom Resource event
   * @param {string} logStreamName - CloudWatch logs stream
   * @param {string} reason - description of the reason why the request failed
   */
  failureResponse(event: IEvent, logStreamName: string, reason: string) {
    const response = this.responseOf(
      "FAILED",
      reason,
      event,
      logStreamName,
      undefined
    );

    logger.error("created failure response", {
      response: response,
      reason: response.Reason,
    });

    return response;
  }

  async handleDelete(
    properties: { [p: string]: string },
    event: IEvent,
    context: Context
  ) {
    const iPreReqProperties = this.mapInputProperties(properties);
    const preReqManager = new PreReqManager(iPreReqProperties);

    await preReqManager.deleteConfig().catch((e) => {
      logger.warn("encountered error deleting stack instances", {
        error: e,
        requestId: e.$metadata?.requestId,
      });
    });

    return this.successResponse(event, context.logStreamName, {
      Data: "Delete Config initiated",
    });
  }

  /**
   * @description maps the generic caller input properties to {IPreReq}
   * @param properties
   */
  mapInputProperties(properties: { [p: string]: string }): IPreReq {
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
      dataplane: properties.dataplane,
      regionalStackSetName: properties.RegionalStackSetName,
    };
  }

  async handleCreateOrUpdate(
    properties: { [p: string]: string },
    event: IEvent,
    context: Context
  ) {
    try {
      const iPreReqProperties = this.mapInputProperties(properties);
      const _pm: PreReqManager = new PreReqManager(iPreReqProperties);
      const firewallManagerAdminSetup = new FirewallManagerAdminSetup({
        firewallManagerAdminAccountId: properties.FMSAdmin,
        firewallManagerClient: tracer.captureAWSv3Client(
          new FMSClient({
            customUserAgent: customUserAgent,
            region: properties.dataplane,
            maxAttempts: 3,
          })
        ),
      });

      await _pm.throwIfOrgLacksFullFeatures(); // check for all features enabled
      await _pm.throwIfNotOrgManagementAccount(); // check for deployment in org management account
      await firewallManagerAdminSetup.setUpCurrentAccountAsFirewallManagerAdmin();
      await _pm.enableTrustedAccess(); // enable trusted access

      if (properties.EnableConfig === "Yes") {
        await _pm.enableConfig(); // enable config in organization
      } else {
        if (event.RequestType === "Create") {
          logger.warn("skipping AWS Config check", {
            enableConfig: properties.EnableConfig,
          });
        } else if (event.RequestType === "Update") {
          // delete config
          await _pm.deleteConfig().catch((e) => {
            logger.warn("encountered error deleting stack instances", {
              error: e,
              requestId: e.$metadata?.requestId,
            });
          });
        }
      }
    } catch (e) {
      logger.error(`Encountered error during stack ${event.RequestType}`, {
        error: e,
        requestType: event.RequestType,
        requestId: e.$metadata?.requestId,
      });

      return this.failureResponse(event, context.logStreamName, e.message);
    }

    logger.info("validated & installed pre-requisites", {
      requestType: event.RequestType,
      enableConfig: properties.EnableConfig,
    });

    return this.successResponse(event, context.logStreamName, {
      PreReqCheck: "true",
    });
  }
}

const handlerClass = new PreReqManagerLambda();
export const handler = handlerClass.handler.bind(handlerClass);
