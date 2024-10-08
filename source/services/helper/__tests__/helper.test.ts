// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { IEvent } from "../index";
import { mockClient } from "aws-sdk-client-mock";
import { FMSClient, GetAdminAccountCommand } from "@aws-sdk/client-fms";
import {
  ShieldClient,
  GetSubscriptionStateCommand,
} from "@aws-sdk/client-shield";
import { handler } from "../index";
import {
  DescribeOrganizationCommand,
  OrganizationsClient,
} from "@aws-sdk/client-organizations";
import {
  DescribeSeverityLevelsCommand,
  SupportClient,
  SupportServiceException,
} from "@aws-sdk/client-support";
const firewallManagerClientMock = mockClient(FMSClient);
const organizationsClientMock = mockClient(OrganizationsClient);
const shieldClientMock = mockClient(ShieldClient);
const supportClientMock = mockClient(SupportClient);

jest.mock("solutions-utils");

describe("helper", function () {
  describe("Create event", function () {
    const FIREWALL_MGR_ADMIN_ACCOUNT_ID = "bar";

    const CREATE_EVENT_ADMIN_CHECK = {
      ResourceType: "Custom::FMSAdminCheck",
      RequestType: "Create",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      ResourceProperties: {
        FMSAdmin: "FIREWALL_MGR_ADMIN_ACCOUNT_ID",
        AccountId: "MASTER_ACCOUNT_ID",
        Region: "baz",
        Stack: "FMSStack",
        GlobalStackSetName: "quz",
        RegionalStackSetName: "quz-baz",
      } as { [key: string]: string },
    } as IEvent;

    const CREATE_UUID_EVENT = {
      ResourceType: "Custom::CreateUUID",
      RequestType: "Create",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      ResourceProperties: {
        FMSAdmin: "FIREWALL_MGR_ADMIN_ACCOUNT_ID",
        AccountId: "MASTER_ACCOUNT_ID",
        Region: "baz",
        Stack: "FMSStack",
        GlobalStackSetName: "quz",
        RegionalStackSetName: "quz-baz",
      } as { [key: string]: string },
    } as IEvent;

    const DESCRIBE_ORGANIZATION_EVENT = {
      ResourceType: "Custom::DescribeOrganization",
      RequestType: "Create",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      ResourceProperties: {
        FMSAdmin: "FIREWALL_MGR_ADMIN_ACCOUNT_ID",
        AccountId: "MASTER_ACCOUNT_ID",
        Region: "baz",
        Stack: "FMSStack",
        GlobalStackSetName: "quz",
        RegionalStackSetName: "quz-baz",
      } as { [key: string]: string },
    } as IEvent;

    it("fails if requesting account is not an admin account", async function () {
      firewallManagerClientMock.on(GetAdminAccountCommand).resolves({
        AdminAccount: FIREWALL_MGR_ADMIN_ACCOUNT_ID,
      });

      await expect(handler(CREATE_EVENT_ADMIN_CHECK, {})).rejects.toThrow(
        /please deploy the stack in FMS Admin account/
      );
    });

    it("creates new UUID event", async function () {
      firewallManagerClientMock.on(GetAdminAccountCommand).resolves({
        AdminAccount: FIREWALL_MGR_ADMIN_ACCOUNT_ID,
      });

      const data = await handler(CREATE_UUID_EVENT, {});
      expect(data.Status).toBe("SUCCESS");
      expect(data.Data["UUID"]).not.toBeNull();
    });

    it("retrieves the Organization ID", async function () {
      const exampleOrgId = "o-exampleorgid";
      const exampleManagementAccountId = "Management_Account_ID";

      organizationsClientMock.on(DescribeOrganizationCommand).resolves({
        Organization: {
          Id: exampleOrgId,
          MasterAccountId: exampleManagementAccountId,
        },
      });

      const data = await handler(DESCRIBE_ORGANIZATION_EVENT, {});
      expect(data.Status).toBe("SUCCESS");
      expect(data.Data["organizationId"]).toEqual(exampleOrgId);
    });

    it("retrieves the Organization's Management Account ID", async function () {
      const exampleOrgId = "o-exampleorgid";
      const exampleManagementAccountId = "Management_Account_ID";

      organizationsClientMock.on(DescribeOrganizationCommand).resolves({
        Organization: {
          Id: exampleOrgId,
          MasterAccountId: exampleManagementAccountId,
        },
      });

      const data = await handler(DESCRIBE_ORGANIZATION_EVENT, {});
      expect(data.Status).toBe("SUCCESS");
      expect(data.Data["organizationManagementAccountId"]).toEqual(
        exampleManagementAccountId
      );
    });
  });

  describe("ProactiveEventResponseStack Create event", function () {
    const CREATE_EVENT_SHIELD_CHECK = {
      ResourceType: "Custom::ShieldSubscriptionCheck",
      RequestType: "Create",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      ResourceProperties: {
        AccountId: "MASTER_ACCOUNT_ID",
        Region: "baz",
        Stack: "ProactiveEventResponseStack",
        GlobalStackSetName: "quz",
        RegionalStackSetName: "quz-baz",
      } as { [key: string]: string },
    } as IEvent;

    const CREATE_EVENT_SUPPORT_CHECK = {
      ResourceType: "Custom::SupportPlanCheck",
      RequestType: "Create",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      ResourceProperties: {
        AccountId: "MASTER_ACCOUNT_ID",
        Region: "baz",
        Stack: "ProactiveEventResponseStack",
        GlobalStackSetName: "quz",
        RegionalStackSetName: "quz-baz",
      } as { [key: string]: string },
    } as IEvent;

    const CREATE_UUID_EVENT = {
      ResourceType: "Custom::CreateUUID",
      RequestType: "Create",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      ResourceProperties: {
        AccountId: "MASTER_ACCOUNT_ID",
        Region: "baz",
        Stack: "ProactiveEventResponseStack",
        GlobalStackSetName: "quz",
        RegionalStackSetName: "quz-baz",
      } as { [key: string]: string },
    } as IEvent;

    it("creates new UUID event", async function () {
      const data = await handler(CREATE_UUID_EVENT, {});
      expect(data.Status).toBe("SUCCESS");
      expect(data.Data["UUID"]).not.toBeNull();
    });

    it("fails if requesting account is not subscribed to Shield Advanced", async function () {
      shieldClientMock.on(GetSubscriptionStateCommand).resolves({
        SubscriptionState: "INACTIVE",
      });
      await expect(handler(CREATE_EVENT_SHIELD_CHECK, {})).rejects.toThrow(
        "please subscribe to Shield Advanced before deploying the stack."
      );
    });

    it("fails if requesting account is not subscribed to Support Plan", async function () {
      const exception = new SupportServiceException({
        name: "SubscriptionRequiredException",
        $fault: "client",
        $metadata: {},
      });
      supportClientMock.on(DescribeSeverityLevelsCommand).rejects(exception);

      await expect(handler(CREATE_EVENT_SUPPORT_CHECK, {})).rejects.toThrow(
        "please subscribe to an AWS Business/Enterprise Support plan before deploying the stack."
      );
    });

    it("succeeds if requesting account is subscribed to Shield Advanced", async function () {
      shieldClientMock.on(GetSubscriptionStateCommand).resolves({
        SubscriptionState: "ACTIVE",
      });
      const data = await handler(CREATE_EVENT_SHIELD_CHECK, {});
      expect(data.Status).toBe("SUCCESS");
    });
  });
});
