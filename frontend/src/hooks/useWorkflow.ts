import { useMutation, useQuery } from '@tanstack/react-query';
import { workflowService } from '../services/api';
import { useWorkflowStore } from '../store';

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

export const useCreateWorkflow = () => {
  const { setSessionId, setWorkflowStatus, setRecipients } = useWorkflowStore();

  return useMutation({
    mutationFn: (data: CreateWorkflowData) => workflowService.createWorkflow(data),
    onSuccess: (response, variables) => {
      setSessionId(response.sessionId);
      setRecipients(variables.recipients);
      setWorkflowStatus('active');
    },
    onError: (error) => {
      console.error('Failed to create workflow:', error);
    },
  });
};

export const useWorkflowStatus = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['workflow-status', sessionId],
    queryFn: () => workflowService.getWorkflowStatus(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
};

export const useSubmitWorkflow = () => {

  return useMutation({
    mutationFn: ({ uniqueUrl, formData }: { uniqueUrl: string; formData: Record<string, any> }) =>
      workflowService.submitWorkflow(uniqueUrl, formData),
    onSuccess: () => {
      // Update workflow status or trigger next recipient
      // This would be handled by the backend notification system
    },
    onError: (error) => {
      console.error('Failed to submit workflow:', error);
    },
  });
};

export const useWorkflow = (uniqueUrl: string | null) => {
  return useQuery({
    queryKey: ['workflow', uniqueUrl],
    queryFn: () => workflowService.getWorkflow(uniqueUrl!),
    enabled: !!uniqueUrl,
  });
};