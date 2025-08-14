import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Paper,
} from '@mui/material';
import { Add, InfoOutlined } from '@mui/icons-material';
import { useFieldArray, type Control } from 'react-hook-form';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from '@dnd-kit/modifiers';

import RecipientCard, { type RecipientData } from './RecipientCard';

interface RecipientFormData {
  recipients: RecipientData[];
}

interface RecipientFormProps {
  control: Control<RecipientFormData>;
}

const RecipientForm: React.FC<RecipientFormProps> = ({ control }) => {
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'recipients',
  });

  // DnD Kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Create sortable items array
  const sortableItems = useMemo(
    () => fields.map((_, index) => `recipient-${index}`),
    [fields]
  );

  const addRecipient = () => {
    if (fields.length < 10) {
      append({
        id: `recipient-${Date.now()}`,
        recipientType: 'PRESCRIBER',
        partyName: '',
        email: '',
        mobile: '',
        npi: '',
        officePhone: '',
        fax: '',
      });
    }
  };

  const removeRecipient = (index: number) => {
    remove(index);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const activeIndex = sortableItems.indexOf(active.id as string);
      const overIndex = sortableItems.indexOf(over?.id as string);

      if (activeIndex !== -1 && overIndex !== -1) {
        move(activeIndex, overIndex);
      }
    }
  };

  const recipientCount = fields.length;
  const maxRecipients = 10;
  const canAddMore = recipientCount < maxRecipients;
  const isMinimum = recipientCount <= 1;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Workflow Recipients
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Add recipients who will complete this PDF form in sequential order.
          Each recipient will be notified when it's their turn to act.
        </Typography>
      </Box>

      {/* Info alert */}
      <Alert severity="info" sx={{ mb: 3 }} icon={<InfoOutlined />}>
        <Typography variant="body2">
          <strong>Sequential Workflow:</strong> Recipients will be notified one at a time in the order shown below. 
          Drag and drop cards to change the order. The first recipient will be notified immediately when you create the workflow.
        </Typography>
      </Alert>

      {/* Recipient Cards with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext 
          items={sortableItems} 
          strategy={verticalListSortingStrategy}
        >
          <Box sx={{ mb: 3 }}>
            {fields.map((field, index) => (
              <RecipientCard
                key={field.id}
                index={index}
                control={control}
                onRemove={removeRecipient}
                isRemovable={!isMinimum}
              />
            ))}
          </Box>
        </SortableContext>
      </DndContext>

      {/* Add recipient button */}
      <Box sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={addRecipient}
          disabled={!canAddMore}
          fullWidth
          size="large"
          sx={{
            py: 1.5,
            borderStyle: 'dashed',
            '&:hover': {
              borderStyle: 'solid',
            },
          }}
        >
          Add Another Recipient ({recipientCount}/{maxRecipients})
        </Button>

        {!canAddMore && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Maximum number of recipients reached. For Phase 2, this will support more recipients.
          </Typography>
        )}
      </Box>

      {/* Workflow summary */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          bgcolor: 'background.default',
          borderStyle: 'dashed',
        }}
      >
        <Typography variant="subtitle2" gutterBottom>
          Workflow Timeline
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {recipientCount === 1 ? (
            'Single recipient workflow - they will be notified immediately.'
          ) : (
            <>
              Step-by-step process: Each recipient completes their portion before the next person is notified.
              Estimated completion time: {recipientCount * 24} hours (assuming 24 hours per step).
            </>
          )}
        </Typography>

        {recipientCount > 1 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" component="div">
              <strong>Notification schedule:</strong>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                {fields.map((field, index) => (
                  <li key={field.id}>
                    <strong>Step {index + 1}:</strong> {index === 0 
                      ? 'Immediate notification' 
                      : `Notified after Step ${index} completion`
                    }
                  </li>
                ))}
              </ul>
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Email & SMS Feature Notice */}
      <Alert severity="success" sx={{ mt: 2 }}>
        <Typography variant="body2">
          <strong>Email & SMS Notifications Available:</strong> Recipients will automatically receive email notifications 
          to their email addresses. Those with mobile numbers will also receive SMS notifications for instant alerts. 
          Make sure to include both email addresses and mobile numbers for maximum reach!
        </Typography>
      </Alert>
    </Box>
  );
};

export default RecipientForm;