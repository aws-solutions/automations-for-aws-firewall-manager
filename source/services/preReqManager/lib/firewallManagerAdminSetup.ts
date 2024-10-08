// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { logger } from "solutions-utils";
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
    const existingAdminAccount = await this.getFirewallManagerAdminAccount();

    if (!existingAdminAccount) {
      await this.setUpFirewallManagerAdmin();
    } else if (this.firewallManagerAdminAccountId === existingAdminAccount) {
      logger.debug("fms admin already configured", {
        existingAdminAccount: existingAdminAccount,
      });
    } else {
      const _m =
        "provided firewall manager admin account does not match with existing firewall manager admin";
      logger.error(_m, {
        existingAdminAccount: existingAdminAccount,
        providedFirewallManagerAdminAccount: this.firewallManagerAdminAccountId,
      });
      throw new Error(_m);
    }

    logger.info("successfully setup fms admin", {
      firewallManagerAdminAccount: this.firewallManagerAdminAccountId,
    });
  };

  private async setUpFirewallManagerAdmin() {
    try {
      await this.firewallManagerClient.send(
        new AssociateAdminAccountCommand({
          AdminAccount: this.firewallManagerAdminAccountId,
        })
      );
    } catch (e) {
      logger.error("encountered error associating fms admin account", {
        error: e,
        firewallManagerAdminAccount: this.firewallManagerAdminAccountId,
        requestId: e.$metadata ? e.$metadata.requestId : undefined,
      });
      throw new Error(e.message);
    }

    logger.debug("associated fms admin account", {
      firewallManagerAdminAccount: this.firewallManagerAdminAccountId,
    });
  }

  private async getFirewallManagerAdminAccount() {
    try {
      const response = await this.firewallManagerClient.send(
        new GetAdminAccountCommand({})
      );

      logger.debug("retrieved fms admin account", {
        firewallManagerAdminAccount: response.AdminAccount,
      });
      return response.AdminAccount;
    } catch (e) {
      if (e.name === "ResourceNotFoundException") {
        logger.debug("unable to find fms admin account", {
          error: e,
          requestId: e.$metadata?.requestId,
        });
        return null;
      } else {
        logger.error("encountered error retrieving fms admin account", {
          error: e,
          requestId: e.$metadata?.requestId,
        });
        throw new Error(e.message);
      }
    }
  }
}
