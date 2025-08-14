/**
 * PDF Form Service - Enhanced form field extraction and interaction
 * 
 * This service provides comprehensive form field detection, validation,
 * and interaction capabilities for PDF documents.
 */

import type { 
  PDFDocumentProxy, 
  PDFPageProxy, 
  AnnotationData 
} from 'pdfjs-dist';

import type {
  PDFFormField,
  PDFFormData,
  PDFFormValidationResult,
  PDFFormFieldType,
  PDFFormFieldValidation,
  PDFFormFieldAppearance,
} from '../types/pdf';

import { logger } from '../utils/logger';

/**
 * Enhanced PDF Form Service
 */
export class PDFFormService {
  private formFields: Map<string, PDFFormField> = new Map();
  private formData: PDFFormData = {};
  private signatureFieldPatterns = [
    /signature/i,
    /sign/i,
    /prescriber/i,
    /doctor/i,
    /provider/i,
    /physician/i,
    /sig$/i,
    /^sig_/i,
  ];

  /**
   * Extract all form fields from a PDF document
   */
  async extractFormFields(pdfDocument: PDFDocumentProxy): Promise<PDFFormField[]> {
    try {
      const fields: PDFFormField[] = [];
      const fieldMap = new Map<string, PDFFormField>();
      
      // Process each page
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const pageFields = await this.extractPageFormFields(page, pageNum);
        
        // Merge with existing fields (handle multi-page fields)
        pageFields.forEach(field => {
          const existingField = fieldMap.get(field.name);
          if (existingField) {
            // Multi-page field - update with additional page info
            existingField.rect = this.mergeFieldRects(existingField.rect, field.rect);
          } else {
            fieldMap.set(field.name, field);
            fields.push(field);
          }
        });
      }

      // Store fields for later use
      this.formFields.clear();
      fields.forEach(field => {
        this.formFields.set(field.name, field);
      });

      logger.info('Extracted form fields:', { 
        totalFields: fields.length,
        fieldNames: fields.map(f => f.name)
      });

      return fields;
    } catch (error) {
      logger.error('Failed to extract form fields:', error);
      throw new Error(`Form field extraction failed: ${error}`);
    }
  }

  /**
   * Extract form fields from a specific page
   */
  private async extractPageFormFields(page: PDFPageProxy, pageNumber: number): Promise<PDFFormField[]> {
    const annotations = await page.getAnnotations({ intent: 'any' });
    const fields: PDFFormField[] = [];
    const viewport = page.getViewport({ scale: 1.0 });

    for (const annotation of annotations) {
      if (this.isFormField(annotation)) {
        const field = await this.processFormField(annotation, pageNumber, viewport);
        if (field) {
          fields.push(field);
        }
      }
    }

    return fields;
  }

  /**
   * Check if annotation is a form field
   */
  private isFormField(annotation: AnnotationData): boolean {
    return (
      annotation.subtype === 'Widget' ||
      (annotation.fieldType && annotation.fieldType !== undefined) ||
      (annotation.fieldName && annotation.fieldName.length > 0)
    );
  }

  /**
   * Process individual form field annotation
   */
  private async processFormField(
    annotation: AnnotationData, 
    pageNumber: number,
    viewport: any
  ): Promise<PDFFormField | null> {
    try {
      const fieldName = annotation.fieldName || `field_${pageNumber}_${Date.now()}`;
      
      // Skip if this is a signature field and hiding is enabled
      if (this.isSignatureField(annotation)) {
        logger.debug('Skipping signature field:', fieldName);
        return null;
      }

      const field: PDFFormField = {
        id: `${fieldName}_${pageNumber}`,
        name: fieldName,
        type: this.determineFieldType(annotation),
        value: annotation.fieldValue || annotation.defaultValue || '',
        defaultValue: annotation.defaultValue || '',
        required: annotation.required || false,
        readonly: annotation.readOnly || false,
        hidden: annotation.hidden || false,
        page: pageNumber,
        rect: annotation.rect || [0, 0, 0, 0],
        
        // Enhanced properties
        multiline: annotation.multiline || false,
        password: annotation.password || false,
        richText: annotation.richText || false,
        maxLength: annotation.maxLen || undefined,
        
        // Extract options for select/radio fields
        options: this.extractFieldOptions(annotation),
        
        // Validation rules
        validation: this.createFieldValidation(annotation),
        
        // Appearance
        appearance: this.extractFieldAppearance(annotation, viewport),
        
        // Export values
        exportValue: annotation.exportValue,
        alternateFieldName: annotation.alternateFieldName,
        mappingName: annotation.mappingName,
      };

      return field;
    } catch (error) {
      logger.error('Failed to process form field:', error);
      return null;
    }
  }

  /**
   * Determine the type of form field
   */
  private determineFieldType(annotation: AnnotationData): PDFFormFieldType {
    if (annotation.fieldType) {
      switch (annotation.fieldType) {
        case 'Tx':
          return annotation.multiline ? 'textarea' : 'text';
        case 'Ch':
          return annotation.combo ? 'select' : 'listbox';
        case 'Btn':
          if (annotation.checkBox) {
            return 'checkbox';
          } else if (annotation.radioButton) {
            return 'radio';
          } else {
            return 'button';
          }
        case 'Sig':
          return 'signature';
        default:
          break;
      }
    }

    // Fallback based on field name
    const fieldName = (annotation.fieldName || '').toLowerCase();
    if (fieldName.includes('date')) return 'date';
    if (fieldName.includes('email')) return 'text';
    if (fieldName.includes('phone')) return 'text';
    if (fieldName.includes('signature') || fieldName.includes('sign')) return 'signature';
    if (fieldName.includes('check')) return 'checkbox';
    
    return 'text'; // Default fallback
  }

  /**
   * Check if field is a signature field
   */
  private isSignatureField(annotation: AnnotationData): boolean {
    if (annotation.fieldType === 'Sig') return true;
    
    const fieldName = annotation.fieldName || '';
    return this.signatureFieldPatterns.some(pattern => pattern.test(fieldName));
  }

  /**
   * Extract options for select/radio fields
   */
  private extractFieldOptions(annotation: AnnotationData): Array<{ value: string; label: string }> | undefined {
    if (!annotation.options) return undefined;
    
    return annotation.options.map((option: any, index: number) => ({
      value: typeof option === 'string' ? option : option.exportValue || `option_${index}`,
      label: typeof option === 'string' ? option : option.displayValue || `Option ${index + 1}`,
    }));
  }

  /**
   * Create validation rules for field
   */
  private createFieldValidation(annotation: AnnotationData): PDFFormValidationValidation | undefined {
    const validation: PDFFormFieldValidation = {};
    let hasValidation = false;

    // Required field
    if (annotation.required) {
      validation.required = true;
      hasValidation = true;
    }

    // Max length
    if (annotation.maxLen && annotation.maxLen > 0) {
      validation.maxLength = annotation.maxLen;
      hasValidation = true;
    }

    // Format validation based on field name
    const fieldName = (annotation.fieldName || '').toLowerCase();
    if (fieldName.includes('email')) {
      validation.format = 'email';
      validation.pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      hasValidation = true;
    } else if (fieldName.includes('phone')) {
      validation.format = 'phone';
      validation.pattern = /^[\+]?[\d\s\-\(\)]+$/;
      hasValidation = true;
    } else if (fieldName.includes('date')) {
      validation.format = 'date';
      hasValidation = true;
    } else if (fieldName.includes('number') || fieldName.includes('amount')) {
      validation.format = 'number';
      validation.pattern = /^[\d\.\,\-\+\s]*$/;
      hasValidation = true;
    }

    // Custom format string from PDF
    if (annotation.format) {
      // Parse PDF format string (simplified)
      if (annotation.format.includes('date')) {
        validation.format = 'date';
        hasValidation = true;
      } else if (annotation.format.includes('number')) {
        validation.format = 'number';
        hasValidation = true;
      }
    }

    return hasValidation ? validation : undefined;
  }

  /**
   * Extract field appearance properties
   */
  private extractFieldAppearance(annotation: AnnotationData, viewport: any): PDFFormFieldAppearance | undefined {
    const appearance: PDFFormFieldAppearance = {};
    let hasAppearance = false;

    // Background color
    if (annotation.backgroundColor) {
      appearance.backgroundColor = this.parseColor(annotation.backgroundColor);
      hasAppearance = true;
    }

    // Border color
    if (annotation.borderColor) {
      appearance.borderColor = this.parseColor(annotation.borderColor);
      hasAppearance = true;
    }

    // Text color
    if (annotation.color) {
      appearance.textColor = this.parseColor(annotation.color);
      hasAppearance = true;
    }

    // Font size - estimate based on field height
    if (annotation.rect) {
      const [, , , y2] = annotation.rect;
      const [, , , y1] = annotation.rect;
      const height = Math.abs(y2 - y1);
      appearance.fontSize = Math.max(8, Math.min(16, height * 0.6));
      hasAppearance = true;
    }

    return hasAppearance ? appearance : undefined;
  }

  /**
   * Parse color from PDF color array
   */
  private parseColor(colorArray: number[]): string {
    if (!Array.isArray(colorArray)) return '#000000';
    
    if (colorArray.length === 1) {
      // Grayscale
      const gray = Math.round(colorArray[0] * 255);
      return `rgb(${gray}, ${gray}, ${gray})`;
    } else if (colorArray.length === 3) {
      // RGB
      const [r, g, b] = colorArray.map(c => Math.round(c * 255));
      return `rgb(${r}, ${g}, ${b})`;
    } else if (colorArray.length === 4) {
      // CMYK - convert to RGB (simplified)
      const [c, m, y, k] = colorArray;
      const r = Math.round(255 * (1 - c) * (1 - k));
      const g = Math.round(255 * (1 - m) * (1 - k));
      const b = Math.round(255 * (1 - y) * (1 - k));
      return `rgb(${r}, ${g}, ${b})`;
    }
    
    return '#000000';
  }

  /**
   * Merge rectangles for multi-page fields
   */
  private mergeFieldRects(rect1: number[], rect2: number[]): number[] {
    return [
      Math.min(rect1[0], rect2[0]), // x1
      Math.min(rect1[1], rect2[1]), // y1
      Math.max(rect1[2], rect2[2]), // x2
      Math.max(rect1[3], rect2[3]), // y2
    ];
  }

  /**
   * Validate form data
   */
  validateFormData(formData: PDFFormData, formFields: PDFFormField[]): PDFFormValidationResult {
    const errors: Record<string, string> = {};
    const warnings: Record<string, string> = {};
    
    let requiredFieldsCompleted = 0;
    const totalRequiredFields = formFields.filter(f => f.required).length;

    formFields.forEach(field => {
      const value = formData[field.name];
      
      // Required field validation
      if (field.required) {
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          errors[field.name] = `${field.name} is required`;
        } else {
          requiredFieldsCompleted++;
        }
      }

      // Skip validation for empty optional fields
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        return;
      }

      // Field-specific validation
      if (field.validation) {
        const validation = field.validation;
        
        // Length validation
        if (validation.minLength && value.length < validation.minLength) {
          errors[field.name] = `Minimum length is ${validation.minLength} characters`;
        }
        
        if (validation.maxLength && value.length > validation.maxLength) {
          errors[field.name] = `Maximum length is ${validation.maxLength} characters`;
        }

        // Pattern validation
        if (validation.pattern) {
          const pattern = typeof validation.pattern === 'string' 
            ? new RegExp(validation.pattern) 
            : validation.pattern;
            
          if (!pattern.test(value)) {
            switch (validation.format) {
              case 'email':
                errors[field.name] = 'Please enter a valid email address';
                break;
              case 'phone':
                errors[field.name] = 'Please enter a valid phone number';
                break;
              case 'date':
                errors[field.name] = 'Please enter a valid date';
                break;
              case 'number':
                errors[field.name] = 'Please enter a valid number';
                break;
              default:
                errors[field.name] = 'Invalid format';
            }
          }
        }

        // Range validation for numbers
        if (validation.format === 'number' && !isNaN(Number(value))) {
          const numValue = Number(value);
          if (validation.min !== undefined && numValue < validation.min) {
            errors[field.name] = `Minimum value is ${validation.min}`;
          }
          if (validation.max !== undefined && numValue > validation.max) {
            errors[field.name] = `Maximum value is ${validation.max}`;
          }
        }

        // Custom validation
        if (validation.custom && typeof validation.custom === 'function') {
          const customResult = validation.custom(value);
          if (customResult !== true) {
            errors[field.name] = typeof customResult === 'string' ? customResult : 'Custom validation failed';
          }
        }
      }

      // Type-specific validation
      switch (field.type) {
        case 'date':
          if (!this.isValidDate(value)) {
            errors[field.name] = 'Please enter a valid date';
          }
          break;
        case 'checkbox':
          if (typeof value !== 'boolean') {
            warnings[field.name] = 'Checkbox value should be true or false';
          }
          break;
        case 'select':
        case 'radio':
          if (field.options && !field.options.some(opt => opt.value === value)) {
            errors[field.name] = 'Please select a valid option';
          }
          break;
      }
    });

    const completionPercentage = totalRequiredFields > 0 
      ? Math.round((requiredFieldsCompleted / totalRequiredFields) * 100) 
      : 100;

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      warnings,
      completionPercentage,
      requiredFieldsCompleted,
      totalRequiredFields,
    };
  }

  /**
   * Validate date string
   */
  private isValidDate(dateString: string): boolean {
    if (!dateString) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * Get field by name
   */
  getField(fieldName: string): PDFFormField | undefined {
    return this.formFields.get(fieldName);
  }

  /**
   * Get all fields
   */
  getAllFields(): PDFFormField[] {
    return Array.from(this.formFields.values());
  }

  /**
   * Get fields by type
   */
  getFieldsByType(type: PDFFormFieldType): PDFFormField[] {
    return this.getAllFields().filter(field => field.type === type);
  }

  /**
   * Get required fields
   */
  getRequiredFields(): PDFFormField[] {
    return this.getAllFields().filter(field => field.required);
  }

  /**
   * Update field value
   */
  updateFieldValue(fieldName: string, value: any): void {
    this.formData[fieldName] = value;
  }

  /**
   * Get form data
   */
  getFormData(): PDFFormData {
    return { ...this.formData };
  }

  /**
   * Set form data
   */
  setFormData(data: PDFFormData): void {
    this.formData = { ...data };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.formFields.clear();
    this.formData = {};
  }

  /**
   * Export form data for submission
   */
  exportFormData(): {
    fields: PDFFormField[];
    data: PDFFormData;
    validation: PDFFormValidationResult;
  } {
    const fields = this.getAllFields();
    const data = this.getFormData();
    const validation = this.validateFormData(data, fields);

    return {
      fields,
      data,
      validation,
    };
  }
}

// Export singleton instance
export const pdfFormService = new PDFFormService();

// Export utility functions
export const PDFFormUtils = {
  /**
   * Generate unique field ID
   */
  generateFieldId: (fieldName: string, pageNumber: number): string => {
    return `${fieldName}_page_${pageNumber}_${Date.now()}`;
  },

  /**
   * Sanitize field name for use as HTML ID
   */
  sanitizeFieldName: (fieldName: string): string => {
    return fieldName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  },

  /**
   * Format field value for display
   */
  formatFieldValue: (value: any, field: PDFFormField): string => {
    if (value === null || value === undefined) return '';
    
    switch (field.type) {
      case 'checkbox':
        return value ? 'Yes' : 'No';
      case 'date':
        if (value instanceof Date) {
          return value.toLocaleDateString();
        } else if (typeof value === 'string') {
          const date = new Date(value);
          return isNaN(date.getTime()) ? value : date.toLocaleDateString();
        }
        break;
      case 'select':
      case 'radio':
        const option = field.options?.find(opt => opt.value === value);
        return option ? option.label : String(value);
      default:
        return String(value);
    }
    
    return String(value);
  },

  /**
   * Check if field should be hidden (like signature fields)
   * Context-aware hiding based on recipient type
   */
  shouldHideField: (field: PDFFormField, recipientType?: string, hideSignatureFields = true): boolean => {
    if (field.hidden) return true;
    
    // If hideSignatureFields is false, show signature fields based on context
    if (field.type === 'signature' && !hideSignatureFields && recipientType) {
      const fieldName = field.name.toLowerCase();
      
      // Patient signature fields - show only for PATIENT recipients
      if (fieldName.includes('patient') || fieldName.includes('patientauth') || fieldName.includes('client')) {
        return recipientType !== 'PATIENT';
      }
      
      // Provider signature fields - show only for PRESCRIBER recipients  
      if (fieldName.includes('prescriber') || fieldName.includes('provider') || fieldName.includes('doctor') || fieldName.includes('providerauth')) {
        return recipientType !== 'PRESCRIBER';
      }
      
      // General auth/signature fields - show based on context
      if (fieldName.includes('auth') || fieldName.includes('sign')) {
        // If it's a provider auth field, show to prescribers
        if (fieldName.includes('provider')) {
          return recipientType !== 'PRESCRIBER';
        }
        // If it's a patient/general auth field, show to patients
        return recipientType !== 'PATIENT';
      }
      
      // If no specific match, show all signature fields to all recipients in workflow
      return false;
    }
    
    // Default behavior: hide all signature fields if hideSignatureFields is true
    if (field.type === 'signature' && hideSignatureFields) return true;
    
    return false;
  },
};