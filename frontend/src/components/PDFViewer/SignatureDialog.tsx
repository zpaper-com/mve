import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Alert,
  Divider,
} from '@mui/material';
import {
  Clear,
  Edit,
  Save,
  Cancel,
} from '@mui/icons-material';

interface SignatureDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (signatureDataUrl: string) => void;
  recipientName?: string;
}

const SignatureDialog: React.FC<SignatureDialogProps> = ({
  open,
  onClose,
  onSave,
  recipientName = 'Provider'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);

  // Canvas dimensions
  const CANVAS_WIDTH = 400;
  const CANVAS_HEIGHT = 200;

  // Initialize canvas
  useEffect(() => {
    if (open && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Set canvas size
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
        
        // Set drawing properties
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Clear canvas with white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Add subtle border
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Reset drawing properties
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
      }
      setHasSignature(false);
    }
  }, [open]);

  // Get mouse/touch position relative to canvas
  const getEventPos = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in event) {
      // Touch event
      const touch = event.touches[0] || event.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    } else {
      // Mouse event
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
      };
    }
  }, []);

  // Start drawing
  const startDrawing = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    const pos = getEventPos(event);
    setIsDrawing(true);
    setLastPoint(pos);
    setHasSignature(true);
  }, [getEventPos]);

  // Draw line
  const draw = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !lastPoint || !canvasRef.current) return;
    
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentPos = getEventPos(event);
    
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.stroke();
    
    setLastPoint(currentPos);
  }, [isDrawing, lastPoint, getEventPos]);

  // Stop drawing
  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    setLastPoint(null);
  }, []);

  // Clear canvas
  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear and reset canvas
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Add border
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Reset drawing properties
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    
    setHasSignature(false);
  }, []);

  // Save signature
  const saveSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    
    // Get signature as data URL
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
    onClose();
  }, [hasSignature, onSave, onClose]);

  // Handle dialog close
  const handleClose = useCallback(() => {
    clearSignature();
    onClose();
  }, [clearSignature, onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '80vh',
        },
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Edit color="primary" />
          <Typography variant="h6" component="div">
            Digital Signature
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {recipientName}, please sign below to complete the form
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Draw your signature in the area below using your mouse or touch screen.
          </Alert>
          
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                border: '2px solid #E0E0E0',
                borderRadius: '4px',
                cursor: 'crosshair',
                maxWidth: '100%',
                height: 'auto',
                touchAction: 'none', // Prevent scrolling on touch
              }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            
            <Button
              variant="outlined"
              startIcon={<Clear />}
              onClick={clearSignature}
              disabled={!hasSignature}
              size="small"
            >
              Clear Signature
            </Button>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />
        
        <Typography variant="body2" color="text.secondary" align="center">
          Your signature will be attached to this form submission and stored securely.
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} startIcon={<Cancel />}>
          Cancel
        </Button>
        <Button
          onClick={saveSignature}
          variant="contained"
          startIcon={<Save />}
          disabled={!hasSignature}
        >
          Save Signature
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SignatureDialog;