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
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          maxHeight: '90vh',
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
        <Paper elevation={0} sx={{ p: 2.5, bgcolor: '#f5f5f5', borderRadius: 2, mb: 2 }}>
          <Typography variant="body1" sx={{ color: '#666' }}>
            Sprkz enables seamless multi-party PDF form completion through intelligent workflow orchestration.
          </Typography>
        </Paper>

        <Typography variant="h6" gutterBottom sx={{ mt: 2, mb: 1.5, fontWeight: 600, fontSize: '1.1rem' }}>
          Quick Start Guide
        </Typography>

        <List dense>
          <ListItem>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Edit color="primary" fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="1. Pre-fill Your Fields"
              primaryTypographyProps={{ fontSize: '0.95rem', fontWeight: 500 }}
            />
          </ListItem>

          <ListItem>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Send color="primary" fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="2. Click 'Send To' to Set Up Workflow"
              primaryTypographyProps={{ fontSize: '0.95rem', fontWeight: 500 }}
            />
          </ListItem>

          <ListItem>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Group color="primary" fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="3. Add Recipients (Sequential Notifications)"
              primaryTypographyProps={{ fontSize: '0.95rem', fontWeight: 500 }}
            />
          </ListItem>

          <ListItem>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <CheckCircle color="primary" fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="4. Automatic Completion & Distribution"
              primaryTypographyProps={{ fontSize: '0.95rem', fontWeight: 500 }}
              secondary="Completed PDF and receipt can be sent to all parties if selected"
              secondaryTypographyProps={{ fontSize: '0.85rem' }}
            />
          </ListItem>
        </List>

        <Paper 
          elevation={0} 
          sx={{ 
            p: 1.5, 
            bgcolor: '#e3f2fd', 
            borderRadius: 1,
            border: '1px solid #90caf9',
            mt: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ArrowForward sx={{ color: '#1976d2', fontSize: 20 }} />
            <Typography variant="body2" sx={{ color: '#424242' }}>
              <strong>Tip:</strong> Fill your fields first, then use "Send To" to route the form through your workflow automatically.
            </Typography>
          </Box>
        </Paper>

        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-start' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                color="primary"
                size="small"
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

      <DialogActions sx={{ p: 2, bgcolor: 'white' }}>
        <Button
          onClick={handleClose}
          variant="contained"
          size="medium"
          sx={{
            px: 3,
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