import { Box } from '@mui/material';
import { useRef } from 'react';
import PDFViewer from '../components/PDFViewer/PDFViewer';

const MerxPDFViewer = () => {
  const formDataRef = useRef<Record<string, any>>({});
  
  console.log('🏗️ MerxPDFViewer - Component initialized with form data tracking');

  const handleFormDataChange = (data: Record<string, any>) => {
    // Merge the new data with existing data
    formDataRef.current = { ...formDataRef.current, ...data };
    console.log('📝 Guest form data updated:', formDataRef.current);
  };

  const getCurrentFormData = () => {
    console.log('📤 MerxPDFViewer - Getting current form data:', formDataRef.current);
    console.log('📤 MerxPDFViewer - Form data keys:', Object.keys(formDataRef.current));
    return formDataRef.current;
  };

  return (
    <Box sx={{ height: '100vh', width: '100vw' }}>
      <PDFViewer 
        pdfUrl="https://qr.md/kb/books/merx.pdf"
        onFormDataChange={handleFormDataChange}
        getCurrentFormData={getCurrentFormData}
      />
    </Box>
  );
};

export default MerxPDFViewer;