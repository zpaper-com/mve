import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { pdfService } from '../services/api';
import { usePDFStore } from '../store';

export const usePDFViewer = (pdfUrl: string) => {
  const {
    setLoading,
    setError,
  } = usePDFStore();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pdf-document', pdfUrl],
    queryFn: async () => {
      try {
        // Always use fetch for now to avoid service dependencies
        const response = await fetch(pdfUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to load PDF: ${response.status} ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        return arrayBuffer;
      } catch (err) {
        console.error('PDF loading error:', err);
        throw err;
      }
    },
    enabled: !!pdfUrl,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });

  // Sync React Query state with Zustand store
  React.useEffect(() => {
    setLoading(isLoading);
    if (error) {
      setError(error.message);
    } else {
      setError(null);
    }
  }, [isLoading, error, setLoading, setError]);

  return {
    pdfData: data,
    isLoading,
    error,
    refetch,
  };
};

export const usePDFNavigation = () => {
  const {
    currentPage,
    totalPages,
    setCurrentPage,
  } = usePDFStore();

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  return {
    currentPage,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    canGoNext: currentPage < totalPages,
    canGoPrev: currentPage > 1,
  };
};

export const usePDFZoom = () => {
  const { zoomLevel, setZoomLevel } = usePDFStore();

  const zoomIn = (step: number = 25) => {
    setZoomLevel(Math.min(400, zoomLevel + step));
  };

  const zoomOut = (step: number = 25) => {
    setZoomLevel(Math.max(25, zoomLevel - step));
  };

  const setZoom = (zoom: number) => {
    setZoomLevel(Math.max(25, Math.min(400, zoom)));
  };

  const resetZoom = () => {
    setZoomLevel(100);
  };

  return {
    zoomLevel,
    zoomIn,
    zoomOut,
    setZoom,
    resetZoom,
    canZoomIn: zoomLevel < 400,
    canZoomOut: zoomLevel > 25,
  };
};