import axios, { type AxiosResponse } from 'axios';
import { ApiResponse } from '../types/api';
import { config } from '../config';

// Auth-related interfaces
export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  nickname?: string;
  picture?: string;
  roles: string[];
  permissions: string[];
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
  loginCount?: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  name?: string;
  role?: string;
}

export interface LoginResponse {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
  csrfToken?: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  idToken?: string;
  tokenType: string;
  expiresIn: number;
}

// Auth service class
export class AuthService {
  private baseURL: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private csrfToken: string | null = null;

  constructor() {
    this.baseURL = `${config.api.baseURL}/auth`;
    
    // Initialize from localStorage
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.csrfToken = localStorage.getItem('csrfToken');

    // Setup axios interceptors
    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth headers
    axios.interceptors.request.use(
      (config) => {
        // Add Authorization header
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }

        // Add CSRF token for non-GET requests
        if (this.csrfToken && ['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
          config.headers['X-CSRF-Token'] = this.csrfToken;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle token refresh
    axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // If token expired and we have a refresh token, try to refresh
        if (error.response?.status === 401 && this.refreshToken && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            await this.refreshAccessToken();
            
            // Update the Authorization header and retry
            originalRequest.headers.Authorization = `Bearer ${this.accessToken}`;
            return axios(originalRequest);
          } catch (refreshError) {
            // Refresh failed, clear tokens and redirect to login
            this.clearTokens();
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private setTokens(tokens: {
    accessToken?: string;
    refreshToken?: string;
    csrfToken?: string;
  }) {
    if (tokens.accessToken) {
      this.accessToken = tokens.accessToken;
      localStorage.setItem('accessToken', tokens.accessToken);
    }

    if (tokens.refreshToken) {
      this.refreshToken = tokens.refreshToken;
      localStorage.setItem('refreshToken', tokens.refreshToken);
    }

    if (tokens.csrfToken) {
      this.csrfToken = tokens.csrfToken;
      localStorage.setItem('csrfToken', tokens.csrfToken);
    }
  }

  private clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.csrfToken = null;
    
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('csrfToken');
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      const response: AxiosResponse<ApiResponse<LoginResponse>> = await axios.post(
        `${this.baseURL}/login`,
        credentials
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Login failed');
      }

      const loginData = response.data.data;

      // Store tokens
      this.setTokens({
        accessToken: loginData.accessToken,
        refreshToken: loginData.refreshToken,
        csrfToken: loginData.csrfToken,
      });

      return loginData;
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<void> {
    try {
      const response: AxiosResponse<ApiResponse> = await axios.post(
        `${this.baseURL}/register`,
        data
      );

      if (!response.data.success) {
        throw new Error(response.data.message || 'Registration failed');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      await axios.post(`${this.baseURL}/logout`);
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      this.clearTokens();
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<RefreshTokenResponse> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response: AxiosResponse<ApiResponse<RefreshTokenResponse>> = await axios.post(
        `${this.baseURL}/refresh`,
        { refreshToken: this.refreshToken }
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Token refresh failed');
      }

      const tokenData = response.data.data;

      // Update access token
      this.setTokens({
        accessToken: tokenData.accessToken,
      });

      return tokenData;
    } catch (error: any) {
      console.error('Token refresh error:', error);
      this.clearTokens();
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getProfile(): Promise<AuthUser | null> {
    if (!this.accessToken) {
      return null;
    }

    try {
      const response: AxiosResponse<ApiResponse<AuthUser>> = await axios.get(
        `${this.baseURL}/profile`
      );

      if (!response.data.success || !response.data.data) {
        return null;
      }

      return response.data.data;
    } catch (error: any) {
      console.error('Profile fetch error:', error);
      
      if (error.response?.status === 401) {
        this.clearTokens();
      }
      
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(data: Partial<AuthUser>): Promise<void> {
    try {
      const response: AxiosResponse<ApiResponse> = await axios.put(
        `${this.baseURL}/profile`,
        data
      );

      if (!response.data.success) {
        throw new Error(response.data.message || 'Profile update failed');
      }
    } catch (error: any) {
      console.error('Profile update error:', error);
      throw error;
    }
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      const response: AxiosResponse<ApiResponse> = await axios.post(
        `${this.baseURL}/password/change`,
        {
          currentPassword,
          newPassword,
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.message || 'Password change failed');
      }
    } catch (error: any) {
      console.error('Password change error:', error);
      throw error;
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<void> {
    try {
      const response: AxiosResponse<ApiResponse> = await axios.post(
        `${this.baseURL}/password/reset`,
        { email }
      );

      if (!response.data.success) {
        throw new Error(response.data.message || 'Password reset failed');
      }
    } catch (error: any) {
      console.error('Password reset error:', error);
      throw error;
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(): Promise<void> {
    try {
      const response: AxiosResponse<ApiResponse> = await axios.post(
        `${this.baseURL}/verify-email`
      );

      if (!response.data.success) {
        throw new Error(response.data.message || 'Email verification failed');
      }
    } catch (error: any) {
      console.error('Email verification error:', error);
      throw error;
    }
  }

  /**
   * Get CSRF token
   */
  async getCsrfToken(): Promise<string> {
    try {
      const response: AxiosResponse<ApiResponse<{ csrfToken: string }>> = await axios.get(
        `${this.baseURL}/csrf-token`
      );

      if (!response.data.success || !response.data.data) {
        throw new Error('Failed to get CSRF token');
      }

      const csrfToken = response.data.data.csrfToken;
      this.setTokens({ csrfToken });
      
      return csrfToken;
    } catch (error: any) {
      console.error('CSRF token error:', error);
      throw error;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get CSRF token
   */
  getCsrfTokenSync(): string | null {
    return this.csrfToken;
  }

  // Development-only methods
  async developmentLogin(userId: string, role: string = 'patient'): Promise<LoginResponse> {
    if (config.app.environment === 'production') {
      throw new Error('Development login not available in production');
    }

    try {
      const response: AxiosResponse<ApiResponse<LoginResponse>> = await axios.post(
        `${this.baseURL}/dev/login`,
        { userId, role }
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Development login failed');
      }

      const loginData = response.data.data;

      // Store tokens
      this.setTokens({
        accessToken: loginData.accessToken,
        csrfToken: loginData.csrfToken,
      });

      return loginData;
    } catch (error: any) {
      console.error('Development login error:', error);
      throw error;
    }
  }

  async getDevUsers(): Promise<Array<{ id: string; role: string; email: string }>> {
    if (config.app.environment === 'production') {
      throw new Error('Development users not available in production');
    }

    try {
      const response: AxiosResponse<ApiResponse<{ users: Array<{ id: string; role: string; email: string }> }>> = 
        await axios.get(`${this.baseURL}/dev/users`);

      if (!response.data.success || !response.data.data) {
        throw new Error('Failed to get development users');
      }

      return response.data.data.users;
    } catch (error: any) {
      console.error('Get dev users error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();

// Helper function to get Auth0 login URL
export function getAuth0LoginUrl(provider?: string, returnTo?: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.auth0.clientId!,
    redirect_uri: config.auth0.redirectUri!,
    scope: config.auth0.scope,
    state: JSON.stringify({ returnTo: returnTo || window.location.pathname }),
  });

  if (provider) {
    params.append('connection', provider);
  }

  return `https://${config.auth0.domain}/authorize?${params.toString()}`;
}

// Helper function to get Auth0 logout URL
export function getAuth0LogoutUrl(returnTo?: string): string {
  const params = new URLSearchParams({
    client_id: config.auth0.clientId!,
    returnTo: returnTo || window.location.origin,
  });

  return `https://${config.auth0.domain}/v2/logout?${params.toString()}`;
}