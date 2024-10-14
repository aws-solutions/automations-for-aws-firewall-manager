// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { customUserAgent } from "../exports";
import { logger, tracer } from "solutions-utils";
import {
  RAMClient,
  DeleteResourceShareCommand,
  ListResourcesCommand,
  ResourceOwner,
  Resource,
} from "@aws-sdk/client-ram";

export class RAMHelper {
  private readonly ramClient: RAMClient;

  constructor(region: string) {
    this.ramClient = tracer.captureAWSv3Client(
      new RAMClient({
        region: region,
        customUserAgent: customUserAgent,
      })
    );
  }

  async deleteResourcesForRuleGroup(ruleGroupArn: string) {
    try {
      const ramResources = await this.listResources([ruleGroupArn]);
      if (ramResources.resources) {
        await this.deleteResourceSharesForResource(ramResources.resources);
        logger.debug(`Deleted RAM Resources for ${ruleGroupArn}`);
      }
    } catch (e) {
      throw new Error("error deleting resources for rule group");
    }
  }

  private async listResources(resourceArns: string[]) {
    try {
      return await this.ramClient.send(
        new ListResourcesCommand({
          resourceArns: resourceArns,
          resourceOwner: ResourceOwner.SELF,
        })
      );
    } catch (e) {
      logger.error("error listing resources", {
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error("error listing resources");
    }
  }

  private async deleteResourceSharesForResource(ramResources: Resource[]) {
    await Promise.all(
      ramResources.map(async (resource) => {
        try {
          await this.ramClient.send(
            new DeleteResourceShareCommand({
              resourceShareArn: resource.resourceShareArn,
            })
          );

          logger.debug(
            `Deleted RAM resource share ${resource.resourceShareArn}`
          );
        } catch (e) {
          logger.error(
            `failed to delete resource share ${resource.resourceShareArn}`,
            {
              error: e,
              requestId: e.$metadata?.requestId,
            }
          );
          throw new Error("error deleting resource shares");
        }
      })
    );
  }
}
