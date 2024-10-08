// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { S3Helper, SNSHelper } from "./clientHelpers";
import { SNS_S3_ERROR_SUBJECT, SNS_S3_FETCH_ERROR_MESSAGE } from "./exports";
import { logger } from "solutions-utils";

export class ManifestHelper {
  private topicArn: string;

  constructor(topicArn: string) {
    this.topicArn = topicArn;
  }

  /**
   * @description downloads and returns the policy manifest
   * @returns
   */
  async fetchManifest(manifestPath: string) {
    const manifestLocation = manifestPath;
    const bucket = manifestLocation.split("|")[0];
    const key = manifestLocation.split("|")[1];

    const s3Helper = new S3Helper();

    try {
      const manifest = await s3Helper.getObject(bucket, key);

      logger.info("fetched policy manifest from S3", {
        manifestLocation: manifestLocation,
        S3Bucket: bucket,
      });

      return manifest;
    } catch (e) {
      const snsHelper = new SNSHelper();
      await snsHelper.publishMessage(
        this.topicArn,
        SNS_S3_ERROR_SUBJECT,
        SNS_S3_FETCH_ERROR_MESSAGE
      );
      logger.error("failed to fetch policy manifest from S3", {
        error: e,
        manifestLocation: manifestLocation,
        S3Bucket: bucket,
        requestId: e.$metadata?.requestId,
      });

      throw new Error("error getting policy manifest");
    }
  }
}
