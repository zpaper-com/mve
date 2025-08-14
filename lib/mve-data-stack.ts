import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface MveDataStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  databaseSecurityGroup: ec2.SecurityGroup;
  redisSecurityGroup: ec2.SecurityGroup;
}

export class MveDataStack extends cdk.Stack {
  public readonly database: rds.DatabaseInstance;
  public readonly redisCluster: elasticache.CfnCacheCluster;
  public readonly databaseSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: MveDataStackProps) {
    super(scope, id, props);

    // Database credentials secret
    this.databaseSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: 'mve/database/credentials',
      description: 'MVE PostgreSQL database credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'mve_admin' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\\'',
        passwordLength: 32
      }
    });

    // Database subnet group
    const dbSubnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      vpc: props.vpc,
      description: 'Subnet group for MVE PostgreSQL database',
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      }
    });

    // Parameter group for PostgreSQL optimization
    const parameterGroup = new rds.ParameterGroup(this, 'DatabaseParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_6
      }),
      parameters: {
        'shared_preload_libraries': 'pg_stat_statements',
        'log_statement': 'all',
        'log_min_duration_statement': '1000',
        'max_connections': '100'
      }
    });

    // RDS PostgreSQL instance (Single AZ for MVP cost optimization)
    this.database = new rds.DatabaseInstance(this, 'Database', {
      instanceIdentifier: 'mve-postgresql',
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_6
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      securityGroups: [props.databaseSecurityGroup],
      credentials: rds.Credentials.fromSecret(this.databaseSecret),
      databaseName: 'mve_database',
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      multiAz: false, // Single AZ for MVP cost optimization
      deletionProtection: true,
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: false,
      parameterGroup: parameterGroup,
      subnetGroup: dbSubnetGroup,
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
      monitoringInterval: cdk.Duration.seconds(60),
      autoMinorVersionUpgrade: true,
      allowMajorVersionUpgrade: false
    });

    // Redis subnet group
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for MVE Redis cluster',
      subnetIds: props.vpc.privateSubnets.map(subnet => subnet.subnetId),
      cacheSubnetGroupName: 'mve-redis-subnet-group'
    });

    // Redis parameter group
    const redisParameterGroup = new elasticache.CfnParameterGroup(this, 'RedisParameterGroup', {
      cacheParameterGroupFamily: 'redis7.x',
      description: 'Parameter group for MVE Redis cluster',
      properties: {
        'maxmemory-policy': 'allkeys-lru',
        'notify-keyspace-events': 'Ex',
        'timeout': '300'
      }
    });

    // ElastiCache Redis cluster (Single node for MVP cost optimization)
    this.redisCluster = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
      clusterName: 'mve-redis',
      cacheNodeType: 'cache.t3.micro',
      engine: 'redis',
      engineVersion: '7.0',
      numCacheNodes: 1,
      vpcSecurityGroupIds: [props.redisSecurityGroup.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.ref,
      cacheParameterGroupName: redisParameterGroup.ref,
      port: 6379,
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
      autoMinorVersionUpgrade: true
    });

    // Add dependency
    this.redisCluster.addDependency(redisSubnetGroup);
    this.redisCluster.addDependency(redisParameterGroup);

    // Create database initialization Lambda (for schema setup)
    const dbInitLambdaCode = `
const { Client } = require('pg');
const AWS = require('aws-sdk');

const secretsManager = new AWS.SecretsManager();

exports.handler = async (event) => {
    try {
        // Get database credentials
        const secretValue = await secretsManager.getSecretValue({
            SecretId: process.env.DB_SECRET_ARN
        }).promise();
        
        const credentials = JSON.parse(secretValue.SecretString);
        
        // Connect to database
        const client = new Client({
            host: process.env.DB_HOST,
            port: 5432,
            database: 'mve_database',
            user: credentials.username,
            password: credentials.password,
            ssl: { rejectUnauthorized: false }
        });
        
        await client.connect();
        
        // Create database schema
        const schema = \`
            -- Workflow Sessions Table
            CREATE TABLE IF NOT EXISTS workflow_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                document_url VARCHAR(500) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                status VARCHAR(50) DEFAULT 'active',
                metadata JSONB
            );

            -- Recipients Table
            CREATE TABLE IF NOT EXISTS recipients (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID REFERENCES workflow_sessions(id),
                order_index INTEGER NOT NULL,
                recipient_type VARCHAR(50) NOT NULL,
                party_name VARCHAR(255),
                email VARCHAR(255),
                mobile VARCHAR(20),
                npi VARCHAR(10),
                unique_url VARCHAR(100) UNIQUE NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                accessed_at TIMESTAMP,
                completed_at TIMESTAMP,
                form_data JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );

            -- Attachments Table
            CREATE TABLE IF NOT EXISTS attachments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID REFERENCES workflow_sessions(id),
                recipient_id UUID REFERENCES recipients(id),
                file_name VARCHAR(255) NOT NULL,
                file_type VARCHAR(50) NOT NULL,
                file_size INTEGER NOT NULL,
                s3_key VARCHAR(500) NOT NULL,
                uploaded_at TIMESTAMP DEFAULT NOW(),
                uploaded_by UUID REFERENCES recipients(id)
            );

            -- Create indexes for performance
            CREATE INDEX IF NOT EXISTS idx_recipients_session_id ON recipients(session_id);
            CREATE INDEX IF NOT EXISTS idx_recipients_unique_url ON recipients(unique_url);
            CREATE INDEX IF NOT EXISTS idx_attachments_session_id ON attachments(session_id);
            CREATE INDEX IF NOT EXISTS idx_workflow_sessions_status ON workflow_sessions(status);
        \`;
        
        await client.query(schema);
        await client.end();
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Database schema created successfully' })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
    `;

    // Store the database initialization code in a custom resource
    new cdk.CustomResource(this, 'DatabaseInitializer', {
      serviceToken: 'arn:aws:lambda:us-east-1:123456789012:function:DatabaseInitializer', // Placeholder
      properties: {
        DatabaseHost: this.database.instanceEndpoint.hostname,
        DatabaseSecretArn: this.databaseSecret.secretArn,
        InitCode: dbInitLambdaCode
      }
    });

    // Output important values
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.database.instanceEndpoint.hostname,
      description: 'RDS PostgreSQL endpoint',
      exportName: 'MveDatabaseEndpoint'
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.databaseSecret.secretArn,
      description: 'ARN of database credentials secret',
      exportName: 'MveDatabaseSecretArn'
    });

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: this.redisCluster.attrRedisEndpointAddress,
      description: 'ElastiCache Redis endpoint',
      exportName: 'MveRedisEndpoint'
    });

    new cdk.CfnOutput(this, 'RedisPort', {
      value: this.redisCluster.attrRedisEndpointPort,
      description: 'ElastiCache Redis port',
      exportName: 'MveRedisPort'
    });
  }
}