// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import got from "got";
import { IMetric, sendAnonymizedMetric } from "../index";

jest.mock("got");

const mockGotPost = jest.spyOn(got, "post");

const mockMetric: IMetric = {
  Solution: "solution",
  UUID: "uuid",
  TimeStamp: "",
  Data: {
    metricData: "metricData",
  },
};

describe("metrics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should send a metric", async () => {
    const testCase = async () => {
      await sendAnonymizedMetric(mockMetric);
    };

    await expect(testCase).not.toThrow();
    expect(mockGotPost).toHaveBeenCalledTimes(1);
  });

  it("should fail silently without throwing an exception if post fails", async () => {
    mockGotPost.mockRejectedValueOnce(new Error("Error posting"));

    const testCase = async () => {
      await sendAnonymizedMetric(mockMetric);
    };

    await expect(testCase).not.toThrow();
    expect(mockGotPost).toHaveBeenCalledTimes(1);
  });
});
