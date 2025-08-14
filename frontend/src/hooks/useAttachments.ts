import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attachmentService } from '../services/api';
import { useAttachmentStore } from '../store';

export interface AttachmentData {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedBy?: string;
}

export const useAttachments = (sessionId: string | null) => {
  const { setAttachments } = useAttachmentStore();

  const query = useQuery({
    queryKey: ['attachments', sessionId],
    queryFn: () => attachmentService.getAttachments(sessionId!),
    enabled: !!sessionId,
  });

  // Handle data updates with useEffect
  React.useEffect(() => {
    if (query.data?.data) {
      // Convert API response to store format
      const attachments = query.data.data.map((att: AttachmentData) => ({
        id: att.id,
        filename: att.fileName,
        size: att.fileSize,
        type: att.fileType,
        uploadedAt: att.uploadedAt.toString(),
      }));
      setAttachments(attachments);
    }
  }, [query.data, setAttachments]);

  return query;
};

export const useUploadAttachment = (sessionId: string | null) => {
  const queryClient = useQueryClient();
  const { addAttachment, setUploading, setUploadProgress } = useAttachmentStore();

  return useMutation({
    mutationFn: async ({ file, retryCount = 0 }: { file: File; retryCount?: number }) => {
      if (!sessionId) throw new Error('No session ID');
      
      setUploading(true);
      setUploadProgress(0);

      const maxRetries = 3;
      let lastError: Error;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Step 1: Get presigned URL
          const presignedResponse = await attachmentService.getPresignedUploadUrl({
            sessionId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          });

          if (!presignedResponse.data) {
            throw new Error('Failed to get presigned URL');
          }

          const { attachment, uploadUrl } = presignedResponse.data;

          // Step 2: Upload directly to S3 with retry logic
          await attachmentService.uploadToS3(
            uploadUrl,
            file,
            (progress) => setUploadProgress(progress)
          );

          // Step 3: Confirm upload
          const confirmResponse = await attachmentService.confirmUpload(attachment.id);

          return confirmResponse.data;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Upload failed');
          
          // Don't retry on validation errors or non-recoverable errors
          if (error instanceof Error && (
            error.message.includes('validation') ||
            error.message.includes('not found') ||
            error.message.includes('invalid')
          )) {
            throw error;
          }

          // If this was the last attempt, throw the error
          if (attempt === maxRetries) {
            throw lastError;
          }

          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          console.log(`Upload attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        }
      }

      throw lastError!;
    },
    onSuccess: (attachment) => {
      if (attachment) {
        const newAttachment = {
          id: attachment.id,
          filename: attachment.fileName,
          size: attachment.fileSize,
          type: attachment.fileType,
          uploadedAt: attachment.uploadedAt.toString(),
        };
        addAttachment(newAttachment);
        
        // Refetch attachments list
        queryClient.invalidateQueries({ queryKey: ['attachments', sessionId] });
      }
    },
    onError: (error) => {
      console.error('Failed to upload attachment:', error);
    },
    onSettled: () => {
      setUploading(false);
      setUploadProgress(0);
    },
  });
};

export const useDeleteAttachment = (sessionId: string | null) => {
  const queryClient = useQueryClient();
  const { removeAttachment } = useAttachmentStore();

  return useMutation({
    mutationFn: (attachmentId: string) => attachmentService.deleteAttachment(attachmentId),
    onSuccess: (_, attachmentId) => {
      removeAttachment(attachmentId);
      
      // Refetch attachments list
      queryClient.invalidateQueries({ queryKey: ['attachments', sessionId] });
    },
    onError: (error) => {
      console.error('Failed to delete attachment:', error);
    },
  });
};

export const useDownloadAttachment = () => {
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const response = await attachmentService.getDownloadUrl(attachmentId);
      if (response.data?.downloadUrl) {
        // Create a temporary link and click it to download
        const link = document.createElement('a');
        link.href = response.data.downloadUrl;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
    onError: (error) => {
      console.error('Failed to download attachment:', error);
    },
  });
};