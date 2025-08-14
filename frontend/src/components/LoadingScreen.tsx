import React from 'react';
import {
  Box,
  CircularProgress,
  LinearProgress,
  Typography,
  Fade,
  Stack,
} from '@mui/material';

interface LoadingScreenProps {
  message?: string;
  showProgress?: boolean;
  progress?: number;
  size?: 'small' | 'medium' | 'large';
  fullScreen?: boolean;
  transparent?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Loading...',
  showProgress = false,
  progress,
  size = 'medium',
  fullScreen = true,
  transparent = false,
}) => {
  const getSize = () => {
    switch (size) {
      case 'small':
        return 32;
      case 'large':
        return 60;
      default:
        return 40;
    }
  };

  const getTypographyVariant = () => {
    switch (size) {
      case 'small':
        return 'body2' as const;
      case 'large':
        return 'h6' as const;
      default:
        return 'body1' as const;
    }
  };

  const containerSx = fullScreen
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: transparent ? 'rgba(255, 255, 255, 0.8)' : 'background.default',
        zIndex: 9999,
        backdropFilter: transparent ? 'blur(2px)' : 'none',
      }
    : {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
        width: '100%',
      };

  return (
    <Fade in timeout={300}>
      <Box sx={containerSx}>
        <Stack spacing={2} alignItems="center" sx={{ textAlign: 'center' }}>
          {/* Circular Progress Indicator */}
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <CircularProgress
              size={getSize()}
              thickness={4}
              variant={progress !== undefined ? 'determinate' : 'indeterminate'}
              value={progress}
              sx={{
                color: 'primary.main',
              }}
            />
            
            {/* Progress percentage in center */}
            {progress !== undefined && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography
                  variant="caption"
                  component="div"
                  color="text.secondary"
                  sx={{ fontSize: size === 'small' ? '0.625rem' : '0.75rem' }}
                >
                  {Math.round(progress)}%
                </Typography>
              </Box>
            )}
          </Box>

          {/* Loading Message */}
          {message && (
            <Typography
              variant={getTypographyVariant()}
              color="text.secondary"
              sx={{
                maxWidth: 300,
                px: 2,
              }}
            >
              {message}
            </Typography>
          )}

          {/* Linear Progress Bar */}
          {showProgress && (
            <Box sx={{ width: 200, mt: 1 }}>
              <LinearProgress
                variant={progress !== undefined ? 'determinate' : 'indeterminate'}
                value={progress}
                sx={{
                  height: 6,
                  borderRadius: 3,
                }}
              />
            </Box>
          )}
        </Stack>
      </Box>
    </Fade>
  );
};

// Skeleton Loading Component for content areas
export const ContentLoader: React.FC<{
  lines?: number;
  height?: number;
  width?: string | number;
}> = ({ lines = 3, height = 20, width = '100%' }) => {
  return (
    <Stack spacing={1} sx={{ width }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Box
          key={index}
          sx={{
            height,
            bgcolor: 'action.hover',
            borderRadius: 1,
            animation: 'pulse 1.5s ease-in-out infinite',
            '@keyframes pulse': {
              '0%': {
                opacity: 1,
              },
              '50%': {
                opacity: 0.4,
              },
              '100%': {
                opacity: 1,
              },
            },
          }}
        />
      ))}
    </Stack>
  );
};

// Page Loading Component with branding
export const PageLoadingScreen: React.FC<LoadingScreenProps> = (props) => {
  return (
    <LoadingScreen
      {...props}
      message={props.message || 'Loading MVE...'}
    />
  );
};

export default LoadingScreen;