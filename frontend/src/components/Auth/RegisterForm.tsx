import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Link,
  Paper,
  IconButton,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  CheckCircle,
} from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import { useAuth } from '../../contexts/AuthContext';
import { config } from '../../config';
import { logger } from '../../utils/logger';

interface RegisterFormProps {
  onSwitchToLogin?: () => void;
  onSuccess?: () => void;
}

interface PasswordStrength {
  score: number;
  feedback: string[];
}

export function RegisterForm({ onSwitchToLogin, onSuccess }: RegisterFormProps) {
  const { register, isLoading, error } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    role: 'patient',
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  // Handle form field changes
  const handleChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement | { value: unknown }>) => {
    const value = event.target.value as string;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Password strength checker
  const checkPasswordStrength = (password: string): PasswordStrength => {
    const feedback: string[] = [];
    let score = 0;

    if (password.length >= 8) score += 1;
    else feedback.push('At least 8 characters');

    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('One lowercase letter');

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('One uppercase letter');

    if (/\d/.test(password)) score += 1;
    else feedback.push('One number');

    if (/[@$!%*?&]/.test(password)) score += 1;
    else feedback.push('One special character (@$!%*?&)');

    return { score, feedback };
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Email validation
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Password validation
    if (!formData.password) {
      errors.password = 'Password is required';
    } else {
      const strength = checkPasswordStrength(formData.password);
      if (strength.score < 5) {
        errors.password = `Password must contain: ${strength.feedback.join(', ')}`;
      }
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    // Name validation
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
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
      await register({
        email: formData.email,
        password: formData.password,
        name: formData.name,
        role: formData.role,
      });

      logger.info('Registration successful');
      setRegistrationSuccess(true);

      if (onSuccess) {
        setTimeout(onSuccess, 2000);
      }
    } catch (error: any) {
      logger.error('Registration failed:', error);
      // Error is handled by the auth context
    }
  };

  // Show success message after registration
  if (registrationSuccess) {
    return (
      <Paper elevation={3} sx={{ p: 4, maxWidth: 400, mx: 'auto', textAlign: 'center' }}>
        <CheckCircle color="success" sx={{ fontSize: 64, mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          Registration Successful!
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Please check your email to verify your account before signing in.
        </Typography>
        {onSwitchToLogin && (
          <Button
            variant="contained"
            onClick={onSwitchToLogin}
            sx={{ mt: 2 }}
          >
            Back to Sign In
          </Button>
        )}
      </Paper>
    );
  }

  const passwordStrength = formData.password ? checkPasswordStrength(formData.password) : null;

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 400, mx: 'auto' }}>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Sign Up
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
          id="name"
          label="Full Name"
          name="name"
          autoComplete="name"
          autoFocus
          value={formData.name}
          onChange={handleChange('name')}
          error={!!validationErrors.name}
          helperText={validationErrors.name}
        />

        <TextField
          margin="normal"
          required
          fullWidth
          id="email"
          label="Email Address"
          name="email"
          autoComplete="email"
          value={formData.email}
          onChange={handleChange('email')}
          error={!!validationErrors.email}
          helperText={validationErrors.email}
        />

        <FormControl fullWidth margin="normal">
          <InputLabel id="role-label">Role</InputLabel>
          <Select
            labelId="role-label"
            id="role"
            value={formData.role}
            label="Role"
            onChange={handleChange('role')}
          >
            <MenuItem value="patient">Patient</MenuItem>
            <MenuItem value="provider">Healthcare Provider</MenuItem>
          </Select>
          <FormHelperText>
            {formData.role === 'provider' ? 'Healthcare professionals' : 'General users'}
          </FormHelperText>
        </FormControl>

        <TextField
          margin="normal"
          required
          fullWidth
          name="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          id="password"
          autoComplete="new-password"
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

        {/* Password Strength Indicator */}
        {formData.password && passwordStrength && (
          <Box sx={{ mt: 1, mb: 1 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {[1, 2, 3, 4, 5].map((level) => (
                <Box
                  key={level}
                  sx={{
                    height: 4,
                    flex: 1,
                    bgcolor: passwordStrength.score >= level 
                      ? passwordStrength.score < 3 
                        ? 'error.main' 
                        : passwordStrength.score < 4 
                          ? 'warning.main' 
                          : 'success.main'
                      : 'grey.300',
                    borderRadius: 1,
                  }}
                />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Password strength: {
                passwordStrength.score < 3 ? 'Weak' :
                passwordStrength.score < 4 ? 'Fair' :
                passwordStrength.score < 5 ? 'Good' : 'Strong'
              }
            </Typography>
          </Box>
        )}

        <TextField
          margin="normal"
          required
          fullWidth
          name="confirmPassword"
          label="Confirm Password"
          type={showConfirmPassword ? 'text' : 'password'}
          id="confirmPassword"
          autoComplete="new-password"
          value={formData.confirmPassword}
          onChange={handleChange('confirmPassword')}
          error={!!validationErrors.confirmPassword}
          helperText={validationErrors.confirmPassword}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label="toggle password visibility"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  edge="end"
                >
                  {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <LoadingButton
          type="submit"
          fullWidth
          variant="contained"
          loading={isLoading}
          sx={{ mt: 3, mb: 2 }}
        >
          Sign Up
        </LoadingButton>

        <Box sx={{ textAlign: 'center' }}>
          {onSwitchToLogin && (
            <Link
              component="button"
              variant="body2"
              onClick={(e) => {
                e.preventDefault();
                onSwitchToLogin();
              }}
            >
              Already have an account? Sign In
            </Link>
          )}
        </Box>
      </Box>
    </Paper>
  );
}