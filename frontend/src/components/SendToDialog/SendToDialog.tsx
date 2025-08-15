import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Stepper,
  Step,
  StepLabel,
  Alert,
  LinearProgress,
  Snackbar,
  Chip,
} from '@mui/material';
import { 
  Close, 
  Send, 
  ArrowBack, 
  ArrowForward, 
  CheckCircle, 
  ErrorOutline,
} from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import RecipientForm from './RecipientForm';
import WorkflowSummary from './WorkflowSummary';
import { logger } from '../../utils/logger';
import { smsService } from '../../services/smsService';
import { emailService } from '../../services/emailService';

const workflowSchema = z.object({
  recipients: z.array(z.object({
    id: z.string().optional(),
    recipientType: z.enum(['PRESCRIBER', 'PATIENT', 'PHARMACY', 'INSURANCE', 'MEDSTAFF', 'CUSTOM']),
    partyName: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid email is required'),
    mobile: z.string().optional(),
    npi: z.string().optional(),
    officePhone: z.string().optional(),
    fax: z.string().optional(),
  })).min(1, 'At least one recipient is required').max(10, 'Maximum 10 recipients allowed'),
});

type WorkflowFormData = z.infer<typeof workflowSchema>;

interface SendToDialogProps {
  open: boolean;
  onClose: () => void;
  documentUrl?: string;
  onSuccess?: (workflowId: string) => void;
  initialFormData?: Record<string, any>;
}

const steps = ['Add Recipients', 'Review & Send'];

const SendToDialog: React.FC<SendToDialogProps> = ({ 
  open, 
  onClose, 
  documentUrl = 'https://qr.md/kb/books/merx.pdf',
  onSuccess,
  initialFormData = {}
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false);
  const [workflowError, setWorkflowError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [smsResults, setSmsResults] = useState<Array<{recipientName: string, phone: string, success: boolean, error?: string}>>([]);
  const [emailResults, setEmailResults] = useState<Array<{recipientName: string, email: string, success: boolean, error?: string}>>([]);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isValid },
    trigger,
  } = useForm<WorkflowFormData>({
    resolver: zodResolver(workflowSchema),
    defaultValues: {
      recipients: [
        {
          id: `recipient-${Date.now()}`,
          recipientType: 'PATIENT',
          partyName: '',
          email: '',
          mobile: '',
          npi: '',
          officePhone: '',
          fax: '',
        },
        {
          id: `recipient-${Date.now() + 1}`,
          recipientType: 'MEDSTAFF',
          partyName: '',
          email: '',
          mobile: '',
          npi: '',
          officePhone: '',
          fax: '',
        },
        {
          id: `recipient-${Date.now() + 2}`,
          recipientType: 'PRESCRIBER',
          partyName: '',
          email: '',
          mobile: '',
          npi: '',
          officePhone: '',
          fax: '',
        },
      ],
    },
    mode: 'onChange', // Enable real-time validation
  });

  const recipients = watch('recipients');

  // No longer using the old mutation - we handle workflow creation directly

  const handleNext = async () => {
    if (activeStep === 0) {
      // Validate current step
      const isStepValid = await trigger('recipients');
      if (isStepValid && recipients.length > 0 && recipients.every(r => r.partyName && r.email)) {
        setActiveStep(1);
      }
    }
  };

  const handleBack = () => {
    setActiveStep(activeStep - 1);
  };

  const handleClose = () => {
    if (!isCreatingWorkflow) {
      setActiveStep(0);
      setSuccessMessage('');
      setWorkflowError('');
      setSmsResults([]);
      setEmailResults([]);
      reset();
      onClose();
    }
  };

  // Function to send SMS notifications to recipients with mobile numbers
  const sendSMSNotifications = async (recipients: any[], workflowData: any) => {
    const smsPromises = recipients
      .filter(recipient => recipient.mobile && smsService.isValidPhoneNumber(recipient.mobile))
      .map(async (recipient, index) => {
        try {
          const formattedPhone = smsService.formatPhoneNumber(recipient.mobile);
          // Find the corresponding recipient URL for this recipient
          const recipientUrl = workflowData.recipientUrls.find((r: any) => r.recipientName === recipient.partyName);
          const workflowUrl = recipientUrl ? recipientUrl.url : workflowData.workflowUrl;
          
          // Extract UUID from the full URL to avoid duplication
          const extractUuidFromUrl = (url: string) => {
            const match = url.match(/\/s\/([^\/\?]+)/);
            return match ? match[1] : url;
          };
          const workflowUuid = extractUuidFromUrl(workflowUrl);
          
          const response = await fetch('/api/send-sms', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: formattedPhone,
              message: `Hi ${recipient.partyName}! You've been added to a PDF workflow. Please complete your portion when notified.`,
              recipientName: recipient.partyName,
              workflowId: workflowData.workflow.id,
              workflowUuid: workflowUuid
            }),
          });
          
          const result = await response.json();
          
          return {
            recipientName: recipient.partyName,
            phone: formattedPhone,
            success: result.success,
            error: result.error
          };
        } catch (error) {
          return {
            recipientName: recipient.partyName,
            phone: recipient.mobile,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

    const results = await Promise.all(smsPromises);
    setSmsResults(results);
    return results;
  };

  // Function to send email notifications to recipients with email addresses
  const sendEmailNotifications = async (recipients: any[], workflowData: any) => {
    const emailPromises = recipients
      .filter(recipient => recipient.email && emailService.isValidEmail(recipient.email))
      .map(async (recipient) => {
        try {
          // Find the corresponding recipient URL for this recipient
          const recipientUrl = workflowData.recipientUrls.find((r: any) => r.recipientName === recipient.partyName);
          const workflowUrl = recipientUrl ? recipientUrl.url : workflowData.workflowUrl;
          
          const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: recipient.email,
              subject: 'PDF Workflow - Action Required',
              body: `Please complete your portion of the PDF workflow. You'll receive instructions on how to access and fill out your section of the form.`,
              recipientName: recipient.partyName,
              workflowUrl: workflowUrl,
              workflowId: workflowData.workflow.id
            }),
          });
          
          const result = await response.json();
          
          return {
            recipientName: recipient.partyName,
            email: recipient.email,
            success: result.success,
            error: result.error
          };
        } catch (error) {
          return {
            recipientName: recipient.partyName,
            email: recipient.email,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

    const results = await Promise.all(emailPromises);
    setEmailResults(results);
    return results;
  };

  const onSubmit = async (data: WorkflowFormData) => {
    setIsCreatingWorkflow(true);
    setWorkflowError('');
    
    try {
      logger.info('Submitting workflow with data:', data);
      logger.info('Initial form data:', Object.keys(initialFormData).length > 0 ? initialFormData : 'No form data');
      
      // Step 1: Create workflow in database first
      logger.info('Creating workflow...');
      const workflowResponse = await fetch('/api/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipients: data.recipients.map((recipient) => ({
            recipientType: recipient.recipientType,
            partyName: recipient.partyName,
            email: recipient.email,
            mobile: recipient.mobile || undefined,
            npi: recipient.npi || undefined,
          })),
          documentUrl,
          metadata: {
            createdBy: 'frontend-user',
            source: 'sendto-dialog',
          },
          initialFormData: Object.keys(initialFormData).length > 0 ? initialFormData : undefined,
        }),
      });
      
      if (!workflowResponse.ok) {
        throw new Error(`HTTP ${workflowResponse.status}: ${workflowResponse.statusText}`);
      }
      
      const workflowData = await workflowResponse.json();
      logger.info('Workflow created:', workflowData.workflow.uuid);
      
      // Step 2: Send notifications only to the FIRST recipient
      logger.info('Sending initial notifications to first recipient only...');
      const firstRecipient = data.recipients[0];
      const [emailResults, smsResults] = await Promise.all([
        sendEmailNotifications([firstRecipient], workflowData),
        sendSMSNotifications([firstRecipient], workflowData)
      ]);
      
      // Workflow creation and notifications completed successfully
      
      // Update success message to include notification results
      const successfulSMS = smsResults.filter(r => r.success).length;
      const totalSMS = smsResults.length;
      const successfulEmails = emailResults.filter(r => r.success).length;
      const totalEmails = emailResults.length;
      
      let notificationMessage = '';
      if (totalEmails > 0 && totalSMS > 0) {
        notificationMessage = `First recipient notified via email and SMS. Next recipients will be notified sequentially as each step completes.`;
      } else if (totalEmails > 0) {
        notificationMessage = `First recipient notified via email. Next recipients will be notified sequentially as each step completes.`;
      } else if (totalSMS > 0) {
        notificationMessage = `First recipient notified via SMS. Next recipients will be notified sequentially as each step completes.`;
      } else {
        notificationMessage = 'Workflow created. First recipient will need to be notified manually.';
      }
      
      setSuccessMessage(`Workflow created successfully! UUID: ${workflowData.workflow.uuid}. ${notificationMessage}`);
      
      if (onSuccess) {
        onSuccess(workflowData.workflow.uuid);
      }
    } catch (error) {
      logger.error('Error creating workflow:', error);
      setWorkflowError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsCreatingWorkflow(false);
    }
  };

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return <RecipientForm control={control} />;
      case 1:
        return <WorkflowSummary recipients={recipients} />;
      default:
        return null;
    }
  };

  const isSubmitDisabled = !isValid || isCreatingWorkflow;
  const canProceed = activeStep === 0 ? 
    recipients.length > 0 && recipients.every(r => r.partyName && r.email) : 
    isValid;

  return (
    <>
      <Dialog
        open={open}
        onClose={() => {}} // Disable backdrop/escape key closing
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { 
            height: '90vh',
            maxHeight: '900px',
          },
        }}
      >
        {/* Header */}
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h5" component="div" sx={{ fontWeight: 600 }}>
                Send PDF Workflow
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create a sequential workflow for PDF form completion
              </Typography>
            </Box>
            <IconButton 
              onClick={handleClose} 
              disabled={isCreatingWorkflow}
              sx={{ color: 'text.secondary' }}
            >
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>

        {/* Progress bar for loading state */}
        {isCreatingWorkflow && (
          <LinearProgress sx={{ mx: 3 }} />
        )}

        <DialogContent dividers sx={{ p: 3 }}>
          {/* Steps indicator */}
          <Box sx={{ mb: 4 }}>
            <Stepper activeStep={activeStep} sx={{ mb: 2 }}>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {/* Step progress indicator */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Step {activeStep + 1} of {steps.length}
              </Typography>
              <Chip
                label={recipients.length === 1 ? '1 Recipient' : `${recipients.length} Recipients`}
                size="small"
                color="primary"
                variant="outlined"
              />
              {recipients.length > 3 && (
                <Chip
                  label="MVP Limit: 3 Recipients"
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>

          {/* Form errors */}
          {Object.keys(errors).length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Please fix the following errors before proceeding:
              </Typography>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                {errors.recipients?.message && (
                  <li>{errors.recipients.message}</li>
                )}
                {errors.recipients?.map((recipientError, index) => (
                  recipientError && (
                    <li key={index}>
                      Recipient {index + 1}: {Object.values(recipientError).join(', ')}
                    </li>
                  )
                ))}
              </ul>
            </Alert>
          )}

          {/* Success message */}
          {successMessage && (
            <Alert 
              severity="success" 
              sx={{ mb: 2 }}
              icon={<CheckCircle />}
            >
              {successMessage}
            </Alert>
          )}

          {/* SMS Results */}
          {smsResults.length > 0 && (
            <Alert 
              severity="info" 
              sx={{ mb: 2 }}
            >
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>SMS Notification Results:</strong>
              </Typography>
              {smsResults.map((result, index) => (
                <Typography key={index} variant="body2" sx={{ ml: 2 }}>
                  • {result.recipientName} ({result.phone}): {result.success ? (
                    <Chip label="Sent" color="success" size="small" />
                  ) : (
                    <Chip label={`Failed: ${result.error}`} color="error" size="small" />
                  )}
                </Typography>
              ))}
            </Alert>
          )}

          {/* Email Results */}
          {emailResults.length > 0 && (
            <Alert 
              severity="info" 
              sx={{ mb: 2 }}
            >
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Email Notification Results:</strong>
              </Typography>
              {emailResults.map((result, index) => (
                <Typography key={index} variant="body2" sx={{ ml: 2 }}>
                  • {result.recipientName} ({result.email}): {result.success ? (
                    <Chip label="Sent" color="success" size="small" />
                  ) : (
                    <Chip label={`Failed: ${result.error}`} color="error" size="small" />
                  )}
                </Typography>
              ))}
            </Alert>
          )}

          {/* API Error message */}
          {workflowError && (
            <Alert 
              severity="error" 
              sx={{ mb: 2 }}
              icon={<ErrorOutline />}
            >
              <Typography variant="body2">
                Failed to create workflow: {workflowError}
              </Typography>
            </Alert>
          )}

          {/* Step content */}
          <form onSubmit={handleSubmit(onSubmit)} id="workflow-form">
            {getStepContent(activeStep)}
          </form>
        </DialogContent>

        <DialogActions sx={{ p: 3, justifyContent: 'space-between' }}>
          {/* Show different actions based on success state */}
          {successMessage ? (
            // Success state - show only Done button
            <>
              <Box /> {/* Empty space for alignment */}
              <Button 
                onClick={handleClose} 
                variant="contained"
                color="success"
                startIcon={<CheckCircle />}
              >
                Done
              </Button>
            </>
          ) : (
            // Normal state - show Cancel and navigation buttons
            <>
              {/* Cancel button */}
              <Button 
                onClick={handleClose} 
                disabled={isCreatingWorkflow}
                color="inherit"
              >
                Cancel
              </Button>
              
              {/* Navigation buttons */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                {/* Back button */}
                {activeStep > 0 && (
                  <Button 
                    onClick={handleBack}
                    disabled={isCreatingWorkflow}
                    startIcon={<ArrowBack />}
                    variant="outlined"
                  >
                    Back
                  </Button>
                )}
                
                {/* Next/Submit button */}
                {activeStep < steps.length - 1 ? (
                  <Button 
                    variant="contained" 
                    onClick={handleNext}
                    disabled={!canProceed || isCreatingWorkflow}
                    endIcon={<ArrowForward />}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    form="workflow-form"
                    variant="contained"
                    disabled={isSubmitDisabled}
                    startIcon={isCreatingWorkflow ? undefined : <Send />}
                    sx={{ minWidth: 120 }}
                  >
                    {isCreatingWorkflow ? 'Creating...' : 'Create Workflow'}
                  </Button>
                )}
              </Box>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Success snackbar */}
      <Snackbar
        open={!!successMessage}
        onClose={() => {}} // Disable auto-close
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          severity="success" 
          variant="filled"
          sx={{ width: '100%' }}
        >
          {successMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default SendToDialog;