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
/**
 * @description
 * AWS Centralized WAF & Security Group Management
 * Microservice to trigger policy updates
 * @author aws-solutions
 */

import { WAFManager } from "./lib/wafManager";
import { SecurityGroupManager } from "./lib/securitygroupManager";
import { ShieldManager } from "./lib/shieldManager";
import { PolicyManager } from "./lib/policyManager";
import { FMSHelper } from "./lib/fmsHelper";
import { logger } from "./lib/common/logger";

/**
 * @description interface for triggering events
 */
interface IEvent {
  version: string;
  id: string;
  "detail-type": "Parameter Store Change";
  source: "aws.ssm";
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: {
    operation: string;
    name: string;
    type: string;
    description: string;
  };
}

exports.handler = async (event: IEvent, _: any) => {
  logger.debug({ label: "PolicyManager", message: "Loading event..." });
  logger.debug({
    label: "PolicyManager",
    message: `event : ${JSON.stringify(event)}`,
  });

  // fetching env variables
  const ous = <string>process.env.FMS_OU;
  const regions = <string>process.env.FMS_REGIONS;
  const tags = <string>process.env.FMS_TAGS;
  const table = <string>process.env.FMS_TABLE;

  let _ous: string[], _regions: string[], _tags: any;
  try {
    _ous = <string[]>await FMSHelper.getSSMParameter(ous);
    _regions = <string[]>await FMSHelper.getSSMParameter(regions);
    _tags = await FMSHelper.getSSMParameter(tags);
  } catch (e) {
    throw new Error(`Failed to fetch SSM parameter: ${e.messsage}`);
  }

  let oud: boolean,
    ouv: boolean,
    rd: boolean,
    rv: boolean,
    tv: boolean,
    td: boolean;
  try {
    // validating the SSM parameters
    oud = await PolicyManager.isOUDelete(_ous);
    ouv = await PolicyManager.isOUValid(_ous);
    rd = await PolicyManager.isRegionDelete(_regions);
    rv = await PolicyManager.isRegionValid(_regions);
    tv = await PolicyManager.isTagValid(_tags);
    td = await PolicyManager.isTagDelete(_tags);
  } catch (e) {
    throw new Error(`Failed to validate SSM parameter: ${e.message}`);
  }

  logger.debug({
    label: "PolicyManagaer",
    message: JSON.stringify({
      OUDelete: oud,
      OUValid: ouv,
      RegionDelete: rd,
      RegionValid: rv,
      TagValid: tv,
      TagDelete: td,
    }),
  });

  if (!oud && !ouv) throw new Error("Invalid OU input provided");

  // policies will be updated with NO tags if provided tags are invalid or set to 'delete'
  if (!tv || td) {
    _tags = {
      ResourceTags: [],
      ExcludeResourceTags: false,
    };
  } else {
    _tags = JSON.parse(_tags);
  }

  const _e = event.detail.name;
  logger.debug({
    label: "PolicyManager",
    message: `triggering parameter: ${_e}`,
  });

  switch (_e) {
    case ous: {
      if (oud) {
        /****************************************************************
         * Delete ALL Policies
         ***************************************************************/
        logger.info({
          label: `PolicyManager${ous}`,
          message: `initiating DELETE on ALL policies`,
        });
        await WAFManager.deleteWAFPolicy(table, "Global").catch((e) => {
          logger.warn({
            label: `PolicyManager/deleteWAFPolicy-Global`,
            message: `${e.message}`,
          });
        }); // global
        await ShieldManager.deleteShieldPolicy(table, "Global").catch((e) => {
          logger.warn({
            label: `PolicyManager/deleteShieldPolicy`,
            message: `${e.message}`,
          });
        });
        const _r = <string[]>await FMSHelper.getRegions().catch((e) => {
          logger.error(`${e.message}`);
        });
        await Promise.allSettled(
          _r.map(async (region) => {
            await WAFManager.deleteWAFPolicy(table, region).catch((e) => {
              logger.warn({
                label: `PolicyManager/deleteWAFPolicy-Regional`,
                message: `${e.message}`,
              });
            }); // regional
            await ShieldManager.deleteShieldPolicy(table, region).catch((e) => {
              logger.warn({
                label: `PolicyManager/deleteShieldPolicy-Regional`,
                message: `${e.message}`,
              });
            });
            await SecurityGroupManager.deleteSecGrpPolicy(
              table,
              region,
              "USAGE_AUDIT"
            ).catch((e) => {
              logger.warn({
                label: `PolicyManager/deleteSecGrpPolicy-UsageAudit`,
                message: `${e.message}`,
              });
            });
            await SecurityGroupManager.deleteSecGrpPolicy(
              table,
              region,
              "CONTENT_AUDIT"
            ).catch((e) => {
              logger.warn({
                label: `PolicyManager/deleteSecGrpPolicy-ContentAudit`,
                message: `${e.message}`,
              });
            });
          })
        );
        logger.info({
          label: `PolicyManager${ous}`,
          message: "ALL FMS policies and related resources deleted",
        });
      } else if (ouv && !rv) {
        /****************************************************************
         * Save ALL Global Policies
         ***************************************************************/
        logger.debug({
          label: `PolicyManager${ous}`,
          message: `saving global policies`,
        });
        await WAFManager.saveWAFPolicy(_ous, _tags, table, "Global").catch(
          (e) => {
            logger.error({
              label: `PolicyManager/saveWAFPolicy-Global`,
              message: `${e.message}`,
            });
          }
        );
        await ShieldManager.saveShieldPolicy(
          _ous,
          _tags,
          table,
          "Global"
        ).catch((e) => {
          logger.error({
            label: `PolicyManager/saveShieldPolicy`,
            message: `${e.message}`,
          });
        });
        logger.info({
          label: `PolicyManager${ous}`,
          message: `global policies saved`,
        });
      } else if (ouv && rv) {
        /****************************************************************
         * Save ALL Policies
         ***************************************************************/
        logger.debug({
          label: `PolicyManager${ous}`,
          message: `saving policies`,
        });
        await WAFManager.saveWAFPolicy(_ous, _tags, table, "Global").catch(
          (e) => {
            logger.error({
              label: `PolicyManager/saveWAFPolicy-Global`,
              message: `${e.message}`,
            });
          }
        );
        await ShieldManager.saveShieldPolicy(
          _ous,
          _tags,
          table,
          "Global"
        ).catch((e) => {
          logger.error({
            label: `PolicyManager/saveShieldPolicy-Global`,
            message: `${e.message}`,
          });
        });
        await Promise.allSettled(
          _regions.map(async (region) => {
            await WAFManager.saveWAFPolicy(_ous, _tags, table, region).catch(
              (e) => {
                logger.error({
                  label: `PolicyManager/saveWAFPolicy-Regional`,
                  message: `${e.message}`,
                });
              }
            ); // regional
            await ShieldManager.saveShieldPolicy(
              _ous,
              _tags,
              table,
              region
            ).catch((e) => {
              logger.error({
                label: `PolicyManager/saveShieldPolicy-Regional`,
                message: `${e.message}`,
              });
            });
            await SecurityGroupManager.saveSecGrpPolicy(
              _ous,
              _tags,
              table,
              region,
              "USAGE_AUDIT"
            ).catch((e) => {
              logger.error({
                label: `PolicyManager/saveSecGrpPolicy-UsageAudit`,
                message: `${e.message}`,
              });
            });
            await SecurityGroupManager.saveSecGrpPolicy(
              _ous,
              _tags,
              table,
              region,
              "CONTENT_AUDIT"
            ).catch((e) => {
              logger.error({
                label: `PolicyManager/saveSecGrpPolicy-ContentAudit`,
                message: `${e.message}`,
              });
            });
          })
        );
        logger.info({
          label: `PolicyManager${ous}`,
          message: `policies saved`,
        });
      } else {
        logger.error({
          lable: `PolicyManager${ous}`,
          message: "invalid OU input",
        });
        throw new Error("Invalid OU input provided");
      }
      break;
    }
    case regions: {
      if (rd) {
        /****************************************************************
         * Delete Regional Policies
         ***************************************************************/
        logger.warn({
          label: `PolicyManager${regions}`,
          message: `initiating DELETE on ALL regional policies`,
        });
        const _r = <string[]>await FMSHelper.getRegions().catch((e) => {
          logger.error(`${e.message}`);
        });
        await Promise.allSettled(
          _r.map(async (region) => {
            await WAFManager.deleteWAFPolicy(table, region).catch((e) => {
              logger.warn({
                label: `PolicyManager/deleteWAFPolicy-Regional`,
                message: `${e.message}`,
              });
            }); // regional
            await ShieldManager.deleteShieldPolicy(table, region).catch((e) => {
              logger.warn({
                label: `PolicyManager/deleteShieldPolicy-Regional`,
                message: `${e.message}`,
              });
            });
            await SecurityGroupManager.deleteSecGrpPolicy(
              table,
              region,
              "USAGE_AUDIT"
            ).catch((e) => {
              logger.warn({
                label: `PolicyManager/deleteSecGrpPolicy-UsageAudit`,
                message: `${e.message}`,
              });
            });
            await SecurityGroupManager.deleteSecGrpPolicy(
              table,
              region,
              "CONTENT_AUDIT"
            ).catch((e) => {
              logger.warn({
                label: `PolicyManager/deleteSecGrpPolicy-ContentAudit`,
                message: `${e.message}`,
              });
            });
          })
        );
        logger.info({
          label: `PolicyManager${regions}`,
          message: `ALL FMS regional policies and related resources deleted`,
        });
      } else if (rv && ouv) {
        /****************************************************************
         * Save Regional Policies
         ***************************************************************/
        logger.debug({
          label: `PolicyManager${regions}`,
          message: `saving regional policies`,
        });
        const _r = <string[]>await FMSHelper.getRegions();
        await Promise.allSettled(
          _r.map(async (region) => {
            if (!_regions.includes(region)) {
              await WAFManager.deleteWAFPolicy(table, region).catch((e) => {
                logger.warn({
                  label: `PolicyManager/deleteWAFPolicy-Regional`,
                  message: `${e.message}`,
                });
              });
              await ShieldManager.deleteShieldPolicy(table, region).catch(
                (e) => {
                  logger.warn({
                    label: `PolicyManager/deleteShieldPolicy-Regional`,
                    message: `${e.message}`,
                  });
                }
              );
              await SecurityGroupManager.deleteSecGrpPolicy(
                table,
                region,
                "USAGE_AUDIT"
              ).catch((e) => {
                logger.warn({
                  label: `PolicyManager/deleteSecGrpPolicy-UsageAudit`,
                  message: `${e.message}`,
                });
              });
              await SecurityGroupManager.deleteSecGrpPolicy(
                table,
                region,
                "CONTENT_AUDIT"
              ).catch((e) => {
                logger.warn({
                  label: `PolicyManager/deleteSecGrpPolicy-ContentAudit`,
                  message: `${e.message}`,
                });
              });
            } else {
              await WAFManager.saveWAFPolicy(_ous, _tags, table, region).catch(
                (e) => {
                  logger.error({
                    label: `PolicyManager/saveWAFPolicy-Regional`,
                    message: `${e.message}`,
                  });
                }
              ); // regional
              await ShieldManager.saveShieldPolicy(
                _ous,
                _tags,
                table,
                region
              ).catch((e) => {
                logger.error({
                  label: `PolicyManager/saveShieldPolicy-Regional`,
                  message: `${e.message}`,
                });
              });
              await SecurityGroupManager.saveSecGrpPolicy(
                _ous,
                _tags,
                table,
                region,
                "USAGE_AUDIT"
              ).catch((e) => {
                logger.error({
                  label: `PolicyManager/saveSecGrpPolicy-UsageAudit`,
                  message: `${e.message}`,
                });
              });
              await SecurityGroupManager.saveSecGrpPolicy(
                _ous,
                _tags,
                table,
                region,
                "CONTENT_AUDIT"
              ).catch((e) => {
                logger.error({
                  label: `PolicyManager/saveSecGrpPolicy-ContentAudit`,
                  message: `${e.message}`,
                });
              });
            }
          })
        );
        logger.debug({
          label: `PolicyManager${regions}`,
          message: "policies saved",
        });
      } else {
        logger.error({
          label: `PolicyManager${regions}`,
          message: "Invalid region list provided",
        });
        throw new Error("Invalid region list provided");
      }
      break;
    }
    case tags: {
      /****************************************************************
       * Save ALL Policies
       ***************************************************************/
      logger.debug({
        label: "PolicyManagaer",
        message: `tags: ${JSON.stringify(_tags)}`,
      });
      logger.debug({
        label: `PolicyManager${tags}`,
        message: "saving policies",
      });
      await WAFManager.saveWAFPolicy(_ous, _tags, table, "Global").catch(
        (e) => {
          logger.error({
            label: `PolicyManager/saveWAFPolicy-Global`,
            message: `${e.message}`,
          });
        }
      ); // global
      await ShieldManager.saveShieldPolicy(_ous, _tags, table, "Global").catch(
        (e) => {
          logger.error({
            label: `PolicyManager/saveShieldPolicy-Global`,
            message: `${e.message}`,
          });
        }
      );
      await Promise.allSettled(
        _regions.map(async (region) => {
          await WAFManager.saveWAFPolicy(_ous, _tags, table, region).catch(
            (e) => {
              logger.error({
                label: `PolicyManager/saveWAFPolicy-Regional`,
                message: `${e.message}`,
              });
            }
          ); // regional
          await ShieldManager.saveShieldPolicy(
            _ous,
            _tags,
            table,
            region
          ).catch((e) => {
            logger.error({
              label: `PolicyManager/saveShieldPolicy-Regional`,
              message: `${e.message}`,
            });
          });
          await SecurityGroupManager.saveSecGrpPolicy(
            _ous,
            _tags,
            table,
            region,
            "USAGE_AUDIT"
          ).catch((e) => {
            logger.error({
              label: `PolicyManager/saveSecGrpPolicy-UsageAudit`,
              message: `${e.message}`,
            });
          });
          await SecurityGroupManager.saveSecGrpPolicy(
            _ous,
            _tags,
            table,
            region,
            "CONTENT_AUDIT"
          ).catch((e) => {
            logger.error({
              label: `PolicyManager/saveSecGrpPolicy-ContentAudit`,
              message: `${e.message}`,
            });
          });
        })
      );
      logger.debug({
        label: `PolicyManager${tags}`,
        message: "policies saved",
      });
      break;
    }
    default: {
      break;
    }
  }
};
