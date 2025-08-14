import React from 'react';
import {
  Box,
  Button,
  Stack,
  CircularProgress,
} from '@mui/material';
import { Save, Cancel, Send } from '@mui/icons-material';

import { useFormContext } from './FormProvider';

interface FormActionsProps {
  submitText?: string;
  cancelText?: string;
  showCancel?: boolean;
  onCancel?: () => void;
  submitIcon?: React.ReactNode;
  cancelIcon?: React.ReactNode;
  direction?: 'row' | 'column';
  justify?: 'flex-start' | 'flex-end' | 'center' | 'space-between';
  spacing?: number;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'contained' | 'outlined' | 'text';
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
}

export const FormActions: React.FC<FormActionsProps> = ({
  submitText = 'Submit',
  cancelText = 'Cancel',
  showCancel = true,
  onCancel,
  submitIcon = <Save />,
  cancelIcon = <Cancel />,
  direction = 'row',
  justify = 'flex-end',
  spacing = 2,
  disabled = false,
  fullWidth = false,
  size = 'medium',
  variant = 'contained',
  color = 'primary',
}) => {
  const { formState, reset } = useFormContext();
  const { isSubmitting, isDirty, isValid } = formState;

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      reset();
    }
  };

  return (
    <Box>
      <Stack
        direction={direction}
        justifyContent={justify}
        spacing={spacing}
        sx={{ width: fullWidth ? '100%' : 'auto' }}
      >
        {showCancel && (
          <Button
            type="button"
            variant="outlined"
            onClick={handleCancel}
            startIcon={cancelIcon}
            disabled={isSubmitting || disabled}
            size={size}
            fullWidth={fullWidth && direction === 'column'}
          >
            {cancelText}
          </Button>
        )}

        <Button
          type="submit"
          variant={variant}
          color={color}
          startIcon={
            isSubmitting ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              submitIcon
            )
          }
          disabled={isSubmitting || disabled || !isValid}
          size={size}
          fullWidth={fullWidth && direction === 'column'}
        >
          {isSubmitting ? 'Submitting...' : submitText}
        </Button>
      </Stack>
    </Box>
  );
};

// Specialized action components
export const SaveActions: React.FC<Omit<FormActionsProps, 'submitText' | 'submitIcon'>> = (props) => (
  <FormActions
    {...props}
    submitText="Save"
    submitIcon={<Save />}
  />
);

export const SendActions: React.FC<Omit<FormActionsProps, 'submitText' | 'submitIcon'>> = (props) => (
  <FormActions
    {...props}
    submitText="Send"
    submitIcon={<Send />}
  />
);

export const SubmitActions: React.FC<Omit<FormActionsProps, 'submitText'>> = (props) => (
  <FormActions
    {...props}
    submitText="Submit"
  />
);

export default FormActions;