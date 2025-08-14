import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { config } from '../config';
import { authService, AuthUser, LoginCredentials, RegisterData } from '../services/authService';
import { logger } from '../utils/logger';

// Auth state interface
export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  csrfToken: string | null;
  accessToken: string | null;
}

// Auth actions
type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: AuthUser | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CSRF_TOKEN'; payload: string | null }
  | { type: 'SET_ACCESS_TOKEN'; payload: string | null }
  | { type: 'LOGOUT' };

// Auth context interface
export interface AuthContextType extends AuthState {
  // State properties are extended from AuthState
  
  // Auth0 methods (for production)
  loginWithRedirect?: (options?: any) => Promise<void>;
  loginWithPopup?: (options?: any) => Promise<void>;
  logout?: (options?: any) => void;
  getAccessTokenSilently?: () => Promise<string>;
  
  // Custom auth methods (for development and API)
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  refreshToken: () => Promise<void>;
  updateProfile: (data: Partial<AuthUser>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  verifyEmail: () => Promise<void>;
  handleLogout: () => Promise<void>;
  
  // Utility methods
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
  isAdmin: () => boolean;
  getCsrfToken: () => Promise<string>;
}

// Initial state
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  csrfToken: null,
  accessToken: null,
};

// Auth reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        isLoading: false,
        error: null,
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_CSRF_TOKEN':
      return { ...state, csrfToken: action.payload };
    case 'SET_ACCESS_TOKEN':
      return { ...state, accessToken: action.payload };
    case 'LOGOUT':
      return {
        ...initialState,
        isLoading: false,
      };
    default:
      return state;
  }
}

// Auth context
const AuthContext = createContext<AuthContextType | null>(null);

// Auth provider props
interface AuthProviderProps {
  children: ReactNode;
}

// Custom Auth Provider (for development/API mode)
export function CustomAuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize auth state from localStorage/cookies
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });

        // Check for existing session
        const profile = await authService.getProfile();
        if (profile) {
          dispatch({ type: 'SET_USER', payload: profile });
          
          // Get CSRF token
          const csrfToken = await authService.getCsrfToken();
          dispatch({ type: 'SET_CSRF_TOKEN', payload: csrfToken });
        } else {
          dispatch({ type: 'SET_USER', payload: null });
        }
      } catch (error) {
        logger.warn('Auth initialization failed:', error);
        dispatch({ type: 'SET_USER', payload: null });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    initializeAuth();
  }, []);

  // Login with email/password
  const login = async (credentials: LoginCredentials) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      const result = await authService.login(credentials);
      
      dispatch({ type: 'SET_USER', payload: result.user });
      dispatch({ type: 'SET_ACCESS_TOKEN', payload: result.accessToken });
      dispatch({ type: 'SET_CSRF_TOKEN', payload: result.csrfToken });

      logger.info('Login successful');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Login failed';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Register new user
  const register = async (data: RegisterData) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      await authService.register(data);
      
      logger.info('Registration successful');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Registration failed';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Refresh access token
  const refreshToken = async () => {
    try {
      const result = await authService.refreshToken();
      dispatch({ type: 'SET_ACCESS_TOKEN', payload: result.accessToken });
    } catch (error) {
      logger.error('Token refresh failed:', error);
      dispatch({ type: 'LOGOUT' });
      throw error;
    }
  };

  // Update user profile
  const updateProfile = async (data: Partial<AuthUser>) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      await authService.updateProfile(data);
      
      // Refresh user profile
      const updatedProfile = await authService.getProfile();
      dispatch({ type: 'SET_USER', payload: updatedProfile });
      
      logger.info('Profile updated successfully');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Profile update failed';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Change password
  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await authService.changePassword(currentPassword, newPassword);
      logger.info('Password changed successfully');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Password change failed';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  // Reset password
  const resetPassword = async (email: string) => {
    try {
      await authService.resetPassword(email);
      logger.info('Password reset email sent');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Password reset failed';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  // Verify email
  const verifyEmail = async () => {
    try {
      await authService.verifyEmail();
      logger.info('Verification email sent');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Email verification failed';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await authService.logout();
      dispatch({ type: 'LOGOUT' });
      logger.info('Logout successful');
    } catch (error) {
      logger.warn('Logout failed:', error);
      // Still clear local state even if server logout fails
      dispatch({ type: 'LOGOUT' });
    }
  };

  // Utility methods
  const hasRole = (role: string): boolean => {
    return state.user?.roles?.includes(role) || false;
  };

  const hasPermission = (permission: string): boolean => {
    return state.user?.permissions?.includes(permission) || false;
  };

  const isAdmin = (): boolean => {
    return hasRole('admin');
  };

  const getCsrfToken = async (): Promise<string> => {
    if (state.csrfToken) {
      return state.csrfToken;
    }

    const token = await authService.getCsrfToken();
    dispatch({ type: 'SET_CSRF_TOKEN', payload: token });
    return token;
  };

  // Context value
  const value: AuthContextType = {
    ...state,
    login,
    register,
    refreshToken,
    updateProfile,
    changePassword,
    resetPassword,
    verifyEmail,
    handleLogout,
    hasRole,
    hasPermission,
    isAdmin,
    getCsrfToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Auth0 Provider Wrapper (for production)
export function Auth0AuthProvider({ children }: AuthProviderProps) {
  const auth0Config = {
    domain: config.auth0.domain!,
    clientId: config.auth0.clientId!,
    authorizationParams: {
      redirect_uri: config.auth0.redirectUri,
      audience: config.auth0.audience,
      scope: config.auth0.scope,
    },
    cacheLocation: 'localstorage' as const,
    useRefreshTokens: true,
  };

  return (
    <Auth0Provider {...auth0Config}>
      <Auth0ContextBridge>{children}</Auth0ContextBridge>
    </Auth0Provider>
  );
}

// Bridge Auth0 state to our custom context
function Auth0ContextBridge({ children }: AuthProviderProps) {
  const {
    user: auth0User,
    isAuthenticated: auth0IsAuthenticated,
    isLoading: auth0IsLoading,
    error: auth0Error,
    loginWithRedirect,
    loginWithPopup,
    logout: auth0Logout,
    getAccessTokenSilently,
  } = useAuth0();

  const [state, dispatch] = useReducer(authReducer, initialState);

  // Sync Auth0 state with our context
  useEffect(() => {
    dispatch({ type: 'SET_LOADING', payload: auth0IsLoading });

    if (auth0Error) {
      dispatch({ type: 'SET_ERROR', payload: auth0Error.message });
    }

    if (auth0IsAuthenticated && auth0User) {
      // Convert Auth0 user to our user format
      const user: AuthUser = {
        id: auth0User.sub!,
        email: auth0User.email!,
        emailVerified: auth0User.email_verified || false,
        name: auth0User.name,
        picture: auth0User.picture,
        roles: auth0User['https://mve.zpaper.com/roles'] || ['patient'],
        permissions: auth0User['https://mve.zpaper.com/permissions'] || [],
        createdAt: auth0User.created_at,
        updatedAt: auth0User.updated_at,
        lastLogin: auth0User.last_login,
      };

      dispatch({ type: 'SET_USER', payload: user });
    } else if (!auth0IsLoading) {
      dispatch({ type: 'SET_USER', payload: null });
    }
  }, [auth0User, auth0IsAuthenticated, auth0IsLoading, auth0Error]);

  // Get access token and set it in state
  useEffect(() => {
    const getToken = async () => {
      if (auth0IsAuthenticated && getAccessTokenSilently) {
        try {
          const token = await getAccessTokenSilently();
          dispatch({ type: 'SET_ACCESS_TOKEN', payload: token });
        } catch (error) {
          logger.warn('Failed to get access token:', error);
        }
      }
    };

    getToken();
  }, [auth0IsAuthenticated, getAccessTokenSilently]);

  // Stub implementations for methods not used with Auth0
  const stubAsync = async () => {
    throw new Error('Not implemented with Auth0 - use Auth0 methods instead');
  };

  const stubSync = () => {
    throw new Error('Not implemented with Auth0 - use Auth0 methods instead');
  };

  // Utility methods
  const hasRole = (role: string): boolean => {
    return state.user?.roles?.includes(role) || false;
  };

  const hasPermission = (permission: string): boolean => {
    return state.user?.permissions?.includes(permission) || false;
  };

  const isAdmin = (): boolean => {
    return hasRole('admin');
  };

  const getCsrfToken = async (): Promise<string> => {
    if (state.csrfToken) {
      return state.csrfToken;
    }

    const token = await authService.getCsrfToken();
    dispatch({ type: 'SET_CSRF_TOKEN', payload: token });
    return token;
  };

  const handleAuth0Logout = () => {
    if (auth0Logout) {
      auth0Logout({
        logoutParams: {
          returnTo: window.location.origin,
        },
      });
    }
  };

  // Context value with Auth0 methods
  const value: AuthContextType = {
    ...state,
    // Auth0 methods
    loginWithRedirect,
    loginWithPopup,
    logout: auth0Logout,
    getAccessTokenSilently,
    // Stub methods (not used with Auth0)
    login: stubAsync,
    register: stubAsync,
    refreshToken: stubAsync,
    updateProfile: stubAsync,
    changePassword: stubAsync,
    resetPassword: stubAsync,
    verifyEmail: stubAsync,
    handleLogout: handleAuth0Logout,
    // Utility methods
    hasRole,
    hasPermission,
    isAdmin,
    getCsrfToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Main Auth Provider - chooses between Auth0 and Custom based on config
export function AuthProvider({ children }: AuthProviderProps) {
  if (config.auth0.domain && config.app.environment === 'production') {
    return <Auth0AuthProvider>{children}</Auth0AuthProvider>;
  } else {
    return <CustomAuthProvider>{children}</CustomAuthProvider>;
  }
}

// Hook to use auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Higher-order component for authenticated routes
export function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AuthenticatedComponent(props: P) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
      return <div>Loading...</div>;
    }

    if (!isAuthenticated) {
      return <div>Please log in to access this page.</div>;
    }

    return <Component {...props} />;
  };
}

// Role-based access component
interface RequireRoleProps {
  roles: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequireRole({ roles, children, fallback }: RequireRoleProps) {
  const { user, hasRole } = useAuth();

  if (!user) {
    return fallback || <div>Authentication required</div>;
  }

  const hasRequiredRole = roles.some(role => hasRole(role));

  if (!hasRequiredRole) {
    return fallback || <div>Access denied</div>;
  }

  return <>{children}</>;
}

// Permission-based access component
interface RequirePermissionProps {
  permissions: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequirePermission({ permissions, children, fallback }: RequirePermissionProps) {
  const { user, hasPermission } = useAuth();

  if (!user) {
    return fallback || <div>Authentication required</div>;
  }

  const hasRequiredPermission = permissions.some(permission => hasPermission(permission));

  if (!hasRequiredPermission) {
    return fallback || <div>Access denied</div>;
  }

  return <>{children}</>;
}