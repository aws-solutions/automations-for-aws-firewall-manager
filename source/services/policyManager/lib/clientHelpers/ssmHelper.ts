// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SSMClient } from "@aws-sdk/client-ssm";
import { customUserAgent } from "../exports";
import { SSMProvider } from "@aws-lambda-powertools/parameters/ssm";
import { logger, tracer } from "solutions-utils";

/**
 * Solution SSM Parameters for Policy Manager
 */
export class SSMHelper {
  private readonly parametersProvider: SSMProvider;

  constructor() {
    const ssmClient = tracer.captureAWSv3Client(
      new SSMClient({
        customUserAgent: customUserAgent,
      })
    );
    this.parametersProvider = new SSMProvider({ awsSdkV3Client: ssmClient });
  }

  /**
   * Function to fetch SSM Parameters for Policy Manager
   * @param {string} ssmParameterPath - path prefix to SSM parameters
   */
  async getParametersByPath(
    ssmParameterPath: string
  ): Promise<{ [key: string]: string }> {
    try {
      const ssmParameters = await this.parametersProvider.getMultiple(
        ssmParameterPath,
        {
          recursive: true,
        }
      );

      if (!ssmParameters) {
        logger.error("no SSM parameters found", {
          parameterPath: ssmParameterPath,
          fetchedParameters: ssmParameters,
        });
        throw new Error("SSM Parameters not found");
      }

      logger.info("Fetched SSM parameters", {
        fetchedParameters: ssmParameters,
      });

      return ssmParameters;
    } catch (e) {
      logger.error("encountered error fetching SSM parameters", {
        error: e,
        requestId: e.$metadata?.requestId,
      });
      throw new Error(
        `error fetching SSM parameters from path ${ssmParameterPath}*`
      );
    }
  }
}
