// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import { sdkStreamMixin } from "@smithy/util-stream";
import {
  GetObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { S3Helper } from "../lib/clientHelpers";
import { Readable } from "stream";
import manifest from "./policy_manifest.test.json";

describe("S3 Helper", () => {
  const mockS3Client = mockClient(S3Client);
  let s3Helper: S3Helper;

  const bucket = "bucket";
  const key = "key";

  const expectedObject = JSON.stringify(manifest);

  beforeEach(() => {
    mockS3Client.reset();
    s3Helper = new S3Helper();
  });

  it("should get a string object for the specified key", async () => {
    // create Stream from policy manifest
    const stream = new Readable();
    stream.push(JSON.stringify(manifest));
    stream.push(null);

    const sdkStream = sdkStreamMixin(stream);

    mockS3Client.on(GetObjectCommand).resolves({ Body: sdkStream });

    const data = await s3Helper.getObject(bucket, key);

    expect(mockS3Client).toHaveReceivedCommandTimes(GetObjectCommand, 1);
    expect(data).toEqual(expectedObject);
  });

  it("should throw an exception if GetParameterCommand fails", async () => {
    mockS3Client.rejectsOnce(
      new S3ServiceException({
        name: "S3ServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await s3Helper.getObject(bucket, key);
    };

    expect(mockS3Client).toHaveReceivedCommandTimes(GetObjectCommand, 0);
    await expect(testCase).rejects.toThrow(`error getting object`);
  });
});
