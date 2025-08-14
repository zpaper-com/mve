import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface MveComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  albSecurityGroup: ec2.SecurityGroup;
  ecsSecurityGroup: ec2.SecurityGroup;
  database: rds.DatabaseInstance;
  redisCluster: elasticache.CfnCacheCluster;
  staticBucket: s3.Bucket;
  documentsBucket: s3.Bucket;
  attachmentsBucket: s3.Bucket;
  distribution: cloudfront.Distribution;
}

export class MveComputeStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly ecrRepository: ecr.Repository;
  public readonly taskRole: iam.Role;
  public readonly executionRole: iam.Role;

  constructor(scope: Construct, id: string, props: MveComputeStackProps) {
    super(scope, id, props);

    // ECR Repository for backend container
    this.ecrRepository = new ecr.Repository(this, 'EcrRepository', {
      repositoryName: 'mve-backend',
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
          rulePriority: 1,
          tagStatus: ecr.TagStatus.UNTAGGED
        }
      ]
    });

    // ECS Cluster
    this.cluster = new ecs.Cluster(this, 'EcsCluster', {
      clusterName: 'mve-cluster',
      vpc: props.vpc,
      containerInsights: true,
      enableFargateCapacityProviders: true
    });

    // Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      loadBalancerName: 'mve-alb',
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSecurityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      }
    });

    // Target Group for ECS service
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      targetGroupName: 'mve-tg',
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      vpc: props.vpc,
      healthCheck: {
        enabled: true,
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        path: '/health',
        protocol: elbv2.Protocol.HTTP,
        timeout: cdk.Duration.seconds(5),
        unhealthyThresholdCount: 3,
        healthyThresholdCount: 2
      },
      deregistrationDelay: cdk.Duration.seconds(30)
    });

    // Note: For MVP, we'll only use HTTP behind CloudFront
    // HTTPS termination happens at CloudFront level

    // HTTP Listener
    this.loadBalancer.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroup])
    });

    // Task execution role
    this.executionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: 'mve-ecs-execution-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ]
    });

    // Add ECR permissions to execution role
    this.executionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage'
      ],
      resources: [this.ecrRepository.repositoryArn]
    }));

    // Add Secrets Manager permissions to execution role
    this.executionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue'
      ],
      resources: ['*'] // TODO: Restrict to specific secrets
    }));

    // Task role for application
    this.taskRole = new iam.Role(this, 'TaskRole', {
      roleName: 'mve-ecs-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
    });

    // Grant S3 permissions to task role
    props.staticBucket.grantReadWrite(this.taskRole);
    props.documentsBucket.grantReadWrite(this.taskRole);
    props.attachmentsBucket.grantReadWrite(this.taskRole);

    // Grant Secrets Manager permissions to task role
    this.taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret'
      ],
      resources: ['*'] // TODO: Restrict to specific secrets
    }));

    // Grant CloudFront invalidation permissions
    this.taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudfront:CreateInvalidation'
      ],
      resources: [`arn:aws:cloudfront::${this.account}:distribution/${props.distribution.distributionId}`]
    }));

    // CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/mve-backend',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: 'mve-backend-task',
      memoryLimitMiB: 2048,
      cpu: 1024,
      executionRole: this.executionRole,
      taskRole: this.taskRole
    });

    // Container Definition
    const container = taskDefinition.addContainer('BackendContainer', {
      containerName: 'mve-backend',
      image: ecs.ContainerImage.fromEcrRepository(this.ecrRepository, 'latest'),
      memoryLimitMiB: 2048,
      cpu: 1024,
      essential: true,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'mve-backend',
        logGroup: logGroup
      }),
      environment: {
        NODE_ENV: 'production',
        PORT: '3000',
        AWS_REGION: this.region,
        S3_STATIC_BUCKET: props.staticBucket.bucketName,
        S3_DOCUMENTS_BUCKET: props.documentsBucket.bucketName,
        S3_ATTACHMENTS_BUCKET: props.attachmentsBucket.bucketName,
        CLOUDFRONT_DISTRIBUTION_ID: props.distribution.distributionId,
        REDIS_HOST: props.redisCluster.attrRedisEndpointAddress,
        REDIS_PORT: props.redisCluster.attrRedisEndpointPort,
        DATABASE_HOST: props.database.instanceEndpoint.hostname,
        DATABASE_NAME: 'mve_database'
      }
      // Note: Secrets will be added when properly configured
    });

    // Add port mapping
    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP
    });

    // ECS Service
    this.service = new ecs.FargateService(this, 'Service', {
      serviceName: 'mve-backend-service',
      cluster: this.cluster,
      taskDefinition: taskDefinition,
      desiredCount: 2, // Start with 2 tasks for high availability
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      securityGroups: [props.ecsSecurityGroup],
      assignPublicIp: false,
      enableExecuteCommand: true,
      platformVersion: ecs.FargatePlatformVersion.LATEST,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE',
          weight: 1
        }
      ]
    });

    // Attach service to target group
    this.service.attachToApplicationTargetGroup(targetGroup);

    // Auto Scaling
    const scalableTarget = this.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 10
    });

    // CPU-based auto scaling
    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60)
    });

    // Memory-based auto scaling
    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60)
    });

    // Request-based auto scaling
    scalableTarget.scaleOnRequestCount('RequestScaling', {
      requestsPerTarget: 1000,
      targetGroup: targetGroup,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60)
    });

    // CloudWatch Alarms
    const highCpuAlarm = new cdk.aws_cloudwatch.Alarm(this, 'HighCpuAlarm', {
      alarmName: 'mve-high-cpu',
      alarmDescription: 'High CPU utilization on ECS service',
      metric: this.service.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      datapointsToAlarm: 2
    });

    const highMemoryAlarm = new cdk.aws_cloudwatch.Alarm(this, 'HighMemoryAlarm', {
      alarmName: 'mve-high-memory',
      alarmDescription: 'High memory utilization on ECS service',
      metric: this.service.metricMemoryUtilization(),
      threshold: 85,
      evaluationPeriods: 2,
      datapointsToAlarm: 2
    });

    // Service health alarm
    const unhealthyTargetsAlarm = new cdk.aws_cloudwatch.Alarm(this, 'UnhealthyTargetsAlarm', {
      alarmName: 'mve-unhealthy-targets',
      alarmDescription: 'Unhealthy targets in target group',
      metric: targetGroup.metricUnhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 2
    });

    // Output important values
    new cdk.CfnOutput(this, 'LoadBalancerDnsName', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS name',
      exportName: 'MveLoadBalancerDnsName'
    });

    new cdk.CfnOutput(this, 'LoadBalancerArn', {
      value: this.loadBalancer.loadBalancerArn,
      description: 'Application Load Balancer ARN',
      exportName: 'MveLoadBalancerArn'
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: this.ecrRepository.repositoryUri,
      description: 'ECR repository URI',
      exportName: 'MveEcrRepositoryUri'
    });

    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS cluster name',
      exportName: 'MveEcsClusterName'
    });

    new cdk.CfnOutput(this, 'EcsServiceName', {
      value: this.service.serviceName,
      description: 'ECS service name',
      exportName: 'MveEcsServiceName'
    });
  }
}