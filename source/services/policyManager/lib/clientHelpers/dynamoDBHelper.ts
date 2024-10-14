// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Note: This will be removed when we remove dynamodb from the solution, splitting out to make it easier

import {
  AttributeValue,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { customUserAgent } from "../exports";
import { logger, tracer } from "solutions-utils";

interface IAttribute {
  updateToken: string;
  policyId: string;
}

export class DynamoDBHelper {
  private readonly client: DynamoDBClient;

  constructor() {
    this.client = tracer.captureAWSv3Client(
      new DynamoDBClient({
        customUserAgent: customUserAgent,
      })
    );
  }

  /**
   * @description get dynamodb item for the policy
   * @param {string} policyName - policy name to be queried
   * @param {string} table - table name with FMS policy details
   * @returns
   * @example  {
          "LastUpdatedAt": {
            "S": "07-09-2020::17-17-54"
          },
          "PolicyId": {
            "S": "a9369754-84e1-422b-ac7d-4d8608e92e27"
          },
          "PolicyName": {
            "S": "FMS-WAF-Global"
          },
          "Region": {
            "S": "Global"
          }
        }
   */
  async getDDBItem(
    primaryKey: string,
    sortKey: string,
    table: string
  ): Promise<{
    [key: string]: AttributeValue;
  }> {
    logger.debug({
      label: "FMSHelper/getDDBItem",
      message: `policy item ${JSON.stringify({
        policy: primaryKey,
        region: sortKey,
      })}`,
    });

    try {
      const params = {
        Key: {
          PolicyName: {
            S: primaryKey,
          },
          Region: {
            S: sortKey,
          },
        },
        TableName: table,
      };
      const response = await this.client.send(new GetItemCommand(params));
      logger.debug("fetched policy item from DDB", {
        policy: primaryKey,
        region: sortKey,
        ddbItem: response.Item,
      });
      if (!response.Item) {
        logger.warn("failed to fetch policy item from DDB", {
          policy: primaryKey,
          region: sortKey,
          table: table,
          requestId: response.$metadata?.requestId,
        });
        throw new Error("ResourceNotFound");
      } else return response.Item;
    } catch (e) {
      if (e.message === "ResourceNotFound") {
        throw new Error("ResourceNotFound");
      }
      logger.error("encountered error fetching policy item from DDB", {
        error: e,
        policy: primaryKey,
        region: sortKey,
        table: table,
        requestId: e.$metadata?.requestId,
      });
      throw new Error(
        `error getting ddb item ${JSON.stringify({
          primaryKey,
          sortKey,
          table,
        })}`
      );
    }
  }

  /**
   * @description save dynamodb item for the policy
   * @param {string} primaryKey - primary key for the ddb table
   * @param {string} sortKey - sort key for the ddb table
   * @param {object} updateAttr - update attributes
   * @param {string} table - table name with FMS policy details
   * @returns
   */
  async saveDDBItem(
    primaryKey: string,
    sortKey: string,
    updateAttr: IAttribute,
    table: string
  ): Promise<void> {
    try {
      const params = {
        ExpressionAttributeNames: {
          "#AT": "LastUpdatedAt",
          "#PI": "PolicyId",
        },
        ExpressionAttributeValues: {
          ":t": {
            S: new Date().toISOString(), // current time
          },
          ":pi": {
            S: updateAttr.policyId, //policy id
          },
        },
        Key: {
          PolicyName: {
            S: primaryKey,
          },
          Region: {
            S: sortKey,
          },
        },
        TableName: table,
        UpdateExpression: "SET #AT = :t, #PI = :pi",
      };

      logger.debug("ddb policy item details", {
        details: params,
      });

      await this.client.send(new UpdateItemCommand(params));

      logger.debug("saved policy item to DDB", {
        policy: primaryKey,
        region: sortKey,
      });
    } catch (e) {
      logger.error("encountered error saving policy item to DDB", {
        error: e,
        policy: primaryKey,
        region: sortKey,
        requestId: e.$metadata?.requestId,
      });
      throw new Error(
        `error saving ddb item ${JSON.stringify({
          primaryKey,
          sortKey,
          table,
        })}`
      );
    }
  }

  /**
   * @description delete dynamodB item
   * @param {string} primaryKey - primary key for the ddb table
   * @param {string} sortKey - sort key for the ddb table
   * @param {string} table - table name with FMS policy details
   */
  async deleteDDBItem(
    primaryKey: string,
    sortKey: string,
    table: string
  ): Promise<void> {
    try {
      const params = {
        Key: {
          PolicyName: {
            S: primaryKey,
          },
          Region: {
            S: sortKey,
          },
        },
        TableName: table,
      };

      logger.debug("ddb policy item details", {
        details: params,
      });

      await this.client.send(new DeleteItemCommand(params));

      logger.debug("deleted policy item from DDB", {
        policy: primaryKey,
        region: sortKey,
      });
    } catch (e) {
      logger.error("encountered error deleting policy item from DDB", {
        error: e,
        policy: primaryKey,
        region: sortKey,
        requestId: e.$metadata?.requestId,
      });
      throw new Error(
        `error deleting ddb item ${JSON.stringify({
          primaryKey,
          sortKey,
          table,
        })}`
      );
    }
  }
}
