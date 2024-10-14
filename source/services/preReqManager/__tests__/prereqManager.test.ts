// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { handler, IEvent } from "../index";
import { mockClient } from "aws-sdk-client-mock";
import {
  DescribeOrganizationCommand,
  EnableAWSServiceAccessCommand,
  ListRootsCommand,
  OrganizationFeatureSet,
  OrganizationsClient,
} from "@aws-sdk/client-organizations";
import { RAMClient } from "@aws-sdk/client-ram";
import { FMSClient, GetAdminAccountCommand } from "@aws-sdk/client-fms";
import {
  ActivateOrganizationsAccessCommand,
  CloudFormationClient,
  CreateStackInstancesCommand,
  CreateStackSetCommand,
  DeleteStackInstancesCommand,
} from "@aws-sdk/client-cloudformation";
import "jest";
import { IPreReq, PreReqManager } from "../lib/preReqManager";
import { EC2Client } from "@aws-sdk/client-ec2";

const organizationsClientMock = mockClient(OrganizationsClient);
const cloudFormationClientMock = mockClient(CloudFormationClient);
const firewallManagerClientMock = mockClient(FMSClient);
const ramClientMock = mockClient(RAMClient);
const ec2Client = mockClient(EC2Client);

const iPreReq: IPreReq = {
  accountId: "bar",
  region: "baz",
  dataplane: "us-east-1",
  globalStackSetName: "quz",
  regionalStackSetName: "quz-baz",
};

const mockRegions = {
  Regions: [
    {
      Endpoint: "ec2.region-apne3.amazonaws.com",
      RegionName: "ap-northeast-3",
    },
    {
      Endpoint: "ec2.region-b.amazonaws.com",
      RegionName: "region-b",
    },
  ],
};

describe("[enableConfig]", () => {
  beforeEach(() => {
    cloudFormationClientMock.reset();
  });

  afterEach(() => {
    cloudFormationClientMock.reset();
  });

  test("fails cfstack name already exists error", async () => {
    const ee: Error = new Error("NameAlreadyExistsException");
    ee.name = "NameAlreadyExistsException";
    cloudFormationClientMock.on(CreateStackSetCommand).rejects(ee);
    const _pm: PreReqManager = new PreReqManager(iPreReq);
    await expect(_pm.enableConfig()).rejects.toThrow(
      /failed to create stack set instances/
    );
  });
});

describe("PreReqManager", function () {
  // PreReq check only succeeds when the current account is the Org's master account
  const MASTER_ACCOUNT_ID = "foo";
  // PreReq check only succeeds if the provided admin ID matches the ID of the existing firewall manager admin
  const FIREWALL_MGR_ADMIN_ACCOUNT_ID = "bar";

  beforeEach(() => {
    organizationsClientMock.reset();
    organizationsClientMock.onAnyCommand().resolves({});
    organizationsClientMock.on(DescribeOrganizationCommand).resolves({
      Organization: {
        FeatureSet: "ALL",
        MasterAccountId: MASTER_ACCOUNT_ID,
      },
    });
    organizationsClientMock.on(ListRootsCommand).resolves({
      Roots: [{ Id: "foo" }],
    });

    cloudFormationClientMock.reset();
    cloudFormationClientMock.onAnyCommand().resolves({});

    firewallManagerClientMock.reset();
    firewallManagerClientMock.on(GetAdminAccountCommand).resolves({
      AdminAccount: FIREWALL_MGR_ADMIN_ACCOUNT_ID,
    });

    ramClientMock.reset();
    ramClientMock.onAnyCommand().resolves({});

    ec2Client.reset();
    ec2Client.onAnyCommand().resolves(mockRegions);
  });

  describe("Create event", function () {
    // Sample of a valid Create event
    const CREATE_EVENT = {
      ResourceType: "Custom::PreReqChecker",
      RequestType: "Create",
      ResourceProperties: {
        FMSAdmin: FIREWALL_MGR_ADMIN_ACCOUNT_ID,
        AccountId: MASTER_ACCOUNT_ID,
        Region: "baz",
        GlobalStackSetName: "quz",
        RegionalStackSetName: "quz-baz",
      } as { [key: string]: string },
    } as IEvent;

    it("succeeds if account setup is valid", async function () {
      // when
      const response = await handler(CREATE_EVENT, {});

      // then
      expect(response.Status).toEqual("SUCCESS");
      expect(response.Data).toEqual({
        PreReqCheck: "true",
      });
      expect(
        organizationsClientMock.commandCalls(EnableAWSServiceAccessCommand)
      ).toHaveLength(2);
      expect(
        cloudFormationClientMock.commandCalls(
          ActivateOrganizationsAccessCommand
        )
      ).toHaveLength(1);
    });

    it("enables config when flag is 'Yes'", async function () {
      // given
      const updateEventWithEnableConfig = {
        ...CREATE_EVENT,
        ResourceProperties: {
          ...CREATE_EVENT.ResourceProperties,
          EnableConfig: "Yes",
        },
      };

      // when
      const response = await handler(updateEventWithEnableConfig, {});
      // then
      expect(response.Status).toEqual("SUCCESS");
      expect(response.Data).toEqual({
        PreReqCheck: "true",
      });
      expect(
        organizationsClientMock.commandCalls(EnableAWSServiceAccessCommand)
      ).toHaveLength(2);
      expect(
        cloudFormationClientMock.commandCalls(
          ActivateOrganizationsAccessCommand
        )
      ).toHaveLength(1);
      expect(
        cloudFormationClientMock.commandCalls(CreateStackSetCommand)
      ).toHaveLength(2);
      expect(
        cloudFormationClientMock.commandCalls(CreateStackInstancesCommand)
      ).toHaveLength(2);
    });

    it("fails if FeatureSet of organisation is not 'ALL'", async function () {
      // given
      const organizationsClientMock = mockClient(OrganizationsClient);
      organizationsClientMock.on(DescribeOrganizationCommand).resolves({
        Organization: {
          FeatureSet: OrganizationFeatureSet.CONSOLIDATED_BILLING,
          MasterAccountId: MASTER_ACCOUNT_ID,
        },
      });

      // when
      const response = await handler(CREATE_EVENT, {});

      // then
      expect(response.Status).toEqual("FAILED");
      expect(response.Reason).toEqual(
        "Organization must be set with all-features"
      );
    });

    it("fails if given FMSAdmin is different than the org's FMSAdmin", async function () {
      // given
      const event = {
        ...CREATE_EVENT,
        ResourceProperties: {
          FMSAdmin: "wrong-admin-id",
          AccountId: MASTER_ACCOUNT_ID,
          Region: "baz",
          GlobalStackSetName: "quz",
          RegionalStackSetName: "quz-baz",
        } as { [key: string]: string },
      };

      // when
      const response = await handler(event, {});

      // then
      expect(response.Status).toEqual("FAILED");
      expect(response.Reason).toEqual(
        "provided firewall manager admin account does not match with existing firewall manager admin"
      );
    });

    it("fails if current account is not from the org's master account", async function () {
      // given
      const event = {
        ...CREATE_EVENT,
        ResourceProperties: {
          FMSAdmin: FIREWALL_MGR_ADMIN_ACCOUNT_ID,
          AccountId: "arbitrary-account-id",
          Region: "baz",
          GlobalStackSetName: "quz",
          RegionalStackSetName: "quz-baz",
        } as { [key: string]: string },
      };

      // when
      const response = await handler(event, {});

      // then
      expect(response.Status).toEqual("FAILED");
      expect(response.Reason).toEqual(
        "The template must be deployed in Organization Management account"
      );
    });

    it("throws an error if mandatory fields are missing", async function () {
      // given
      const event = {
        ResourceType: "Custom::PreReqChecker",
        RequestType: "Create",
        ResourceProperties: {
          AccountId: null,
          Region: "",
          GlobalStackSetName: " ",
          RegionalStackSetName: undefined,
        } as { [key: string]: string | null | undefined },
      } as unknown as IEvent;

      // when
      const response = await handler(event, {});

      // then
      expect(response.Status).toEqual("FAILED");
      expect(response.Reason).toEqual(
        "Non-blank input values required for the following parameters: AccountId, Region, GlobalStackSetName, RegionalStackSetName"
      );
    });
  });

  describe("Update event", function () {
    // Sample of a valid Update event
    const UPDATE_EVENT = {
      ResourceType: "Custom::PreReqChecker",
      RequestType: "Update",
      ResourceProperties: {
        FMSAdmin: FIREWALL_MGR_ADMIN_ACCOUNT_ID,
        AccountId: MASTER_ACCOUNT_ID,
        Region: "baz",
        GlobalStackSetName: "quz",
        RegionalStackSetName: "quz-baz",
      } as { [key: string]: string },
    } as IEvent;

    it("succeeds if account setup is valid", async function () {
      // when
      const response = await handler(UPDATE_EVENT, {});
      // then
      expect(response.Status).toEqual("SUCCESS");
      expect(response.Data).toEqual({
        PreReqCheck: "true",
      });
      expect(
        organizationsClientMock.commandCalls(EnableAWSServiceAccessCommand)
      ).toHaveLength(2);
      expect(
        cloudFormationClientMock.commandCalls(
          ActivateOrganizationsAccessCommand
        )
      ).toHaveLength(1);
      expect(
        cloudFormationClientMock.commandCalls(DeleteStackInstancesCommand) // When "EnableConfig" is not "Yes", an Update should delete config
      ).toHaveLength(2);
    });

    it("enables config when flag is 'Yes'", async function () {
      // given
      const updateEventWithEnableConfig = {
        ...UPDATE_EVENT,
        ResourceProperties: {
          ...UPDATE_EVENT.ResourceProperties,
          EnableConfig: "Yes",
        },
      };

      // when
      const response = await handler(updateEventWithEnableConfig, {});

      // then
      expect(response.Status).toEqual("SUCCESS");
      expect(response.Data).toEqual({
        PreReqCheck: "true",
      });
      expect(
        organizationsClientMock.commandCalls(EnableAWSServiceAccessCommand)
      ).toHaveLength(2);
      expect(
        cloudFormationClientMock.commandCalls(
          ActivateOrganizationsAccessCommand
        )
      ).toHaveLength(1);
      expect(
        cloudFormationClientMock.commandCalls(CreateStackSetCommand)
      ).toHaveLength(2);
      expect(
        cloudFormationClientMock.commandCalls(CreateStackInstancesCommand)
      ).toHaveLength(2);
    });

    it("fails if FeatureSet of organisation is not 'ALL'", async function () {
      // given
      const organizationsClientMock = mockClient(OrganizationsClient);
      organizationsClientMock.on(DescribeOrganizationCommand).resolves({
        Organization: {
          FeatureSet: OrganizationFeatureSet.CONSOLIDATED_BILLING,
          MasterAccountId: MASTER_ACCOUNT_ID,
        },
      });

      // when
      const response = await handler(UPDATE_EVENT, {});

      // then
      expect(response.Status).toEqual("FAILED");
      expect(response.Reason).toEqual(
        "Organization must be set with all-features"
      );
    });

    it("fails if given FMSAdmin is different than the org's FMSAdmin", async function () {
      // given
      const event = {
        ...UPDATE_EVENT,
        ResourceProperties: {
          FMSAdmin: "wrong-admin-id",
          AccountId: MASTER_ACCOUNT_ID,
          Region: "baz",
          GlobalStackSetName: "quz",
          RegionalStackSetName: "quz-baz",
        } as { [key: string]: string },
      };

      // when
      const response = await handler(event, {});

      // then
      expect(response.Status).toEqual("FAILED");
      expect(response.Reason).toEqual(
        "provided firewall manager admin account does not match with existing firewall manager admin"
      );
    });

    it("fails if current account is not from the org's master account", async function () {
      // given
      const event = {
        ...UPDATE_EVENT,
        ResourceProperties: {
          FMSAdmin: FIREWALL_MGR_ADMIN_ACCOUNT_ID,
          AccountId: "arbitrary-account-id",
          Region: "baz",
          GlobalStackSetName: "quz",
          RegionalStackSetName: "quz-baz",
        } as { [key: string]: string },
      };

      // when
      const response = await handler(event, {});

      // then
      expect(response.Status).toEqual("FAILED");
      expect(response.Reason).toEqual(
        "The template must be deployed in Organization Management account"
      );
    });
  });

  describe("Delete event", () => {
    // Sample of a valid Create event
    const DELETE_EVENT = {
      ResourceType: "Custom::PreReqChecker",
      RequestType: "Delete",
      ResourceProperties: {
        FMSAdmin: FIREWALL_MGR_ADMIN_ACCOUNT_ID,
        AccountId: MASTER_ACCOUNT_ID,
        Region: "baz",
        GlobalStackSetName: "quz",
        RegionalStackSetName: "quz-baz",
      } as { [key: string]: string },
    } as IEvent;

    it("succeeds if account setup is valid", async function () {
      // given

      // when
      const response = await handler(DELETE_EVENT, {});
      // then
      expect(response.Status).toEqual("SUCCESS");
      expect(response.Data).toEqual({
        Data: "Delete Config initiated",
      });
      expect(
        cloudFormationClientMock.commandCalls(DeleteStackInstancesCommand)
          .length
      ).toBeGreaterThan(0);
    });
  });
});
