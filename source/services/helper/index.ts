// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { v4 as uuidv4 } from "uuid";
import { logger } from "solutions-utils";
import { FMSClient, GetAdminAccountCommand } from "@aws-sdk/client-fms";
import {
  ShieldClient,
  GetSubscriptionStateCommand,
  GetSubscriptionStateResponse,
  SubscriptionState,
} from "@aws-sdk/client-shield";
import { Context } from "aws-lambda";
import type { LambdaInterface } from "@aws-lambda-powertools/commons/types";
import {
  DescribeOrganizationCommand,
  OrganizationsClient,
} from "@aws-sdk/client-organizations";
import {
  DescribeSeverityLevelsCommand,
  SupportClient,
} from "@aws-sdk/client-support";

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

export interface HelperResponse {
  ResponseData: { [p: string]: string };
  Status: string;
}

class HelperLambda implements LambdaInterface {
  @logger.injectLambdaContext()
  public async handler(
    event: IEvent,
    context: Context
  ): Promise<{
    Status: string;
    LogicalResourceId: string;
    RequestId: string;
    PhysicalResourceId: string;
    Data: { [p: string]: string };
    Reason: string;
    StackId: string;
  }> {
    logger.debug("Received incoming event", {
      lambdaEvent: event,
    });

    let responseData: { [key: string]: string } = {
      Data: "NOV",
    };

    let status = "SUCCESS";
    const properties = event.ResourceProperties;

    if (
      event.ResourceType === "Custom::CreateUUID" &&
      event.RequestType === "Create"
    ) {
      const createUUIDResponse: HelperResponse = this.createUUID();

      status = createUUIDResponse.Status;
      responseData = createUUIDResponse.ResponseData;
    } else if (
      event.ResourceType === "Custom::FMSAdminCheck" &&
      event.RequestType === "Create" &&
      properties.Stack === "FMSStack"
    ) {
      const fmsAdminCheckResponse = await this.FMSAdminCheck(properties);

      status = fmsAdminCheckResponse.Status;
      responseData = fmsAdminCheckResponse.ResponseData;
    } else if (
      event.ResourceType === "Custom::DescribeOrganization" &&
      event.RequestType === "Create"
    ) {
      const describeOrganizationResponse: HelperResponse =
        await this.describeOrganization(properties);

      status = describeOrganizationResponse.Status;
      responseData = describeOrganizationResponse.ResponseData;
    } else if (
      event.ResourceType === "Custom::ShieldSubscriptionCheck" &&
      event.RequestType === "Create"
    ) {
      const shieldSubscriptionCheckResponse: HelperResponse =
        await this.shieldSubscriptionCheck(properties);

      status = shieldSubscriptionCheckResponse.Status;
      responseData = shieldSubscriptionCheckResponse.ResponseData;
    } else if (
      event.ResourceType === "Custom::SupportPlanCheck" &&
      event.RequestType === "Create"
    ) {
      const supportPlanCheckResponse: HelperResponse =
        await this.supportPlanCheck(properties);

      status = supportPlanCheckResponse.Status;
      responseData = supportPlanCheckResponse.ResponseData;
    }
    /**
     * Send response back to custom resource
     */
    return this.sendResponse(
      event,
      context.logStreamName,
      status,
      responseData
    );
  }

  private createUUID(): HelperResponse {
    const responseData = {
      UUID: uuidv4(),
    };
    logger.debug("Invoke helper/UUID", {
      UUID: responseData.UUID,
    });
    return {
      ResponseData: responseData,
      Status: "SUCCESS",
    };
  }

  private async FMSAdminCheck(properties: {
    [key: string]: string;
  }): Promise<HelperResponse> {
    logger.debug("helper/FMSAdminCheck");
    const fms = new FMSClient({ region: properties.Region });
    try {
      const resp = await fms.send(new GetAdminAccountCommand({}));
      if (resp.AdminAccount != properties.Account) {
        throw new Error(
          `the firewall manager admin account status is ${resp.RoleStatus}, please deploy the stack in FMS Admin account`
        );
      }

      return {
        ResponseData: { Data: "NOV" },
        Status: "SUCCESS",
      };
    } catch (e) {
      logger.error("helper/FMSAdminCheck", {
        FMSAdminCheckError: e as Error,
      });
      return {
        ResponseData: {
          Error: e.message,
        },
        Status: "FAILED",
      };
    }
  }

  private async describeOrganization(properties: {
    [key: string]: string;
  }): Promise<HelperResponse> {
    logger.debug("helper/DescribeOrganization");
    const organizationClient = new OrganizationsClient({
      region: properties.Region,
    });
    try {
      const describeOrganizationResponse = await organizationClient.send(
        new DescribeOrganizationCommand({})
      );
      if (
        !describeOrganizationResponse.Organization ||
        !describeOrganizationResponse.Organization.Id ||
        !describeOrganizationResponse.Organization.MasterAccountId
      ) {
        throw new Error(`could not retrieve Organization information`);
      }

      return {
        ResponseData: {
          organizationId: describeOrganizationResponse.Organization.Id,
          organizationManagementAccountId:
            describeOrganizationResponse.Organization.MasterAccountId,
        },
        Status: "SUCCESS",
      };
    } catch (e) {
      logger.error("helper/DescribeOrganization", {
        DescribeOrganizationError: e as Error,
      });
      return {
        ResponseData: {
          Error: e.message,
        },
        Status: "FAILED",
      };
    }
  }

  private async shieldSubscriptionCheck(properties: {
    [key: string]: string;
  }): Promise<HelperResponse> {
    logger.debug("helper/ShieldSubscriptionCheck");
    const shieldClient = new ShieldClient({ region: properties.Region });

    try {
      const resp: GetSubscriptionStateResponse = await shieldClient.send(
        new GetSubscriptionStateCommand({})
      );
      if (resp.SubscriptionState !== SubscriptionState.ACTIVE) {
        throw new Error(
          "please subscribe to Shield Advanced before deploying the stack."
        );
      }

      return {
        ResponseData: { Data: "NOV" },
        Status: "SUCCESS",
      };
    } catch (e) {
      logger.error("helper/ShieldSubscriptionCheck", {
        ShieldSubscriptionCheckError: e as Error,
      });
      return {
        ResponseData: {
          Error: e.message,
        },
        Status: "FAILED",
      };
    }
  }

  private async supportPlanCheck(properties: {
    [key: string]: string;
  }): Promise<HelperResponse> {
    logger.debug("helper/SupportPlanCheck");
    const supportClient = new SupportClient({ region: properties.Region });

    try {
      // arbitrary call to Support API to verify that deployer has Support Plan
      await supportClient.send(
        new DescribeSeverityLevelsCommand({
          language: "en",
        })
      );

      return {
        ResponseData: { Data: "NOV" },
        Status: "SUCCESS",
      };
    } catch (e) {
      const responseData = { Error: e.message };
      const status = "FAILED";
      if (e.name === "SubscriptionRequiredException") {
        logger.error("helper/SupportPlanCheck", {
          SupportPlanCheckError: e as Error,
        });
        responseData.Error =
          "please subscribe to an AWS Business/Enterprise Support plan before deploying the stack.";
      }
      return {
        ResponseData: responseData,
        Status: status,
      };
    }
  }

  /**
   * Sends a response to custom resource
   * for Create/Update/Delete
   * @param {any} event - Custom Resource event
   * @param {string} logStreamName - CloudWatch logs stream
   * @param {string} responseStatus - response status
   * @param {any} responseData - response data
   */
  private async sendResponse(
    event: IEvent,
    logStreamName: string,
    responseStatus: string,
    responseData: { [key: string]: string }
  ) {
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

    logger.debug("helper/sendResponse", {
      responseBody: responseBody,
    });

    if (responseStatus === "FAILED") {
      const responseError = new Error(responseBody.Reason);
      logger.error("helper/sendResponse", {
        responseStatus: responseStatus,
        sendResponseError: responseError,
      });
      throw responseError;
    } else return responseBody;
  }
}

const handlerClass = new HelperLambda();
export const handler = handlerClass.handler.bind(handlerClass);
