// Frontend configuration
interface Config {
  app: {
    name: string;
    version: string;
    environment: 'development' | 'production' | 'staging';
  };
  api: {
    baseURL: string;
    timeout: number;
  };
  auth0: {
    domain?: string;
    clientId?: string;
    audience?: string;
    redirectUri: string;
    scope: string;
  };
  features: {
    useAuth0: boolean;
    enableSocialLogin: boolean;
    enableRegistration: boolean;
    enablePasswordReset: boolean;
  };
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    enableConsole: boolean;
  };
}

const config: Config = {
  app: {
    name: 'MVE',
    version: '1.0.0',
    environment: (import.meta.env.VITE_NODE_ENV as any) || 'development',
  },
  api: {
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api',
    timeout: 10000,
  },
  auth0: {
    domain: import.meta.env.VITE_AUTH0_DOMAIN,
    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
    audience: import.meta.env.VITE_AUTH0_AUDIENCE || 'mve-api',
    redirectUri: import.meta.env.VITE_AUTH0_REDIRECT_URI || `${window.location.origin}/auth/callback`,
    scope: 'openid profile email phone',
  },
  features: {
    useAuth0: !!(import.meta.env.VITE_AUTH0_DOMAIN && import.meta.env.VITE_AUTH0_CLIENT_ID),
    enableSocialLogin: import.meta.env.VITE_ENABLE_SOCIAL_LOGIN === 'true',
    enableRegistration: import.meta.env.VITE_ENABLE_REGISTRATION !== 'false', // Default to true
    enablePasswordReset: import.meta.env.VITE_ENABLE_PASSWORD_RESET !== 'false', // Default to true
  },
  logging: {
    level: (import.meta.env.VITE_LOG_LEVEL as any) || 'info',
    enableConsole: import.meta.env.VITE_ENABLE_CONSOLE_LOGGING !== 'false',
  },
};

export { config };
export type { Config };