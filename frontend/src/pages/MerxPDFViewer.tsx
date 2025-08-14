import { Box } from '@mui/material';
import PDFViewer from '../components/PDFViewer/PDFViewer';

const MerxPDFViewer = () => {
  return (
    <Box sx={{ height: '100vh', width: '100vw' }}>
      <PDFViewer pdfUrl="https://qr.md/kb/books/merx.pdf" />
    </Box>
  );
};

export default MerxPDFViewer;