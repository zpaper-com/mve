import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class MveNetworkingStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly databaseSecurityGroup: ec2.SecurityGroup;
  public readonly redisSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC with public and private subnets
    this.vpc = new ec2.Vpc(this, 'MveVpc', {
      vpcName: 'mve-vpc',
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 1, // Cost optimization: Single NAT Gateway
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true
    });

    // Application Load Balancer Security Group
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'mve-alb-sg',
      description: 'Security group for MVE Application Load Balancer',
      allowAllOutbound: true
    });

    // Allow HTTP and HTTPS traffic from internet
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic from internet'
    );

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic from internet'
    );

    // ECS Tasks Security Group
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'mve-ecs-sg',
      description: 'Security group for MVE ECS tasks',
      allowAllOutbound: true
    });

    // Allow traffic from ALB to ECS tasks on port 3000
    this.ecsSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow traffic from ALB to ECS tasks'
    );

    // Database Security Group
    this.databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'mve-database-sg',
      description: 'Security group for MVE RDS PostgreSQL database',
      allowAllOutbound: false
    });

    // Allow PostgreSQL traffic from ECS tasks
    this.databaseSecurityGroup.addIngressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL traffic from ECS tasks'
    );

    // Redis Security Group
    this.redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'mve-redis-sg',
      description: 'Security group for MVE ElastiCache Redis',
      allowAllOutbound: false
    });

    // Allow Redis traffic from ECS tasks
    this.redisSecurityGroup.addIngressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow Redis traffic from ECS tasks'
    );

    // VPC Endpoints for cost optimization (avoid NAT Gateway charges for AWS services)
    new ec2.VpcEndpoint(this, 'S3VpcEndpoint', {
      vpc: this.vpc,
      service: ec2.VpcEndpointService.S3,
      vpcEndpointType: ec2.VpcEndpointType.GATEWAY,
      routeTableIds: this.vpc.privateSubnets.map(subnet => subnet.routeTable.routeTableId)
    });

    new ec2.VpcEndpoint(this, 'EcrVpcEndpoint', {
      vpc: this.vpc,
      service: ec2.VpcEndpointService.ECR,
      privateDnsEnabled: true,
      securityGroups: [this.ecsSecurityGroup]
    });

    new ec2.VpcEndpoint(this, 'EcrDkrVpcEndpoint', {
      vpc: this.vpc,
      service: ec2.VpcEndpointService.ECR_DOCKER,
      privateDnsEnabled: true,
      securityGroups: [this.ecsSecurityGroup]
    });

    new ec2.VpcEndpoint(this, 'CloudWatchLogsVpcEndpoint', {
      vpc: this.vpc,
      service: ec2.VpcEndpointService.CLOUDWATCH_LOGS,
      privateDnsEnabled: true,
      securityGroups: [this.ecsSecurityGroup]
    });

    new ec2.VpcEndpoint(this, 'SecretsManagerVpcEndpoint', {
      vpc: this.vpc,
      service: ec2.VpcEndpointService.SECRETS_MANAGER,
      privateDnsEnabled: true,
      securityGroups: [this.ecsSecurityGroup]
    });

    // Output important values
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID for MVE infrastructure',
      exportName: 'MveVpcId'
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'Private subnet IDs for ECS tasks',
      exportName: 'MvePrivateSubnetIds'
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: this.vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'Public subnet IDs for ALB',
      exportName: 'MvePublicSubnetIds'
    });
  }
}