import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Link,
  Divider,
  FormControlLabel,
  Checkbox,
  Paper,
  IconButton,
  InputAdornment,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Google,
  Facebook,
  GitHub,
  Apple,
} from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import { useAuth } from '../../contexts/AuthContext';
import { config } from '../../config';
import { getAuth0LoginUrl } from '../../services/authService';
import { logger } from '../../utils/logger';

interface LoginFormProps {
  onSwitchToRegister?: () => void;
  onForgotPassword?: () => void;
  redirectTo?: string;
}

export function LoginForm({ 
  onSwitchToRegister, 
  onForgotPassword,
  redirectTo = '/',
}: LoginFormProps) {
  const { login, loginWithRedirect, isLoading, error } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Handle form field changes
  const handleChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      await login({
        email: formData.email,
        password: formData.password,
        rememberMe: formData.rememberMe,
      });

      logger.info('Login successful, redirecting to:', redirectTo);
      window.location.href = redirectTo;
    } catch (error: any) {
      logger.error('Login failed:', error);
      // Error is handled by the auth context
    }
  };

  // Handle social login
  const handleSocialLogin = (provider: string) => {
    if (config.features.useAuth0 && loginWithRedirect) {
      // Auth0 social login
      loginWithRedirect({
        authorizationParams: {
          connection: provider,
          redirect_uri: config.auth0.redirectUri,
        },
      });
    } else {
      // Redirect to backend social login endpoint
      window.location.href = getAuth0LoginUrl(provider, redirectTo);
    }
  };

  // Development login options
  const handleDevLogin = async (userId: string, role: string) => {
    if (config.app.environment !== 'development') return;

    try {
      const { authService } = await import('../../services/authService');
      await authService.developmentLogin(userId, role);
      window.location.href = redirectTo;
    } catch (error) {
      logger.error('Development login failed:', error);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 400, mx: 'auto' }}>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Sign In
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          margin="normal"
          required
          fullWidth
          id="email"
          label="Email Address"
          name="email"
          autoComplete="email"
          autoFocus
          value={formData.email}
          onChange={handleChange('email')}
          error={!!validationErrors.email}
          helperText={validationErrors.email}
        />

        <TextField
          margin="normal"
          required
          fullWidth
          name="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          id="password"
          autoComplete="current-password"
          value={formData.password}
          onChange={handleChange('password')}
          error={!!validationErrors.password}
          helperText={validationErrors.password}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label="toggle password visibility"
                  onClick={() => setShowPassword(!showPassword)}
                  edge="end"
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <FormControlLabel
          control={
            <Checkbox
              value="remember"
              color="primary"
              checked={formData.rememberMe}
              onChange={handleChange('rememberMe')}
            />
          }
          label="Remember me"
        />

        <LoadingButton
          type="submit"
          fullWidth
          variant="contained"
          loading={isLoading}
          sx={{ mt: 3, mb: 2 }}
        >
          Sign In
        </LoadingButton>

        <Box sx={{ textAlign: 'center', mb: 2 }}>
          {config.features.enablePasswordReset && onForgotPassword && (
            <Link
              component="button"
              variant="body2"
              onClick={(e) => {
                e.preventDefault();
                onForgotPassword();
              }}
              sx={{ mr: 2 }}
            >
              Forgot password?
            </Link>
          )}
          
          {config.features.enableRegistration && onSwitchToRegister && (
            <Link
              component="button"
              variant="body2"
              onClick={(e) => {
                e.preventDefault();
                onSwitchToRegister();
              }}
            >
              Don't have an account? Sign Up
            </Link>
          )}
        </Box>

        {/* Social Login */}
        {config.features.enableSocialLogin && (
          <>
            <Divider sx={{ my: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Or continue with
              </Typography>
            </Divider>

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
              <IconButton
                onClick={() => handleSocialLogin('google-oauth2')}
                color="primary"
                aria-label="Sign in with Google"
              >
                <Google />
              </IconButton>
              <IconButton
                onClick={() => handleSocialLogin('facebook')}
                color="primary"
                aria-label="Sign in with Facebook"
              >
                <Facebook />
              </IconButton>
              <IconButton
                onClick={() => handleSocialLogin('github')}
                color="primary"
                aria-label="Sign in with GitHub"
              >
                <GitHub />
              </IconButton>
              <IconButton
                onClick={() => handleSocialLogin('apple')}
                color="primary"
                aria-label="Sign in with Apple"
              >
                <Apple />
              </IconButton>
            </Box>
          </>
        )}

        {/* Development Login Options */}
        {config.app.environment === 'development' && (
          <>
            <Divider sx={{ my: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Development Login
              </Typography>
            </Divider>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleDevLogin('admin', 'admin')}
              >
                Login as Admin
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleDevLogin('provider', 'provider')}
              >
                Login as Provider
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleDevLogin('patient', 'patient')}
              >
                Login as Patient
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Paper>
  );
}