import React, { useEffect, useCallback, useRef } from 'react';
import {
  Box,
  IconButton,
  Typography,
  ButtonGroup,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  ZoomIn,
  ZoomOut,
  ZoomOutMap,
  FitScreen,
} from '@mui/icons-material';
import { usePDFStore } from '../../store';

interface ZoomControlsProps {
  variant?: 'toolbar' | 'floating';
}

const ZOOM_LEVELS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

const ZoomControls: React.FC<ZoomControlsProps> = ({ variant = 'toolbar' }) => {
  const { zoomLevel, setZoomLevel } = usePDFStore();
  const touchRef = useRef<{ distance: number; scale: number } | null>(null);

  // Zoom functions
  const zoomIn = useCallback(() => {
    const currentIndex = ZOOM_LEVELS.findIndex(level => level >= zoomLevel);
    const nextIndex = Math.min(currentIndex + 1, ZOOM_LEVELS.length - 1);
    setZoomLevel(ZOOM_LEVELS[nextIndex]);
  }, [zoomLevel, setZoomLevel]);

  const zoomOut = useCallback(() => {
    const currentIndex = ZOOM_LEVELS.findIndex(level => level > zoomLevel) - 1;
    const prevIndex = Math.max(currentIndex - 1, 0);
    setZoomLevel(ZOOM_LEVELS[prevIndex]);
  }, [zoomLevel, setZoomLevel]);

  const fitToWidth = useCallback(() => {
    // This would need to be calculated based on container width
    // For now, set to a reasonable default
    setZoomLevel(100);
  }, [setZoomLevel]);

  const actualSize = useCallback(() => {
    setZoomLevel(100);
  }, [setZoomLevel]);

  const handleZoomSelect = useCallback((value: number) => {
    setZoomLevel(value);
  }, [setZoomLevel]);

  // Touch gesture handling for pinch-to-zoom
  const handleTouchStart = useCallback((event: TouchEvent) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      touchRef.current = {
        distance,
        scale: zoomLevel
      };
    }
  }, [zoomLevel]);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (event.touches.length === 2 && touchRef.current) {
      event.preventDefault();
      
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      const scaleChange = distance / touchRef.current.distance;
      const newScale = Math.max(25, Math.min(400, touchRef.current.scale * scaleChange));
      
      setZoomLevel(newScale);
    }
  }, [setZoomLevel]);

  const handleTouchEnd = useCallback((event: TouchEvent) => {
    if (event.touches.length < 2) {
      touchRef.current = null;
    }
  }, []);

  // Add touch event listeners
  useEffect(() => {
    const element = document.body;
    
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const canZoomIn = zoomLevel < 400;
  const canZoomOut = zoomLevel > 25;

  if (variant === 'floating') {
    return (
      <Box
        sx={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 1000,
          backgroundColor: 'background.paper',
          borderRadius: 1,
          boxShadow: 2,
          p: 1,
        }}
      >
        <ButtonGroup orientation="vertical" variant="outlined" size="small">
          <Tooltip title="Zoom In">
            <IconButton onClick={zoomIn} disabled={!canZoomIn}>
              <ZoomIn />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom Out">
            <IconButton onClick={zoomOut} disabled={!canZoomOut}>
              <ZoomOut />
            </IconButton>
          </Tooltip>
          <Tooltip title="Fit to Width">
            <IconButton onClick={fitToWidth}>
              <FitScreen />
            </IconButton>
          </Tooltip>
          <Tooltip title="Actual Size">
            <IconButton onClick={actualSize}>
              <ZoomOutMap />
            </IconButton>
          </Tooltip>
        </ButtonGroup>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Tooltip title="Zoom Out">
        <IconButton
          color="inherit"
          onClick={zoomOut}
          disabled={!canZoomOut}
          size="small"
        >
          <ZoomOut />
        </IconButton>
      </Tooltip>
      
      <FormControl size="small" sx={{ minWidth: 80 }}>
        <Select
          value={ZOOM_LEVELS.find(level => level >= zoomLevel) || zoomLevel}
          onChange={(e) => handleZoomSelect(Number(e.target.value))}
          sx={{
            color: 'inherit',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(255, 255, 255, 0.3)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(255, 255, 255, 0.5)',
            },
            '& .MuiSelect-icon': {
              color: 'inherit',
            },
          }}
        >
          {ZOOM_LEVELS.map((level) => (
            <MenuItem key={level} value={level}>
              {level}%
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      
      <Tooltip title="Zoom In">
        <IconButton
          color="inherit"
          onClick={zoomIn}
          disabled={!canZoomIn}
          size="small"
        >
          <ZoomIn />
        </IconButton>
      </Tooltip>
      
      <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5 }}>
        <Tooltip title="Fit to Width">
          <IconButton
            color="inherit"
            onClick={fitToWidth}
            size="small"
          >
            <FitScreen />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Actual Size (100%)">
          <IconButton
            color="inherit"
            onClick={actualSize}
            size="small"
          >
            <ZoomOutMap />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default ZoomControls;