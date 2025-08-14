import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Card,
  CardContent,
  Avatar,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  LinearProgress,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  Person,
  Business,
  LocalHospital,
  HealthAndSafety,
  Email,
  Phone,
  Badge,
  Schedule,
  NotificationsActive,
  CheckCircle,
  ExpandMore,
  Info,
  Timeline,
  SendTimeExtension,
} from '@mui/icons-material';

interface Recipient {
  id?: string;
  recipientType: 'PRESCRIBER' | 'PATIENT' | 'PHARMACY' | 'INSURANCE' | 'CUSTOM';
  partyName: string;
  email: string;
  mobile?: string;
  npi?: string;
}

interface WorkflowSummaryProps {
  recipients: Recipient[];
}

const recipientTypeConfig = {
  PRESCRIBER: {
    label: 'Prescriber',
    icon: LocalHospital,
    color: '#2e7d32',
    bgcolor: '#e8f5e8',
    description: 'Healthcare provider who prescribes medication',
  },
  PATIENT: {
    label: 'Patient',
    icon: Person,
    color: '#1976d2',
    bgcolor: '#e3f2fd',
    description: 'Patient receiving medical care',
  },
  PHARMACY: {
    label: 'Pharmacy',
    icon: Business,
    color: '#ed6c02',
    bgcolor: '#fff3e0',
    description: 'Pharmacy that dispenses medication',
  },
  INSURANCE: {
    label: 'Insurance',
    icon: HealthAndSafety,
    color: '#9c27b0',
    bgcolor: '#f3e5f5',
    description: 'Insurance provider for coverage verification',
  },
  CUSTOM: {
    label: 'Other',
    icon: Person,
    color: '#616161',
    bgcolor: '#f5f5f5',
    description: 'Custom recipient type',
  },
} as const;

const WorkflowSummary: React.FC<WorkflowSummaryProps> = ({ recipients }) => {
  const theme = useTheme();
  const [expandedAccordion, setExpandedAccordion] = useState<string | false>('summary');

  const handleAccordionChange = (panel: string) => (
    event: React.SyntheticEvent,
    isExpanded: boolean
  ) => {
    setExpandedAccordion(isExpanded ? panel : false);
  };

  const totalRecipients = recipients.length;
  const estimatedCompletionHours = totalRecipients * 24; // 24 hours per step
  const estimatedCompletionDays = Math.ceil(estimatedCompletionHours / 24);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Timeline color="primary" />
          Review Workflow
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Review the complete workflow before sending. Each recipient will be processed sequentially.
        </Typography>
      </Box>

      {/* Workflow Overview */}
      <Accordion 
        expanded={expandedAccordion === 'summary'} 
        onChange={handleAccordionChange('summary')}
        sx={{ mb: 2 }}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              <Info />
            </Avatar>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Workflow Overview
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {totalRecipients} recipient{totalRecipients > 1 ? 's' : ''} • 
                Est. {estimatedCompletionDays} day{estimatedCompletionDays > 1 ? 's' : ''} to complete
              </Typography>
            </Box>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="primary" fontWeight="bold">
                  {totalRecipients}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Recipients
                </Typography>
              </CardContent>
            </Card>
            
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="primary" fontWeight="bold">
                  {estimatedCompletionHours}h
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Est. Completion Time
                </Typography>
              </CardContent>
            </Card>
          </Box>

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Sequential Processing:</strong> Recipients will be notified one at a time. 
              Each must complete their step before the next person is notified.
            </Typography>
          </Alert>
        </AccordionDetails>
      </Accordion>

      {/* Workflow Steps */}
      <Accordion 
        expanded={expandedAccordion === 'steps'} 
        onChange={handleAccordionChange('steps')}
        defaultExpanded={true}
        sx={{ mb: 2 }}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
            <Avatar sx={{ bgcolor: 'success.main' }}>
              <Timeline />
            </Avatar>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Workflow Steps
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Sequential order of recipient notifications
              </Typography>
            </Box>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stepper orientation="vertical" sx={{ ml: 0 }}>
            {recipients.map((recipient, index) => {
              const typeConfig = recipientTypeConfig[recipient.recipientType] || recipientTypeConfig.CUSTOM;
              const TypeIcon = typeConfig.icon;
              const isFirst = index === 0;
              const isLast = index === recipients.length - 1;

              return (
                <Step key={index} active={true} completed={false}>
                  <StepLabel
                    icon={
                      <Avatar
                        sx={{
                          width: 32,
                          height: 32,
                          bgcolor: typeConfig.bgcolor,
                          color: typeConfig.color,
                        }}
                      >
                        <TypeIcon fontSize="small" />
                      </Avatar>
                    }
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        Step {index + 1}: {recipient.partyName || 'Unnamed Recipient'}
                      </Typography>
                      <Chip
                        label={typeConfig.label}
                        size="small"
                        sx={{
                          bgcolor: typeConfig.bgcolor,
                          color: typeConfig.color,
                          fontWeight: 500,
                        }}
                      />
                      {isFirst && (
                        <Chip
                          label="First"
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      )}
                      {isLast && (
                        <Chip
                          label="Final"
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  </StepLabel>
                  <StepContent>
                    <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                      <CardContent sx={{ p: 2 }}>
                        {/* Recipient Details */}
                        <List dense>
                          <ListItem>
                            <ListItemIcon>
                              <Email color="action" />
                            </ListItemIcon>
                            <ListItemText
                              primary="Email Address"
                              secondary={recipient.email}
                            />
                          </ListItem>

                          {recipient.mobile && (
                            <ListItem>
                              <ListItemIcon>
                                <Phone color="action" />
                              </ListItemIcon>
                              <ListItemText
                                primary="Mobile Phone"
                                secondary={recipient.mobile}
                              />
                            </ListItem>
                          )}

                          {recipient.npi && (
                            <ListItem>
                              <ListItemIcon>
                                <Badge color="action" />
                              </ListItemIcon>
                              <ListItemText
                                primary="NPI Number"
                                secondary={recipient.npi}
                              />
                            </ListItem>
                          )}
                        </List>

                        <Divider sx={{ my: 1 }} />

                        {/* Notification Timing */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          {isFirst ? (
                            <>
                              <NotificationsActive color="success" fontSize="small" />
                              <Typography variant="body2" color="success.main" fontWeight={600}>
                                Will be notified immediately
                              </Typography>
                            </>
                          ) : (
                            <>
                              <Schedule color="primary" fontSize="small" />
                              <Typography variant="body2" color="primary.main" fontWeight={600}>
                                Will be notified after Step {index} completion
                              </Typography>
                            </>
                          )}
                        </Box>

                        {/* Description */}
                        <Typography variant="body2" color="text.secondary">
                          {typeConfig.description}
                        </Typography>
                      </CardContent>
                    </Card>
                  </StepContent>
                </Step>
              );
            })}
          </Stepper>
        </AccordionDetails>
      </Accordion>

      {/* Timeline Preview */}
      <Accordion 
        expanded={expandedAccordion === 'timeline'} 
        onChange={handleAccordionChange('timeline')}
        sx={{ mb: 2 }}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
            <Avatar sx={{ bgcolor: 'warning.main' }}>
              <SendTimeExtension />
            </Avatar>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Expected Timeline
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Estimated notification schedule
              </Typography>
            </Box>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Workflow Progress (Estimated)
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={0} 
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
              <Typography variant="caption">Start</Typography>
              <Typography variant="caption">
                Complete (~{estimatedCompletionDays} days)
              </Typography>
            </Box>
          </Box>

          <List>
            {recipients.map((recipient, index) => {
              const hoursFromStart = index * 24;
              const dayFromStart = Math.floor(hoursFromStart / 24);
              
              return (
                <ListItem key={index}>
                  <ListItemIcon>
                    <Avatar
                      sx={{
                        width: 24,
                        height: 24,
                        bgcolor: index === 0 ? 'success.main' : 'primary.main',
                        fontSize: '0.75rem',
                      }}
                    >
                      {index + 1}
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={recipient.partyName || `Recipient ${index + 1}`}
                    secondary={
                      index === 0
                        ? 'Immediate notification'
                        : `Day ${dayFromStart + 1} (after ${hoursFromStart}h)`
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </AccordionDetails>
      </Accordion>

      {/* Important Notes */}
      <Alert severity="warning" sx={{ mt: 2 }}>
        <Typography variant="body2">
          <strong>Before you proceed:</strong>
        </Typography>
        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
          <li>Double-check all email addresses are correct</li>
          <li>Ensure recipients are in the correct order</li>
          <li>Remember that each step has a 48-hour timeout</li>
          <li>You'll receive progress notifications throughout the workflow</li>
        </ul>
      </Alert>
    </Box>
  );
};

export default WorkflowSummary;