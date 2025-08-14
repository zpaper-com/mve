import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Skeleton,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { usePDFStore } from '../../store';

interface ThumbnailPanelProps {
  pdfDocument: PDFDocumentProxy | null;
}

interface ThumbnailData {
  pageNumber: number;
  imageData: string | null;
  loading: boolean;
}

const ThumbnailPanel: React.FC<ThumbnailPanelProps> = ({ pdfDocument }) => {
  const { currentPage, totalPages, setCurrentPage, toggleThumbnails } = usePDFStore();
  const [thumbnails, setThumbnails] = useState<ThumbnailData[]>([]);

  useEffect(() => {
    if (!pdfDocument) return;

    // Initialize thumbnail data
    const initialThumbnails: ThumbnailData[] = Array.from(
      { length: totalPages },
      (_, index) => ({
        pageNumber: index + 1,
        imageData: null,
        loading: true,
      })
    );
    setThumbnails(initialThumbnails);

    // Generate thumbnails
    const generateThumbnails = async () => {
      const updatedThumbnails = [...initialThumbnails];

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          const page = await pdfDocument.getPage(pageNum);
          const scale = 0.3; // Small scale for thumbnails
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if (context) {
            const renderContext = {
              canvasContext: context,
              viewport: viewport,
              canvas: canvas,
            };

            await page.render(renderContext).promise;
            const imageData = canvas.toDataURL();

            updatedThumbnails[pageNum - 1] = {
              pageNumber: pageNum,
              imageData,
              loading: false,
            };

            setThumbnails([...updatedThumbnails]);
          }
        } catch (error) {
          console.error(`Error generating thumbnail for page ${pageNum}:`, error);
          updatedThumbnails[pageNum - 1] = {
            pageNumber: pageNum,
            imageData: null,
            loading: false,
          };
          setThumbnails([...updatedThumbnails]);
        }
      }
    };

    generateThumbnails();
  }, [pdfDocument, totalPages]);

  const handleThumbnailClick = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  return (
    <Box
      sx={{
        width: 200,
        backgroundColor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography variant="subtitle2">Pages</Typography>
        <IconButton size="small" onClick={toggleThumbnails}>
          <Close />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {thumbnails.map((thumbnail) => (
            <Box key={thumbnail.pageNumber}>
              <Paper
                sx={{
                  p: 1,
                  cursor: 'pointer',
                  border: currentPage === thumbnail.pageNumber ? 2 : 1,
                  borderColor: currentPage === thumbnail.pageNumber ? 'primary.main' : 'divider',
                  '&:hover': {
                    borderColor: 'primary.main',
                  },
                }}
                onClick={() => handleThumbnailClick(thumbnail.pageNumber)}
              >
                <Box sx={{ textAlign: 'center' }}>
                  {thumbnail.loading ? (
                    <Skeleton variant="rectangular" width="100%" height={120} />
                  ) : thumbnail.imageData ? (
                    <img
                      src={thumbnail.imageData}
                      alt={`Page ${thumbnail.pageNumber}`}
                      style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        height: 120,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'grey.100',
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Error
                      </Typography>
                    </Box>
                  )}
                  <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
                    {thumbnail.pageNumber}
                  </Typography>
                </Box>
              </Paper>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default ThumbnailPanel;