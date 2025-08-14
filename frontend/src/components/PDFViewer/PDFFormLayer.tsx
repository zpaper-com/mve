/**
 * PDF Form Layer Component
 * 
 * Renders interactive form fields on top of the PDF canvas
 * with proper positioning and styling.
 */

import React, { useEffect, useRef, useState } from 'react';
import { 
  Box, 
  TextField, 
  Checkbox, 
  Radio, 
  RadioGroup, 
  FormControl, 
  FormControlLabel,
  Select,
  MenuItem,
  Button,
  Typography,
  Tooltip,
  Alert
} from '@mui/material';
import type { PDFFormField, PDFFormData } from '../../types/pdf';
import { PDFFormUtils } from '../../services/pdfFormService';

interface PDFFormLayerProps {
  formFields: PDFFormField[];
  formData: PDFFormData;
  currentPage: number;
  scale: number;
  onFieldChange: (fieldName: string, value: any) => void;
  readonly?: boolean;
  showErrors?: boolean;
  errors?: Record<string, string>;
  recipientType?: string;
  hideSignatureFields?: boolean;
}

const PDFFormLayer: React.FC<PDFFormLayerProps> = ({
  formFields,
  formData,
  currentPage,
  scale,
  onFieldChange,
  readonly = false,
  showErrors = true,
  errors = {},
  recipientType,
  hideSignatureFields = true,
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const [fieldElements, setFieldElements] = useState<Map<string, HTMLElement>>(new Map());

  // Filter fields for current page
  const currentPageFields = formFields.filter(field => 
    field.page === currentPage && !PDFFormUtils.shouldHideField(field, recipientType, hideSignatureFields)
  );

  // Update field positions when scale changes
  useEffect(() => {
    if (!layerRef.current) return;

    const layer = layerRef.current;
    currentPageFields.forEach(field => {
      const element = fieldElements.get(field.id);
      if (element) {
        updateFieldPosition(element, field, scale);
      }
    });
  }, [scale, currentPageFields, fieldElements]);

  const updateFieldPosition = (element: HTMLElement, field: PDFFormField, scale: number) => {
    const [x1, y1, x2, y2] = field.rect;
    
    // Convert PDF coordinates to CSS coordinates
    const left = x1 * scale;
    const top = y1 * scale;
    const width = (x2 - x1) * scale;
    const height = (y2 - y1) * scale;

    element.style.position = 'absolute';
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;

    // Apply field appearance
    if (field.appearance) {
      const appearance = field.appearance;
      if (appearance.backgroundColor) {
        element.style.backgroundColor = appearance.backgroundColor;
      }
      if (appearance.borderColor) {
        element.style.borderColor = appearance.borderColor;
      }
      if (appearance.textColor) {
        element.style.color = appearance.textColor;
      }
      if (appearance.fontSize) {
        element.style.fontSize = `${appearance.fontSize * scale}px`;
      }
    }
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    if (!readonly) {
      onFieldChange(fieldName, value);
    }
  };

  const renderFormField = (field: PDFFormField) => {
    const value = formData[field.name] || '';
    const hasError = showErrors && errors[field.name];
    const fieldId = PDFFormUtils.sanitizeFieldName(field.name);

    const commonProps = {
      id: fieldId,
      disabled: readonly || field.readonly,
      required: field.required,
      error: hasError,
      'data-field-name': field.name,
    };

    switch (field.type) {
      case 'text':
      case 'textarea':
        return (
          <TextField
            {...commonProps}
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            multiline={field.type === 'textarea' || field.multiline}
            type={field.password ? 'password' : 'text'}
            placeholder={field.alternateFieldName || ''}
            inputProps={{
              maxLength: field.maxLength,
              style: {
                fontSize: 'inherit',
                padding: '2px 4px',
                height: field.type === 'textarea' ? 'auto' : '100%',
                boxSizing: 'border-box',
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                height: '100%',
                '& fieldset': {
                  border: hasError ? '2px solid red' : '1px solid rgba(0,0,0,0.3)',
                },
              },
              '& .MuiInputBase-input': {
                fontSize: 'inherit',
              },
            }}
          />
        );

      case 'checkbox':
        return (
          <FormControlLabel
            control={
              <Checkbox
                {...commonProps}
                checked={Boolean(value)}
                onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                size="small"
              />
            }
            label={field.alternateFieldName || ''}
            sx={{
              margin: 0,
              height: '100%',
              '& .MuiFormControlLabel-label': {
                fontSize: 'inherit',
              },
            }}
          />
        );

      case 'radio':
        return (
          <FormControl component="fieldset" sx={{ height: '100%' }}>
            <RadioGroup
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              row
            >
              {field.options?.map((option, index) => (
                <FormControlLabel
                  key={index}
                  value={option.value}
                  control={<Radio size="small" disabled={commonProps.disabled} />}
                  label={option.label}
                  sx={{
                    margin: 0,
                    '& .MuiFormControlLabel-label': {
                      fontSize: 'inherit',
                    },
                  }}
                />
              ))}
            </RadioGroup>
          </FormControl>
        );

      case 'select':
      case 'listbox':
        return (
          <FormControl fullWidth sx={{ height: '100%' }}>
            <Select
              {...commonProps}
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              size="small"
              sx={{
                height: '100%',
                '& .MuiSelect-select': {
                  fontSize: 'inherit',
                  padding: '2px 8px',
                },
              }}
            >
              {field.options?.map((option, index) => (
                <MenuItem key={index} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case 'date':
        return (
          <TextField
            {...commonProps}
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            inputProps={{
              style: {
                fontSize: 'inherit',
                padding: '2px 4px',
                height: '100%',
                boxSizing: 'border-box',
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                height: '100%',
                '& fieldset': {
                  border: hasError ? '2px solid red' : '1px solid rgba(0,0,0,0.3)',
                },
              },
            }}
          />
        );

      case 'button':
        return (
          <Button
            {...commonProps}
            variant="outlined"
            onClick={() => handleFieldChange(field.name, Date.now())}
            sx={{
              height: '100%',
              fontSize: 'inherit',
              minWidth: 'unset',
              padding: '2px 8px',
            }}
          >
            {field.alternateFieldName || 'Click'}
          </Button>
        );

      case 'signature':
        // Signature fields are typically hidden, but show placeholder if visible
        return (
          <Box
            sx={{
              height: '100%',
              border: '2px dashed #ccc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
            }}
          >
            <Typography variant="caption" color="textSecondary">
              Signature Field (Hidden)
            </Typography>
          </Box>
        );

      default:
        return (
          <TextField
            {...commonProps}
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={`Unknown field type: ${field.type}`}
            inputProps={{
              style: {
                fontSize: 'inherit',
                padding: '2px 4px',
                height: '100%',
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                height: '100%',
              },
            }}
          />
        );
    }
  };

  return (
    <Box
      ref={layerRef}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: readonly ? 'none' : 'auto',
        zIndex: 10,
      }}
    >
      {currentPageFields.map((field) => {
        const fieldElement = renderFormField(field);
        const hasError = showErrors && errors[field.name];

        return (
          <Tooltip
            key={field.id}
            title={
              hasError ? (
                <Alert severity="error" sx={{ fontSize: '0.75rem' }}>
                  {errors[field.name]}
                </Alert>
              ) : (
                field.alternateFieldName || field.name
              )
            }
            arrow
            placement="top"
          >
            <Box
              ref={(el) => {
                if (el) {
                  setFieldElements(prev => new Map(prev.set(field.id, el)));
                  updateFieldPosition(el, field, scale);
                }
              }}
              sx={{
                position: 'absolute',
                boxSizing: 'border-box',
                '&:hover': {
                  outline: readonly ? 'none' : '2px solid rgba(25, 118, 210, 0.5)',
                },
              }}
            >
              {fieldElement}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
};

export default PDFFormLayer;