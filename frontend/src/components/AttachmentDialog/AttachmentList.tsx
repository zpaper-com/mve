import React, { useState } from 'react';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Paper,
  Typography,
  Chip,
  Dialog,
  DialogContent,
  CircularProgress,
  Tooltip,
  Box,
} from '@mui/material';
import {
  InsertDriveFile,
  Image,
  PictureAsPdf,
  Delete,
  Download,
  Visibility,
} from '@mui/icons-material';
import { useAttachmentStore } from '../../store';
import { useDeleteAttachment, useDownloadAttachment } from '../../hooks/useAttachments';

interface Attachment {
  id: string;
  filename: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface AttachmentListProps {
  attachments: Attachment[];
  sessionId?: string;
  disabled?: boolean;
}

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) {
    return <Image color="primary" />;
  } else if (type === 'application/pdf') {
    return <PictureAsPdf color="error" />;
  }
  return <InsertDriveFile />;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

const AttachmentList: React.FC<AttachmentListProps> = ({ attachments, sessionId, disabled }) => {
  const { removeAttachment } = useAttachmentStore();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const deleteMutation = useDeleteAttachment(sessionId || null);
  const downloadMutation = useDownloadAttachment();

  const handleDelete = async (attachment: Attachment) => {
    if (disabled) return;
    
    try {
      await deleteMutation.mutateAsync(attachment.id);
      removeAttachment(attachment.id);
    } catch (error) {
      console.error('Failed to delete attachment:', error);
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    if (disabled) return;
    
    try {
      await downloadMutation.mutateAsync(attachment.id);
    } catch (error) {
      console.error('Failed to download attachment:', error);
    }
  };

  const handlePreview = async (attachment: Attachment) => {
    if (!attachment.type.startsWith('image/')) return;
    
    // For image preview, we'll use the download URL temporarily
    // In a real implementation, you might want a separate preview endpoint
    try {
      const response = await fetch(`/api/attachments/${attachment.id}/url`);
      const data = await response.json();
      if (data.success && data.data.downloadUrl) {
        setPreviewUrl(data.data.downloadUrl);
        setPreviewOpen(true);
      }
    } catch (error) {
      console.error('Failed to get preview URL:', error);
    }
  };

  if (attachments.length === 0) {
    return (
      <Paper sx={{ p: 2, textAlign: 'center' }}>
        <Typography color="text.secondary">
          No attachments yet. Upload files using the dropzone above.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ maxHeight: 300, overflow: 'auto' }}>
      <List>
        {attachments.map((attachment, index) => (
          <ListItem key={attachment.id} divider={index < attachments.length - 1}>
            <ListItemIcon>
              {getFileIcon(attachment.type)}
            </ListItemIcon>
            <ListItemText
              primary={
                <Typography variant="subtitle2" noWrap>
                  {attachment.filename}
                </Typography>
              }
              secondary={
                <div>
                  <Typography variant="body2" component="span">
                    {formatFileSize(attachment.size)}
                  </Typography>
                  <Chip
                    label={attachment.type.split('/')[1]?.toUpperCase() || 'FILE'}
                    size="small"
                    sx={{ ml: 1, height: 20 }}
                  />
                  <Typography variant="caption" display="block" color="text.secondary">
                    Uploaded {formatDate(attachment.uploadedAt)}
                  </Typography>
                </div>
              }
            />
            <ListItemSecondaryAction>
              {attachment.type.startsWith('image/') && (
                <Tooltip title="Preview image">
                  <IconButton
                    edge="end"
                    aria-label="preview"
                    onClick={() => handlePreview(attachment)}
                    sx={{ mr: 1 }}
                    size="small"
                    disabled={disabled}
                  >
                    <Visibility />
                  </IconButton>
                </Tooltip>
              )}
              
              <Tooltip title="Download file">
                <IconButton
                  edge="end"
                  aria-label="download"
                  onClick={() => handleDownload(attachment)}
                  sx={{ mr: 1 }}
                  size="small"
                  disabled={disabled || downloadMutation.isPending}
                >
                  {downloadMutation.isPending ? (
                    <CircularProgress size={20} />
                  ) : (
                    <Download />
                  )}
                </IconButton>
              </Tooltip>
              
              <Tooltip title="Delete file">
                <IconButton
                  edge="end"
                  aria-label="delete"
                  onClick={() => handleDelete(attachment)}
                  color="error"
                  size="small"
                  disabled={disabled || deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <CircularProgress size={20} />
                  ) : (
                    <Delete />
                  )}
                </IconButton>
              </Tooltip>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>
      
      {/* Image Preview Dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ p: 0 }}>
          {previewUrl && (
            <Box sx={{ textAlign: 'center' }}>
              <img
                src={previewUrl}
                alt="Attachment preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '80vh',
                  objectFit: 'contain',
                }}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Paper>
  );
};

export default AttachmentList;