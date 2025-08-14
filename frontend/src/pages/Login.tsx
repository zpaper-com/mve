import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Alert,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import { LoginForm } from '../components/Auth/LoginForm';
import { RegisterForm } from '../components/Auth/RegisterForm';
import { useAuth } from '../contexts/AuthContext';
import { config } from '../config';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`auth-tabpanel-${index}`}
      aria-labelledby={`auth-tab-${index}`}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState(0);
  const [alertMessage, setAlertMessage] = useState<{
    type: 'error' | 'success' | 'info' | 'warning';
    message: string;
  } | null>(null);

  // Parse query parameters and location state
  const searchParams = new URLSearchParams(location.search);
  const error = searchParams.get('error');
  const message = searchParams.get('message');
  const tab = searchParams.get('tab');
  const returnTo = (location.state as any)?.from || searchParams.get('returnTo') || '/';

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated && !isLoading) {
      navigate(returnTo, { replace: true });
      return;
    }

    // Set initial tab based on URL parameter
    if (tab === 'register' && config.features.enableRegistration) {
      setActiveTab(1);
    }

    // Handle URL parameters for messages
    if (error) {
      switch (error) {
        case 'auth_failed':
          setAlertMessage({
            type: 'error',
            message: 'Authentication failed. Please try again.',
          });
          break;
        case 'session_expired':
          setAlertMessage({
            type: 'warning',
            message: 'Your session has expired. Please sign in again.',
          });
          break;
        case 'access_denied':
          setAlertMessage({
            type: 'error',
            message: 'Access denied. You don\'t have permission to access that resource.',
          });
          break;
        default:
          setAlertMessage({
            type: 'error',
            message: 'An error occurred. Please try again.',
          });
      }
    }

    if (message) {
      setAlertMessage({
        type: 'info',
        message: decodeURIComponent(message),
      });
    }

    // Handle location state message
    const stateMessage = (location.state as any)?.message;
    if (stateMessage) {
      setAlertMessage({
        type: 'info',
        message: stateMessage,
      });
    }

    // Clear URL parameters to clean up the URL
    if (error || message || tab) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('error');
      newUrl.searchParams.delete('message');
      newUrl.searchParams.delete('tab');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [isAuthenticated, isLoading, navigate, returnTo, error, message, tab, location.state]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    setAlertMessage(null); // Clear any messages when switching tabs
  };

  const handleSwitchToRegister = () => {
    setActiveTab(1);
    setAlertMessage(null);
  };

  const handleSwitchToLogin = () => {
    setActiveTab(0);
    setAlertMessage(null);
  };

  const handleRegistrationSuccess = () => {
    // Switch to login tab after successful registration
    setTimeout(() => {
      setActiveTab(0);
      setAlertMessage({
        type: 'success',
        message: 'Registration successful! Please check your email to verify your account.',
      });
    }, 2000);
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: 'calc(100vh - 200px)',
        }}
      >
        {/* App Logo/Title */}
        <Typography component="h1" variant="h2" sx={{ mb: 4, fontWeight: 'bold' }}>
          MVE
        </Typography>

        <Typography variant="h6" color="text.secondary" sx={{ mb: 4, textAlign: 'center' }}>
          PDF Form Viewer and Workflow Management
        </Typography>

        {/* Alert Messages */}
        {alertMessage && (
          <Alert 
            severity={alertMessage.type} 
            sx={{ mb: 3, width: '100%', maxWidth: 400 }}
            onClose={() => setAlertMessage(null)}
          >
            {alertMessage.message}
          </Alert>
        )}

        {/* Auth Forms */}
        <Paper elevation={0} sx={{ width: '100%', maxWidth: 400 }}>
          {config.features.enableRegistration ? (
            <>
              {/* Tabs for Login/Register */}
              <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                  value={activeTab}
                  onChange={handleTabChange}
                  aria-label="auth tabs"
                  variant="fullWidth"
                >
                  <Tab label="Sign In" id="auth-tab-0" />
                  <Tab label="Sign Up" id="auth-tab-1" />
                </Tabs>
              </Box>

              {/* Login Tab */}
              <TabPanel value={activeTab} index={0}>
                <LoginForm
                  onSwitchToRegister={handleSwitchToRegister}
                  redirectTo={returnTo}
                />
              </TabPanel>

              {/* Register Tab */}
              <TabPanel value={activeTab} index={1}>
                <RegisterForm
                  onSwitchToLogin={handleSwitchToLogin}
                  onSuccess={handleRegistrationSuccess}
                />
              </TabPanel>
            </>
          ) : (
            // Only show login form if registration is disabled
            <LoginForm
              redirectTo={returnTo}
            />
          )}
        </Paper>

        {/* Footer */}
        <Box sx={{ mt: 8, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            © 2024 MVE. Secure PDF workflow management.
          </Typography>
          {config.app.environment === 'development' && (
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
              Development Mode
            </Typography>
          )}
        </Box>
      </Box>
    </Container>
  );
}