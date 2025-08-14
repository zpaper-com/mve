import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  IconButton,
  TextField,
  MenuItem,
  Chip,
  Avatar,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  DragIndicator,
  Person,
  Business,
  LocalHospital,
  HealthAndSafety,
  Delete,
  Email,
  Phone,
  Badge,
  Fax,
  Work,
} from '@mui/icons-material';
import { type Control, useController } from 'react-hook-form';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface RecipientData {
  id: string;
  recipientType: 'PRESCRIBER' | 'PATIENT' | 'PHARMACY' | 'INSURANCE' | 'MEDSTAFF' | 'CUSTOM';
  partyName: string;
  email: string;
  mobile?: string;
  npi?: string;
  officePhone?: string;
  fax?: string;
}

interface RecipientCardProps {
  index: number;
  control: Control<any>;
  onRemove: (index: number) => void;
  isRemovable?: boolean;
}

const recipientTypeConfig = {
  PRESCRIBER: {
    label: 'Provider',
    icon: LocalHospital,
    color: '#2e7d32',
    bgcolor: '#e8f5e8',
  },
  PATIENT: {
    label: 'Patient',
    icon: Person,
    color: '#1976d2',
    bgcolor: '#e3f2fd',
  },
  PHARMACY: {
    label: 'Pharmacy',
    icon: Business,
    color: '#ed6c02',
    bgcolor: '#fff3e0',
  },
  INSURANCE: {
    label: 'Insurance',
    icon: HealthAndSafety,
    color: '#9c27b0',
    bgcolor: '#f3e5f5',
  },
  MEDSTAFF: {
    label: 'Med-Staff',
    icon: HealthAndSafety,
    color: '#d32f2f',
    bgcolor: '#ffebee',
  },
  CUSTOM: {
    label: 'Other',
    icon: Person,
    color: '#616161',
    bgcolor: '#f5f5f5',
  },
} as const;

const RecipientCard: React.FC<RecipientCardProps> = ({
  index,
  control,
  onRemove,
  isRemovable = true,
}) => {
  const theme = useTheme();

  // DnD Kit sortable hook
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `recipient-${index}` });

  // Form controllers
  const {
    field: typeField,
    fieldState: typeFieldState,
  } = useController({
    name: `recipients.${index}.recipientType`,
    control,
    defaultValue: 'PRESCRIBER',
  });

  const {
    field: nameField,
    fieldState: nameFieldState,
  } = useController({
    name: `recipients.${index}.partyName`,
    control,
    rules: { required: 'Name is required' },
  });

  const {
    field: emailField,
    fieldState: emailFieldState,
  } = useController({
    name: `recipients.${index}.email`,
    control,
    rules: {
      required: 'Email is required',
      pattern: {
        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: 'Invalid email format',
      },
    },
  });

  const {
    field: mobileField,
    fieldState: mobileFieldState,
  } = useController({
    name: `recipients.${index}.mobile`,
    control,
    rules: {
      pattern: {
        value: /^\+?[1-9]\d{1,14}$/,
        message: 'Invalid mobile number format',
      },
    },
  });

  const {
    field: npiField,
    fieldState: npiFieldState,
  } = useController({
    name: `recipients.${index}.npi`,
    control,
    rules: {
      pattern: {
        value: /^\d{10}$/,
        message: 'NPI must be 10 digits',
      },
    },
  });

  const {
    field: officePhoneField,
    fieldState: officePhoneFieldState,
  } = useController({
    name: `recipients.${index}.officePhone`,
    control,
    rules: {
      pattern: {
        value: /^\+?[1-9]\d{1,14}$/,
        message: 'Invalid phone number format',
      },
    },
  });

  const {
    field: faxField,
    fieldState: faxFieldState,
  } = useController({
    name: `recipients.${index}.fax`,
    control,
    rules: {
      pattern: {
        value: /^\+?[1-9]\d{1,14}$/,
        message: 'Invalid fax number format',
      },
    },
  });

  const typeConfig = recipientTypeConfig[typeField.value] || recipientTypeConfig.CUSTOM;
  const TypeIcon = typeConfig.icon;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      sx={{
        mb: 2,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        boxShadow: isDragging ? 4 : 1,
        '&:hover': {
          boxShadow: 2,
        },
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        {/* Header with drag handle and controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          {/* Drag handle */}
          <Tooltip title="Drag to reorder">
            <IconButton
              {...attributes}
              {...listeners}
              size="small"
              sx={{ 
                cursor: 'grab',
                mr: 1,
                '&:active': { cursor: 'grabbing' },
              }}
            >
              <DragIndicator />
            </IconButton>
          </Tooltip>

          {/* Recipient type avatar */}
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: typeConfig.bgcolor,
              color: typeConfig.color,
              mr: 2,
            }}
          >
            <TypeIcon fontSize="small" />
          </Avatar>

          {/* Step number and title */}
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Step {index + 1}
            </Typography>
            <Chip
              label={typeConfig.label}
              size="small"
              sx={{
                bgcolor: typeConfig.bgcolor,
                color: typeConfig.color,
                fontWeight: 500,
              }}
            />
          </Box>

          {/* Remove button */}
          {isRemovable && (
            <Tooltip title="Remove recipient">
              <IconButton
                onClick={() => onRemove(index)}
                size="small"
                color="error"
                sx={{ ml: 1 }}
              >
                <Delete fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Form fields */}
        <Box sx={{ 
          display: 'grid', 
          gap: 2, 
          gridTemplateColumns: { 
            xs: '1fr', 
            md: typeField.value === 'MEDSTAFF' ? '1fr 1fr' : '1fr 1fr'
          } 
        }}>
          {/* Recipient Type */}
          <TextField
            select
            label="Recipient Type"
            value={typeField.value}
            onChange={typeField.onChange}
            error={!!typeFieldState.error}
            helperText={typeFieldState.error?.message}
            fullWidth
            required
          >
            {Object.entries(recipientTypeConfig).map(([value, config]) => (
              <MenuItem key={value} value={value}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <config.icon fontSize="small" sx={{ color: config.color }} />
                  {config.label}
                </Box>
              </MenuItem>
            ))}
          </TextField>

          {/* Party Name */}
          <TextField
            label="Name / Organization"
            value={nameField.value || ''}
            onChange={nameField.onChange}
            error={!!nameFieldState.error}
            helperText={nameFieldState.error?.message}
            fullWidth
            required
            placeholder="Enter name or organization"
            inputProps={{
              autoComplete: 'name',
            }}
          />

          {/* Email */}
          <TextField
            label="Email Address"
            type="email"
            value={emailField.value || ''}
            onChange={emailField.onChange}
            error={!!emailFieldState.error}
            helperText={emailFieldState.error?.message}
            fullWidth
            required
            placeholder="user@example.com"
            inputProps={{
              autoComplete: 'email',
            }}
            InputProps={{
              startAdornment: <Email sx={{ mr: 1, color: 'action.active' }} />,
            }}
          />

          {/* Mobile Phone */}
          <TextField
            label="Mobile Phone"
            type="tel"
            value={mobileField.value || ''}
            onChange={mobileField.onChange}
            error={!!mobileFieldState.error}
            helperText={mobileFieldState.error?.message || 'Optional - for SMS notifications (Phase 2)'}
            fullWidth
            placeholder="+1234567890"
            inputProps={{
              autoComplete: 'tel',
            }}
            InputProps={{
              startAdornment: <Phone sx={{ mr: 1, color: 'action.active' }} />,
            }}
          />

          {/* Office Phone (for Med-Staff verification) */}
          {typeField.value === 'MEDSTAFF' && (
            <TextField
              label="Office Phone"
              type="tel"
              value={officePhoneField.value || ''}
              onChange={officePhoneField.onChange}
              error={!!officePhoneFieldState.error}
              helperText={officePhoneFieldState.error?.message || 'Verification office phone number'}
              fullWidth
              placeholder="+1234567890"
              inputProps={{
                autoComplete: 'tel',
              }}
              InputProps={{
                startAdornment: <Work sx={{ mr: 1, color: 'action.active' }} />,
              }}
            />
          )}

          {/* Fax (for Med-Staff verification) */}
          {typeField.value === 'MEDSTAFF' && (
            <TextField
              label="Office Fax"
              type="tel"
              value={faxField.value || ''}
              onChange={faxField.onChange}
              error={!!faxFieldState.error}
              helperText={faxFieldState.error?.message || 'Verification office fax number'}
              fullWidth
              placeholder="+1234567890"
              inputProps={{
                autoComplete: 'tel-national',
              }}
              InputProps={{
                startAdornment: <Fax sx={{ mr: 1, color: 'action.active' }} />,
              }}
            />
          )}

          {/* NPI (for healthcare providers, excluding Med-Staff) */}
          {['PRESCRIBER', 'PHARMACY'].includes(typeField.value) && (
            <TextField
              label="NPI Number"
              value={npiField.value || ''}
              onChange={npiField.onChange}
              error={!!npiFieldState.error}
              helperText={npiFieldState.error?.message || 'National Provider Identifier'}
              fullWidth
              placeholder="1234567890"
              sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}
              InputProps={{
                startAdornment: <Badge sx={{ mr: 1, color: 'action.active' }} />,
              }}
            />
          )}
        </Box>

        {/* Additional info */}
        <Box sx={{ mt: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            This recipient will receive an email notification to complete their portion of the workflow.
            {index === 0 
              ? ' They will be notified immediately upon workflow creation.'
              : ` They will be notified after Step ${index} is completed.`
            }
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default RecipientCard;