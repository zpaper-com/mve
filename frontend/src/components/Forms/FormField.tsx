import React from 'react';
import { Controller, type FieldPath, type FieldValues } from 'react-hook-form';
import {
  TextField,
  FormControl,
  FormLabel,
  FormHelperText,
  Checkbox,
  FormControlLabel,
  Radio,
  RadioGroup,
  Select,
  MenuItem,
  FormGroup,
  Switch,
  Autocomplete,
  Chip,
  Box,
  InputAdornment,
} from '@mui/material';

import { useFormContext } from './FormProvider';

export interface FormFieldProps<T extends FieldValues = FieldValues> {
  name: FieldPath<T>;
  label?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | 'date' | 'datetime-local' | 'time';
  variant?: 'text' | 'select' | 'checkbox' | 'radio' | 'switch' | 'autocomplete' | 'multiselect';
  placeholder?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
  options?: Array<{ label: string; value: any }>;
  multiple?: boolean;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  InputProps?: any;
  sx?: any;
}

export const FormField = <T extends FieldValues = FieldValues>({
  name,
  label,
  type = 'text',
  variant = 'text',
  placeholder,
  helperText,
  required = false,
  disabled = false,
  multiline = false,
  rows = 4,
  fullWidth = true,
  size = 'medium',
  options = [],
  multiple = false,
  startAdornment,
  endAdornment,
  InputProps,
  sx,
}: FormFieldProps<T>) => {
  const { control, formState } = useFormContext<T>();
  const error = formState.errors[name];

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const commonProps = {
          ...field,
          label,
          required,
          disabled,
          fullWidth,
          size,
          error: Boolean(error),
          helperText: error?.message || helperText,
          sx,
        };

        switch (variant) {
          case 'text':
            return (
              <TextField
                {...commonProps}
                type={type}
                placeholder={placeholder}
                multiline={multiline}
                rows={multiline ? rows : undefined}
                InputProps={{
                  startAdornment: startAdornment && (
                    <InputAdornment position="start">{startAdornment}</InputAdornment>
                  ),
                  endAdornment: endAdornment && (
                    <InputAdornment position="end">{endAdornment}</InputAdornment>
                  ),
                  ...InputProps,
                }}
              />
            );

          case 'select':
            return (
              <TextField
                {...commonProps}
                select
                SelectProps={{
                  multiple,
                  renderValue: multiple
                    ? (selected: any) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {(selected as string[]).map((value) => {
                            const option = options.find(opt => opt.value === value);
                            return (
                              <Chip
                                key={value}
                                label={option?.label || value}
                                size="small"
                              />
                            );
                          })}
                        </Box>
                      )
                    : undefined,
                }}
              >
                {options.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            );

          case 'autocomplete':
            return (
              <Autocomplete
                {...field}
                options={options}
                getOptionLabel={(option: any) => 
                  typeof option === 'object' ? option.label : option
                }
                isOptionEqualToValue={(option: any, value: any) =>
                  option.value === value
                }
                multiple={multiple}
                disabled={disabled}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={label}
                    required={required}
                    error={Boolean(error)}
                    helperText={error?.message || helperText}
                    fullWidth={fullWidth}
                    size={size}
                    placeholder={placeholder}
                  />
                )}
                renderTags={multiple ? (value, getTagProps) =>
                  value.map((option: any, index: number) => (
                    <Chip
                      variant="outlined"
                      label={typeof option === 'object' ? option.label : option}
                      size="small"
                      {...getTagProps({ index })}
                    />
                  ))
                : undefined}
                onChange={(_, value) => field.onChange(value)}
                value={field.value || (multiple ? [] : null)}
              />
            );

          case 'checkbox':
            if (options.length > 0) {
              // Multiple checkboxes
              return (
                <FormControl error={Boolean(error)} disabled={disabled}>
                  {label && <FormLabel component="legend">{label}</FormLabel>}
                  <FormGroup>
                    {options.map((option) => (
                      <FormControlLabel
                        key={option.value}
                        control={
                          <Checkbox
                            checked={field.value?.includes?.(option.value) || false}
                            onChange={(e) => {
                              const currentValue = field.value || [];
                              if (e.target.checked) {
                                field.onChange([...currentValue, option.value]);
                              } else {
                                field.onChange(
                                  currentValue.filter((val: any) => val !== option.value)
                                );
                              }
                            }}
                            size={size}
                          />
                        }
                        label={option.label}
                      />
                    ))}
                  </FormGroup>
                  {(error?.message || helperText) && (
                    <FormHelperText>{error?.message || helperText}</FormHelperText>
                  )}
                </FormControl>
              );
            } else {
              // Single checkbox
              return (
                <FormControlLabel
                  control={
                    <Checkbox
                      {...field}
                      checked={field.value || false}
                      disabled={disabled}
                      size={size}
                    />
                  }
                  label={label}
                />
              );
            }

          case 'radio':
            return (
              <FormControl error={Boolean(error)} disabled={disabled}>
                {label && <FormLabel component="legend">{label}</FormLabel>}
                <RadioGroup {...field} value={field.value || ''}>
                  {options.map((option) => (
                    <FormControlLabel
                      key={option.value}
                      value={option.value}
                      control={<Radio size={size} />}
                      label={option.label}
                    />
                  ))}
                </RadioGroup>
                {(error?.message || helperText) && (
                  <FormHelperText>{error?.message || helperText}</FormHelperText>
                )}
              </FormControl>
            );

          case 'switch':
            return (
              <FormControlLabel
                control={
                  <Switch
                    {...field}
                    checked={field.value || false}
                    disabled={disabled}
                    size={size}
                  />
                }
                label={label}
              />
            );

          default:
            return (
              <TextField
                {...commonProps}
                type={type}
                placeholder={placeholder}
              />
            );
        }
      }}
    />
  );
};

export default FormField;