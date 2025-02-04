// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct } from "constructs";
import {
  CfnQueue,
  Queue,
  QueueEncryption,
  QueuePolicy,
} from "aws-cdk-lib/aws-sqs";
import { AnyPrincipal, Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";

/**
 * @description
 * This construct generates a dead letter queue with encryption in-transit.
 * @author aws-solutions
 */
export class DeadLetterQueueConstruct extends Construct {
  private readonly queue: Queue;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const deadLetterQueue: Queue = new Queue(this, `DLQ`, {
      encryption: QueueEncryption.KMS_MANAGED,
    });

    /**
     * @description SQS queue policy to enforce only encrypted connections over HTTPS,
     * adding aws:SecureTransport in conditions
     */
    const queuePolicy: QueuePolicy = new QueuePolicy(this, "QueuePolicy", {
      queues: [deadLetterQueue],
    });
    queuePolicy.document.addStatements(
      new PolicyStatement({
        sid: "AllowPublishThroughSSLOnly",
        actions: ["sqs:*"],
        effect: Effect.DENY,
        resources: [deadLetterQueue.queueArn],
        conditions: {
          ["Bool"]: {
            "aws:SecureTransport": "false",
          },
        },

        principals: [new AnyPrincipal()],
      })
    );

    const cfnQueue = deadLetterQueue.node.defaultChild as CfnQueue;
    // Maintain the historic logical ID to avoid update replacement
    cfnQueue.overrideLogicalId(`DLQ581697C4`);
    this.queue = deadLetterQueue;
  }

  getQueue(): Queue {
    return this.queue;
  }
}
