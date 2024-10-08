// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import {
  EC2Client,
  DescribeRegionsCommand,
  EC2ServiceException,
} from "@aws-sdk/client-ec2";
import { EC2Helper } from "../lib/clientHelpers";

describe("EC2 Helper", () => {
  const ec2Mock = mockClient(EC2Client);
  let ec2Helper: EC2Helper;

  const expectedRegions = ["us-east-1", "us-east-2"];

  const mockResponse = {
    Regions: [
      {
        RegionName: "us-east-1",
      },
      {
        RegionName: "us-east-2",
      },
      {
        RegionName: "ap-northeast-3",
      },
      {},
    ],
  };

  beforeEach(() => {
    ec2Mock.reset();
    ec2Helper = new EC2Helper();

    ec2Mock.on(DescribeRegionsCommand).resolves(mockResponse);
  });

  it("should get enabled region names", async () => {
    const response = await ec2Helper.getRegions();

    expect(response).toEqual(expectedRegions);
  });

  it("should throw an exception if no Regions returned", async () => {
    ec2Mock.on(DescribeRegionsCommand).resolvesOnce({});

    const testCase = async () => {
      await ec2Helper.getRegions();
    };

    await expect(testCase).rejects.toThrow(/error fetching ec2 regions/);
  });

  it("should throw an exception if DescribeRegionCommand fails", async () => {
    ec2Mock.on(DescribeRegionsCommand).rejectsOnce(
      new EC2ServiceException({
        name: "EC2ServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await ec2Helper.getRegions();
    };

    await expect(testCase).rejects.toThrow(/error fetching ec2 regions/);
  });
});
