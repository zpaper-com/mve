import React, { useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  LinearProgress,
} from '@mui/material';
import { CloudUpload, AttachFile } from '@mui/icons-material';

interface DropzoneProps {
  onFileUpload: (files: FileList | null) => void;
  dragActive: boolean;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  uploading: boolean;
  uploadProgress: number;
  disabled?: boolean;
}

const Dropzone: React.FC<DropzoneProps> = ({
  onFileUpload,
  dragActive,
  onDrop,
  onDragOver,
  onDragLeave,
  uploading,
  uploadProgress,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileUpload(e.target.files);
    // Reset input value to allow uploading the same file again
    e.target.value = '';
  };

  const handleBrowseFiles = () => {
    fileInputRef.current?.click();
  };

  return (
    <Box>
      <Paper
        sx={{
          border: 2,
          borderStyle: 'dashed',
          borderColor: dragActive ? 'primary.main' : 'grey.300',
          backgroundColor: dragActive ? 'primary.50' : 'grey.50',
          p: 4,
          textAlign: 'center',
          cursor: uploading ? 'default' : 'pointer',
          transition: 'all 0.2s ease-in-out',
          '&:hover': uploading ? {} : {
            borderColor: 'primary.main',
            backgroundColor: 'primary.50',
          },
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={uploading ? undefined : handleBrowseFiles}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
          disabled={uploading || disabled}
        />

        {uploading ? (
          <Box>
            <CloudUpload sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Typography variant="h6" gutterBottom>
              Uploading files...
            </Typography>
            <Box sx={{ width: '100%', maxWidth: 300, mx: 'auto', mt: 2 }}>
              <LinearProgress 
                variant="determinate" 
                value={uploadProgress} 
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {Math.round(uploadProgress)}% complete
              </Typography>
            </Box>
          </Box>
        ) : (
          <Box>
            <AttachFile sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Typography variant="h6" gutterBottom>
              Drop files here or click to browse
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {disabled 
                ? 'Session ID required for file uploads'
                : 'Supports JPEG, PNG, GIF, WebP, and BMP image files up to 25MB each'
              }
            </Typography>
            <Button
              variant="outlined"
              startIcon={<CloudUpload />}
              onClick={handleBrowseFiles}
              disabled={disabled}
            >
              Choose Files
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default Dropzone;