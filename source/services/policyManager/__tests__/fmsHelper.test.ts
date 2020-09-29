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
import "jest";
import { FMSHelper } from "../lib/fmsHelper";

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

jest.mock("aws-sdk", () => {
  return {
    DynamoDB: jest.fn(() => ({
      getItem: mockDDB,
      updateItem: mockDDB,
      deleteItem: mockDDB,
    })),
    SSM: jest.fn(() => ({
      getParameter: mockSSM,
    })),
    EC2: jest.fn(() => ({
      describeRegions: mockEC2,
    })),
    FMS: jest.fn(() => ({
      deletePolicy: mockFMS,
      putPolicy: mockFMS,
    })),
  };
});

describe("==FMS Helper Tests==", () => {
  describe("[getDDBItem]", () => {
    beforeEach(() => {
      mockDDB.mockReset();
    });
    test("[TDD] successful api call", async () => {
      mockDDB.mockImplementation((_) => {
        return {
          promise() {
            return Promise.resolve({ Item: mockDDBItem });
          },
        };
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
    test("[TDD] failed api call", async () => {
      mockDDB.mockImplementation(() => {
        return {
          promise() {
            throw new Error();
          },
        };
      });
      try {
        await FMSHelper.getDDBItem("primaryKey", "sortKey", "table");
      } catch (e) {
        expect(e.message).toEqual("error getting ddb item");
      }
    });
  });

  describe("[updateDDBItem]", () => {
    beforeEach(() => {
      mockDDB.mockReset();
    });
    test("[TDD] successful api call", async () => {
      mockDDB.mockImplementation(() => {
        return {
          promise() {
            return Promise.resolve();
          },
        };
      });
      try {
        await FMSHelper.updateDDBItem(
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
      mockDDB.mockImplementation(() => {
        return {
          promise() {
            return Promise.reject();
          },
        };
      });
      try {
        await FMSHelper.updateDDBItem(
          "primaryKey",
          "sortKey",
          { updateToken: "", policyId: "" },
          "table"
        );
      } catch (e) {
        expect(e.message).toEqual("error updating ddb item");
      }
    });
  });

  describe("[deleteDDBItem]", () => {
    beforeEach(() => {
      mockDDB.mockReset();
    });
    test("[TDD] successful api call", async () => {
      mockDDB.mockImplementation(() => {
        return {
          promise() {
            return Promise.resolve();
          },
        };
      });
      try {
        await FMSHelper.deleteDDBItem("primaryKey", "sortKey", "table");
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      mockDDB.mockImplementation(() => {
        return {
          promise() {
            return Promise.reject();
          },
        };
      });
      try {
        await FMSHelper.deleteDDBItem("primaryKey", "sortKey", "table");
      } catch (e) {
        expect(e.message).toEqual("error deleting ddb item");
      }
    });
  });

  describe("[getSSMParameter]", () => {
    beforeEach(() => {
      mockSSM.mockReset();
    });
    test("[BDD] successful api call", async () => {
      mockSSM.mockImplementation(() => {
        return {
          promise() {
            return Promise.resolve(mockSSMParameterS);
          },
        };
      });
      try {
        const data = await FMSHelper.getSSMParameter("primaryKey");
        expect(data).toEqual(mockSSMS);
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[BDD] successful api call", async () => {
      mockSSM.mockImplementation(() => {
        return {
          promise() {
            return Promise.resolve(mockSSMParameterSL);
          },
        };
      });
      try {
        const data = await FMSHelper.getSSMParameter("primaryKey");
        expect(data).toEqual(expect.arrayContaining(mockSSMSL));
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      mockSSM.mockImplementation(() => {
        return {
          promise() {
            return Promise.reject();
          },
        };
      });
      try {
        await FMSHelper.getSSMParameter("primaryKey");
      } catch (e) {
        expect(e.message).toEqual("error fetching SSM parameter");
      }
    });
  });

  describe("[getRegions]", () => {
    beforeEach(() => {
      mockEC2.mockReset();
    });
    test("[BDD] successful api call", async () => {
      mockEC2.mockImplementation(() => {
        return {
          promise() {
            return Promise.resolve(mockRegions);
          },
        };
      });
      try {
        const data = await FMSHelper.getRegions();
        expect(data).toEqual(expect.arrayContaining(mockRegionsArr));
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      mockEC2.mockImplementation(() => {
        return {
          promise() {
            return Promise.reject();
          },
        };
      });
      try {
        await FMSHelper.getRegions();
      } catch (e) {
        expect(e.message).toEqual("error fetching regions");
      }
    });
  });

  describe("[putPolicy]", () => {
    beforeEach(() => {
      mockFMS.mockReset();
    });
    test("[BDD] successful api call", async () => {
      mockFMS.mockImplementation(() => {
        return {
          promise() {
            return Promise.resolve();
          },
        };
      });
      try {
        await FMSHelper.putPolicy(mockPolicy, "region-a");
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[BDD] successful api call", async () => {
      mockFMS.mockImplementation(() => {
        return {
          promise() {
            return Promise.resolve();
          },
        };
      });
      try {
        await FMSHelper.putPolicy(mockPolicy, "Global");
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      mockFMS.mockRejectedValue("");
      try {
        await FMSHelper.putPolicy(mockPolicy, "region-a");
      } catch (e) {
        expect(e.message).toEqual("failed to save policy");
      }
    });
  });

  describe("[deletePolicy]", () => {
    beforeEach(() => {
      mockFMS.mockReset();
    });
    test("[BDD] successful api call", async () => {
      FMSHelper.getDDBItem = jest.fn().mockImplementation(() => {
        return Promise.resolve(mockDDBItem);
      });
      mockFMS.mockImplementation(() => {
        return {
          promise() {
            return Promise.resolve();
          },
        };
      });
      FMSHelper.deleteDDBItem = jest.fn().mockImplementation(() => {
        return Promise.resolve();
      });
      try {
        await FMSHelper.deletePolicy("", "", "");
      } catch (e) {
        console.log(`negative test: ${e.message}`);
      }
    });
    test("[TDD] failed api call", async () => {
      FMSHelper.getDDBItem = jest.fn().mockImplementation(() => {
        return Promise.resolve(mockDDBItem);
      });
      mockFMS.mockImplementation(() => {
        return {
          promise() {
            throw new Error();
          },
        };
      });
      try {
        await FMSHelper.deletePolicy("policyX", "us-east-1", "table");
      } catch (e) {
        expect(e.message).toEqual("error deleting policy");
      }
    });
  });
});
