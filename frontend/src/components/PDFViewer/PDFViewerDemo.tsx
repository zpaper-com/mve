/**
 * PDF Viewer Demo Component
 * 
 * Demonstrates the comprehensive PDF viewer functionality with all features
 * including form interaction, performance monitoring, and virtual scrolling.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Card,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import PDFViewer from './PDFViewer';
// import { DEFAULT_PDF_CONFIG } from '../../types/pdf';

// Fallback config to avoid errors
const DEFAULT_PDF_CONFIG = {
  enableScripting: false,
  hideSignatureFields: true,
  autoSave: true,
  saveDebounceMs: 1000,
  maxCanvasPixels: 16777216,
  cacheSize: 20,
  prefetchPages: 3,
  verbosity: 1,
};

interface WorkflowData {
  workflow: {
    id: string;
    uuid: string;
    documentUrl: string;
    status: string;
    recipients: Array<{
      id: number;
      recipient_name: string;
      email: string;
      mobile: string;
      recipient_type: string;
      order_index: number;
      status: string;
    }>;
    notifications: Array<any>;
  };
}

const PDFViewerDemo: React.FC = () => {
  const { uuid } = useParams<{ uuid?: string }>();
  
  // Using the requested Merx PDF
  const [pdfUrl] = useState('/merx.pdf');
  const [enableVirtualScrolling, setEnableVirtualScrolling] = useState(true);
  const [enableFormInteraction, setEnableFormInteraction] = useState(true);
  const [documentInfo, setDocumentInfo] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errorInfo, setErrorInfo] = useState<string | null>(null);
  const [performanceInfo, setPerformanceInfo] = useState<any>(null);
  
  // Workflow context
  const [workflowData, setWorkflowData] = useState<WorkflowData | null>(null);
  const [isWorkflowContext, setIsWorkflowContext] = useState(false);
  const [currentRecipientIndex, setCurrentRecipientIndex] = useState<number | null>(null);
  const [isLastRecipient, setIsLastRecipient] = useState(false);
  const [currentRecipientToken, setCurrentRecipientToken] = useState<string | null>(null);

  // Fetch recipient data if token is present
  useEffect(() => {
    if (uuid) {
      setIsWorkflowContext(true);
      fetchRecipientData(uuid);
    } else {
      setIsWorkflowContext(false);
      setWorkflowData(null);
    }
  }, [uuid]);

  const fetchRecipientData = async (token: string) => {
    try {
      const response = await fetch(`/api/recipients/${token}`);
      if (response.ok) {
        const data = await response.json();
        
        // Convert recipient data to workflow data format for compatibility
        const workflowData = {
          workflow: {
            id: data.recipient.workflow.id,
            uuid: data.recipient.workflow.uuid,
            documentUrl: data.recipient.workflow.documentUrl,
            status: data.recipient.workflow.status,
            recipients: [data.recipient] // Only current recipient for now
          }
        };
        
        setWorkflowData(workflowData);
        setCurrentRecipientIndex(data.recipient.position.current);
        setIsLastRecipient(data.recipient.position.isLast);
        setCurrentRecipientToken(data.recipient.uniqueToken);
        
        console.log(`🔑 Recipient context: ${data.recipient.name} (${data.recipient.position.current + 1}/${data.recipient.position.total}), isLast: ${data.recipient.position.isLast}`);
      } else {
        console.error('Failed to fetch recipient data:', response.statusText);
        setErrorInfo('Failed to load recipient information');
      }
    } catch (error) {
      console.error('Error fetching recipient data:', error);
      setErrorInfo('Failed to load recipient information');
    }
  };

  // Handle PDF load event
  const handlePDFLoad = useCallback((document: PDFDocumentProxy) => {
    setDocumentInfo({
      numPages: document.numPages,
      fingerprint: document.fingerprints?.[0] || 'Unknown',
      loadingTask: 'Completed',
    });
    setErrorInfo(null);
    console.log('PDF loaded successfully:', document);
  }, []);

  // Handle PDF error event
  const handlePDFError = useCallback((error: Error) => {
    setErrorInfo(error.message);
    console.error('PDF load error:', error);
  }, []);

  // Handle page change event
  const handlePageChange = useCallback((pageNumber: number) => {
    console.log('Page changed to:', pageNumber);
  }, []);

  // Handle zoom change event
  const handleZoomChange = useCallback((zoomLevel: number) => {
    console.log('Zoom changed to:', zoomLevel);
  }, []);

  // Handle form data change event
  const handleFormDataChange = useCallback((data: Record<string, any>) => {
    setFormData(data);
    console.log('Form data updated:', data);
  }, []);

  // Custom PDF configuration
  const customConfig = {
    ...DEFAULT_PDF_CONFIG,
    enableScripting: false, // Security: disable JavaScript
    hideSignatureFields: true, // MVE requirement
    autoSave: true,
    saveDebounceMs: 1000,
    maxCanvasPixels: 16777216, // 4096x4096
    cacheSize: 20,
    prefetchPages: 3,
    verbosity: 1,
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>


      {/* Main PDF Viewer */}
      <Box sx={{ flex: 1, mx: 1, mb: 1, position: 'relative', minHeight: 0 }}>
        <Card sx={{ height: '100%', overflow: 'hidden' }}>
          <PDFViewer
            pdfUrl={pdfUrl}
            onLoad={handlePDFLoad}
            onError={handlePDFError}
            onPageChange={handlePageChange}
            onZoomChange={handleZoomChange}
            onFormDataChange={handleFormDataChange}
            config={customConfig}
            enableVirtualScrolling={enableVirtualScrolling}
            enableFormInteraction={enableFormInteraction}
            workflowContext={{
              isWorkflowContext,
              workflowData,
              currentRecipientIndex,
              isLastRecipient,
              currentRecipientToken,
            }}
          />
        </Card>
      </Box>
    </Box>
  );
};

export default PDFViewerDemo;