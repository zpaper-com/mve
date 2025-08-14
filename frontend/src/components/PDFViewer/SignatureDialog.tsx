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
  fieldDimensions?: { width: number; height: number } | null;
}

const SignatureDialog: React.FC<SignatureDialogProps> = ({
  open,
  onClose,
  onSave,
  recipientName = 'Provider',
  fieldDimensions
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);

  // Dynamic canvas dimensions based on field size, with sensible defaults and limits
  const DEFAULT_WIDTH = 400;
  const DEFAULT_HEIGHT = 200;
  const MIN_WIDTH = 200;
  const MIN_HEIGHT = 100;
  const MAX_WIDTH = 600;
  const MAX_HEIGHT = 300;
  
  // Calculate canvas dimensions from field dimensions with aspect ratio preserved
  const calculateCanvasDimensions = () => {
    if (!fieldDimensions) {
      return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    }
    
    // Use field dimensions as base, but apply reasonable limits
    let width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, fieldDimensions.width * 1.2)); // 20% larger than field
    let height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, fieldDimensions.height * 1.2));
    
    // Ensure minimum aspect ratio for usability
    const aspectRatio = width / height;
    if (aspectRatio < 1.5) {
      width = height * 1.5;
    }
    if (aspectRatio > 4) {
      height = width / 4;
    }
    
    return { width: Math.round(width), height: Math.round(height) };
  };
  
  const canvasDimensions = calculateCanvasDimensions();
  const CANVAS_WIDTH = canvasDimensions.width;
  const CANVAS_HEIGHT = canvasDimensions.height;

  // Initialize canvas
  useEffect(() => {
    if (open && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Set canvas size
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
        
        // Set drawing properties - blue, thicker lines
        ctx.strokeStyle = '#1976d2'; // Material-UI blue
        ctx.lineWidth = 3; // Thicker line
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Clear canvas with white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Add subtle border
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Reset drawing properties - blue, thicker lines
        ctx.strokeStyle = '#1976d2'; // Material-UI blue
        ctx.lineWidth = 3; // Thicker line
      }
      setHasSignature(false);
    }
  }, [open, CANVAS_WIDTH, CANVAS_HEIGHT]);

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
    
    // Reset drawing properties - blue, thicker lines
    ctx.strokeStyle = '#1976d2'; // Material-UI blue
    ctx.lineWidth = 3; // Thicker line
    
    setHasSignature(false);
  }, [CANVAS_WIDTH, CANVAS_HEIGHT]);

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
        {fieldDimensions && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Canvas sized for {Math.round(fieldDimensions.width)}x{Math.round(fieldDimensions.height)}px field
          </Typography>
        )}
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