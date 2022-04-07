// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { FirewallManagerAdminSetup } from "../lib/firewallManagerAdminSetup";
import {
  AssociateAdminAccountCommand,
  FMSClient,
  GetAdminAccountCommand,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "@aws-sdk/client-fms";
import { customUserAgent, dataplane } from "../lib/exports";
import { AwsStub, mockClient } from "aws-sdk-client-mock";

describe("Firewall Manager Admin setup", function () {
  const ADMIN_ACCOUNT_ID = "foo";

  let service: FirewallManagerAdminSetup;
  let firewallManagerClientMock: AwsStub<ServiceInputTypes, ServiceOutputTypes>;
  beforeEach(() => {
    firewallManagerClientMock = mockClient(FMSClient);
    firewallManagerClientMock.on(GetAdminAccountCommand).resolves({
      AdminAccount: ADMIN_ACCOUNT_ID,
    });

    service = new FirewallManagerAdminSetup({
      firewallManagerAdminAccountId: ADMIN_ACCOUNT_ID,
      firewallManagerClient: new FMSClient({
        customUserAgent,
        region: dataplane,
        maxAttempts: 3,
      }),
    });
  });

  it("should set up the admin account if the organisation doesnt have one yet", async function () {
    // given
    firewallManagerClientMock.on(GetAdminAccountCommand).rejects({
      name: "ResourceNotFoundException",
    });

    // when
    await service.setUpCurrentAccountAsFirewallManagerAdmin();

    // then
    expect(firewallManagerClientMock.call(0).firstArg).toBeInstanceOf(
      GetAdminAccountCommand
    );
    expect(firewallManagerClientMock.call(1).firstArg).toBeInstanceOf(
      AssociateAdminAccountCommand
    );
    expect(firewallManagerClientMock.calls()).toHaveLength(2);
  });

  it("should fail if the current account is different from the organisations firewall admin account", async function () {
    // given
    firewallManagerClientMock.on(GetAdminAccountCommand).resolves({
      AdminAccount: "some-other-account-id",
    });

    // when
    try {
      await service.setUpCurrentAccountAsFirewallManagerAdmin();
      fail("Expected error to be thrown");

      // then
    } catch (e) {
      expect(e.message).toEqual(
        "provided firewall manager admin account does not match with existing firewall manager admin"
      );
    }
  });

  it("should succeed if the current account is the firewall admin account", async function () {
    // given
    // when
    await service.setUpCurrentAccountAsFirewallManagerAdmin();

    // then
    expect(firewallManagerClientMock.call(0).firstArg).toBeInstanceOf(
      GetAdminAccountCommand
    );
    expect(firewallManagerClientMock.calls()).toHaveLength(1);
  });
});
