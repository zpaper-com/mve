# Auth0 Setup Guide for MVE

This guide walks through the complete Auth0 setup process for the MVE (PDF Form Viewer and Workflow Management) application.

## Prerequisites

- Auth0 account (sign up at https://auth0.com)
- Access to your Auth0 Dashboard
- Domain: `mve.zpaper.com` (or your chosen domain)

## 1. Create Auth0 Application

### Step 1: Create New Application
1. Go to Auth0 Dashboard → Applications
2. Click "Create Application"
3. Name: `MVE Production` (or `MVE Development`)
4. Application Type: **Single Page Application (SPA)**
5. Click "Create"

### Step 2: Configure Application Settings
In your application settings, configure:

#### Basic Information
- **Name**: MVE Production
- **Description**: PDF Form Viewer and Workflow Management System
- **Application Logo**: Upload your application logo
- **Application Type**: Single Page Application

#### Application URIs
```
Allowed Callback URLs:
https://mve.zpaper.com/auth/callback
http://localhost:3000/auth/callback (development only)

Allowed Logout URLs:
https://mve.zpaper.com/
https://mve.zpaper.com/login
http://localhost:3000/ (development only)

Allowed Web Origins:
https://mve.zpaper.com
http://localhost:3000 (development only)

Allowed Origins (CORS):
https://mve.zpaper.com
http://localhost:3000 (development only)
```

#### Advanced Settings

**OAuth**
- JsonWebToken Signature Algorithm: `RS256`
- OIDC Conformant: `Enabled`

**Grant Types**
- [x] Authorization Code
- [x] Refresh Token
- [x] Client Credentials (for Management API)

**Refresh Token Behavior**
- Refresh Token Rotation: `Rotating`
- Refresh Token Expiration: `Expiring`
- Absolute Lifetime: 2592000 seconds (30 days)
- Inactivity Lifetime: 604800 seconds (7 days)

## 2. Create Auth0 API

### Step 1: Create API
1. Go to Auth0 Dashboard → APIs
2. Click "Create API"
3. Name: `MVE API`
4. Identifier: `mve-api`
5. Signing Algorithm: `RS256`

### Step 2: Configure API Settings
- **Name**: MVE API
- **Identifier**: `mve-api` (this becomes your audience)
- **Token Expiration**: 86400 seconds (24 hours)
- **Token Expiration For Browser Flows**: 7200 seconds (2 hours)

### Step 3: Define Scopes
Add the following scopes to your API:

```
read:documents - Read document content
write:documents - Edit document content
create:workflows - Create new workflows
manage:workflows - Manage all workflows
read:users - View user profiles
manage:users - Create, update, and delete users
assign:roles - Assign roles to users
admin:system - Full system administration
admin:analytics - View system analytics
admin:audit - Access audit logs
```

## 3. Set Up Roles and Permissions

### Step 1: Create Roles
1. Go to Auth0 Dashboard → User Management → Roles
2. Create the following roles:

#### Admin Role
- **Name**: Admin
- **Description**: System administrators with full access
- **Permissions**: All scopes from MVE API

#### Provider Role
- **Name**: Provider
- **Description**: Healthcare providers
- **Permissions**:
  - `read:documents`
  - `write:documents`
  - `create:workflows`
  - `read:users`

#### Patient Role
- **Name**: Patient
- **Description**: General users/patients
- **Permissions**:
  - `read:documents`
  - `write:documents`

### Step 2: Configure Role Assignment
Go to Auth0 Dashboard → Actions → Flows → Login Flow

Create a custom action to assign roles:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://mve.zpaper.com/';
  
  // Default role assignment logic
  let roles = ['patient']; // Default role
  
  // Admin users (configure based on your criteria)
  const adminEmails = ['admin@zpaper.com', 'super@zpaper.com'];
  if (adminEmails.includes(event.user.email)) {
    roles = ['admin'];
  }
  
  // Provider users (configure based on email domain or metadata)
  if (event.user.email && event.user.email.includes('@healthcare.')) {
    roles = ['provider'];
  }
  
  // Custom role assignment based on user metadata
  if (event.user.app_metadata && event.user.app_metadata.roles) {
    roles = event.user.app_metadata.roles;
  }
  
  // Set roles in token
  api.idToken.setCustomClaim(`${namespace}roles`, roles);
  api.accessToken.setCustomClaim(`${namespace}roles`, roles);
  
  // Set permissions based on roles
  const permissions = [];
  roles.forEach(role => {
    switch(role) {
      case 'admin':
        permissions.push(
          'read:documents', 'write:documents', 'create:workflows', 'manage:workflows',
          'read:users', 'manage:users', 'assign:roles', 'admin:system', 'admin:analytics', 'admin:audit'
        );
        break;
      case 'provider':
        permissions.push('read:documents', 'write:documents', 'create:workflows', 'read:users');
        break;
      case 'patient':
        permissions.push('read:documents', 'write:documents');
        break;
    }
  });
  
  api.idToken.setCustomClaim(`${namespace}permissions`, [...new Set(permissions)]);
  api.accessToken.setCustomClaim(`${namespace}permissions`, [...new Set(permissions)]);
};
```

## 4. Configure Social Connections

### Step 1: Enable Social Providers
1. Go to Auth0 Dashboard → Authentication → Social
2. Enable and configure:

#### Google
- Client ID: From Google Cloud Console
- Client Secret: From Google Cloud Console
- Attributes: email, email_verified, name, picture

#### Facebook
- App ID: From Facebook Developers
- App Secret: From Facebook Developers
- Attributes: email, name, picture

#### GitHub
- Client ID: From GitHub OAuth App
- Client Secret: From GitHub OAuth App
- Attributes: email, name, picture

#### Apple (Optional)
- Services ID: From Apple Developer
- Client Secret: JWT from Apple Developer
- Attributes: email, name

### Step 2: Connection Settings
For each social connection:
- **Sync user profile attributes at each login**: Enabled
- **Trust email verification from provider**: Enabled (for trusted providers)

## 5. Configure Database Connection

### Step 1: Username-Password-Authentication
1. Go to Auth0 Dashboard → Authentication → Database
2. Configure the default connection:

#### Settings
- **Name**: Username-Password-Authentication
- **Requires Username**: Disabled (use email only)
- **Import Users to Auth0**: Enabled
- **Disable Sign Ups**: Disabled (allow registrations)

#### Password Policy
- **Password Policy**: Good
- **Password Length**: 8-128 characters
- **Password Complexity**: 
  - [x] At least one lower case letter
  - [x] At least one upper case letter  
  - [x] At least one number
  - [x] At least one special character

#### Security
- **Brute Force Protection**: Enabled
- **Breached Password Detection**: Enabled

## 6. Set Up Custom Domain (Production)

### Step 1: Configure Custom Domain
1. Go to Auth0 Dashboard → Branding → Custom Domains
2. Domain: `auth.zpaper.com`
3. Type: Self Managed
4. Follow DNS verification steps

### Step 2: Update Configuration
Once custom domain is verified, update all URLs to use:
- `https://auth.zpaper.com` instead of `https://your-tenant.us.auth0.com`

## 7. Environment Variables

### Backend Environment Variables (.env)
```bash
# Auth0 Configuration
AUTH0_DOMAIN=your-tenant.us.auth0.com
# Or with custom domain: AUTH0_DOMAIN=auth.zpaper.com
AUTH0_CLIENT_ID=your_spa_client_id
AUTH0_CLIENT_SECRET=your_management_api_secret
AUTH0_AUDIENCE=mve-api
AUTH0_WEBHOOK_SECRET=your_webhook_secret

# Management API (for server-side operations)
AUTH0_MANAGEMENT_CLIENT_ID=your_management_client_id
AUTH0_MANAGEMENT_CLIENT_SECRET=your_management_secret
```

### Frontend Environment Variables (.env)
```bash
# Auth0 Configuration
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your_spa_client_id
VITE_AUTH0_AUDIENCE=mve-api
VITE_AUTH0_REDIRECT_URI=https://mve.zpaper.com/auth/callback

# Feature flags
VITE_ENABLE_SOCIAL_LOGIN=true
VITE_ENABLE_REGISTRATION=true
VITE_ENABLE_PASSWORD_RESET=true
```

## 8. Set Up Management API Access

### Step 1: Create Machine-to-Machine Application
1. Go to Auth0 Dashboard → Applications
2. Click "Create Application"
3. Name: `MVE Backend`
4. Application Type: **Machine to Machine Applications**
5. Select API: **Auth0 Management API**

### Step 2: Configure Scopes
Grant the following scopes for the Management API:
- `read:users`
- `update:users`
- `create:users`
- `delete:users`
- `read:users_app_metadata`
- `update:users_app_metadata`
- `create:users_app_metadata`
- `delete:users_app_metadata`
- `read:user_custom_blocks`
- `create:user_tickets`

## 9. Configure Webhooks (Optional)

### Step 1: Create Webhook
1. Go to Auth0 Dashboard → Monitoring → Logs → Log Streams
2. Create webhook for user events
3. URL: `https://mve.zpaper.com/api/auth/webhook`
4. Events: Login Success, Login Failure, User Registration

### Step 2: Secure Webhook
Use the webhook secret to verify incoming requests:
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expectedSignature}`)
  );
}
```

## 10. Testing Configuration

### Development Testing
1. Use the development endpoints in your Auth0 configuration
2. Test with the provided development login components
3. Verify token generation and validation

### Production Testing
1. Deploy to staging environment first
2. Test all authentication flows
3. Verify social login integrations
4. Test role-based access controls

## 11. Security Best Practices

### Token Security
- Use HTTPS everywhere in production
- Store tokens securely (httpOnly cookies for session, localStorage for SPA)
- Implement proper token refresh flows
- Use short-lived access tokens (15 minutes)

### Session Management
- Implement session timeout (30 minutes inactivity)
- Limit concurrent sessions (5 per user)
- Log security events for monitoring

### Rate Limiting
- Implement rate limiting on auth endpoints
- Monitor for brute force attacks
- Set up alerts for suspicious activity

## 12. Monitoring and Logging

### Auth0 Logs
- Monitor login success/failure rates
- Set up alerts for unusual patterns
- Track user registration trends

### Application Logs
- Log authentication events
- Monitor token refresh patterns
- Track authorization failures

## Support and Troubleshooting

### Common Issues
1. **CORS Errors**: Verify allowed origins in Auth0 settings
2. **Token Validation Failures**: Check audience and issuer settings
3. **Social Login Issues**: Verify callback URLs and client credentials
4. **Role Assignment Problems**: Check custom actions and token claims

### Debug Mode
Enable debug logging in development:
```bash
DEBUG=auth0:* npm start
```

This setup provides a production-ready Auth0 configuration for the MVE application with proper security, role management, and monitoring capabilities.