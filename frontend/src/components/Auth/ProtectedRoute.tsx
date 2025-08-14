import React, { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: string[];
  requiredPermissions?: string[];
  fallbackPath?: string;
  showLoading?: boolean;
}

export function ProtectedRoute({ 
  children, 
  requiredRoles = [],
  requiredPermissions = [],
  fallbackPath = '/login',
  showLoading = true,
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading, hasRole, hasPermission } = useAuth();
  const location = useLocation();

  // Show loading spinner while authentication is being determined
  if (isLoading && showLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '50vh',
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography variant="body1" color="text.secondary">
          Authenticating...
        </Typography>
      </Box>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <Navigate 
        to={fallbackPath} 
        state={{ 
          from: location.pathname + location.search,
          message: 'Please sign in to access this page'
        }} 
        replace 
      />
    );
  }

  // Check role requirements
  if (requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.some(role => hasRole(role));
    
    if (!hasRequiredRole) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '50vh',
            gap: 2,
            textAlign: 'center',
            p: 3,
          }}
        >
          <Typography variant="h5" color="error">
            Access Denied
          </Typography>
          <Typography variant="body1" color="text.secondary">
            You don't have the required permissions to access this page.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Required roles: {requiredRoles.join(', ')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your roles: {user.roles.join(', ') || 'None'}
          </Typography>
        </Box>
      );
    }
  }

  // Check permission requirements
  if (requiredPermissions.length > 0) {
    const hasRequiredPermission = requiredPermissions.some(permission => hasPermission(permission));
    
    if (!hasRequiredPermission) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '50vh',
            gap: 2,
            textAlign: 'center',
            p: 3,
          }}
        >
          <Typography variant="h5" color="error">
            Access Denied
          </Typography>
          <Typography variant="body1" color="text.secondary">
            You don't have the required permissions to access this page.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Required permissions: {requiredPermissions.join(', ')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your permissions: {user.permissions?.join(', ') || 'None'}
          </Typography>
        </Box>
      );
    }
  }

  // All checks passed, render the protected content
  return <>{children}</>;
}

// Specialized components for common use cases
export function AdminRoute({ children, fallbackPath = '/login' }: { children: ReactNode; fallbackPath?: string }) {
  return (
    <ProtectedRoute 
      requiredRoles={['admin']} 
      fallbackPath={fallbackPath}
    >
      {children}
    </ProtectedRoute>
  );
}

export function ProviderRoute({ children, fallbackPath = '/login' }: { children: ReactNode; fallbackPath?: string }) {
  return (
    <ProtectedRoute 
      requiredRoles={['admin', 'provider']} 
      fallbackPath={fallbackPath}
    >
      {children}
    </ProtectedRoute>
  );
}

export function AuthenticatedRoute({ children, fallbackPath = '/login' }: { children: ReactNode; fallbackPath?: string }) {
  return (
    <ProtectedRoute fallbackPath={fallbackPath}>
      {children}
    </ProtectedRoute>
  );
}