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
 * This is Firewall Manager Demo construct
 * minimal resources for demo purpose ONLY
 * @author @aws-solutions
 */

import { App, CfnResource, Stack } from "@aws-cdk/core";
import { Vpc, SecurityGroup, Peer, Port } from "@aws-cdk/aws-ec2";
import manifest from "./manifest.json";
const {
  CloudFrontToS3,
} = require("@aws-solutions-constructs/aws-cloudfront-s3");

export class DemoStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.description = `(${manifest.demoSolutionId}) - The AWS CloudFormation template for deployment of the ${manifest.solutionName} demo resources. Version ${manifest.solutionVersion}`;
    this.templateOptions.templateFormatVersion = manifest.templateVersion;

    //=============================================================================================
    // Resources
    //=============================================================================================
    /**
     * CloudFront - S3 resource
     */
    new CloudFrontToS3(this, "test-cloudfront-s3", {});

    /**
     * Security Groups
     */
    const vpc = new Vpc(this, "test-VPC", {
      cidr: "10.0.0.0/16",
    });

    vpc.publicSubnets.forEach((s) => {
      const cfnSubnet = s.node.defaultChild as CfnResource;
      cfnSubnet.addPropertyOverride("MapPublicIpOnLaunch", false);
    });

    const sg = new SecurityGroup(this, "test-vpc-sg", {
      vpc: vpc,
      allowAllOutbound: true,
    });
    sg.addIngressRule(Peer.anyIpv4(), Port.allTcp());

    //=============================================================================================
    // cfn_nag suppress rules
    //=============================================================================================
    const sgSuppress = sg.node.findChild("Resource") as CfnResource;
    const vpcSuppress = vpc.node.findChild("Resource") as CfnResource;
    sgSuppress.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W40",
            reason:
              "Demo template, need resources to trigger violation rules in the account",
          },
          {
            id: "W5",
            reason:
              "Demo template, need resources to trigger violation rules in the account",
          },
          {
            id: "W9",
            reason:
              "Demo template, need resources to trigger violation rules in the account",
          },
          {
            id: "W2",
            reason:
              "Demo template, need resources to trigger violation rules in the account",
          },
          {
            id: "W27",
            reason:
              "Demo template, need resources to trigger violation rules in the account",
          },
        ],
      },
    };

    vpcSuppress.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W60",
            reason:
              "Demo template, need resources to trigger violation rules in the account",
          },
        ],
      },
    };
  }
}
