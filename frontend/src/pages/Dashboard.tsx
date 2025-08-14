import React from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Stack,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Divider,
  Alert,
} from '@mui/material';
import {
  PictureAsPdf,
  AccountTree,
  Add,
  Visibility,
  Edit,
  Delete,
  Schedule,
  CheckCircle,
  Error,
  Warning,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { LoadingScreen } from '@components/LoadingScreen';

// Mock data - replace with real API calls
const recentWorkflows = [
  {
    id: '1',
    title: 'Patient Consent Form - John Doe',
    status: 'active',
    currentStep: 2,
    totalSteps: 3,
    createdAt: new Date('2024-01-15'),
    dueDate: new Date('2024-01-17'),
  },
  {
    id: '2',
    title: 'Medical Release - Jane Smith',
    status: 'completed',
    currentStep: 3,
    totalSteps: 3,
    createdAt: new Date('2024-01-14'),
    completedAt: new Date('2024-01-16'),
  },
  {
    id: '3',
    title: 'Insurance Authorization - Bob Wilson',
    status: 'pending',
    currentStep: 1,
    totalSteps: 2,
    createdAt: new Date('2024-01-13'),
    dueDate: new Date('2024-01-18'),
  },
];

const stats = {
  totalWorkflows: 24,
  activeWorkflows: 8,
  completedWorkflows: 15,
  overdueWorkflows: 1,
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'active':
      return 'primary';
    case 'pending':
      return 'warning';
    case 'overdue':
      return 'error';
    default:
      return 'default';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle />;
    case 'active':
      return <Schedule />;
    case 'pending':
      return <Warning />;
    case 'overdue':
      return <Error />;
    default:
      return <Schedule />;
  }
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen message="Loading dashboard..." />;
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleCreateWorkflow = () => {
    navigate('/workflow/new');
  };

  const handleViewPDF = () => {
    navigate('/pdf');
  };

  const handleViewWorkflow = (workflowId: string) => {
    navigate(`/workflow/${workflowId}`);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap={2}
        >
          <Box>
            <Typography variant="h4" gutterBottom>
              Welcome back, {user.name || 'User'}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Manage your PDF workflows and documents
            </Typography>
          </Box>

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdf />}
              onClick={handleViewPDF}
            >
              View PDF
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleCreateWorkflow}
            >
              New Workflow
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56 }}>
                  <AccountTree />
                </Avatar>
                <Box>
                  <Typography variant="h4" color="primary">
                    {stats.totalWorkflows}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Workflows
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar sx={{ bgcolor: 'info.main', width: 56, height: 56 }}>
                  <Schedule />
                </Avatar>
                <Box>
                  <Typography variant="h4" color="info.main">
                    {stats.activeWorkflows}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active Workflows
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar sx={{ bgcolor: 'success.main', width: 56, height: 56 }}>
                  <CheckCircle />
                </Avatar>
                <Box>
                  <Typography variant="h4" color="success.main">
                    {stats.completedWorkflows}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Completed
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar sx={{ bgcolor: 'error.main', width: 56, height: 56 }}>
                  <Error />
                </Avatar>
                <Box>
                  <Typography variant="h4" color="error.main">
                    {stats.overdueWorkflows}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Overdue
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Activity */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <Typography variant="h6">Recent Workflows</Typography>
                <Button size="small" onClick={() => navigate('/workflow')}>
                  View All
                </Button>
              </Stack>

              {recentWorkflows.length === 0 ? (
                <Alert severity="info">
                  No workflows found. Create your first workflow to get started.
                </Alert>
              ) : (
                <List>
                  {recentWorkflows.map((workflow, index) => (
                    <React.Fragment key={workflow.id}>
                      <ListItem
                        secondaryAction={
                          <Stack direction="row" spacing={1}>
                            <IconButton
                              edge="end"
                              onClick={() => handleViewWorkflow(workflow.id)}
                            >
                              <Visibility />
                            </IconButton>
                            <IconButton edge="end">
                              <Edit />
                            </IconButton>
                          </Stack>
                        }
                      >
                        <ListItemIcon>
                          {getStatusIcon(workflow.status)}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={1}
                              flexWrap="wrap"
                            >
                              <Typography variant="subtitle1">
                                {workflow.title}
                              </Typography>
                              <Chip
                                label={workflow.status}
                                size="small"
                                color={getStatusColor(workflow.status) as any}
                                variant="outlined"
                              />
                            </Stack>
                          }
                          secondary={
                            <Stack spacing={0.5}>
                              <Typography variant="body2" color="text.secondary">
                                Step {workflow.currentStep} of {workflow.totalSteps}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Created: {workflow.createdAt.toLocaleDateString()}
                                {workflow.dueDate && (
                                  <> • Due: {workflow.dueDate.toLocaleDateString()}</>
                                )}
                                {workflow.completedAt && (
                                  <> • Completed: {workflow.completedAt.toLocaleDateString()}</>
                                )}
                              </Typography>
                            </Stack>
                          }
                        />
                      </ListItem>
                      {index < recentWorkflows.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </CardContent>
            <CardActions>
              <Button
                variant="outlined"
                fullWidth
                onClick={handleCreateWorkflow}
                startIcon={<Add />}
              >
                Create New Workflow
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={3}>
            {/* Quick Actions */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Quick Actions
                </Typography>
                <Stack spacing={2}>
                  <Button
                    variant="outlined"
                    startIcon={<PictureAsPdf />}
                    fullWidth
                    onClick={handleViewPDF}
                  >
                    Open PDF Viewer
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<AccountTree />}
                    fullWidth
                    onClick={() => navigate('/workflow')}
                  >
                    Manage Workflows
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            {/* Tips */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Tips
                </Typography>
                <Stack spacing={2}>
                  <Alert severity="info">
                    <strong>Pro Tip:</strong> Use keyboard shortcuts Ctrl+Plus and Ctrl+Minus to zoom in the PDF viewer.
                  </Alert>
                  <Alert severity="success">
                    You can add up to 3 recipients in your workflows for the MVP version.
                  </Alert>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Dashboard;