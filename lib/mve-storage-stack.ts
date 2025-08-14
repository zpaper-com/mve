import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class MveStorageStack extends cdk.Stack {
  public readonly staticBucket: s3.Bucket;
  public readonly documentsBucket: s3.Bucket;
  public readonly attachmentsBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly certificate: certificatemanager.Certificate;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for static assets (React app)
    this.staticBucket = new s3.Bucket(this, 'StaticBucket', {
      bucketName: 'mve-zpaper-static',
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          noncurrentVersionExpiration: cdk.Duration.days(30),
          enabled: true
        }
      ]
    });

    // S3 Bucket for PDF documents
    this.documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: 'mve-zpaper-documents',
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'ArchiveOldVersions',
          noncurrentVersionTransition: {
            storageClass: s3.StorageClass.GLACIER,
            transitionAfter: cdk.Duration.days(30)
          },
          enabled: true
        }
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ['https://mve.zpaper.com'],
          allowedHeaders: ['*'],
          maxAge: 3600
        }
      ]
    });

    // S3 Bucket for attachments
    this.attachmentsBucket = new s3.Bucket(this, 'AttachmentsBucket', {
      bucketName: 'mve-zpaper-attachments',
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'DeleteOldAttachments',
          expiration: cdk.Duration.days(90),
          enabled: true
        }
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ['https://mve.zpaper.com'],
          allowedHeaders: ['*'],
          maxAge: 3600
        }
      ]
    });

    // SSL Certificate for mve.zpaper.com
    // Note: For MVP, we'll create a certificate but you'll need to validate DNS records
    this.certificate = new certificatemanager.Certificate(this, 'SslCertificate', {
      domainName: 'mve.zpaper.com',
      subjectAlternativeNames: [],
      validation: certificatemanager.CertificateValidation.fromDns(),
      certificateName: 'mve-zpaper-certificate'
    });

    // Origin Access Identity for S3 access
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {
      comment: 'MVE CloudFront Origin Access Identity'
    });

    // Grant CloudFront access to S3 buckets
    this.staticBucket.grantRead(originAccessIdentity);
    this.documentsBucket.grantRead(originAccessIdentity);

    // Response headers policy for security
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      responseHeadersPolicyName: 'mve-security-headers',
      comment: 'Security headers for MVE application',
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(31536000),
          includeSubdomains: true,
          preload: true,
          override: true
        }
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'X-Robots-Tag',
            value: 'noindex, nofollow',
            override: true
          }
        ]
      }
    });

    // Cache policies
    const staticCachePolicy = new cloudfront.CachePolicy(this, 'StaticCachePolicy', {
      cachePolicyName: 'mve-static-cache-policy',
      comment: 'Cache policy for static assets',
      defaultTtl: cdk.Duration.days(1),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.seconds(0),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('CloudFront-Viewer-Country'),
      cookieBehavior: cloudfront.CacheCookieBehavior.none()
    });

    const dynamicCachePolicy = new cloudfront.CachePolicy(this, 'DynamicCachePolicy', {
      cachePolicyName: 'mve-dynamic-cache-policy',
      comment: 'Cache policy for dynamic content',
      defaultTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(1),
      minTtl: cdk.Duration.seconds(0),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        'Authorization',
        'Content-Type',
        'Accept',
        'Origin',
        'Referer'
      ),
      cookieBehavior: cloudfront.CacheCookieBehavior.all()
    });

    // CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: ['mve.zpaper.com'],
      certificate: this.certificate,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: true,
      enabled: true,
      comment: 'MVE CloudFront Distribution',
      
      // Default behavior - React SPA from S3
      defaultBehavior: {
        origin: new origins.S3Origin(this.staticBucket, {
          originAccessIdentity: originAccessIdentity
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: staticCachePolicy,
        responseHeadersPolicy: responseHeadersPolicy,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        compress: true
      },

      additionalBehaviors: {

        // Static document assets from S3
        '/documents/*/assets/*': {
          origin: new origins.S3Origin(this.documentsBucket, {
            originAccessIdentity: originAccessIdentity
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticCachePolicy,
          responseHeadersPolicy: responseHeadersPolicy,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          compress: true
        }
      },

      // Custom error responses for SPA routing
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0)
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0)
        }
      ]
    });

    // Route 53 configuration - commented out for MVP
    // Uncomment and configure when you have access to the hosted zone
    /*
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'zpaper.com'
    });

    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: 'mve',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution))
    });
    */

    // Output important values
    new cdk.CfnOutput(this, 'StaticBucketName', {
      value: this.staticBucket.bucketName,
      description: 'S3 bucket name for static assets',
      exportName: 'MveStaticBucketName'
    });

    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: this.documentsBucket.bucketName,
      description: 'S3 bucket name for documents',
      exportName: 'MveDocumentsBucketName'
    });

    new cdk.CfnOutput(this, 'AttachmentsBucketName', {
      value: this.attachmentsBucket.bucketName,
      description: 'S3 bucket name for attachments',
      exportName: 'MveAttachmentsBucketName'
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: 'MveDistributionId'
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: 'MveDistributionDomainName'
    });

    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: `https://mve.zpaper.com`,
      description: 'Website URL',
      exportName: 'MveWebsiteUrl'
    });
  }
}