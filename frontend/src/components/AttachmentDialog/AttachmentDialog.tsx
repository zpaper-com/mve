import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  LinearProgress,
  Alert,
  Chip,
} from '@mui/material';
import {
  Close,
  CloudUpload,
  AttachFile,
  Image,
  PictureAsPdf,
  Delete,
  CheckCircle,
  ErrorOutline,
} from '@mui/icons-material';

interface AttachmentDialogProps {
  open: boolean;
  onClose: () => void;
  workflowId?: string;
  recipientId?: string;
  uploadedBy?: string;
  onSuccess?: (attachment: any) => void;
}

interface UploadFile {
  id: string;
  file: File;
  uploading: boolean;
  uploaded: boolean;
  error?: string;
  result?: any;
}

const AttachmentDialog: React.FC<AttachmentDialogProps> = ({
  open,
  onClose,
  workflowId,
  recipientId,
  uploadedBy = 'user',
  onSuccess
}) => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  }, []);

  const addFiles = (newFiles: File[]) => {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf'
    ];

    const validFiles = newFiles.filter(file => {
      if (!allowedTypes.includes(file.type)) {
        alert(`File type not supported: ${file.type}. Only images and PDFs are allowed.`);
        return false;
      }
      if (file.size > 25 * 1024 * 1024) {
        alert(`File too large: ${file.name}. Maximum size is 25MB.`);
        return false;
      }
      return true;
    });

    const uploadFiles: UploadFile[] = validFiles.map(file => ({
      id: `${Date.now()}_${Math.random().toString(36).substring(7)}`,
      file,
      uploading: false,
      uploaded: false
    }));

    setFiles(prev => [...prev, ...uploadFiles]);
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const uploadFile = async (uploadFile: UploadFile) => {
    if (!workflowId) {
      alert('Workflow ID is required for upload');
      return;
    }

    setFiles(prev => prev.map(f => 
      f.id === uploadFile.id ? { ...f, uploading: true, error: undefined } : f
    ));

    try {
      const formData = new FormData();
      formData.append('file', uploadFile.file);
      formData.append('workflowId', workflowId);
      if (recipientId) {
        formData.append('recipientId', recipientId);
      }
      formData.append('uploadedBy', uploadedBy);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, uploading: false, uploaded: true, result: result.attachment }
          : f
      ));

      if (onSuccess) {
        onSuccess(result.attachment);
      }

    } catch (error) {
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, uploading: false, error: error instanceof Error ? error.message : 'Upload failed' }
          : f
      ));
    }
  };

  const uploadAllFiles = async () => {
    const pendingFiles = files.filter(f => !f.uploading && !f.uploaded && !f.error);
    
    for (const file of pendingFiles) {
      await uploadFile(file);
    }
  };

  const handleClose = () => {
    setFiles([]);
    setDragOver(false);
    onClose();
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <Image color="primary" />;
    } else if (file.type === 'application/pdf') {
      return <PictureAsPdf color="error" />;
    }
    return <AttachFile />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const pendingUploads = files.filter(f => !f.uploaded && !f.error).length;
  const successfulUploads = files.filter(f => f.uploaded).length;
  const failedUploads = files.filter(f => f.error).length;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '80vh', maxHeight: '800px' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            Attach Files
          </Typography>
          <IconButton onClick={handleClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Drop zone */}
        <Paper
          sx={{
            border: '2px dashed',
            borderColor: dragOver ? 'primary.main' : 'grey.300',
            bgcolor: dragOver ? 'primary.50' : 'grey.50',
            p: 4,
            textAlign: 'center',
            mb: 3,
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'primary.50',
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <CloudUpload sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Drop files here or click to browse
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Supported formats: Images (JPEG, PNG, GIF, WebP) and PDF files
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Maximum file size: 25MB
          </Typography>
          
          <input
            id="file-input"
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </Paper>

        {/* Upload summary */}
        {files.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              {pendingUploads > 0 && (
                <Chip label={`${pendingUploads} pending`} color="warning" size="small" />
              )}
              {successfulUploads > 0 && (
                <Chip label={`${successfulUploads} uploaded`} color="success" size="small" />
              )}
              {failedUploads > 0 && (
                <Chip label={`${failedUploads} failed`} color="error" size="small" />
              )}
            </Box>
          </Box>
        )}

        {/* File list */}
        {files.length > 0 && (
          <List sx={{ maxHeight: '300px', overflow: 'auto' }}>
            {files.map((uploadFile) => (
              <ListItem key={uploadFile.id} divider>
                <ListItemIcon>
                  {getFileIcon(uploadFile.file)}
                </ListItemIcon>
                <ListItemText
                  primary={uploadFile.file.name}
                  secondary={
                    <Box>
                      <Typography variant="caption" display="block">
                        {formatFileSize(uploadFile.file.size)} • {uploadFile.file.type}
                      </Typography>
                      {uploadFile.uploading && (
                        <Box sx={{ mt: 1 }}>
                          <LinearProgress size="small" />
                          <Typography variant="caption" color="text.secondary">
                            Uploading...
                          </Typography>
                        </Box>
                      )}
                      {uploadFile.uploaded && (
                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                          <CheckCircle color="success" sx={{ fontSize: 16, mr: 0.5 }} />
                          <Typography variant="caption" color="success.main">
                            Uploaded successfully
                          </Typography>
                        </Box>
                      )}
                      {uploadFile.error && (
                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                          <ErrorOutline color="error" sx={{ fontSize: 16, mr: 0.5 }} />
                          <Typography variant="caption" color="error.main">
                            {uploadFile.error}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  {!uploadFile.uploaded && (
                    <IconButton
                      edge="end"
                      onClick={() => removeFile(uploadFile.id)}
                      disabled={uploadFile.uploading}
                      size="small"
                    >
                      <Delete />
                    </IconButton>
                  )}
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        {/* Error message */}
        {!workflowId && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Workflow ID is required for file uploads
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={uploadAllFiles}
          disabled={pendingUploads === 0 || !workflowId}
          startIcon={<CloudUpload />}
        >
          Upload {pendingUploads > 0 ? `${pendingUploads} file${pendingUploads > 1 ? 's' : ''}` : 'Files'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AttachmentDialog;