/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import {
  AttributeValue,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { DescribeRegionsCommand, EC2Client } from "@aws-sdk/client-ec2";
import {
  Policy,
  PutPolicyResponse,
  FMSClient,
  DeletePolicyCommand,
  PutPolicyCommand,
} from "@aws-sdk/client-fms";
import { customUserAgent } from "./exports";
import { logger, serviceLogger } from "./common/logger";

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
  static async getDDBItem(
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
      const ddb = new DynamoDBClient({
        customUserAgent,
        logger: serviceLogger,
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
      const response = await ddb.send(new GetItemCommand(params));
      logger.debug({
        label: "FMSHelper/getDDBItem",
        message: `ddb item fetched ${JSON.stringify(response)}`,
      });
      if (!response.Item) throw new Error("ResourceNotFound");
      else return response.Item;
    } catch (e) {
      if (e.message === "ResourceNotFound") {
        logger.warn({
          label: "FMSHelper/getDDBItem",
          message: `item not found ${JSON.stringify({
            primaryKey,
            sortKey,
            table,
          })}`,
        });
        throw new Error("ResourceNotFound");
      }
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
  static saveDDBItem = async (
    primaryKey: string,
    sortKey: string,
    updateAttr: IAttribute,
    table: string
  ): Promise<void> => {
    logger.debug({
      label: "FMSHelper/saveDDBItem",
      message: `item ${JSON.stringify({
        primaryKey,
        sortKey,
        updateAttr,
      })}`,
    });
    try {
      const ddb = new DynamoDBClient({
        customUserAgent,
        logger: serviceLogger,
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
        label: "FMSHelper/saveDDBItem",
        message: `ddb item details ${JSON.stringify(params)}`,
      });
      await ddb.send(new UpdateItemCommand(params));
      logger.debug({
        label: "FMSHelper/saveDDBItem",
        message: `ddb item saved`,
      });
    } catch (e) {
      logger.error({
        label: "FMSHelper/saveDDBItem",
        message: JSON.stringify(e),
      });
      throw new Error(
        `error saving ddb item ${JSON.stringify({
          primaryKey,
          sortKey,
          table,
        })}`
      );
    }
  };

  /**
   * @description delete dynamodB item
   * @param {string} primaryKey - primary key for the ddb table
   * @param {string} sortKey - sort key for the ddb table
   * @param {string} table - table name with FMS policy details
   */
  static deleteDDBItem = async (
    primaryKey: string,
    sortKey: string,
    table: string
  ): Promise<void> => {
    logger.debug({
      label: "FMSHelper/deleteDDBItem",
      message: `deleting ddb item ${JSON.stringify({
        primaryKey,
        sortKey,
        table,
      })}`,
    });
    try {
      const ddb = new DynamoDBClient({
        customUserAgent,
        logger: serviceLogger,
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
        message: `ddb item details ${JSON.stringify(params)}`,
      });
      await ddb.send(new DeleteItemCommand(params));
      logger.debug({
        label: "FMSHelper/deleteDDBItem",
        message: `ddb item deleted`,
      });
    } catch (e) {
      logger.error({
        label: "FMSHelper/deleteDDBItem",
        message: JSON.stringify(e),
      });
      throw new Error(
        `error deleting ddb item ${JSON.stringify({
          primaryKey,
          sortKey,
          table,
        })}`
      );
    }
  };

  /**
   * @description function to fetch ssm parameter value
   * @param {string} ssmParameterName - name of the parameter to fetch
   * @returns {Promise}
   */
  static getSSMParameter = async (
    ssmParameterName: string
  ): Promise<string | string[]> => {
    logger.debug({
      label: "FMSHelper/getSSMParameter",
      message: `getting ssm parameter ${ssmParameterName}`,
    });
    try {
      const ssm = new SSMClient({ customUserAgent, logger: serviceLogger });
      const response = await ssm.send(
        new GetParameterCommand({ Name: ssmParameterName })
      );
      if (!response.Parameter?.Value || !response.Parameter?.Version) {
        logger.error({
          label: "FMSHelper/getSSMParameter",
          message: `parameter not found: ${ssmParameterName}`,
        });
        throw new Error("parameter not found");
      } else {
        logger.debug({
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
      throw new Error(`error fetching SSM parameter ${ssmParameterName}`);
    }
  };

  /**
   * @description returns ec2 regions list
   * @returns
   */
  static getRegions = async (): Promise<string[]> => {
    logger.debug({
      label: "FMSHelper/getRegions",
      message: `getting ec2 regions`,
    });
    try {
      const ec2 = new EC2Client({
        customUserAgent,
        logger: serviceLogger,
      });

      const _r = await ec2.send(
        new DescribeRegionsCommand({ AllRegions: true })
      );

      if (!_r.Regions) throw new Error("failed to describe regions");
      const regions = <string[]>_r.Regions.filter((region) => {
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
        label: "FMSHelper/getRegions",
        message: JSON.stringify(e),
      });
      throw new Error("error fetching ec2 regions");
    }
  };

  /**
   * @description put fms policy
   * @param policyName
   * @param region
   * @param table
   */
  static putPolicy = async (
    policy: Policy,
    region: string
  ): Promise<PutPolicyResponse> => {
    logger.debug({
      label: "FMSHelper/putPolicy",
      message: `saving policy ${policy.PolicyName} in ${region}`,
    });
    try {
      let fms: FMSClient;

      // global or regional
      if (region === "Global") {
        fms = new FMSClient({
          region: "us-east-1",
          customUserAgent,
          logger: serviceLogger,
        });
      } else {
        fms = new FMSClient({
          region: region,
          maxAttempts: +(process.env.MAX_ATTEMPTS as string), // to avoid throttling exceptions
          customUserAgent,
          logger: serviceLogger,
        });
      }
      const resp = await fms.send(
        new PutPolicyCommand({
          Policy: policy,
        })
      );
      logger.debug({
        label: "FMSHelper/putPolicy",
        message: `policy ${policy.PolicyName} saved in ${region}`,
      });
      return resp;
    } catch (e) {
      logger.error({
        label: "FMSHelper/putPolicy",
        message: JSON.stringify(e),
      });
      throw new Error(
        `failed to save policy ${policy.PolicyName} in ${region}`
      );
    }
  };

  /**
   * @description delete fms policy
   * @param policyName
   * @param region
   * @param table
   */
  static deletePolicy = async (
    policyName: string,
    region: string,
    table: string
  ): Promise<void> => {
    logger.debug({
      label: "FMSHelper/deletePolicy",
      message: `deleting policy ${policyName} in ${region}`,
    });
    try {
      const resp = await FMSHelper.getDDBItem(policyName, region, table);
      if (resp.PolicyId.S) {
        let fms: FMSClient;
        // global or regional
        if (region === "Global") {
          fms = new FMSClient({
            region: "us-east-1",
            maxAttempts: +(process.env.MAX_ATTEMPTS as string), // to avoid throttling exceptions
            customUserAgent,
            logger: serviceLogger,
          });
        } else {
          fms = new FMSClient({
            region: region,
            maxAttempts: +(process.env.MAX_ATTEMPTS as string), // to avoid throttling exceptions
            customUserAgent,
            logger: serviceLogger,
          });
        }
        await fms.send(
          new DeletePolicyCommand({
            PolicyId: resp.PolicyId.S,
            DeleteAllPolicyResources: true,
          })
        );

        await FMSHelper.deleteDDBItem(policyName, region, table);
        logger.debug({
          label: "FMSHelper/deletePolicy",
          message: `policy ${policyName} deleted in ${region}`,
        });
      }
    } catch (e) {
      if (e.message === "ResourceNotFound") {
        logger.warn({
          label: "FMSHelper/deletePolicy",
          message: `policy ${policyName} in ${region} not found`,
        });
        throw new Error(`policy ${policyName} in ${region} not found`);
      } else {
        logger.error({
          label: "FMSHelper/deletePolicy",
          message: e.message,
        });
        throw new Error(`error deleting policy ${policyName} in ${region}`);
      }
    }
  };
}
