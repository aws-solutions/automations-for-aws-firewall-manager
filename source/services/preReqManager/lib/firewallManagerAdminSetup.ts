// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { logger } from "./common/logger";
import {
  AssociateAdminAccountCommand,
  FMSClient,
  GetAdminAccountCommand,
} from "@aws-sdk/client-fms";

/**
 * @description sets up the current account as firewall manager admin account for the organisation.
 * or, if the organisation already has a firewall manager admin account, validates that that is the account where the solution is deployed in.
 */
export class FirewallManagerAdminSetup {
  readonly firewallManagerAdminAccountId: string;
  readonly firewallManagerClient: FMSClient;

  constructor(props: {
    firewallManagerClient: FMSClient;
    firewallManagerAdminAccountId: string;
  }) {
    this.firewallManagerAdminAccountId = props.firewallManagerAdminAccountId;
    this.firewallManagerClient = props.firewallManagerClient;
  }

  /**
   * @description set up fms admin account if no fms admin exists.
   * if an admin account exists but is different from the account the solution is deployed to, throw an error.
   * fms admin can only be set from organization management account
   */
  setUpCurrentAccountAsFirewallManagerAdmin = async (): Promise<void> => {
    const loggerLabel =
      "PreRegManager/setUpCurrentAccountAsFirewallManagerAdmin";
    logger.debug({
      label: loggerLabel,
      message: `initiating fms admin check`,
    });

    const existingAdminAccount = await this.getFirewallManagerAdminAccount();

    if (!existingAdminAccount) {
      await this.setUpFirewallManagerAdmin();
    } else if (this.firewallManagerAdminAccountId === existingAdminAccount) {
      logger.debug({
        label: loggerLabel,
        message: `fms admin already set up`,
      });
    } else {
      const _m =
        "provided firewall manager admin account does not match with existing firewall manager admin";
      logger.error({
        label: loggerLabel,
        message: _m,
      });
      throw new Error(_m);
    }

    logger.info({
      label: loggerLabel,
      message: `success`,
    });
  };

  private async setUpFirewallManagerAdmin() {
    const loggerLabel = "PreRegManager/setUpFirewallManagerAdmin";
    logger.debug({
      label: loggerLabel,
      message: `associating ${this.firewallManagerAdminAccountId} as firewall manager admin`,
    });
    try {
      await this.firewallManagerClient.send(
        new AssociateAdminAccountCommand({
          AdminAccount: this.firewallManagerAdminAccountId,
        })
      );
    } catch (e) {
      logger.error({
        label: loggerLabel,
        message: `AssociateAdminAccountCommand error: ${e.message}`,
      });
      throw new Error(e.message);
    }
  }

  private async getFirewallManagerAdminAccount() {
    const loggerLabel = "PreRegManager/getFirewallManagerAdminAccount";
    try {
      const response = await this.firewallManagerClient.send(
        new GetAdminAccountCommand({})
      );
      logger.debug({
        label: loggerLabel,
        message: `GetAdminAccountCommand response: ${JSON.stringify(response)}`,
      });
      return response.AdminAccount;
    } catch (e) {
      if (e.name === "ResourceNotFoundException") {
        logger.debug({
          label: loggerLabel,
          message: `No firewall manager admin account found`,
        });
        return null;
      } else {
        logger.error({
          label: loggerLabel,
          message: e.message,
        });
        throw new Error(e.message);
      }
    }
  }
}
