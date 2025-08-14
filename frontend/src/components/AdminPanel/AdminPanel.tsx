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
  const [formDataDialogOpen, setFormDataDialogOpen] = useState(false);
  const [selectedFormData, setSelectedFormData] = useState<any>(null);
  const [signatureViewerOpen, setSignatureViewerOpen] = useState(false);
  const [selectedSignature, setSelectedSignature] = useState<any>(null);
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

  const handleViewFormData = (formDataSubmission: any) => {
    setSelectedFormData(formDataSubmission);
    setFormDataDialogOpen(true);
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
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <img 
          src="/Sprkz.png" 
          alt="Sprkz Logo" 
          style={{ width: 40, height: 40, marginRight: 16 }}
        />
        <Box>
          <Typography variant="h3" component="h1" gutterBottom sx={{ mb: 0 }}>
            Admin Panel
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            MVE PDF Workflow System
          </Typography>
        </Box>
      </Box>
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
                            <TableCell>Signature</TableCell>
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
                              <TableCell>
                                {recipient.recipient_type === 'PRESCRIBER' ? (
                                  (() => {
                                    // Look for signature in form data history
                                    const recipientSubmission = workflow.formDataHistory?.find(
                                      (submission: any) => submission.recipient_name === recipient.recipient_name
                                    );
                                    
                                    // Debug logging for signature detection
                                    if (recipient.recipient_type === 'PRESCRIBER') {
                                      console.log('🔍 Checking signatures for provider:', recipient.recipient_name);
                                      console.log('🔍 Recipient submission:', recipientSubmission);
                                      if (recipientSubmission?.form_data) {
                                        console.log('🔍 Form data keys:', Object.keys(recipientSubmission.form_data));
                                        console.log('🔍 Form data:', recipientSubmission.form_data);
                                      }
                                    }
                                    
                                    const hasSignature = recipientSubmission?.form_data && 
                                      Object.keys(recipientSubmission.form_data).some(key => 
                                        key.toLowerCase().includes('signature') || 
                                        key.toLowerCase().includes('prescriber') ||
                                        key.toLowerCase().includes('sign') ||
                                        key.toLowerCase().includes('auth')
                                      ) && Object.values(recipientSubmission.form_data).some(value => 
                                        typeof value === 'string' && value.startsWith('data:image/')
                                      );
                                    
                                    if (hasSignature) {
                                      return (
                                        <Button 
                                          size="small" 
                                          variant="outlined" 
                                          color="success"
                                          onClick={() => {
                                            // Find the signature field and value
                                            const signatureField = Object.entries(recipientSubmission.form_data).find(([key, value]) => 
                                              (key.toLowerCase().includes('signature') || 
                                               key.toLowerCase().includes('prescriber') ||
                                               key.toLowerCase().includes('sign') ||
                                               key.toLowerCase().includes('auth')) &&
                                              typeof value === 'string' && value.startsWith('data:image/')
                                            );
                                            if (signatureField) {
                                              // Look for metadata
                                              const metadataKey = `${signatureField[0]}_metadata`;
                                              const metadataString = recipientSubmission.form_data[metadataKey];
                                              let metadata = null;
                                              if (metadataString) {
                                                try {
                                                  metadata = JSON.parse(metadataString);
                                                } catch (e) {
                                                  console.warn('Failed to parse signature metadata:', e);
                                                }
                                              }
                                              
                                              setSelectedSignature({
                                                recipientName: recipient.recipient_name,
                                                fieldName: signatureField[0],
                                                signatureData: signatureField[1],
                                                metadata: metadata
                                              });
                                              setSignatureViewerOpen(true);
                                            }
                                          }}
                                        >
                                          View Signature
                                        </Button>
                                      );
                                    } else if (recipient.status === 'completed') {
                                      return (
                                        <Typography variant="caption" color="text.secondary">
                                          No Signature Found
                                        </Typography>
                                      );
                                    } else {
                                      return (
                                        <Typography variant="caption" color="text.secondary">
                                          Not Signed
                                        </Typography>
                                      );
                                    }
                                  })()
                                ) : (
                                  <Typography variant="caption" color="text.secondary">
                                    N/A
                                  </Typography>
                                )}
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

                    {/* Form Data Section */}
                    {workflow.formDataHistory && workflow.formDataHistory.length > 0 && (
                      <>
                        <Typography variant="subtitle1" gutterBottom sx={{ mt: 3 }}>
                          Form Data History ({workflow.formDataHistory.length} submissions)
                        </Typography>
                        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Recipient</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Submitted At</TableCell>
                                <TableCell>Form Fields</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {workflow.formDataHistory.map((submission, index) => (
                                <TableRow key={index}>
                                  <TableCell>{submission.recipient_name}</TableCell>
                                  <TableCell>
                                    <Chip 
                                      label={recipientTypeConfig[submission.recipient_type as keyof typeof recipientTypeConfig]?.label || submission.recipient_type}
                                      size="small"
                                      sx={{
                                        bgcolor: recipientTypeConfig[submission.recipient_type as keyof typeof recipientTypeConfig]?.bgcolor || '#f5f5f5',
                                        color: recipientTypeConfig[submission.recipient_type as keyof typeof recipientTypeConfig]?.color || '#616161',
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>{submission.submitted_at ? formatDate(submission.submitted_at) : '-'}</TableCell>
                                  <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      {Object.entries(submission.form_data).length > 0 ? (
                                        <>
                                          <Chip 
                                            label={`${Object.entries(submission.form_data).length} fields`}
                                            size="small"
                                            color="primary"
                                            variant="outlined"
                                          />
                                          <Button
                                            size="small"
                                            variant="text"
                                            onClick={() => handleViewFormData(submission)}
                                          >
                                            View Fields
                                          </Button>
                                        </>
                                      ) : (
                                        <Chip 
                                          label="No form data"
                                          size="small"
                                          color="default"
                                          variant="outlined"
                                        />
                                      )}
                                    </Box>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </>
                    )}

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

      {/* Form Data Details Dialog */}
      <Dialog
        open={formDataDialogOpen}
        onClose={() => setFormDataDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { 
            height: '80vh',
            maxHeight: '600px',
          },
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6" component="div">
                Form Data Details
              </Typography>
              {selectedFormData && (
                <Typography variant="body2" color="text.secondary">
                  Submitted by {selectedFormData.recipient_name} ({recipientTypeConfig[selectedFormData.recipient_type as keyof typeof recipientTypeConfig]?.label || selectedFormData.recipient_type})
                  {selectedFormData.submitted_at && ` on ${formatDate(selectedFormData.submitted_at)}`}
                </Typography>
              )}
            </Box>
            <IconButton 
              onClick={() => setFormDataDialogOpen(false)}
              sx={{ color: 'text.secondary' }}
            >
              <Cancel />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0 }}>
          {selectedFormData && (
            <Box sx={{ p: 3 }}>
              {Object.keys(selectedFormData.form_data).length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Field Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(selectedFormData.form_data).map(([fieldName, value]) => (
                        <TableRow key={fieldName}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                              {fieldName}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ maxWidth: 300, wordBreak: 'break-word' }}>
                              {typeof value === 'boolean' ? (
                                <Chip 
                                  label={value ? 'Yes' : 'No'} 
                                  color={value ? 'success' : 'default'}
                                  size="small"
                                />
                              ) : (
                                <Typography variant="body2">
                                  {String(value) || <em style={{ color: '#999' }}>Empty</em>}
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={typeof value} 
                              size="small" 
                              variant="outlined"
                              color={
                                typeof value === 'boolean' ? 'info' :
                                typeof value === 'number' ? 'warning' :
                                'default'
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Alert severity="info">
                  <Typography variant="body2">
                    No form data was submitted by this recipient.
                  </Typography>
                </Alert>
              )}

              {/* Raw JSON view for debugging */}
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Raw JSON Data:
                </Typography>
                <Paper 
                  variant="outlined" 
                  sx={{ 
                    p: 2, 
                    backgroundColor: '#f5f5f5',
                    maxHeight: 200,
                    overflow: 'auto'
                  }}
                >
                  <pre style={{ 
                    margin: 0, 
                    fontSize: '0.75rem', 
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {JSON.stringify(selectedFormData.form_data, null, 2)}
                  </pre>
                </Paper>
              </Box>
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setFormDataDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Signature Viewer Dialog */}
      <Dialog
        open={signatureViewerOpen}
        onClose={() => setSignatureViewerOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { 
            height: '80vh',
            maxHeight: '600px',
          },
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6" component="div">
                Digital Signature
              </Typography>
              {selectedSignature && (
                <Typography variant="body2" color="text.secondary">
                  Signed by {selectedSignature.recipientName} - Field: {selectedSignature.fieldName}
                </Typography>
              )}
            </Box>
            <IconButton 
              onClick={() => setSignatureViewerOpen(false)}
              sx={{ color: 'text.secondary' }}
            >
              <Cancel />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0 }}>
          {selectedSignature?.signatureData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Signature Image */}
              <Box sx={{ 
                p: 3,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: '#FAFAFA',
                borderBottom: '1px solid #E0E0E0'
              }}>
                <Box sx={{
                  border: '2px solid #E0E0E0',
                  borderRadius: 1,
                  p: 2,
                  backgroundColor: 'white',
                  maxWidth: '100%'
                }}>
                  <img 
                    src={selectedSignature.signatureData}
                    alt="Digital Signature"
                    style={{
                      maxWidth: '500px',
                      maxHeight: '200px',
                      objectFit: 'contain',
                      display: 'block'
                    }}
                  />
                </Box>
              </Box>
              
              {/* Signature Metadata */}
              <Box sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Signature Details
                </Typography>
                <Box sx={{ display: 'grid', gap: 2 }}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Signed By:
                    </Typography>
                    <Typography variant="body1">
                      {selectedSignature.metadata?.signedBy || selectedSignature.recipientName || 'Unknown'}
                    </Typography>
                  </Box>
                  
                  {selectedSignature.metadata?.signedAt && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Date & Time:
                      </Typography>
                      <Typography variant="body1">
                        {formatDate(selectedSignature.metadata.signedAt)}
                      </Typography>
                    </Box>
                  )}
                  
                  {selectedSignature.metadata?.signedIP && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        IP Address:
                      </Typography>
                      <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                        {selectedSignature.metadata.signedIP}
                      </Typography>
                    </Box>
                  )}
                  
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Field Name:
                    </Typography>
                    <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      {selectedSignature.fieldName}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          ) : (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                No signature data available
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setSignatureViewerOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AdminPanel;