import React, { createContext, useContext } from 'react';
import { useForm, type UseFormReturn, type FieldValues, type UseFormProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ZodSchema } from 'zod';

interface FormContextValue<T extends FieldValues = FieldValues> extends UseFormReturn<T> {
  isSubmitting: boolean;
}

const FormContext = createContext<FormContextValue | null>(null);

export const useFormContext = <T extends FieldValues = FieldValues>() => {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context as FormContextValue<T>;
};

interface FormProviderProps<T extends FieldValues = FieldValues> {
  children: React.ReactNode;
  schema?: ZodSchema<T>;
  defaultValues?: Partial<T>;
  mode?: 'onBlur' | 'onChange' | 'onSubmit' | 'onTouched' | 'all';
  onSubmit?: (data: T) => Promise<void> | void;
  className?: string;
}

export const FormProvider = <T extends FieldValues = FieldValues>({
  children,
  schema,
  defaultValues,
  mode = 'onBlur',
  onSubmit,
  className,
}: FormProviderProps<T>) => {
  const formOptions: UseFormProps<T> = {
    mode,
    defaultValues,
    ...(schema && { resolver: zodResolver(schema) }),
  };

  const form = useForm<T>(formOptions);
  const { handleSubmit, formState } = form;

  const handleFormSubmit = async (data: T) => {
    if (onSubmit) {
      try {
        await onSubmit(data);
      } catch (error) {
        // Error handling is done at the component level
        console.error('Form submission error:', error);
      }
    }
  };

  const contextValue: FormContextValue<T> = {
    ...form,
    isSubmitting: formState.isSubmitting,
  };

  return (
    <FormContext.Provider value={contextValue}>
      <form 
        onSubmit={handleSubmit(handleFormSubmit)} 
        className={className}
        noValidate
      >
        {children}
      </form>
    </FormContext.Provider>
  );
};

export default FormProvider;