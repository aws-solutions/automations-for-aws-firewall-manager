/**
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
import { DynamoDB, SSM, EC2, FMS } from "aws-sdk";
import awsClient from "./clientConfig.json";
import { Policy } from "aws-sdk/clients/fms";
import { logger } from "./common/logger";

interface IAttribute {
  updateToken: string;
  policyId: string;
}
export class FMSHelper {
  constructor() {
    /**
     * nothing to do
     */
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
          "PolicyUpdateToken": {
            "S": "1:SqIn3DqPUxtHAv0FqhzxMA=="
          },
          "Region": {
            "S": "Global"
          }
        }
   */
  static async getDDBItem(primaryKey: string, sortKey: string, table: string) {
    logger.debug({
      label: "fmsHelper/getDDBItem",
      message: `policy item: ${JSON.stringify({
        policy: primaryKey,
        region: sortKey,
      })}`,
    });
    try {
      const ddb = new DynamoDB({
        apiVersion: awsClient.dynamodb,
      });
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
      const response = await ddb.getItem(params).promise();
      logger.debug({
        label: "fmsHelper/getDDBItem",
        message: `ddb item fetched: ${JSON.stringify(response)}`,
      });
      if (!response.Item) throw new Error("ResourceNotFound");
      else return response.Item;
    } catch (e) {
      if (e.message === "ResourceNotFound") {
        logger.warn({
          label: "fmsHelper/getDDBItem",
          message: "dynamo db item not found",
        });
        throw new Error("ResourceNotFound");
      }
      throw new Error("error getting ddb item");
    }
  }

  /**
   * @description update dynamodb item for the policy
   * @param {string} primaryKey - primary key for the ddb table
   * @param {string} sortKey - sory key for the ddb table
   * @param {object} updateAttr - update attributes
   * @param {string} table - table name with FMS policy details
   * @returns
   */
  static async updateDDBItem(
    primaryKey: string,
    sortKey: string,
    updateAttr: IAttribute,
    table: string
  ) {
    logger.debug({
      label: "fmsHelper/updateDDBItem",
      message: `policy item: ${JSON.stringify({
        policy: primaryKey,
        region: sortKey,
        update: updateAttr,
      })}`,
    });
    try {
      const ddb = new DynamoDB({
        apiVersion: awsClient.dynamodb,
      });
      const params = {
        ExpressionAttributeNames: {
          "#AT": "LastUpdatedAt",
          "#PO": "PolicyUpdateToken",
          "#PI": "PolicyId",
        },
        ExpressionAttributeValues: {
          ":t": {
            S: new Date().toISOString(), // current time
          },
          ":p": {
            S: updateAttr.updateToken, // update token
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
        UpdateExpression: "SET #AT = :t, #PO = :p, #PI = :pi",
      };
      logger.debug({
        label: "FMSHelper/updateDDBItem",
        message: `ddb item details: ${JSON.stringify(params)}`,
      });
      await ddb.updateItem(params).promise();
      logger.info({
        label: "FMSHelper/updateDDBItem",
        message: `ddb item updated`,
      });
    } catch (e) {
      logger.error({
        label: "fmsHelper/updateDDBItem",
        message: JSON.stringify(e),
      });
      throw new Error("error updating ddb item");
    }
  }

  /**
   * @description delete dynamodB item
   * @param {string} primaryKey - primary key for the ddb table
   * @param {string} sortKey - sory key for the ddb table
   * @param {string} table - table name with FMS policy details
   */

  static async deleteDDBItem(
    primaryKey: string,
    sortKey: string,
    table: string
  ) {
    logger.debug({
      label: "fmsHelper/deleteDDBItem",
      message: `deleting policy: ${JSON.stringify({
        policy: primaryKey,
        region: sortKey,
      })}`,
    });
    try {
      const ddb = new DynamoDB({
        apiVersion: awsClient.dynamodb,
      });
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
      logger.debug({
        label: "FMSHelper/deleteDDBItem",
        message: `ddb item details: ${JSON.stringify(params)}`,
      });
      await ddb.deleteItem(params).promise();
      logger.info({
        label: "FMSHelper/deleteDDBItem",
        message: `ddb item deleted`,
      });
    } catch (e) {
      logger.error({
        label: "fmsHelper/deleteDDBItem",
        messsage: JSON.stringify(e),
      });
      throw new Error("error deleting ddb item");
    }
  }
  /**
   * @description function to fetch ssm parameter value
   * @param {string} ssmParameterName - name of the parameter to fetch
   * @returns {Promise}
   */
  static async getSSMParameter(ssmParameterName: string): Promise<any> {
    logger.debug({
      label: "FMSHelper/getSSMParameter",
      message: `getting ssm parameter: ${ssmParameterName}`,
    });
    try {
      const ssm = new SSM({ apiVersion: awsClient.ssm });
      const response = await ssm
        .getParameter({ Name: ssmParameterName })
        .promise();
      if (!response.Parameter?.Value || !response.Parameter?.Version) {
        logger.error({
          label: "FMSHelper/getSSMParameter",
          message: `parameter not found: ${ssmParameterName}`,
        });
        throw new Error("parameter not found");
      } else {
        logger.info({
          label: "FMSHelper/getSSMParameter",
          message: `ssm parameter fetched: ${JSON.stringify(response)}`,
        });
        if (response.Parameter.Type === "StringList")
          return response.Parameter.Value.split(",");
        // return string[]
        else return response.Parameter.Value;
        // return string
      }
    } catch (e) {
      logger.error({
        label: "FMSHelper/getSSMParameter",
        message: JSON.stringify(e),
      });
      throw new Error("error fetching SSM parameter");
    }
  }

  /**
   * @description returns ec2 regions list
   * @returns
   */
  static async getRegions() {
    logger.debug({
      label: "FMSHelper/getRegions",
      message: `getting ec2 regions`,
    });
    try {
      const ec2 = new EC2({
        apiVersion: awsClient.ec2,
      });

      const _r = await ec2.describeRegions().promise();

      if (!_r.Regions) throw new Error("failed to describe regions");

      const regions = _r.Regions.filter((region) => {
        return region.RegionName !== "ap-northeast-3";
      }).map((region) => {
        return region.RegionName;
      });
      logger.debug({
        label: "FMSHelper/getRegions",
        message: `${JSON.stringify({ regions: regions })}`,
      });
      return regions;
    } catch (e) {
      logger.error({
        label: "fmsHelper/getRegions",
        message: JSON.stringify(e),
      });
      throw new Error("error fetching regions");
    }
  }

  /**
   * @description put fms policy
   * @param policyName
   * @param region
   * @param table
   */
  static async putPolicy(policy: Policy, region: string) {
    logger.debug({
      label: "fmsHelper/putPolicy",
      message: `saving policy: ${JSON.stringify(policy)}`,
    });
    try {
      let fms: FMS;
      // global or regional
      if (region === "Global") {
        fms = new FMS({
          apiVersion: awsClient.fms,
          region: awsClient.dataPlane,
          retryDelayOptions: { base: 500 }, // adjust as needed
          maxRetries: 10, // adjust as needed
        });
      } else {
        fms = new FMS({
          apiVersion: awsClient.fms,
          region: region,
          retryDelayOptions: { base: 500 }, // adjust as needed
          maxRetries: 10, // adjust as needed
        });
      }
      const resp = await fms
        .putPolicy({
          Policy: policy,
        })
        .promise();
      logger.info({
        label: "fmsHelper/putPolicy",
        message: `policy saved`,
      });
      return resp;
    } catch (e) {
      logger.error({
        label: "fmsHelper/putPolicy",
        message: JSON.stringify(e),
      });
      throw new Error(`failed to save policy`);
    }
  }

  /**
   * @description delete fms policy
   * @param policyName
   * @param region
   * @param table
   */
  static async deletePolicy(policyName: string, region: string, table: string) {
    logger.debug({
      label: "fmsHelper/deletePolicy",
      message: `deleting policy: ${JSON.stringify({
        policy: policyName,
        region: region,
      })}`,
    });
    try {
      const resp = await FMSHelper.getDDBItem(policyName, region, table);
      let fms: FMS;
      // global or regional
      if (region === "Global") {
        fms = new FMS({
          apiVersion: awsClient.fms,
          region: awsClient.dataPlane,
          retryDelayOptions: { base: 500 },
          maxRetries: 10,
        });
      } else {
        fms = new FMS({
          apiVersion: awsClient.fms,
          region: region,
          retryDelayOptions: { base: 500 },
          maxRetries: 10,
        });
      }
      await fms
        .deletePolicy({
          PolicyId: resp!.PolicyId.S!,
          DeleteAllPolicyResources: true,
        })
        .promise();
      await FMSHelper.deleteDDBItem(policyName, region, table);
      logger.info({
        label: "fmsHelper/deletePolicy",
        message: `policy deleted`,
      });
    } catch (e) {
      if (e.message === "ResourceNotFound") {
        logger.warn({
          label: "fmsHelper/deletePolicy",
          message: "policy does not exist",
        });
        throw new Error("policy not found");
      } else {
        logger.error({
          label: "fmsHelper/deletePolicy",
          message: e.message,
        });
        throw new Error("error deleting policy");
      }
    }
  }
}
