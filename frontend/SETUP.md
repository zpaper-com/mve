# MVE Frontend - Setup Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open browser:**
   Navigate to `http://localhost:3000`

## Key Features

- **PDF Viewer** at `/merx` route loads `https://qr.md/kb/books/merx.pdf`
- **Send To Dialog** creates sequential workflows with up to 10 recipients
- **Attachment Dialog** supports drag-and-drop file upload (images, PDFs)
- **Zustand** stores for PDF, Workflow, and Attachment state
- **React Query** for API state management
- **MUI** components with custom theme
- **React Hook Form + Zod** for type-safe forms

## Technology Stack

- Vite + React + TypeScript
- MUI v5 for UI components
- Zustand for client state
- React Query for server state  
- React Hook Form + zod for forms
- React Router v6 for routing
- PDF.js for PDF rendering

## Component Structure

```
components/
├── PDFViewer/
│   ├── PDFViewer.tsx       # Main PDF component
│   ├── PDFToolbar.tsx      # Zoom, navigation, actions
│   └── ThumbnailPanel.tsx  # Page thumbnails
├── SendToDialog/
│   ├── SendToDialog.tsx    # Multi-step workflow dialog
│   ├── RecipientForm.tsx   # Add recipients form
│   └── WorkflowSummary.tsx # Review workflow
└── AttachmentDialog/
    ├── AttachmentDialog.tsx # File upload dialog
    ├── Dropzone.tsx        # Drag-drop upload
    └── AttachmentList.tsx  # File management
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
VITE_API_BASE_URL=http://localhost:3001/api
VITE_MAX_FILE_SIZE=26214400
VITE_MAX_RECIPIENTS=10
```

## Available Scripts

- `npm run dev` - Development server (port 3000)
- `npm run build` - Production build
- `npm run preview` - Preview production build
- `npm run type-check` - TypeScript validation
- `npm run lint` - ESLint checking