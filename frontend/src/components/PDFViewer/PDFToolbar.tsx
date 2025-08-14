import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Button,
  Box,
  TextField,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from '@mui/material';
import {
  MenuOpen,
  NavigateBefore,
  NavigateNext,
  Send,
  Check,
  CheckCircle,
  AttachFile,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { usePDFStore } from '../../store';
import SendToDialog from '../SendToDialog/SendToDialog';
import AttachmentDialog from '../AttachmentDialog/AttachmentDialog';
import ZoomControls from './ZoomControls';

// Import recipient type configuration for display
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

interface PDFToolbarProps {
  workflowContext?: {
    isWorkflowContext: boolean;
    workflowData: any;
    currentRecipientIndex: number | null;
    isLastRecipient: boolean;
    currentRecipientToken: string | null;
    currentRecipientType?: string | null;
    currentRecipientName?: string | null;
  };
  getCurrentFormData?: () => Record<string, any>;
}

const PDFToolbar: React.FC<PDFToolbarProps> = ({ workflowContext, getCurrentFormData }) => {
  const {
    currentPage,
    totalPages,
    showThumbnails,
    setCurrentPage,
    toggleThumbnails,
  } = usePDFStore();

  const [sendToOpen, setSendToOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [pageInput, setPageInput] = useState(currentPage.toString());
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);

  // Update page input when current page changes
  React.useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePageInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(event.target.value);
  };

  const handlePageInputSubmit = () => {
    const pageNum = parseInt(pageInput);
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
    } else {
      setPageInput(currentPage.toString());
    }
  };

  const handleWorkflowSubmission = () => {
    if (workflowContext?.isLastRecipient) {
      setCompletionDialogOpen(true);
    } else {
      setSubmissionDialogOpen(true);
    }
  };

  const handleSubmissionConfirm = async () => {
    if (!workflowContext?.currentRecipientToken) {
      console.error('No recipient token available for submission');
      return;
    }
    
    try {
      const token = workflowContext.currentRecipientToken;
      const formData = getCurrentFormData ? getCurrentFormData() : {};
      
      console.log('📤 Submitting form data:', formData);
      console.log('📤 Signature fields in submission:', Object.keys(formData).filter(key => 
        key.toLowerCase().includes('signature') || key.toLowerCase().includes('prescriber')
      ));
      
      const response = await fetch(`/api/recipients/${token}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formData: formData
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Submission successful:', result.message);
      } else {
        console.error('❌ Submission failed:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Error submitting:', error);
    }
    
    setSubmissionDialogOpen(false);
  };

  const handleCompletionConfirm = async () => {
    if (!workflowContext?.currentRecipientToken) {
      console.error('No recipient token available for completion');
      return;
    }
    
    try {
      const token = workflowContext.currentRecipientToken;
      const response = await fetch(`/api/recipients/${token}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formData: getCurrentFormData ? getCurrentFormData() : {}
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Completion successful:', result.message);
      } else {
        console.error('❌ Completion failed:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Error completing:', error);
    }
    
    setCompletionDialogOpen(false);
  };

  return (
    <>
      <AppBar position="static" elevation={1}>
        <Toolbar sx={{ gap: 2, minHeight: '56px !important' }}>
          <Tooltip title={showThumbnails ? 'Hide Thumbnails' : 'Show Thumbnails'}>
            <IconButton
              edge="start"
              color="inherit"
              onClick={toggleThumbnails}
              sx={{
                transform: showThumbnails ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            >
              {showThumbnails ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </Tooltip>

          {/* Workflow Title */}
          {workflowContext?.isWorkflowContext && workflowContext.currentRecipientName && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
              <Typography variant="h6" sx={{ color: 'inherit', fontWeight: 500 }}>
                {workflowContext.currentRecipientName}
              </Typography>
              {workflowContext.currentRecipientType && (
                <Chip
                  label={
                    recipientTypeConfig[workflowContext.currentRecipientType as keyof typeof recipientTypeConfig]?.label || 
                    workflowContext.currentRecipientType
                  }
                  size="small"
                  sx={{
                    bgcolor: recipientTypeConfig[workflowContext.currentRecipientType as keyof typeof recipientTypeConfig]?.bgcolor || '#f5f5f5',
                    color: recipientTypeConfig[workflowContext.currentRecipientType as keyof typeof recipientTypeConfig]?.color || '#616161',
                    fontWeight: 500,
                  }}
                />
              )}
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Previous Page (← or Page Up)">
              <IconButton
                color="inherit"
                onClick={handlePrevPage}
                disabled={currentPage <= 1}
              >
                <NavigateBefore />
              </IconButton>
            </Tooltip>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                value={pageInput}
                onChange={handlePageInputChange}
                onBlur={handlePageInputSubmit}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handlePageInputSubmit();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                size="small"
                inputProps={{
                  min: 1,
                  max: totalPages,
                  type: 'number',
                  'aria-label': 'Current page number',
                }}
                sx={{ 
                  width: 60, 
                  '& .MuiInputBase-input': { 
                    textAlign: 'center',
                    color: 'inherit',
                    fontSize: '0.875rem',
                  },
                  '& .MuiOutlinedInput-root': {
                    height: '32px',
                    '& fieldset': {
                      borderColor: 'rgba(255, 255, 255, 0.3)',
                    },
                    '&:hover fieldset': {
                      borderColor: 'rgba(255, 255, 255, 0.5)',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'rgba(255, 255, 255, 0.8)',
                    },
                  },
                }}
              />
              <Typography variant="body2">
                of {totalPages}
              </Typography>
            </Box>

            <Tooltip title="Next Page (→ or Page Down)">
              <IconButton
                color="inherit"
                onClick={handleNextPage}
                disabled={currentPage >= totalPages}
              >
                <NavigateNext />
              </IconButton>
            </Tooltip>
          </Box>

          <ZoomControls variant="toolbar" />

          <Box sx={{ flexGrow: 1 }} />

          {workflowContext?.isWorkflowContext && (
            <Tooltip title="Attach files to this document">
              <Button
                variant="outlined"
                startIcon={<AttachFile />}
                onClick={() => setAttachmentOpen(true)}
                sx={{ 
                  color: 'inherit', 
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  '&:hover': {
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  },
                }}
              >
                Attach
              </Button>
            </Tooltip>
          )}

          <Tooltip title={
            workflowContext?.isWorkflowContext 
              ? (workflowContext.isLastRecipient ? "Complete this workflow" : "Submit your portion")
              : "Send this document to recipients"
          }>
            <Button
              variant="contained"
              startIcon={
                workflowContext?.isWorkflowContext 
                  ? (workflowContext.isLastRecipient ? <CheckCircle /> : <Check />)
                  : <Send />
              }
              onClick={
                workflowContext?.isWorkflowContext 
                  ? handleWorkflowSubmission
                  : () => setSendToOpen(true)
              }
              sx={{ 
                backgroundColor: 'primary.main',
                '&:hover': {
                  backgroundColor: 'primary.dark',
                },
                boxShadow: 2,
              }}
            >
              {workflowContext?.isWorkflowContext 
                ? (workflowContext.isLastRecipient ? "Complete" : "Submit")
                : "Send To"
              }
            </Button>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <SendToDialog 
        open={sendToOpen} 
        onClose={() => setSendToOpen(false)}
        initialFormData={getCurrentFormData ? getCurrentFormData() : {}}
      />
      
      {workflowContext?.isWorkflowContext && (
        <AttachmentDialog 
          open={attachmentOpen} 
          onClose={() => setAttachmentOpen(false)} 
          workflowId={workflowContext?.workflowData?.workflow?.id}
          recipientId={workflowContext?.workflowData?.recipient?.id}
          uploadedBy={workflowContext?.workflowData?.recipient?.name || 'user'}
          onSuccess={(attachment) => {
            console.log('✅ File uploaded successfully:', attachment);
          }}
        />
      )}

      {/* Submission Dialog */}
      <Dialog
        open={submissionDialogOpen}
        onClose={() => setSubmissionDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Check color="success" />
            <Typography variant="h6">Submission Complete</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Thank you! Your portion has been submitted successfully.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The next recipient will be notified to complete their portion of the workflow.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleSubmissionConfirm} 
            variant="contained" 
            color="primary"
            startIcon={<Check />}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Completion Dialog */}
      <Dialog
        open={completionDialogOpen}
        onClose={() => setCompletionDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircle color="success" />
            <Typography variant="h6">Workflow Complete</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Congratulations! The entire workflow has been completed successfully.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            All recipients have finished their portions and the document is now finalized.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleCompletionConfirm} 
            variant="contained" 
            color="success"
            startIcon={<CheckCircle />}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PDFToolbar;