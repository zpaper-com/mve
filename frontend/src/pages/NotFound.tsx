import React from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  Paper,
} from '@mui/material';
import { Home, ArrowBack } from '@mui/icons-material';
import { useNavigate, Link } from 'react-router-dom';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

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
            p: 6,
            textAlign: 'center',
            borderRadius: 2,
          }}
        >
          <Stack spacing={3} alignItems="center">
            {/* 404 Display */}
            <Typography
              variant="h1"
              sx={{
                fontSize: '8rem',
                fontWeight: 700,
                color: 'primary.main',
                lineHeight: 1,
              }}
            >
              404
            </Typography>

            {/* Error Message */}
            <Box>
              <Typography variant="h4" gutterBottom>
                Page Not Found
              </Typography>
              <Typography variant="body1" color="text.secondary" maxWidth="sm">
                The page you're looking for doesn't exist. It might have been moved, 
                deleted, or you entered the wrong URL.
              </Typography>
            </Box>

            {/* Action Buttons */}
            <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
              <Button
                variant="contained"
                startIcon={<Home />}
                component={Link}
                to="/"
                size="large"
              >
                Go Home
              </Button>
              
              <Button
                variant="outlined"
                startIcon={<ArrowBack />}
                onClick={() => navigate(-1)}
                size="large"
              >
                Go Back
              </Button>
            </Stack>

            {/* Additional Help */}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              If you think this is a mistake, please{' '}
              <Typography
                component="a"
                href="mailto:support@zpaper.com"
                sx={{ color: 'primary.main', textDecoration: 'none' }}
              >
                contact support
              </Typography>
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
};

export default NotFound;