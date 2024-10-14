// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import "jest";
import { EVENT_SOURCE, IEvent } from "../lib/exports";
import { handler } from "../index";

const mockIsDelete = jest.fn();
const mockIsValid = jest.fn();

jest.mock("../lib/Validator", () => {
  return {
    Validator: function () {
      return {
        isDelete: mockIsDelete,
        isValid: mockIsValid,
      };
    },
  };
});

const mockHandleEvent = jest.fn();
jest.mock("../lib/policyManager", () => {
  return {
    PolicyManager: function () {
      return {
        handleEvent: mockHandleEvent,
      };
    },
  };
});

const mockFetchManifest = jest.fn();
jest.mock("../lib/manifestHelper", () => {
  return {
    ManifestHelper: function () {
      return {
        fetchManifest: mockFetchManifest,
      };
    },
  };
});

const mockRegions = "us-east-1,us-east-2";
const mockOUs = "ou-1111-11111111,ou-2222-22222222";
const mockTags =
  '{"ResourceTags":[{"Key":"Environment","Value":"Prod"}],"ExcludeResourceTags":false}';

let mockGetParametersByPathResponse: { [key: string]: string };

const mockGetParametersByPath = jest.fn();
const mockGetObject = jest.fn();
const mockPublishMessage = jest.fn();
jest.mock("../lib/clientHelpers", () => {
  return {
    SSMHelper: function () {
      return {
        getParametersByPath: mockGetParametersByPath,
      };
    },
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

const mockEvent = {
  version: "",
  account: "",
  time: "",
  region: "",
  resources: [""],
  source: "aws.ssm",
  detail: {
    operation: "",
    name: "region",
    type: "",
    description: "",
  } as { [key: string]: string },
} as IEvent;

const dummyContext = {
  callbackWaitsForEmptyEventLoop: true,
  functionVersion: "$LATEST",
  functionName: "foo-bar-function",
  memoryLimitInMB: "128",
  logGroupName: "/aws/lambda/foo-bar-function-123456abcdef",
  logStreamName: "2021/03/09/[$LATEST]abcdef123456abcdef123456abcdef123456",
  invokedFunctionArn:
    "arn:aws:lambda:eu-west-1:123456789012:function:foo-bar-function",
  awsRequestId: "c6af9ac6-7b61-11e6-9a41-93e812345678",
  getRemainingTimeInMillis: () => 1234,
  done: () => console.log("Done!"),
  fail: () => console.log("Failed!"),
  succeed: () => console.log("Succeeded!"),
};

describe("PolicyManager", function () {
  beforeEach(() => {
    jest.resetAllMocks();

    process.env.FMS_REGION = "/FMS/Regions";
    process.env.FMS_OU = "/FMS/OUs";
    process.env.FMS_TAG = "/FMS/Tags";
    process.env.SSM_PARAM_PREFIX = "/FMS/";
    process.env.FMS_TABLE = "ddbTable";

    mockGetParametersByPathResponse = {
      Regions: mockRegions,
      OUs: mockOUs,
      Tags: mockTags,
    };
    mockGetParametersByPath.mockResolvedValue(mockGetParametersByPathResponse);

    mockIsDelete.mockReturnValue(false);
    mockIsValid.mockReturnValue(true);
  });

  describe("Event", function () {
    it("should throw an exception when it fails to fetch ssm parameters by path", async () => {
      mockGetParametersByPath
        .mockReset()
        .mockRejectedValueOnce(new Error("err1"));

      await expect(handler(mockEvent, dummyContext)).rejects.toThrow(
        "Failed to fetch SSM parameters: err1"
      );
    });

    it("should throw an exception when it fails to fetch regions parameter", async () => {
      delete mockGetParametersByPathResponse["Regions"];
      mockGetParametersByPath
        .mockReset()
        .mockResolvedValueOnce(mockGetParametersByPathResponse);

      await expect(handler(mockEvent, dummyContext)).rejects.toThrow(
        /Failed to fetch SSM parameters/
      );
    });

    it("should throw an exception when it fails to fetch tags parameter", async () => {
      delete mockGetParametersByPathResponse["Tags"];
      mockGetParametersByPath
        .mockReset()
        .mockResolvedValueOnce(mockGetParametersByPathResponse);

      await expect(handler(mockEvent, dummyContext)).rejects.toThrow(
        /Failed to fetch SSM parameters/
      );
    });

    it("should throw an exception when it fails to fetch OUs parameter", async () => {
      delete mockGetParametersByPathResponse["OUs"];
      mockGetParametersByPath
        .mockReset()
        .mockResolvedValueOnce(mockGetParametersByPathResponse);

      await expect(handler(mockEvent, dummyContext)).rejects.toThrow(
        /Failed to fetch SSM parameters/
      );
    });

    it("should throw an exception when it fails to validate region parameter", async () => {
      mockIsValid.mockRejectedValueOnce(new Error("err1"));

      await expect(handler(mockEvent, dummyContext)).rejects.toThrow(
        "Failed to validate SSM parameter: err1"
      );
    });

    it("should call the PolicyManager handler with Region if event detail is region", async () => {
      const mockRegionEvent = {
        ...mockEvent,
        detail: {
          ...mockEvent.detail,
          name: "/FMS/Regions",
        },
      };

      await handler(mockRegionEvent, dummyContext);

      expect(mockHandleEvent).toHaveBeenCalledWith(EVENT_SOURCE.REGION);
    });

    it("should call the PolicyManager handler with OU if event detail is OUs", async () => {
      const mockOuEvent = {
        ...mockEvent,
        detail: {
          ...mockEvent.detail,
          name: "/FMS/OUs",
        },
      };

      await handler(mockOuEvent, dummyContext);

      expect(mockHandleEvent).toHaveBeenCalledWith(EVENT_SOURCE.OU);
    });

    it("should call the PolicyManager handler with Tag if event detail is Tags", async () => {
      const mockTagEvent = {
        ...mockEvent,
        detail: {
          ...mockEvent.detail,
          name: "/FMS/Tags",
        },
      };

      await handler(mockTagEvent, dummyContext);

      expect(mockHandleEvent).toHaveBeenCalledWith(EVENT_SOURCE.TAG);
    });

    it("should call the PolicyManager handler with S3 if event source is S3", async () => {
      const mockS3Event = {
        ...mockEvent,
        source: "aws.s3" as const,
      };

      await handler(mockS3Event, dummyContext);

      expect(mockHandleEvent).toHaveBeenCalledWith(EVENT_SOURCE.S3);
    });
  });
});
