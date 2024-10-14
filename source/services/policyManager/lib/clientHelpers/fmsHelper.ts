// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  DeletePolicyCommand,
  FMSClient,
  GetPolicyCommand,
  Policy,
  PutPolicyCommand,
  PutPolicyResponse,
} from "@aws-sdk/client-fms";
import { customUserAgent, getDataplaneForPartition } from "../exports";
import { logger, tracer } from "solutions-utils";

export interface FMSHelperProps {
  partition?: string;
  maxAttempts?: number;
}

export class FMSHelper {
  private readonly globalDataplane: string;
  private readonly maxAttempts: number;

  constructor(props: FMSHelperProps) {
    this.globalDataplane = getDataplaneForPartition(props.partition ?? "aws");
    this.maxAttempts = props.maxAttempts ?? 10;
  }

  async putPolicy(policy: Policy, region: string): Promise<PutPolicyResponse> {
    try {
      const fmsClient = this.createFMSClient(region);

      const resp = await fmsClient.send(
        new PutPolicyCommand({
          Policy: policy,
        })
      );

      logger.debug(
        `successfully put policy ${policy.PolicyName} in region ${region}`,
        {
          policy: policy.PolicyName,
          region: region,
        }
      );
      return resp;
    } catch (e) {
      logger.error(
        `encountered error putting policy ${policy.PolicyName} in region ${region}`,
        {
          error: e,
          policy: policy.PolicyName,
          region: region,
          requestId: e.$metadata?.requestId,
        }
      );
      throw new Error(
        `failed to save policy ${policy.PolicyName} in ${region}`
      );
    }
  }

  async deletePolicy(policyId: string, region: string): Promise<void> {
    try {
      const fmsClient = this.createFMSClient(region);

      await fmsClient.send(
        new DeletePolicyCommand({
          PolicyId: policyId,
          DeleteAllPolicyResources: true,
        })
      );

      logger.debug("deleted policy in FMS", {
        policy: policyId,
        region: region,
      });
    } catch (e) {
      logger.error(
        `encountered error deleting policy ${policyId} in ${region}`,
        {
          error: e,
          policyId: policyId,
          region: region,
          requestId: e.$metadata?.requestId,
        }
      );
      throw new Error(`error deleting policy`);
    }
  }

  async getPolicy(policyId: string, region: string): Promise<Policy> {
    const fmsClient = this.createFMSClient(region);

    try {
      const response = await fmsClient.send(
        new GetPolicyCommand({
          PolicyId: policyId,
        })
      );

      if (!response.Policy) {
        throw new Error(`No Policy found with policyId ${policyId}`);
      }

      return response.Policy;
    } catch (e) {
      logger.error(`encountered error getting policy ${policyId}`, {
        error: e,
        policyId,
        region,
        requestId: e.$metadata?.requestId,
      });
      throw new Error(`error getting policy`);
    }
  }

  private createFMSClient(region: string) {
    const clientRegion = region === "Global" ? this.globalDataplane : region;
    return tracer.captureAWSv3Client(
      new FMSClient({
        region: clientRegion,
        maxAttempts: this.maxAttempts, // to avoid throttling exceptions
        customUserAgent: customUserAgent,
      })
    );
  }
}
