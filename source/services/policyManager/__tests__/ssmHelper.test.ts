// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "aws-sdk-client-mock-jest";
import { SSMHelper } from "../lib/clientHelpers";

const mockGetMultiple = jest.fn();
jest.mock("@aws-lambda-powertools/parameters/ssm", () => {
  return {
    SSMProvider: jest.fn().mockImplementation(() => {
      return {
        getMultiple: mockGetMultiple,
      };
    }),
  };
});

describe("SSM Helper", () => {
  let ssmHelper: SSMHelper;
  let mockAllParameters: Record<string, string>;

  beforeEach(() => {
    mockGetMultiple.mockClear();
    ssmHelper = new SSMHelper();
    mockAllParameters = {
      Regions: "region1, region2",
      OUs: "ou1, ou2",
      Tags: "tags",
    };
  });

  it("should fetch SSM parameters from path", async () => {
    mockGetMultiple.mockResolvedValueOnce(mockAllParameters);

    const response = await ssmHelper.getParametersByPath("/FMS/");

    expect(mockGetMultiple).toHaveBeenCalledTimes(1);
    expect(response).toEqual(mockAllParameters);
  });

  it("should throw an exception when no parameters are fetched", async () => {
    mockGetMultiple.mockResolvedValueOnce(undefined);

    const testCase = async () => {
      await ssmHelper.getParametersByPath("/FMS/");
    };

    await expect(testCase).rejects.toThrow(/error fetching SSM parameters/);
  });

  it("should throw an exception if GetMultiple fails", async () => {
    mockGetMultiple.mockRejectedValueOnce(
      new Error("error fetching parameters")
    );

    const testCase = async () => {
      await ssmHelper.getParametersByPath("/FMS/");
    };

    await expect(testCase).rejects.toThrow(/error fetching SSM parameters/);
  });
});
