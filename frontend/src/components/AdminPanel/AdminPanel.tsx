import React, { useState, useEffect } from 'react';
import AttachmentViewer from '../AttachmentDialog/AttachmentViewer';
import {
  Box,
  Typography,
  Container,
  Tabs,
  Tab,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  Button,
  Alert,
  Card,
  CardContent,
  CardActions,
  Grid,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Refresh,
  Edit,
  Save,
  Cancel,
  Email,
  Sms,
  Visibility,
  Settings,
  Analytics,
  DeleteSweep,
  PictureAsPdf,
  AttachFile,
  Image,
} from '@mui/icons-material';
import axios from 'axios';
import { format } from 'date-fns';

// Import recipient type configuration for role colors and labels
const recipientTypeConfig = {
  PRESCRIBER: {
    label: 'Provider',
    color: '#2e7d32',
    bgcolor: '#e8f5e8',
  },
  PATIENT: {
    label: 'Patient',
    color: '#1976d2',
    bgcolor: '#e3f2fd',
  },
  PHARMACY: {
    label: 'Pharmacy',
    color: '#ed6c02',
    bgcolor: '#fff3e0',
  },
  INSURANCE: {
    label: 'Insurance',
    color: '#9c27b0',
    bgcolor: '#f3e5f5',
  },
  MEDSTAFF: {
    label: 'Med-Staff',
    color: '#d32f2f',
    bgcolor: '#ffebee',
  },
  CUSTOM: {
    label: 'Other',
    color: '#616161',
    bgcolor: '#f5f5f5',
  },
} as const;

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface Workflow {
  id: string;
  uuid: string;
  documentUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  metadata: any;
  recipients: any[];
  notifications: any[];
}

interface MessageTemplate {
  id: string;
  type: 'sms' | 'email';
  name: string;
  subject?: string;
  content: string;
  variables: string[];
}

interface Stats {
  total_workflows: number;
  active_workflows: number;
  completed_workflows: number;
}

const AdminPanel: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [attachmentViewerOpen, setAttachmentViewerOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, templatesRes] = await Promise.all([
        axios.get('/api/stats'),
        axios.get('/api/templates'),
      ]);
      
      setStats(statsRes.data.stats);
      setTemplates(templatesRes.data.templates || []);
    } catch (err) {
      setError('Failed to load admin data');
      console.error('Admin data load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/workflows');
      setWorkflows(response.data.workflows || []);
    } catch (err) {
      setError('Failed to load workflows');
      console.error('Workflows load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    if (newValue === 1 && workflows.length === 0) {
      loadWorkflows();
    }
  };

  const handleEditTemplate = (template: MessageTemplate) => {
    setEditingTemplate({ ...template });
    setEditDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;

    try {
      await axios.put(`/api/templates/${editingTemplate.id}`, editingTemplate);
      setSuccess('Template updated successfully');
      setEditDialogOpen(false);
      setEditingTemplate(null);
      loadData();
    } catch (err) {
      setError('Failed to update template');
      console.error('Template update error:', err);
    }
  };

  const handleClearWorkflows = async () => {
    setLoading(true);
    try {
      await axios.delete('/api/admin/workflows');
      setSuccess('All workflows cleared successfully');
      setClearDialogOpen(false);
      setWorkflows([]);
      // Reload stats to reflect cleared data
      await loadData();
    } catch (err) {
      setError('Failed to clear workflows');
      console.error('Clear workflows error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewAttachment = (attachment: any) => {
    setSelectedAttachment(attachment);
    setAttachmentViewerOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'sent': return 'success';
      case 'pending': return 'warning';
      case 'failed': return 'error';
      case 'active': return 'primary';
      case 'completed': return 'success';
      default: return 'default';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'PPpp');
    } catch {
      return dateString;
    }
  };

  const renderRolePills = (recipients: any[]) => {
    // Get unique recipient types from the workflow
    const uniqueRoles = Array.from(new Set(recipients.map(r => r.recipient_type)))
      .sort((a, b) => {
        // Sort by typical workflow order: PATIENT, MEDSTAFF, PRESCRIBER, others
        const order = ['PATIENT', 'MEDSTAFF', 'PRESCRIBER', 'PHARMACY', 'INSURANCE', 'CUSTOM'];
        return order.indexOf(a) - order.indexOf(b);
      });

    return (
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
        {uniqueRoles.map((roleType) => {
          const config = recipientTypeConfig[roleType as keyof typeof recipientTypeConfig] || recipientTypeConfig.CUSTOM;
          return (
            <Chip
              key={roleType}
              label={config.label}
              size="small"
              sx={{
                bgcolor: config.bgcolor,
                color: config.color,
                fontWeight: 500,
                fontSize: '0.75rem',
              }}
            />
          );
        })}
      </Box>
    );
  };

  const defaultTemplates: MessageTemplate[] = [
    {
      id: 'sms_workflow_notification',
      type: 'sms',
      name: 'SMS Workflow Notification',
      content: `Hi {{recipientName}}!

You've been added to a PDF workflow for completion.

{{message}}

Access your workflow: {{workflowUrl}}

This is an automated message from MVE PDF Workflow System.`,
      variables: ['recipientName', 'message', 'workflowUrl']
    },
    {
      id: 'email_workflow_notification',
      type: 'email',
      name: 'Email Workflow Notification',
      subject: 'PDF Workflow - Action Required',
      content: `Hi {{recipientName}},

You've been added to a PDF workflow for completion.

{{body}}

Access your workflow: {{workflowUrl}}

Best regards,
MVE PDF Workflow System`,
      variables: ['recipientName', 'body', 'workflowUrl']
    }
  ];

  const displayTemplates = templates.length > 0 ? templates : defaultTemplates;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Admin Panel
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Manage workflows, notifications, and message templates
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab icon={<Analytics />} label="Dashboard" />
          <Tab icon={<Visibility />} label="Workflows & Events" />
          <Tab icon={<Settings />} label="Message Templates" />
        </Tabs>
      </Box>

      {/* Dashboard Tab */}
      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" component="div">
                  Total Workflows
                </Typography>
                <Typography variant="h3" color="primary">
                  {stats?.total_workflows || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" component="div">
                  Active Workflows
                </Typography>
                <Typography variant="h3" color="warning.main">
                  {stats?.active_workflows || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" component="div">
                  Completed Workflows
                </Typography>
                <Typography variant="h3" color="success.main">
                  {stats?.completed_workflows || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Workflows & Events Tab */}
      <TabPanel value={tabValue} index={1}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h5">Workflows & Notification Events</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={loadWorkflows}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteSweep />}
              onClick={() => setClearDialogOpen(true)}
              disabled={loading || workflows.length === 0}
            >
              Clear All
            </Button>
          </Box>
        </Box>

        {workflows.length === 0 ? (
          <Alert severity="info">
            No workflows found. Click "Refresh" to load workflows.
          </Alert>
        ) : (
          workflows.map((workflow) => (
            <Card key={workflow.id} sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="h6">
                      Workflow: {workflow.uuid}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Created: {formatDate(workflow.createdAt)} • {workflow.recipients.length} recipient{workflow.recipients.length !== 1 ? 's' : ''}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                      <Chip 
                        label={workflow.status} 
                        color={getStatusColor(workflow.status) as any}
                        size="small"
                      />
                      {renderRolePills(workflow.recipients)}
                    </Box>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setSelectedWorkflow(selectedWorkflow?.id === workflow.id ? null : workflow)}
                  >
                    {selectedWorkflow?.id === workflow.id ? 'Hide Details' : 'Show Details'}
                  </Button>
                </Box>

                {selectedWorkflow?.id === workflow.id && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle1" gutterBottom>
                      Recipients ({workflow.recipients.length})
                    </Typography>
                    <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Mobile</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {workflow.recipients.map((recipient, index) => (
                            <TableRow key={index}>
                              <TableCell>{recipient.recipient_name}</TableCell>
                              <TableCell>{recipient.email}</TableCell>
                              <TableCell>{recipient.mobile || '-'}</TableCell>
                              <TableCell>{recipient.recipient_type}</TableCell>
                              <TableCell>
                                <Chip label={recipient.status} size="small" color={getStatusColor(recipient.status) as any} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    <Typography variant="subtitle1" gutterBottom>
                      Notification Events ({workflow.notifications.length})
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Type</TableCell>
                            <TableCell>Recipient</TableCell>
                            <TableCell>Subject</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Sent At</TableCell>
                            <TableCell>External ID</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {workflow.notifications.map((notification, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  {notification.type === 'email' ? <Email sx={{ mr: 1 }} /> : <Sms sx={{ mr: 1 }} />}
                                  {notification.type.toUpperCase()}
                                </Box>
                              </TableCell>
                              <TableCell>{notification.recipient_address}</TableCell>
                              <TableCell>{notification.subject || '-'}</TableCell>
                              <TableCell>
                                <Chip label={notification.status} size="small" color={getStatusColor(notification.status) as any} />
                              </TableCell>
                              <TableCell>{notification.sent_at ? formatDate(notification.sent_at) : '-'}</TableCell>
                              <TableCell>{notification.external_id || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    {/* Attachments Section */}
                    {workflow.attachments && workflow.attachments.length > 0 && (
                      <>
                        <Typography variant="subtitle1" gutterBottom sx={{ mt: 3 }}>
                          Attachments ({workflow.attachments.length})
                        </Typography>
                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>File Name</TableCell>
                                <TableCell>Uploaded By</TableCell>
                                <TableCell>Size</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Uploaded At</TableCell>
                                <TableCell>Actions</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {workflow.attachments.map((attachment, index) => (
                                <TableRow key={index}>
                                  <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      {attachment.mime_type?.startsWith('image/') ? (
                                        <Image sx={{ mr: 1, color: 'primary.main' }} />
                                      ) : attachment.mime_type === 'application/pdf' ? (
                                        <PictureAsPdf sx={{ mr: 1, color: 'error.main' }} />
                                      ) : (
                                        <AttachFile sx={{ mr: 1 }} />
                                      )}
                                      {attachment.original_filename}
                                    </Box>
                                  </TableCell>
                                  <TableCell>{attachment.recipient_name || attachment.uploaded_by || '-'}</TableCell>
                                  <TableCell>
                                    {attachment.file_size ? `${(attachment.file_size / 1024 / 1024).toFixed(1)} MB` : '-'}
                                  </TableCell>
                                  <TableCell>{attachment.mime_type || '-'}</TableCell>
                                  <TableCell>{attachment.created_at ? formatDate(attachment.created_at) : '-'}</TableCell>
                                  <TableCell>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      onClick={() => handleViewAttachment(attachment)}
                                    >
                                      View
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </TabPanel>

      {/* Message Templates Tab */}
      <TabPanel value={tabValue} index={2}>
        <Typography variant="h5" gutterBottom>
          Message Templates
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Edit SMS and email message templates. Use mustache syntax like {'{{variableName}}'} for dynamic content.
        </Typography>

        <Grid container spacing={3}>
          {displayTemplates.map((template) => (
            <Grid item xs={12} md={6} key={template.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    {template.type === 'email' ? <Email sx={{ mr: 1 }} /> : <Sms sx={{ mr: 1 }} />}
                    <Typography variant="h6">{template.name}</Typography>
                  </Box>
                  
                  {template.subject && (
                    <Typography variant="subtitle2" gutterBottom>
                      Subject: {template.subject}
                    </Typography>
                  )}
                  
                  <Typography variant="body2" sx={{ 
                    whiteSpace: 'pre-wrap', 
                    bgcolor: 'grey.50', 
                    p: 1, 
                    borderRadius: 1,
                    mb: 2,
                    maxHeight: 200,
                    overflow: 'auto'
                  }}>
                    {template.content}
                  </Typography>
                  
                  <Typography variant="caption" color="text.secondary">
                    Variables: {template.variables.map(v => `{{${v}}}`).join(', ')}
                  </Typography>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<Edit />}
                    onClick={() => handleEditTemplate(template)}
                  >
                    Edit Template
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </TabPanel>

      {/* Edit Template Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Edit {editingTemplate?.type.toUpperCase()} Template
        </DialogTitle>
        <DialogContent>
          {editingTemplate && (
            <Box sx={{ pt: 1 }}>
              <TextField
                fullWidth
                label="Template Name"
                value={editingTemplate.name}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                sx={{ mb: 2 }}
              />
              
              {editingTemplate.type === 'email' && (
                <TextField
                  fullWidth
                  label="Subject"
                  value={editingTemplate.subject || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  sx={{ mb: 2 }}
                />
              )}
              
              <TextField
                fullWidth
                multiline
                rows={12}
                label="Message Content"
                value={editingTemplate.content}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                sx={{ mb: 2 }}
              />
              
              <Alert severity="info">
                <Typography variant="body2">
                  <strong>Available variables:</strong> {editingTemplate.variables.map(v => `{{${v}}}`).join(', ')}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Use mustache syntax like {'{{recipientName}}'} to insert dynamic content.
                </Typography>
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} startIcon={<Cancel />}>
            Cancel
          </Button>
          <Button onClick={handleSaveTemplate} variant="contained" startIcon={<Save />}>
            Save Template
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Workflows Confirmation Dialog */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DeleteSweep color="error" />
            <Typography variant="h6">Clear All Workflows</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>This action cannot be undone!</strong>
            </Typography>
          </Alert>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to clear all workflows? This will permanently delete:
          </Typography>
          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
            <li>All {workflows.length} workflow(s)</li>
            <li>All recipients and their data</li>
            <li>All notification history</li>
            <li>All workflow tokens and URLs</li>
          </ul>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            This is useful for clearing test data during development.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleClearWorkflows} 
            variant="contained" 
            color="error" 
            startIcon={<DeleteSweep />}
            disabled={loading}
          >
            {loading ? 'Clearing...' : 'Clear All Workflows'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Attachment Viewer Dialog */}
      <AttachmentViewer
        open={attachmentViewerOpen}
        onClose={() => {
          setAttachmentViewerOpen(false);
          setSelectedAttachment(null);
        }}
        attachment={selectedAttachment}
      />
    </Container>
  );
};

export default AdminPanel;