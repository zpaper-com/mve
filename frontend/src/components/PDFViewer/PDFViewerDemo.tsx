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
import { usePDFStore } from '../../store';
// import { DEFAULT_PDF_CONFIG } from '../../types/pdf';

// Import recipient type configuration for title display
const recipientTypeConfig = {
  PRESCRIBER: {
    label: 'Provider',
    color: '#2e7d32',
    bgcolor: '#e8f5e8',
  },
  PATIENT: {
    label: 'Patient',
    color: '#1976d2',
    bgcolor: '#e3f2fd',
  },
  PHARMACY: {
    label: 'Pharmacy',
    color: '#ed6c02',
    bgcolor: '#fff3e0',
  },
  INSURANCE: {
    label: 'Insurance',
    color: '#9c27b0',
    bgcolor: '#f3e5f5',
  },
  MEDSTAFF: {
    label: 'Med-Staff',
    color: '#d32f2f',
    bgcolor: '#ffebee',
  },
  CUSTOM: {
    label: 'Other',
    color: '#616161',
    bgcolor: '#f5f5f5',
  },
} as const;

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
  const { formData: storeFormData } = usePDFStore();
  
  // Using the requested Merx PDF (use remote URL to match MerxPDFViewer)
  const [pdfUrl] = useState('https://qr.md/kb/books/merx.pdf');
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
  const [currentRecipientType, setCurrentRecipientType] = useState<string | null>(null);
  const [currentRecipientName, setCurrentRecipientName] = useState<string | null>(null);

  // Fetch recipient data if token is present
  useEffect(() => {
    if (uuid) {
      setIsWorkflowContext(true);
      fetchRecipientData(uuid);
    } else {
      setIsWorkflowContext(false);
      setWorkflowData(null);
      // Set title for guest users
      document.title = 'MVE Sprkz - Guest';
    }
  }, [uuid]);

  const fetchRecipientData = async (token: string) => {
    try {
      const response = await fetch(`/api/recipients/${token}`);
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Recipient API response:', data);
        console.log('🔍 Recipient type:', data.recipient?.recipientType);
        
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
        setCurrentRecipientType(data.recipient.recipientType);
        setCurrentRecipientName(data.recipient.name);
        
        console.log('🔍 Set recipient type to:', data.recipient.recipientType);
        console.log('🔍 Set recipient name to:', data.recipient.name);
        
        // Set title for workflow users
        const recipientLabel = recipientTypeConfig[data.recipient.recipientType as keyof typeof recipientTypeConfig]?.label || data.recipient.recipientType;
        document.title = `MVE Sprkz - ${data.recipient.name} (${recipientLabel})`;
        
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
    setFormData(prevData => {
      const newData = {
        ...prevData,
        ...data
      };
      console.log('Form data updated:', data);
      console.log('Current form data after update:', newData);
      return newData;
    });
  }, []);

  // Function to get current form data from store at submit time
  const getCurrentFormData = useCallback(() => {
    console.log('📋 Getting current form data from store:', storeFormData);
    return storeFormData;
  }, [storeFormData]);

  // Custom PDF configuration - context-aware signature field hiding
  const customConfig = {
    ...DEFAULT_PDF_CONFIG,
    enableScripting: false, // Security: disable JavaScript
    hideSignatureFields: isWorkflowContext ? false : true, // Show signature fields in workflow context
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
            onFormDataChange={undefined}
            config={customConfig}
            enableVirtualScrolling={enableVirtualScrolling}
            enableFormInteraction={enableFormInteraction}
            getCurrentFormData={getCurrentFormData}
            workflowContext={{
              isWorkflowContext,
              workflowData,
              currentRecipientIndex,
              isLastRecipient,
              currentRecipientToken,
              currentRecipientType,
              currentRecipientName,
            }}
          />
        </Card>
      </Box>
    </Box>
  );
};

export default PDFViewerDemo;