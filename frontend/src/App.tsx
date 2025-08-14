import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, GlobalStyles } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Theme
import { theme } from './theme';

// Import the actual PDF Viewer Demo
import PDFViewerDemo from './components/PDFViewer/PDFViewerDemo';
import AdminPanel from './components/AdminPanel/AdminPanel';

// Simple demo component
function SimpleHome() {
  return (
    <div style={{ padding: 20 }}>
      <h1>MVE PDF Viewer</h1>
      <p>Available routes:</p>
      <ul>
        <li><a href="/pdf">PDF Viewer Demo</a></li>
        <li><a href="/merx">Legacy PDF Route</a> (redirects to /pdf)</li>
        <li><a href="/s/sample123">Short URL Demo</a> (workflow session URL)</li>
        <li><a href="/admin">Admin Panel</a> (view events and edit templates)</li>
      </ul>
    </div>
  );
}

// Global styles
const globalStyles = {
  '*': {
    boxSizing: 'border-box',
  },
  html: {
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    height: '100%',
    width: '100%',
  },
  body: {
    height: '100%',
    width: '100%',
  },
  '#root': {
    height: '100%',
    width: '100%',
  },
  // Custom scrollbar styles
  '*::-webkit-scrollbar': {
    width: 8,
    height: 8,
  },
  '*::-webkit-scrollbar-track': {
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 4,
  },
  '*::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 4,
    '&:hover': {
      backgroundColor: 'rgba(0,0,0,0.3)',
    },
  },
};

// React Query client configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry for 4xx errors
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: 'always',
    },
    mutations: {
      retry: false,
    },
  },
});

// Loading fallback component
const PageLoader: React.FC = () => (
  <div>Loading...</div>
);

// Main App Routes Component
const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<SimpleHome />} />
      <Route path="/pdf/:sessionId?" element={<PDFViewerDemo />} />
      <Route path="/pdf" element={<PDFViewerDemo />} />
      <Route path="/merx" element={<Navigate to="/pdf" replace />} />
      
      {/* Short URL for workflow sessions */}
      <Route path="/s/:uuid" element={<PDFViewerDemo />} />
      
      {/* Admin Panel */}
      <Route path="/admin" element={<AdminPanel />} />
      
      {/* 404 Not Found */}
      <Route path="*" element={<div>Page Not Found</div>} />
    </Routes>
  );
};

// Main App Component
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles styles={globalStyles} />
        <Router>
          <Suspense fallback={<PageLoader />}>
            <AppRoutes />
          </Suspense>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;