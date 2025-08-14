import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Close,
  Download,
  Image,
  PictureAsPdf,
  AttachFile,
} from '@mui/icons-material';

interface AttachmentViewerProps {
  open: boolean;
  onClose: () => void;
  attachment: {
    id: number;
    original_filename: string;
    mime_type: string;
    file_size: number;
    uploaded_by: string;
    created_at: string;
    url?: string;
  } | null;
}

const AttachmentViewer: React.FC<AttachmentViewerProps> = ({
  open,
  onClose,
  attachment
}) => {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>('');

  const handleImageLoad = () => {
    setLoading(false);
  };

  const handleImageError = () => {
    setLoading(false);
    setError('Failed to load image');
  };

  const handleDownload = () => {
    if (attachment) {
      const downloadUrl = `/api/attachments/${attachment.id}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = attachment.original_filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const getFileIcon = () => {
    if (!attachment) return <AttachFile />;
    
    if (attachment.mime_type?.startsWith('image/')) {
      return <Image color="primary" />;
    } else if (attachment.mime_type === 'application/pdf') {
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

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  React.useEffect(() => {
    if (open && attachment) {
      setLoading(true);
      setError('');
    }
  }, [open, attachment]);

  if (!attachment) return null;

  const attachmentUrl = `/api/attachments/${attachment.id}`;
  const isImage = attachment.mime_type?.startsWith('image/');
  const isPDF = attachment.mime_type === 'application/pdf';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { height: '90vh', maxHeight: '800px' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getFileIcon()}
            <Box>
              <Typography variant="h6">
                {attachment.original_filename}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatFileSize(attachment.file_size)} • {attachment.mime_type}
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, position: 'relative' }}>
        {/* Loading indicator */}
        {loading && (
          <Box 
            sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '400px' 
            }}
          >
            <CircularProgress />
          </Box>
        )}

        {/* Error state */}
        {error && (
          <Box sx={{ p: 3 }}>
            <Alert severity="error">
              {error}
            </Alert>
          </Box>
        )}

        {/* Image viewer */}
        {isImage && (
          <Box 
            sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              minHeight: '400px',
              bgcolor: 'grey.50'
            }}
          >
            <img
              src={attachmentUrl}
              alt={attachment.original_filename}
              onLoad={handleImageLoad}
              onError={handleImageError}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: loading ? 'none' : 'block'
              }}
            />
          </Box>
        )}

        {/* PDF viewer */}
        {isPDF && (
          <Box sx={{ height: '100%', minHeight: '400px' }}>
            <iframe
              src={attachmentUrl}
              width="100%"
              height="100%"
              style={{ border: 'none' }}
              onLoad={handleImageLoad}
              title={attachment.original_filename}
            />
          </Box>
        )}

        {/* Other file types */}
        {!isImage && !isPDF && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              Preview not available for this file type. You can download the file to view it.
            </Alert>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              {getFileIcon()}
            </Box>
            <Typography variant="body1" gutterBottom>
              {attachment.original_filename}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatFileSize(attachment.file_size)} • {attachment.mime_type}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Uploaded by {attachment.uploaded_by} on {formatDate(attachment.created_at)}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={handleDownload}
          >
            Download
          </Button>
          <Button onClick={onClose}>
            Close
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default AttachmentViewer;