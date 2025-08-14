import React from 'react';
import {
  Box,
  Button,
  Container,
  Typography,
  Paper,
  Stack,
  Alert,
  Collapse,
} from '@mui/material';
import {
  ErrorOutline,
  Refresh,
  BugReport,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';

interface ErrorBoundaryProps {
  error?: Error;
  resetError?: () => void;
  title?: string;
  showDetails?: boolean;
}

export const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({
  error,
  resetError,
  title = 'Something went wrong',
  showDetails = true,
}) => {
  const [showErrorDetails, setShowErrorDetails] = React.useState(false);

  const handleReload = () => {
    if (resetError) {
      resetError();
    } else {
      window.location.reload();
    }
  };

  const handleReportBug = () => {
    const subject = encodeURIComponent('MVE Application Error Report');
    const body = encodeURIComponent(
      `Error Message: ${error?.message || 'Unknown error'}\n\n` +
      `Stack Trace:\n${error?.stack || 'No stack trace available'}\n\n` +
      `URL: ${window.location.href}\n` +
      `User Agent: ${navigator.userAgent}\n` +
      `Timestamp: ${new Date().toISOString()}`
    );
    
    // In production, this would be replaced with a proper error reporting service
    window.open(`mailto:support@zpaper.com?subject=${subject}&body=${body}`);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Container maxWidth="md">
        <Paper
          elevation={3}
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 2,
          }}
        >
          <Stack spacing={3} alignItems="center">
            {/* Error Icon */}
            <ErrorOutline
              sx={{
                fontSize: 80,
                color: 'error.main',
                mb: 2,
              }}
            />

            {/* Error Title */}
            <Typography variant="h4" component="h1" gutterBottom>
              {title}
            </Typography>

            {/* Error Description */}
            <Typography variant="body1" color="text.secondary" maxWidth="sm">
              We encountered an unexpected error. This has been logged and our team 
              has been notified. Please try refreshing the page or contact support 
              if the problem persists.
            </Typography>

            {/* Action Buttons */}
            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Button
                variant="contained"
                startIcon={<Refresh />}
                onClick={handleReload}
                size="large"
              >
                Reload Page
              </Button>
              
              <Button
                variant="outlined"
                startIcon={<BugReport />}
                onClick={handleReportBug}
                size="large"
              >
                Report Issue
              </Button>
            </Stack>

            {/* Error Details Section */}
            {error && showDetails && (
              <Box sx={{ width: '100%', mt: 3 }}>
                <Button
                  variant="text"
                  onClick={() => setShowErrorDetails(!showErrorDetails)}
                  endIcon={showErrorDetails ? <ExpandLess /> : <ExpandMore />}
                  size="small"
                >
                  {showErrorDetails ? 'Hide' : 'Show'} Error Details
                </Button>

                <Collapse in={showErrorDetails}>
                  <Alert 
                    severity="error" 
                    sx={{ 
                      mt: 2, 
                      textAlign: 'left',
                      '& .MuiAlert-message': {
                        width: '100%',
                      },
                    }}
                  >
                    <Typography variant="subtitle2" gutterBottom>
                      Error Message:
                    </Typography>
                    <Typography
                      variant="body2"
                      component="pre"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        mb: 2,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}
                    >
                      {error.message}
                    </Typography>

                    {error.stack && (
                      <>
                        <Typography variant="subtitle2" gutterBottom>
                          Stack Trace:
                        </Typography>
                        <Typography
                          variant="body2"
                          component="pre"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            maxHeight: 200,
                            overflow: 'auto',
                          }}
                        >
                          {error.stack}
                        </Typography>
                      </>
                    )}
                  </Alert>
                </Collapse>
              </Box>
            )}

            {/* Additional Help */}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
              Error ID: {Date.now().toString(36).toUpperCase()}
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
};

export default ErrorBoundary;