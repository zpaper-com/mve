import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Divider,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import {
  Description,
  Send,
  CheckCircle,
  Group,
  Edit,
  Notifications,
  ArrowForward,
} from '@mui/icons-material';

interface SplashDialogProps {
  open: boolean;
  onClose: () => void;
}

const SplashDialog: React.FC<SplashDialogProps> = ({ open, onClose }) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Check if user has opted to not show again
  useEffect(() => {
    const hideDialog = localStorage.getItem('hideSplashDialog');
    if (hideDialog === 'true' && open) {
      onClose();
    }
  }, [open, onClose]);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem('hideSplashDialog', 'true');
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1, color: 'white' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              bgcolor: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Description sx={{ fontSize: 28, color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="h4" component="div" sx={{ fontWeight: 700 }}>
              Welcome to Sprkz
            </Typography>
            <Typography variant="subtitle1" sx={{ opacity: 0.95 }}>
              PDF Form Filling & Workflow Orchestration
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 2, bgcolor: 'white', mt: 0 }}>
        <Paper elevation={0} sx={{ p: 3, bgcolor: '#f5f5f5', borderRadius: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ color: '#333', fontWeight: 600 }}>
            How It Works
          </Typography>
          <Typography variant="body1" paragraph sx={{ color: '#666' }}>
            Sprkz enables seamless multi-party PDF form completion through intelligent workflow orchestration. 
            Perfect for documents requiring input from multiple stakeholders in a specific sequence.
          </Typography>
        </Paper>

        <Typography variant="h6" gutterBottom sx={{ mt: 3, mb: 2, fontWeight: 600 }}>
          Getting Started
        </Typography>

        <List>
          <ListItem>
            <ListItemIcon>
              <Edit color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="1. Pre-fill Your Fields"
              secondary="Fill in any form fields you're responsible for. You can complete your portion before sending to others."
            />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <Send color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="2. Click 'Send To' When Ready"
              secondary="Once you've filled your fields, click the 'Send To' button in the toolbar to set up your workflow."
            />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <Group color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="3. Add Recipients"
              secondary="Add up to 10 recipients who need to complete portions of the form. Each person will receive the form in sequence."
            />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <Notifications color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="4. Sequential Notifications"
              secondary="Recipients are notified one at a time via email/SMS. Each person completes their section before the next is notified."
            />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <CheckCircle color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="5. Automatic Completion"
              secondary="When all recipients have completed their portions, the finalized PDF is automatically generated and available for download."
            />
          </ListItem>
        </List>

        <Divider sx={{ my: 3 }} />

        <Paper 
          elevation={0} 
          sx={{ 
            p: 2, 
            bgcolor: '#e3f2fd', 
            borderRadius: 1,
            border: '1px solid #90caf9',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <ArrowForward sx={{ color: '#1976d2' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1976d2' }}>
              Quick Tip
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#424242' }}>
            Start by filling in any fields you know, then use "Send To" to route the form to others 
            who need to provide additional information. The form will move through your workflow automatically!
          </Typography>
        </Paper>

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-start' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography variant="body2" color="text.secondary">
                Don't show this again
              </Typography>
            }
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, bgcolor: 'white' }}>
        <Button
          onClick={handleClose}
          variant="contained"
          size="large"
          sx={{
            px: 4,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #5a67d8 0%, #6b4199 100%)',
            },
          }}
        >
          Get Started
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SplashDialog;