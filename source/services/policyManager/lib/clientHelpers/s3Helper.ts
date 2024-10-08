// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Readable } from "stream";
import { customUserAgent } from "../exports";
import { logger, tracer } from "solutions-utils";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export class S3Helper {
  private readonly client: S3Client;

  constructor() {
    this.client = tracer.captureAWSv3Client(
      new S3Client({
        customUserAgent: customUserAgent,
      })
    );
  }

  async getObject(bucket: string, key: string) {
    const streamToString = (stream: Readable) =>
      new Promise((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    try {
      const { Body } = await this.client.send(command);
      logger.info("fetched object from S3", {
        key: key,
        S3Bucket: bucket,
      });
      return <string>await streamToString(Body as Readable);
    } catch (e) {
      logger.error("failed to fetch object from S3", {
        error: e,
        key: key,
        S3Bucket: bucket,
        requestId: e.$metadata?.requestId,
      });
      throw new Error("error getting object");
    }
  }
}
