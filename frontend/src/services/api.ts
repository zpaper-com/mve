import axios, { 
  type AxiosResponse, 
  type AxiosError, 
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

// Define AxiosInstance type locally
type AxiosInstance = typeof axios;

import { config } from '@config';
import { logger } from '@utils/logger';

// API Error class
export class ApiError extends Error {
  public status: number;
  public code?: string;
  public data?: any;
  
  constructor(status: number, message: string, code?: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

// Request/Response interfaces
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  success: boolean;
  timestamp?: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Create axios instance
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: config.api.baseURL,
    timeout: config.api.timeout,
    headers: {
      'Content-Type': 'application/json',
    },
    withCredentials: true, // Include cookies for CSRF
  });

  // Request interceptor
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // Add auth token if available
      const token = getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Add CSRF token if available
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      }

      // Log request in development
      if (import.meta.env.DEV) {
        logger.info('API Request:', {
          method: config.method?.toUpperCase(),
          url: `${config.baseURL}${config.url}`,
          headers: config.headers,
          data: config.data,
        });
      }

      return config;
    },
    (error: AxiosError) => {
      logger.error('Request interceptor error:', error);
      return Promise.reject(error);
    }
  );

  // Response interceptor
  client.interceptors.response.use(
    (response: AxiosResponse): AxiosResponse => {
      // Log response in development
      if (import.meta.env.DEV) {
        logger.info('API Response:', {
          status: response.status,
          url: response.config.url,
          data: response.data,
        });
      }

      return response;
    },
    (error: AxiosError): Promise<never> => {
      const status = error.response?.status || 0;
      const message = error.response?.data?.message || error.message;
      const code = error.response?.data?.code || error.code;
      const data = error.response?.data;

      // Log error
      logger.error('API Error:', {
        status,
        message,
        code,
        url: error.config?.url,
        method: error.config?.method,
      });

      // Handle specific error cases
      switch (status) {
        case 401:
          // Unauthorized - clear auth and redirect to login
          clearAuthToken();
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          break;
        case 403:
          // Forbidden - show access denied
          logger.warn('Access denied to resource');
          break;
        case 429:
          // Rate limited
          logger.warn('Rate limit exceeded');
          break;
        case 500:
          // Server error
          logger.error('Server error occurred');
          break;
        default:
          break;
      }

      throw new ApiError(status, message, code, data);
    }
  );

  return client;
};

// Create the API client instance
export const apiClient = createApiClient();

// Helper functions for token management
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

function getCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('csrf_token') || 
         document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || 
         null;
}

function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token');
  localStorage.removeItem('csrf_token');
}

// Generic API request wrapper
export async function apiRequest<T = any>(
  config: AxiosRequestConfig
): Promise<T> {
  try {
    const response = await apiClient.request<ApiResponse<T>>(config);
    return response.data.data || response.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(0, 'Network error occurred');
  }
}

// Convenience methods
export const api = {
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    apiRequest<T>({ method: 'GET', url, ...config }),

  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> =>
    apiRequest<T>({ method: 'POST', url, data, ...config }),

  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> =>
    apiRequest<T>({ method: 'PUT', url, data, ...config }),

  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> =>
    apiRequest<T>({ method: 'PATCH', url, data, ...config }),

  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    apiRequest<T>({ method: 'DELETE', url, ...config }),
};

// Upload file with progress
export async function uploadFile(
  url: string,
  file: File,
  onProgress?: (progress: number) => void,
  additionalData?: Record<string, any>
): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  
  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
  }

  return apiRequest({
    method: 'POST',
    url,
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: onProgress ? (progressEvent) => {
      const total = progressEvent.total || 1;
      const progress = Math.round((progressEvent.loaded * 100) / total);
      onProgress(progress);
    } : undefined,
  });
}

// Service interfaces
interface CreateWorkflowData {
  documentUrl: string;
  recipients: Array<{
    type: string;
    name: string;
    email: string;
    mobile?: string;
    npi?: string;
  }>;
}

interface WorkflowResponse {
  sessionId: string;
  uniqueUrls: string[];
}

interface AttachmentResponse {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  url: string;
}

// PDF Service
export const pdfService = {
  async getMerxPdf(): Promise<ArrayBuffer> {
    try {
      // For development, fetch directly from the public URL
      const response = await fetch('https://qr.md/kb/books/merx.pdf');
      if (!response.ok) {
        throw new ApiError(response.status, 'Failed to load PDF');
      }
      return response.arrayBuffer();
    } catch (error) {
      logger.error('Failed to load Merx PDF:', error);
      throw error;
    }
  },

  async getPdfDocument(sessionId: string): Promise<ArrayBuffer> {
    const response = await apiClient.get(`/pdf/${sessionId}/document`, {
      responseType: 'arraybuffer',
    });
    return response.data;
  },

  async getPdfThumbnails(sessionId: string): Promise<string[]> {
    return api.get<string[]>(`/pdf/${sessionId}/thumbnails`);
  },

  async saveFormData(sessionId: string, formData: Record<string, any>): Promise<void> {
    return api.post(`/pdf/${sessionId}/form-data`, formData);
  },

  async getFormData(sessionId: string): Promise<Record<string, any>> {
    return api.get<Record<string, any>>(`/pdf/${sessionId}/form-data`);
  },
};

// Workflow Service
export const workflowService = {
  async createWorkflow(data: {
    recipients: Array<{
      recipientType: 'PRESCRIBER' | 'PATIENT' | 'PHARMACY' | 'INSURANCE' | 'CUSTOM';
      partyName?: string;
      email?: string;
      mobile?: string;
      npi?: string;
    }>;
    metadata?: Record<string, any>;
  }): Promise<{
    id: string;
    documentUrl: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    recipients: Array<{
      id: string;
      orderIndex: number;
      recipientType: string;
      partyName?: string;
      email?: string;
      uniqueUrl: string;
      status: string;
    }>;
  }> {
    return api.post('/workflow/create', data);
  },

  async getWorkflow(uniqueUrl: string): Promise<{
    session: {
      id: string;
      documentUrl: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    };
    currentRecipient: {
      id: string;
      orderIndex: number;
      recipientType: string;
      partyName?: string;
      email?: string;
      status: string;
      uniqueUrl: string;
    };
    completedRecipients: Array<any>;
    pendingRecipients: Array<any>;
  }> {
    return api.get(`/workflow/${uniqueUrl}`);
  },

  async submitWorkflow(uniqueUrl: string, formData: Record<string, any>): Promise<{
    session: any;
    currentRecipient: any;
    completedRecipients: Array<any>;
    pendingRecipients: Array<any>;
  }> {
    return api.post(`/workflow/${uniqueUrl}/submit`, { formData });
  },

  async getWorkflowStatus(sessionId: string): Promise<{
    workflow: any;
    stats: {
      totalRecipients: number;
      completedRecipients: number;
      pendingRecipients: number;
      currentStep: number;
      completionRate: number;
    };
  }> {
    return api.get(`/workflow/session/${sessionId}/status`);
  },

  async getWorkflowStats(sessionId: string): Promise<{
    totalRecipients: number;
    completedRecipients: number;
    pendingRecipients: number;
    currentStep: number;
    completionRate: number;
  }> {
    return api.get(`/workflow/session/${sessionId}/stats`);
  },

  async listWorkflows(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{
    workflows: Array<any>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    return api.get('/workflow/list', { params });
  },

  async expireWorkflow(sessionId: string): Promise<void> {
    return api.put(`/workflow/session/${sessionId}/expire`);
  },

  async cancelWorkflow(sessionId: string, reason?: string): Promise<void> {
    return api.post(`/workflow/session/${sessionId}/cancel`, { reason });
  },
};

// Attachment Service with S3 Direct Upload Support
export const attachmentService = {
  // Get presigned URL for direct S3 upload
  async getPresignedUploadUrl(data: {
    sessionId: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }): Promise<ApiResponse<{
    attachment: {
      id: string;
      fileName: string;
      fileType: string;
      fileSize: number;
      s3Key: string;
      uploadedAt: Date;
    };
    uploadUrl: string;
    isMultipart?: boolean;
  }>> {
    const response = await apiClient.post(`/api/attachments/${data.sessionId}/presigned-url`, {
      fileName: data.fileName,
      fileType: data.fileType,
      fileSize: data.fileSize,
    });
    return response.data;
  },

  // Upload directly to S3 using presigned URL with cancellation support
  async uploadToS3(
    uploadUrl: string,
    file: File,
    onProgress?: (progress: number) => void,
    cancelToken?: { cancelled: boolean }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded * 100) / event.total);
            onProgress(progress);
          }
        });
      }

      // Handle cancellation
      if (cancelToken) {
        const checkCancellation = () => {
          if (cancelToken.cancelled) {
            xhr.abort();
            reject(new ApiError(0, 'Upload cancelled by user'));
            return;
          }
          // Check every 100ms
          setTimeout(checkCancellation, 100);
        };
        checkCancellation();
      }

      xhr.addEventListener('load', () => {
        if (cancelToken?.cancelled) {
          reject(new ApiError(0, 'Upload cancelled by user'));
          return;
        }
        
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new ApiError(xhr.status, 'Upload failed'));
        }
      });

      xhr.addEventListener('error', () => {
        if (cancelToken?.cancelled) {
          reject(new ApiError(0, 'Upload cancelled by user'));
        } else {
          reject(new ApiError(0, 'Network error during upload'));
        }
      });

      xhr.addEventListener('abort', () => {
        reject(new ApiError(0, 'Upload cancelled'));
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  },

  // Confirm upload completion
  async confirmUpload(attachmentId: string): Promise<ApiResponse<{
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    s3Key: string;
    uploadedAt: Date;
  }>> {
    const response = await apiClient.post(`/api/attachments/${attachmentId}/confirm`);
    return response.data;
  },

  // Get all attachments for a session
  async getAttachments(sessionId: string): Promise<ApiResponse<Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    uploadedAt: Date;
    uploadedBy?: string;
  }>>> {
    const response = await apiClient.get(`/api/attachments/${sessionId}`);
    return response.data;
  },

  // Get download URL for an attachment
  async getDownloadUrl(attachmentId: string): Promise<ApiResponse<{
    downloadUrl: string;
  }>> {
    const response = await apiClient.get(`/api/attachments/${attachmentId}/url`);
    return response.data;
  },

  // Delete an attachment
  async deleteAttachment(attachmentId: string): Promise<ApiResponse<{
    attachmentId: string;
  }>> {
    const response = await apiClient.delete(`/api/attachments/${attachmentId}`);
    return response.data;
  },

  // Get attachment metadata
  async getAttachmentById(attachmentId: string): Promise<ApiResponse<{
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    uploadedAt: Date;
    uploadedBy?: string;
  }>> {
    const response = await apiClient.get(`/api/attachments/${attachmentId}`);
    return response.data;
  },

  // Legacy upload method (for fallback or direct uploads)
  async uploadAttachment(
    sessionId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<AttachmentResponse> {
    return uploadFile(
      `/api/attachments/${sessionId}/upload`,
      file,
      onProgress,
      { sessionId }
    );
  },

  // Download attachment directly (triggers browser download)
  async downloadAttachment(attachmentId: string): Promise<Blob> {
    const response = await apiClient.get(`/api/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },
};

// Auth Service (simplified - the main auth logic is in AuthContext)
export const authService = {
  async login(credentials: { email: string; password: string }): Promise<{
    user: any;
    accessToken: string;
    refreshToken: string;
    csrfToken: string;
  }> {
    return api.post('/auth/login', credentials);
  },

  async register(data: {
    email: string;
    password: string;
    name: string;
  }): Promise<void> {
    return api.post('/auth/register', data);
  },

  async logout(): Promise<void> {
    return api.post('/auth/logout');
  },

  async refreshToken(): Promise<{ accessToken: string; refreshToken: string }> {
    return api.post('/auth/refresh');
  },

  async getProfile(): Promise<any> {
    return api.get('/auth/profile');
  },

  async updateProfile(data: Partial<any>): Promise<any> {
    return api.patch('/auth/profile', data);
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return api.post('/auth/change-password', { currentPassword, newPassword });
  },

  async resetPassword(email: string): Promise<void> {
    return api.post('/auth/reset-password', { email });
  },

  async verifyEmail(): Promise<void> {
    return api.post('/auth/verify-email');
  },

  async getCsrfToken(): Promise<string> {
    const response = await api.get<{ token: string }>('/auth/csrf-token');
    return response.token;
  },
};

// Health check service
export const healthService = {
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy';
    version: string;
    timestamp: string;
    services: Record<string, 'up' | 'down'>;
  }> {
    return api.get('/health');
  },
};