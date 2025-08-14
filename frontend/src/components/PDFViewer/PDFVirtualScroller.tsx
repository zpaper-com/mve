/**
 * PDF Virtual Scroller Component
 * 
 * Provides virtual scrolling for large PDF documents to improve performance
 * by only rendering visible pages and a small buffer around them.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFPerformanceService } from '../../services/pdfPerformanceService';
import { usePDFStore } from '../../store';

interface VirtualScrollerProps {
  pdfDocument: PDFDocumentProxy;
  performanceService: PDFPerformanceService;
  containerHeight: number;
  zoomLevel: number;
  onPageChange: (pageNumber: number) => void;
}

interface VirtualItem {
  index: number;
  pageNumber: number;
  top: number;
  height: number;
  visible: boolean;
  rendered: boolean;
  canvas?: HTMLCanvasElement;
}

const PDFVirtualScroller: React.FC<VirtualScrollerProps> = ({
  pdfDocument,
  performanceService,
  containerHeight,
  zoomLevel,
  onPageChange,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  
  const [virtualItems, setVirtualItems] = useState<VirtualItem[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [totalHeight, setTotalHeight] = useState(0);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [renderingPages, setRenderingPages] = useState<Set<number>>(new Set());

  // Initialize virtual items
  useEffect(() => {
    if (!pdfDocument || !performanceService) return;

    const initializeItems = async () => {
      const items: VirtualItem[] = [];
      let currentTop = 0;
      
      // Get first page to estimate dimensions
      const firstPage = await pdfDocument.getPage(1);
      const viewport = firstPage.getViewport({ scale: zoomLevel / 100 });
      const baseHeight = viewport.height;
      const pageMargin = 20;

      for (let i = 1; i <= pdfDocument.numPages; i++) {
        items.push({
          index: i - 1,
          pageNumber: i,
          top: currentTop,
          height: baseHeight,
          visible: false,
          rendered: false,
        });
        currentTop += baseHeight + pageMargin;
      }

      setVirtualItems(items);
      setTotalHeight(currentTop);
    };

    initializeItems();
  }, [pdfDocument, performanceService, zoomLevel]);

  // Calculate visible items
  const calculateVisibleItems = useCallback(() => {
    if (!scrollRef.current) return;

    const scrollTop = scrollRef.current.scrollTop;
    const containerHeight = scrollRef.current.clientHeight;
    const bufferSize = Math.min(3, Math.ceil(containerHeight / 800)); // Buffer 3 pages or based on container

    let start = -1;
    let end = -1;

    // Find visible range
    for (let i = 0; i < virtualItems.length; i++) {
      const item = virtualItems[i];
      const itemTop = item.top;
      const itemBottom = item.top + item.height;

      if (itemBottom >= scrollTop && itemTop <= scrollTop + containerHeight) {
        if (start === -1) start = i;
        end = i;
      }
    }

    // Expand range for buffer
    const bufferedStart = Math.max(0, start - bufferSize);
    const bufferedEnd = Math.min(virtualItems.length - 1, end + bufferSize);

    setVisibleRange({ start: bufferedStart, end: bufferedEnd });
    setScrollTop(scrollTop);

    // Update visible flags and trigger rendering
    const updatedItems = virtualItems.map((item, index) => ({
      ...item,
      visible: index >= bufferedStart && index <= bufferedEnd,
    }));

    setVirtualItems(updatedItems);

    // Render visible pages
    for (let i = bufferedStart; i <= bufferedEnd; i++) {
      const item = updatedItems[i];
      if (!item.rendered && !renderingPages.has(item.pageNumber)) {
        renderPage(item);
      }
    }

    // Update current page based on scroll position
    const currentPageItem = virtualItems.find(item => 
      scrollTop >= item.top && scrollTop < item.top + item.height
    );
    
    if (currentPageItem) {
      onPageChange(currentPageItem.pageNumber);
    }

  }, [virtualItems, renderingPages, onPageChange]);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    requestAnimationFrame(calculateVisibleItems);
  }, [calculateVisibleItems]);

  // Set up scroll listener
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial calculation
    calculateVisibleItems();

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll, calculateVisibleItems]);

  // Render individual page
  const renderPage = useCallback(async (item: VirtualItem) => {
    if (!performanceService || renderingPages.has(item.pageNumber)) return;

    setRenderingPages(prev => new Set(prev).add(item.pageNumber));

    try {
      const scale = zoomLevel / 100;
      const canvas = await performanceService.queuePageRender(
        item.pageNumber,
        item.visible ? 1 : 0.5, // Higher priority for visible pages
        scale
      );

      // Update item with rendered canvas
      setVirtualItems(prev => prev.map(prevItem => 
        prevItem.pageNumber === item.pageNumber 
          ? { ...prevItem, rendered: true, canvas, height: canvas.height }
          : prevItem
      ));

      // Update container for item
      const container = itemsRef.current.get(item.pageNumber);
      if (container && canvas) {
        // Clear previous content
        container.innerHTML = '';
        
        // Add canvas
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        canvas.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
        canvas.style.border = '1px solid #ccc';
        canvas.style.backgroundColor = 'white';
        
        container.appendChild(canvas);
      }

    } catch (error) {
      console.error(`Failed to render page ${item.pageNumber}:`, error);
    } finally {
      setRenderingPages(prev => {
        const newSet = new Set(prev);
        newSet.delete(item.pageNumber);
        return newSet;
      });
    }
  }, [performanceService, zoomLevel]);

  // Scroll to specific page
  const scrollToPage = useCallback((pageNumber: number) => {
    const item = virtualItems.find(item => item.pageNumber === pageNumber);
    if (item && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: item.top,
        behavior: 'smooth',
      });
    }
  }, [virtualItems]);

  // Expose scroll to page function
  useEffect(() => {
    (window as any).__pdfScrollToPage = scrollToPage;
    return () => {
      delete (window as any).__pdfScrollToPage;
    };
  }, [scrollToPage]);

  return (
    <Box
      ref={scrollRef}
      sx={{
        height: '100%',
        overflow: 'auto',
        position: 'relative',
        backgroundColor: '#f5f5f5',
      }}
    >
      {/* Virtual container with total height */}
      <Box sx={{ height: totalHeight, position: 'relative' }}>
        {virtualItems
          .filter(item => item.visible)
          .map(item => (
            <Box
              key={item.pageNumber}
              ref={el => {
                if (el) {
                  itemsRef.current.set(item.pageNumber, el);
                }
              }}
              sx={{
                position: 'absolute',
                top: item.top,
                left: 0,
                right: 0,
                height: item.height,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '10px',
                boxSizing: 'border-box',
              }}
            >
              {!item.rendered && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    minHeight: 200,
                    backgroundColor: 'white',
                    border: '1px solid #ccc',
                    borderRadius: 1,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  <CircularProgress size={40} />
                  <Typography variant="body2" sx={{ mt: 2 }}>
                    Loading Page {item.pageNumber}...
                  </Typography>
                </Box>
              )}
            </Box>
          ))}
      </Box>

      {/* Page indicator */}
      <Box
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: 1,
          fontSize: '0.75rem',
          zIndex: 1000,
        }}
      >
        {virtualItems.find(item => 
          scrollTop >= item.top && scrollTop < item.top + item.height
        )?.pageNumber || 1} / {pdfDocument.numPages}
      </Box>
    </Box>
  );
};

export default PDFVirtualScroller;