// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { IEvent } from "../index";
import { mockClient } from "aws-sdk-client-mock";
import { FMSClient, GetAdminAccountCommand } from "@aws-sdk/client-fms";
import { handler } from "../index";
const firewallManagerClientMock = mockClient(FMSClient);

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

    const CREATE_LAUNCH_DATA_EVENT = {
      ResourceType: "Custom::LaunchData",
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

      try {
        await handler(CREATE_EVENT_ADMIN_CHECK, {});
      } catch (e) {
        expect(e.message).toEqual(
          "please deploy the stack in FMS Admin account"
        );
      }
    });

    it("creates new UUID event", async function () {
      firewallManagerClientMock.on(GetAdminAccountCommand).resolves({
        AdminAccount: FIREWALL_MGR_ADMIN_ACCOUNT_ID,
      });
      const data = await handler(CREATE_UUID_EVENT, {});
      expect(data.Status).toBe("SUCCESS");
      expect(data.Data["UUID"]).not.toBeNull();
    });

    it("creates new launch data event", async function () {
      process.env.SEND_METRIC == "Yes";
      firewallManagerClientMock.on(GetAdminAccountCommand).resolves({
        AdminAccount: FIREWALL_MGR_ADMIN_ACCOUNT_ID,
      });
      
      const data = await handler(CREATE_LAUNCH_DATA_EVENT, {});
      expect(data.Status).toBe("SUCCESS");
    });
  });
});
