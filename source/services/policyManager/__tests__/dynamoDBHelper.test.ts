// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  DeleteItemCommand,
  DynamoDBClient,
  DynamoDBServiceException,
  GetItemCommand,
  ResourceNotFoundException,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import { DynamoDBHelper } from "../lib/clientHelpers";

describe("DDB Helper", () => {
  const mockDDBClient = mockClient(DynamoDBClient);
  let ddbHelper: DynamoDBHelper;
  const primaryKey = "primaryKey";
  const sortKey = "sortKey";
  const table = "table";

  const mockDDBItem = {
    LastUpdatedAt: {
      S: "07-09-2020::17-17-54",
    },
    PolicyId: {
      S: "a9369754-84e1-422b-ac7d-4d8608e92e27",
    },
    PolicyName: {
      S: "FMS-WAF-Global",
    },
    Region: {
      S: "Global",
    },
  };

  beforeEach(() => {
    mockDDBClient.reset();
    mockDDBClient.resolves({ Item: mockDDBItem, $metadata: {} });

    ddbHelper = new DynamoDBHelper();
  });

  describe("getDDBItem", () => {
    it("should get an item", async () => {
      const data = await ddbHelper.getDDBItem(primaryKey, sortKey, table);

      expect(mockDDBClient).toHaveReceivedCommandTimes(GetItemCommand, 1);
      expect(data).toEqual(mockDDBItem);
    });

    it("should throw an exception if response does not contain an item", async () => {
      mockDDBClient.resolvesOnce({});

      const testCase = async () => {
        await ddbHelper.getDDBItem(primaryKey, sortKey, table);
      };

      expect(mockDDBClient).toHaveReceivedCommandTimes(GetItemCommand, 0);
      await expect(testCase).rejects.toThrow("ResourceNotFound");
    });

    it("should throw a ResourceNotFound exception if item is not in the table", async () => {
      mockDDBClient.rejectsOnce(
        new ResourceNotFoundException({
          message: "ResourceNotFound",
          $metadata: {},
        })
      );

      const testCase = async () => {
        await ddbHelper.getDDBItem(primaryKey, sortKey, table);
      };

      expect(mockDDBClient).toHaveReceivedCommandTimes(GetItemCommand, 0);
      await expect(testCase).rejects.toThrow("ResourceNotFound");
    });

    it("should throw an exception if GetItemCommand fails", async () => {
      mockDDBClient.rejectsOnce(
        new DynamoDBServiceException({
          name: "DynamoDBServiceException",
          $fault: "server",
          $metadata: {},
        })
      );

      const testCase = async () => {
        await ddbHelper.getDDBItem(primaryKey, sortKey, table);
      };

      expect(mockDDBClient).toHaveReceivedCommandTimes(GetItemCommand, 0);
      await expect(testCase).rejects.toThrow(/error getting ddb item/);
    });
  });

  describe("saveDDBItem", () => {
    const updateAttr = { updateToken: "updateToken", policyId: "policyId" };

    it("should save an item", async () => {
      await ddbHelper.saveDDBItem(primaryKey, sortKey, updateAttr, table);

      expect(mockDDBClient).toHaveReceivedCommandTimes(UpdateItemCommand, 1);
    });

    it("should throw an exception on if UpdateItemCommand fails", async () => {
      mockDDBClient.rejectsOnce(
        new DynamoDBServiceException({
          name: "DynamoDBServiceException",
          $fault: "server",
          $metadata: {},
        })
      );

      const testCase = async () => {
        await ddbHelper.saveDDBItem(primaryKey, sortKey, updateAttr, table);
      };

      expect(mockDDBClient).toHaveReceivedCommandTimes(UpdateItemCommand, 0);
      await expect(testCase).rejects.toThrow(/error saving ddb item/);
    });
  });

  describe("deleteDDBItem", () => {
    it("should delete an item", async () => {
      await ddbHelper.deleteDDBItem(primaryKey, sortKey, table);

      expect(mockDDBClient).toHaveReceivedCommandTimes(DeleteItemCommand, 1);
    });

    it("should throw an exception if DeleteItemCommand fils", async () => {
      mockDDBClient.rejectsOnce(
        new DynamoDBServiceException({
          name: "DynamoDBServiceException",
          $fault: "server",
          $metadata: {},
        })
      );

      const testCase = async () => {
        await ddbHelper.deleteDDBItem(primaryKey, sortKey, table);
      };

      expect(mockDDBClient).toHaveReceivedCommandTimes(DeleteItemCommand, 0);
      await expect(testCase).rejects.toThrow(/error deleting ddb item/);
    });
  });
});
