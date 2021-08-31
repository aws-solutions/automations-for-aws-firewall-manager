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

import "jest";
import { FMSHelper } from "../lib/PolicyHelper";

// setting up mocks
const mockDDB = jest.fn();
const mockSSM = jest.fn();
const mockEC2 = jest.fn();
const mockFMS = jest.fn();

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
  PolicyUpdateToken: {
    S: "1:SqIn3DqPUxtHAv0FqhzxMA==",
  },
  Region: {
    S: "Global",
  },
};

const mockSSMParameterSL = {
  Parameter: {
    Type: "StringList",
    Value: "a,b,c",
    Version: 1,
  },
};
const mockSSMSL = mockSSMParameterSL.Parameter.Value.split(",");

const mockSSMParameterS = {
  Parameter: {
    Type: "String",
    Value: "a",
    Version: 1,
  },
};
const mockSSMS = mockSSMParameterS.Parameter.Value;

const mockRegions = {
  Regions: [
    {
      Endpoint: "ec2.region-a.amazonaws.com",
      RegionName: "region-a",
    },
    {
      Endpoint: "ec2.region-b.amazonaws.com",
      RegionName: "region-b",
    },
    {
      Endpoint: "ec2.region-c.amazonaws.com",
      RegionName: "region-c",
    },
  ],
};
const mockRegionsArr = mockRegions.Regions.map((region) => {
  return region.RegionName;
});

const mockPolicy = {
  PolicyName: "P1",
  RemediationEnabled: false,
  ResourceType: "fmsResourceTyp",
  ResourceTags: [{ Key: "", Value: "" }],
  ExcludeResourceTags: false,
  SecurityServicePolicyData: {
    Type: "fmsType",
    ManagedServiceData: "PolicyData",
  },
  IncludeMap: {
    ORG_UNIT: [],
  },
};

// mocking dynamodb client
jest.mock("@aws-sdk/client-dynamodb", () => {
  return {
    DynamoDBClient: jest.fn(() => ({
      send: mockDDB,
    })),
    GetItemCommand: jest.fn(),
    UpdateItemCommand: jest.fn(),
    DeleteItemCommand: jest.fn(),
  };
});

// mocking ssm client
jest.mock("@aws-sdk/client-ssm", () => {
  return {
    SSMClient: jest.fn(() => ({
      send: mockSSM,
    })),
    GetParameterCommand: jest.fn(),
  };
});

// mocking ec2 client
jest.mock("@aws-sdk/client-ec2", () => {
  return {
    EC2Client: jest.fn(() => ({
      send: mockEC2,
    })),
    DescribeRegionsCommand: jest.fn(),
  };
});

// mocking fms client
jest.mock("@aws-sdk/client-fms", () => {
  return {
    FMSClient: jest.fn(() => ({
      send: mockFMS,
    })),
    DeletePolicyCommand: jest.fn(),
    PutPolicyCommand: jest.fn(),
  };
});

// test suites
describe("==Policy Helper Tests==", () => {
  describe("[getDDBItem]", () => {
    beforeEach(() => {
      mockDDB.mockReset();
    });
    test("[TDD] successful api call", async () => {
      mockDDB.mockResolvedValue({
        Item: mockDDBItem,
      });
      try {
        const data = await FMSHelper.getDDBItem(
          "primaryKey",
          "sortKey",
          "table"
        );
        expect(data).toEqual(mockDDBItem);
      } catch (e) {
        console.log(`negative test ${e.message}`);
      }
    });
    test("[TDD] failed ResourceNotFound api call", async () => {
      mockDDB.mockResolvedValue({
        Item: null,
      });
      try {
        await FMSHelper.getDDBItem("primaryKey", "sortKey", "table");
      } catch (e) {
        expect(e.message).toEqual("ResourceNotFound");
      }
    });
    test("[TDD] failed api call", async () => {
      mockDDB.mockRejectedValue("error in ddb get item");
      try {
        await FMSHelper.getDDBItem("primaryKey", "sortKey", "table");
      } catch (e) {
        expect(e.message).toEqual(
          `error getting ddb item ${JSON.stringify({
            primaryKey: "primaryKey",
            sortKey: "sortKey",
            table: "table",
          })}`
        );
      }
    });
  });

  describe("[saveDDBItem]", () => {
    beforeEach(() => {
      mockDDB.mockReset();
    });
    test("[TDD] successful api call", async () => {
      mockDDB.mockReturnValue(Promise.resolve());
      try {
        await FMSHelper.saveDDBItem(
          "primaryKey",
          "sortKey",
          { updateToken: "updateToken", policyId: "policyId" },
          "table"
        );
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      mockDDB.mockRejectedValue("error in ddb update");
      try {
        await FMSHelper.saveDDBItem(
          "primaryKey",
          "sortKey",
          { updateToken: "", policyId: "" },
          "table"
        );
      } catch (e) {
        expect(e.message).toEqual(
          `error saving ddb item ${JSON.stringify({
            primaryKey: "primaryKey",
            sortKey: "sortKey",
            table: "table",
          })}`
        );
      }
    });
  });

  describe("[deleteDDBItem]", () => {
    beforeEach(() => {
      mockDDB.mockReset();
    });
    test("[TDD] successful api call", async () => {
      mockDDB.mockResolvedValue("");
      try {
        await FMSHelper.deleteDDBItem("primaryKey", "sortKey", "table");
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      mockDDB.mockRejectedValue("fail in ddb delete");
      try {
        await FMSHelper.deleteDDBItem("primaryKey", "sortKey", "table");
      } catch (e) {
        expect(e.message).toEqual(
          `error deleting ddb item ${JSON.stringify({
            primaryKey: "primaryKey",
            sortKey: "sortKey",
            table: "table",
          })}`
        );
      }
    });
  });

  describe("[getSSMParameter]", () => {
    beforeEach(() => {
      mockSSM.mockReset();
    });
    test("[BDD] successful api call", async () => {
      mockSSM.mockResolvedValue(mockSSMParameterS);
      try {
        const data = await FMSHelper.getSSMParameter("primaryKey");
        expect(data).toEqual(mockSSMS);
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[BDD] successful api call", async () => {
      mockSSM.mockResolvedValue(mockSSMParameterSL);
      try {
        const data = await FMSHelper.getSSMParameter("primaryKey");
        expect(data).toEqual(expect.arrayContaining(mockSSMSL));
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      mockSSM.mockRejectedValue("fail in ssm get parameter");
      const ssmP = "mySSMParameter";
      try {
        await FMSHelper.getSSMParameter(ssmP);
      } catch (e) {
        expect(e.message).toEqual(`error fetching SSM parameter ${ssmP}`);
      }
    });
  });

  describe("[getRegions]", () => {
    beforeEach(() => {
      mockEC2.mockReset();
    });
    test("[BDD] successful api call", async () => {
      mockEC2.mockResolvedValue(mockRegions);
      try {
        const data = await FMSHelper.getRegions();
        expect(data).toEqual(expect.arrayContaining(mockRegionsArr));
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      mockEC2.mockRejectedValue("fail in ec2 describe");
      try {
        await FMSHelper.getRegions();
      } catch (e) {
        expect(e.message).toEqual("error fetching ec2 regions");
      }
    });
  });

  describe("[putPolicy]", () => {
    beforeEach(() => {
      mockFMS.mockReset();
    });
    test("[BDD] successful api call", async () => {
      mockFMS.mockResolvedValue("");
      try {
        await FMSHelper.putPolicy(mockPolicy, "region-a");
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[BDD] successful api call", async () => {
      mockFMS.mockResolvedValue("");
      try {
        await FMSHelper.putPolicy(mockPolicy, "Global");
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      mockFMS.mockRejectedValue("fail in fms put");
      const _region = "myRregion";
      try {
        await FMSHelper.putPolicy(mockPolicy, _region);
      } catch (e) {
        expect(e.message).toEqual(
          `failed to save policy ${mockPolicy.PolicyName} in ${_region}`
        );
      }
    });
  });

  describe("[deletePolicy]", () => {
    beforeEach(() => {
      mockFMS.mockReset();
    });
    test("[BDD] successful api call", async () => {
      FMSHelper.getDDBItem = jest.fn().mockResolvedValue(mockDDBItem);
      mockFMS.mockResolvedValue("");
      FMSHelper.deleteDDBItem = jest.fn().mockResolvedValue("");
      try {
        await FMSHelper.deletePolicy("", "", "");
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      FMSHelper.getDDBItem = jest.fn().mockResolvedValue(mockDDBItem);
      mockFMS.mockRejectedValue("error in fms delete");
      try {
        await FMSHelper.deletePolicy("policyX", "myRegion", "table");
      } catch (e) {
        expect(e.message).toEqual("error deleting policy policyX in myRegion");
      }
    });
  });
});
