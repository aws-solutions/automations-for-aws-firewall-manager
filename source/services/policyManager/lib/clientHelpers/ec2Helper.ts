// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { DescribeRegionsCommand, EC2Client } from "@aws-sdk/client-ec2";
import { customUserAgent } from "../exports";
import { logger, tracer } from "solutions-utils";

export class EC2Helper {
  private readonly client: EC2Client;

  constructor() {
    this.client = tracer.captureAWSv3Client(
      new EC2Client({
        customUserAgent: customUserAgent,
      })
    );
  }

  /**
   * @description returns ec2 regions list
   * @returns
   */
  async getRegions(): Promise<string[]> {
    logger.debug({
      label: "FMSHelper/getRegions",
      message: `getting ec2 regions`,
    });
    try {
      const regionResponse = await this.client.send(
        new DescribeRegionsCommand({ AllRegions: true })
      );

      if (!regionResponse.Regions) {
        logger.error("failed to describe all regions", {
          requestId: regionResponse.$metadata?.requestId,
        });
        throw new Error("failed to describe regions");
      }

      const regions =
        regionResponse.Regions.filter((region) => {
          return region.RegionName && region.RegionName !== "ap-northeast-3";
        }).map((region) => {
          return <string>region.RegionName;
        }) ?? [];
      logger.debug("retrieved all regions", {
        regions: regions,
      });
      return regions;
    } catch (e) {
      logger.error("encountered error getting all EC2 regions", {
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error("error fetching ec2 regions");
    }
  }
}
