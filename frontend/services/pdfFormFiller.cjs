const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFTextField, PDFCheckBox, PDFSignature } = require('pdf-lib');

class PDFFormFillerService {
  constructor() {
    this.outputDir = path.join(__dirname, '../completed_forms');
    this.ensureOutputDirectory();
  }

  ensureOutputDirectory() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Fill PDF form with workflow data and flatten it
   * @param {string} sourceUrl - URL or path to the source PDF
   * @param {Object} workflowData - Complete workflow data with all recipients' form data
   * @param {string} workflowId - Workflow ID for filename
   * @returns {Promise<string>} Path to the flattened PDF
   */
  async fillAndFlattenPDF(sourceUrl, workflowData, workflowId) {
    try {
      console.log('🔧 Starting PDF form filling for workflow:', workflowId);
      
      // Download or read the source PDF
      let pdfBytes;
      if (sourceUrl.startsWith('http')) {
        const response = await fetch(sourceUrl);
        pdfBytes = new Uint8Array(await response.arrayBuffer());
      } else {
        pdfBytes = fs.readFileSync(sourceUrl);
      }

      // Load the PDF document
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const form = pdfDoc.getForm();
      
      console.log('📋 PDF loaded, available form fields:', form.getFields().length);
      
      // List all available field names for debugging
      const allFieldNames = form.getFields().map(f => f.getName());
      console.log('📋 Available PDF field names (first 20):', allFieldNames.slice(0, 20));
      
      // Combine all form data from all recipients
      const allFormData = this.combineWorkflowFormData(workflowData);
      
      console.log('📝 Combined form data keys:', Object.keys(allFormData).length);
      console.log('📝 Form data field names (first 20):', Object.keys(allFormData).slice(0, 20));
      console.log('📝 Sample values:', Object.entries(allFormData).slice(0, 5).map(([k, v]) => 
        `${k}: ${typeof v === 'string' && v.startsWith('data:image/') ? '[IMAGE DATA]' : v}`
      ));
      
      // Check for field name matches
      const formDataKeys = Object.keys(allFormData);
      const matchingFields = allFieldNames.filter(pdfField => formDataKeys.includes(pdfField));
      console.log(`🔗 Matching fields between PDF and form data: ${matchingFields.length} out of ${allFieldNames.length} PDF fields`);
      if (matchingFields.length > 0) {
        console.log('🔗 Sample matching fields:', matchingFields.slice(0, 5));
      }

      // Fill form fields
      await this.fillFormFields(form, allFormData, pdfDoc);

      // Log a sample of filled fields to verify they're set
      const fieldsAfterFilling = form.getFields();
      console.log('🔍 Checking fields after filling:');
      for (let i = 0; i < Math.min(5, fieldsAfterFilling.length); i++) {
        const field = fieldsAfterFilling[i];
        const fieldName = field.getName();
        if (field.constructor.name === 'PDFTextField' && field.getText) {
          const value = field.getText();
          if (value) {
            console.log(`  ✓ Field "${fieldName}" has value: "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
          }
        }
      }

      // Flatten the form (make it non-editable)
      form.flatten();
      
      console.log('✅ Form flattened successfully');

      // Save the completed PDF
      const outputFilename = `workflow_${workflowId}_completed.pdf`;
      const outputPath = path.join(this.outputDir, outputFilename);
      
      const pdfBytes_filled = await pdfDoc.save();
      fs.writeFileSync(outputPath, pdfBytes_filled);
      
      console.log('💾 Completed PDF saved:', outputPath);
      
      return outputPath;
    } catch (error) {
      console.error('❌ Error filling PDF:', error);
      throw error;
    }
  }

  /**
   * Combine form data from all recipients in the workflow
   * @param {Object} workflowData - Workflow with recipients and form data history
   * @returns {Object} Combined form data
   */
  combineWorkflowFormData(workflowData) {
    const combinedData = {};
    
    // Combine data from all recipients in form data history
    if (workflowData.formDataHistory) {
      for (const submission of workflowData.formDataHistory) {
        if (submission.form_data) {
          Object.assign(combinedData, submission.form_data);
        }
      }
    }
    
    return combinedData;
  }

  /**
   * Fill form fields with data
   * @param {Object} form - PDF form object
   * @param {Object} formData - Form data to fill
   */
  async fillFormFields(form, formData, pdfDoc) {
    const fields = form.getFields();
    let filledCount = 0;
    let hiddenCount = 0;

    for (const field of fields) {
      const fieldName = field.getName();
      
      // Hide kbup field completely by clearing its value
      if (fieldName && fieldName.toLowerCase() === 'kbup') {
        try {
          // Clear the field value and make it readonly
          if (field.setText) {
            field.setText(''); // Clear any existing value
          }
          field.enableReadOnly(); // Make it read-only so it can't be edited
          console.log('🔒 Hidden kbup field:', fieldName);
          hiddenCount++;
          continue;
        } catch (hideError) {
          console.warn(`⚠️ Could not hide kbup field:`, hideError.message);
          // Skip this field and continue
          continue;
        }
      }
      
      if (fieldName in formData) {
        const value = formData[fieldName];
        
        try {
          if (field.constructor.name === 'PDFTextField') {
            // Handle signature fields with image data
            const isSignatureField = fieldName.toLowerCase().includes('sign') || 
                                    fieldName.toLowerCase().includes('auth') ||
                                    fieldName.includes('SIGN') ||
                                    fieldName.includes('AUTH');
            if (typeof value === 'string' && value.startsWith('data:image/') && isSignatureField) {
              console.log('🖊️ Processing signature field with image:', fieldName);
              await this.embedSignatureImage(pdfDoc, field, value, fieldName);
              filledCount++;
            } else if (typeof value === 'string' && value.startsWith('data:image/')) {
              // Skip other image data in regular text fields
              console.log('⏭️ Skipping image data for non-signature text field:', fieldName);
              continue;
            } else {
              // Regular text field
              field.setText(String(value));
              console.log(`✍️ Filled text field "${fieldName}" with: "${String(value).substring(0, 50)}${String(value).length > 50 ? '...' : ''}"`);
              filledCount++;
            }
            
          } else if (field.constructor.name === 'PDFCheckBox') {
            // Handle checkboxes
            const isChecked = value === true || value === 'true' || value === 'Yes' || value === 'yes';
            if (isChecked) {
              field.check();
            } else {
              field.uncheck();
            }
            filledCount++;
            
          } else if (field.constructor.name === 'PDFDropdown') {
            // Handle dropdowns
            field.select(String(value));
            filledCount++;
            
          } else if ((fieldName.toLowerCase().includes('sign') || fieldName.toLowerCase().includes('auth') || fieldName.includes('SIGN') || fieldName.includes('AUTH')) && typeof value === 'string' && value.startsWith('data:image/')) {
            // Handle other signature field types
            console.log('🖊️ Processing non-text signature field:', fieldName);
            try {
              await this.embedSignatureImage(pdfDoc, field, value, fieldName);
              filledCount++;
            } catch (signatureError) {
              console.warn(`⚠️ Could not embed signature for ${fieldName}, using fallback`);
              // Fallback to text indication
              if (field.setText) {
                field.setText('✓ SIGNED');
                filledCount++;
              }
            }
          }
          
        } catch (fieldError) {
          console.warn(`⚠️ Error filling field ${fieldName}:`, fieldError.message);
        }
      }
    }
    
    console.log(`✅ Filled ${filledCount} form fields, hidden ${hiddenCount} fields out of ${fields.length} total fields`);
  }

  /**
   * Embed signature image into PDF field - simplified approach
   * @param {Object} pdfDoc - PDF document
   * @param {Object} field - PDF form field
   * @param {string} imageData - Base64 image data
   * @param {string} fieldName - Field name for logging
   */
  async embedSignatureImage(pdfDoc, field, imageData, fieldName) {
    try {
      console.log(`🖊️ Attempting to embed signature image for: ${fieldName}`);
      
      // Extract base64 data
      const base64Data = imageData.split(',')[1];
      if (!base64Data) {
        throw new Error('Invalid image data format');
      }
      
      // Convert to bytes
      const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      // Embed image in PDF (try PNG first, fallback to JPG)
      let image;
      try {
        image = await pdfDoc.embedPng(imageBytes);
        console.log(`✅ PNG image embedded, dimensions: ${image.width}x${image.height}`);
      } catch (pngError) {
        console.log('⚠️ PNG embed failed, trying JPG...');
        image = await pdfDoc.embedJpeg(imageBytes);
        console.log(`✅ JPEG image embedded, dimensions: ${image.width}x${image.height}`);
      }
      
      // SIMPLIFIED APPROACH: Place signature on all pages where the field name suggests it belongs
      const pages = pdfDoc.getPages();
      console.log(`📄 PDF has ${pages.length} pages`);
      
      // Try multiple positioning strategies
      let signaturePlaced = false;
      
      // Strategy 1: Try to get actual field position
      try {
        const form = pdfDoc.getForm();
        const formField = form.getTextField(fieldName);
        const widgets = formField.acroField.getWidgets();
        
        for (let i = 0; i < widgets.length; i++) {
          const widget = widgets[i];
          const rect = widget.getRectangle();
          const pageRef = widget.P();
          
          // Find which page this widget belongs to
          let targetPageIndex = 0;
          for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
            if (pages[pageIdx].ref === pageRef) {
              targetPageIndex = pageIdx;
              break;
            }
          }
          
          const targetPage = pages[targetPageIndex];
          console.log(`📍 Found field position: Page ${targetPageIndex + 1}, Rect: ${rect.x}, ${rect.y}, ${rect.width}, ${rect.height}`);
          
          // Calculate signature dimensions (fit within field)
          const maxWidth = Math.max(rect.width, 150);
          const maxHeight = Math.max(rect.height, 40);
          
          // Maintain aspect ratio
          const imageAspect = image.width / image.height;
          let drawWidth = maxWidth;
          let drawHeight = maxWidth / imageAspect;
          
          if (drawHeight > maxHeight) {
            drawHeight = maxHeight;
            drawWidth = maxHeight * imageAspect;
          }
          
          // Center within field
          const drawX = rect.x + (rect.width - drawWidth) / 2;
          const drawY = rect.y + (rect.height - drawHeight) / 2;
          
          // Draw signature
          targetPage.drawImage(image, {
            x: drawX,
            y: drawY,
            width: drawWidth,
            height: drawHeight
          });
          
          console.log(`✅ Signature placed on page ${targetPageIndex + 1} at (${drawX.toFixed(1)}, ${drawY.toFixed(1)}) size ${drawWidth.toFixed(1)}x${drawHeight.toFixed(1)}`);
          signaturePlaced = true;
        }
      } catch (fieldPositionError) {
        console.log(`⚠️ Could not get exact field position: ${fieldPositionError.message}`);
      }
      
      // Strategy 2: If field positioning failed, place signatures on likely pages
      if (!signaturePlaced) {
        console.log('📌 Using fallback positioning...');
        
        // Place on last page (most signatures are at the end)
        const lastPage = pages[pages.length - 1];
        const { width: pageWidth, height: pageHeight } = lastPage.getSize();
        
        // Calculate signature size (reasonable default)
        const signatureWidth = Math.min(200, pageWidth * 0.3);
        const signatureHeight = signatureWidth / (image.width / image.height);
        
        // Position in bottom right area
        const x = pageWidth - signatureWidth - 50;
        const y = 100; // From bottom
        
        lastPage.drawImage(image, {
          x,
          y,
          width: signatureWidth,
          height: signatureHeight
        });
        
        console.log(`✅ Fallback signature placed on last page at (${x.toFixed(1)}, ${y.toFixed(1)}) size ${signatureWidth.toFixed(1)}x${signatureHeight.toFixed(1)}`);
        signaturePlaced = true;
      }
      
      // Clear the form field text
      if (field.setText) {
        field.setText('');
      }
      
      if (!signaturePlaced) {
        throw new Error('Could not place signature with any strategy');
      }
      
    } catch (error) {
      console.error(`❌ Error embedding signature image for ${fieldName}:`, error.message);
      console.error('Stack:', error.stack);
      
      // Fallback to visible text indication
      try {
        if (field.setText) {
          field.setText('*** DIGITALLY SIGNED ***');
          console.log(`✅ Set fallback text for ${fieldName}`);
        }
      } catch (fallbackError) {
        console.warn(`⚠️ Could not set fallback text for ${fieldName}: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Get the relative path for serving via HTTP
   * @param {string} absolutePath - Absolute file path
   * @returns {string} Relative path for HTTP serving
   */
  getRelativePath(absolutePath) {
    const filename = path.basename(absolutePath);
    return `/completed_forms/${filename}`;
  }

  /**
   * Check if a completed PDF exists for a workflow
   * @param {string} workflowId - Workflow ID
   * @returns {boolean|string} False if not exists, file path if exists
   */
  getCompletedPDFPath(workflowId) {
    const filename = `workflow_${workflowId}_completed.pdf`;
    const fullPath = path.join(this.outputDir, filename);
    
    return fs.existsSync(fullPath) ? fullPath : false;
  }

  /**
   * Process all completed workflows and generate PDFs
   * @param {Function} getCompletedWorkflows - Function to get completed workflows from database
   */
  async processExistingCompletedWorkflows(getCompletedWorkflows) {
    console.log('🔄 Processing existing completed workflows...');
    
    try {
      const completedWorkflows = await getCompletedWorkflows();
      console.log(`📊 Found ${completedWorkflows.length} completed workflows`);
      
      let processedCount = 0;
      let errorCount = 0;
      
      for (const workflow of completedWorkflows) {
        try {
          // Check if PDF already exists
          if (this.getCompletedPDFPath(workflow.id)) {
            console.log(`⏭️ PDF already exists for workflow ${workflow.id}`);
            continue;
          }
          
          await this.fillAndFlattenPDF(
            workflow.document_url || workflow.documentUrl,
            workflow,
            workflow.id
          );
          
          processedCount++;
          console.log(`✅ Processed workflow ${workflow.id} (${processedCount}/${completedWorkflows.length})`);
          
        } catch (workflowError) {
          console.error(`❌ Error processing workflow ${workflow.id}:`, workflowError.message);
          errorCount++;
        }
      }
      
      console.log(`🎉 Batch processing complete: ${processedCount} processed, ${errorCount} errors`);
      
    } catch (error) {
      console.error('❌ Error in batch processing:', error);
      throw error;
    }
  }
}

module.exports = PDFFormFillerService;