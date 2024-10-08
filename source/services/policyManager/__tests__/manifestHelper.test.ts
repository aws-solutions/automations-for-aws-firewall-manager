// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { ManifestHelper } from "../lib/manifestHelper";
import manifest from "./policy_manifest.test.json";

const mockGetObject = jest.fn();
const mockPublishMessage = jest.fn();
jest.mock("../lib/clientHelpers", () => {
  return {
    S3Helper: function () {
      return {
        getObject: mockGetObject,
      };
    },
    SNSHelper: function () {
      return {
        publishMessage: mockPublishMessage,
      };
    },
  };
});

const mockTopicArn = "topicArn";
const mockManifestPath = "mi-bucket|mi-manifest";
let manifestHelper: ManifestHelper;

describe("ManifestHelper", () => {
  beforeEach(() => {
    manifestHelper = new ManifestHelper(mockTopicArn);
    mockGetObject.mockResolvedValue({});
  });

  it("should return the manifest file", async () => {
    mockGetObject.mockResolvedValue(manifest);

    const result = await manifestHelper.fetchManifest(mockManifestPath);
    expect(result).toEqual(manifest);
  });

  it("should throw an exception if S3 cannot find the policy manifest file", async () => {
    mockGetObject.mockRejectedValueOnce("error getting manifest");

    const testCase = async () => {
      await manifestHelper.fetchManifest(mockManifestPath);
    };

    await expect(testCase).rejects.toThrow("error getting policy manifest");
    expect(mockPublishMessage).toHaveBeenCalled();
  });
});
