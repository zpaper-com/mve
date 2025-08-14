import React from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Avatar,
  Stack,
  Chip,
  Divider,
} from '@mui/material';

import { useAuth } from '@/contexts/AuthContext';
import { LoadingScreen } from '@components/LoadingScreen';

const Profile: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen message="Loading profile..." />;
  }

  if (!user) {
    return (
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography variant="h6">Please log in to view your profile.</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        Profile
      </Typography>

      <Card>
        <CardContent>
          <Stack spacing={3}>
            {/* User Avatar and Basic Info */}
            <Stack direction="row" spacing={3} alignItems="center">
              <Avatar
                src={user.picture}
                alt={user.name}
                sx={{ width: 80, height: 80 }}
              >
                {user.name?.[0] || user.email[0]}
              </Avatar>
              <Box>
                <Typography variant="h5">
                  {user.name || 'User'}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {user.email}
                </Typography>
                {user.roles && user.roles.length > 0 && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    {user.roles.map(role => (
                      <Chip
                        key={role}
                        label={role}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                )}
              </Box>
            </Stack>

            <Divider />

            {/* Account Details */}
            <Box>
              <Typography variant="h6" gutterBottom>
                Account Details
              </Typography>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Email
                  </Typography>
                  <Typography variant="body1">
                    {user.email}
                  </Typography>
                </Box>

                {user.createdAt && (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Member Since
                    </Typography>
                    <Typography variant="body1">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                )}

                {user.lastLogin && (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Last Login
                    </Typography>
                    <Typography variant="body1">
                      {new Date(user.lastLogin).toLocaleString()}
                    </Typography>
                  </Box>
                )}

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Email Verified
                  </Typography>
                  <Chip
                    label={user.emailVerified ? 'Verified' : 'Not Verified'}
                    size="small"
                    color={user.emailVerified ? 'success' : 'warning'}
                  />
                </Box>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
};

export default Profile;