const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, 'mve_workflows.db');
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('❌ Error opening database:', err);
          reject(err);
          return;
        }
        console.log('✅ Connected to SQLite database');
        this.createTables().then(resolve).catch(reject);
      });
    });
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      // Create tables first, then indexes
      const tableQueries = [
        // Workflows table
        `CREATE TABLE IF NOT EXISTS workflows (
          id TEXT PRIMARY KEY,
          uuid TEXT UNIQUE NOT NULL,
          document_url TEXT,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT,
          completed_pdf_path TEXT
        )`,
        
        // Recipients table
        `CREATE TABLE IF NOT EXISTS recipients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workflow_id TEXT NOT NULL,
          recipient_name TEXT NOT NULL,
          email TEXT,
          mobile TEXT,
          recipient_type TEXT DEFAULT 'PRESCRIBER',
          order_index INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending',
          unique_token TEXT UNIQUE,
          form_data TEXT, -- JSON string of form field values
          submitted_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (workflow_id) REFERENCES workflows (id)
        )`,
        
        // Notifications table (for tracking email/SMS events)
        `CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workflow_id TEXT NOT NULL,
          recipient_id INTEGER,
          type TEXT NOT NULL, -- 'email' or 'sms'
          recipient_address TEXT NOT NULL, -- email address or phone number
          subject TEXT,
          message TEXT,
          status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
          external_id TEXT, -- Twilio message SID or email ID
          error_message TEXT,
          sent_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (workflow_id) REFERENCES workflows (id),
          FOREIGN KEY (recipient_id) REFERENCES recipients (id)
        )`,
        
        // Message templates table
        `CREATE TABLE IF NOT EXISTS message_templates (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL, -- 'email' or 'sms'
          name TEXT NOT NULL,
          subject TEXT,
          content TEXT NOT NULL,
          variables TEXT, -- JSON array of variable names
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Attachments table
        `CREATE TABLE IF NOT EXISTS attachments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workflow_id TEXT NOT NULL,
          recipient_id INTEGER,
          original_filename TEXT NOT NULL,
          stored_filename TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          mime_type TEXT NOT NULL,
          uploaded_by TEXT, -- recipient name or 'admin'
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (workflow_id) REFERENCES workflows (id),
          FOREIGN KEY (recipient_id) REFERENCES recipients (id)
        )`
      ];
      
      const indexQueries = [
        // Create indexes for better performance
        `CREATE INDEX IF NOT EXISTS idx_workflows_uuid ON workflows (uuid)`,
        `CREATE INDEX IF NOT EXISTS idx_recipients_workflow ON recipients (workflow_id)`,
        `CREATE INDEX IF NOT EXISTS idx_recipients_token ON recipients (unique_token)`,
        `CREATE INDEX IF NOT EXISTS idx_notifications_workflow ON notifications (workflow_id)`,
        `CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications (type)`,
        `CREATE INDEX IF NOT EXISTS idx_attachments_workflow ON attachments (workflow_id)`,
        `CREATE INDEX IF NOT EXISTS idx_attachments_recipient ON attachments (recipient_id)`
      ];

      // First create all tables
      this.runQueriesSequentially(tableQueries)
        .then(() => {
          console.log('✅ All tables created successfully');
          // Then create indexes
          return this.runQueriesSequentially(indexQueries);
        })
        .then(() => {
          console.log('✅ All indexes created successfully');
          // Run migrations to add missing columns
          return this.runMigrations();
        })
        .then(() => {
          // Initialize default templates
          return this.initializeDefaultTemplates();
        })
        .then(() => {
          resolve();
        })
        .catch(reject);
    });
  }

  async runQueriesSequentially(queries) {
    return new Promise((resolve, reject) => {
      let index = 0;
      
      const runNext = () => {
        if (index >= queries.length) {
          resolve();
          return;
        }
        
        const query = queries[index];
        this.db.run(query, (err) => {
          if (err) {
            console.error(`❌ Error running query ${index + 1}:`, err);
            reject(err);
            return;
          }
          
          index++;
          runNext();
        });
      };
      
      runNext();
    });
  }

  async runMigrations() {
    return new Promise((resolve, reject) => {
      const migrations = [
        // Add form_data column to recipients table if it doesn't exist
        `ALTER TABLE recipients ADD COLUMN form_data TEXT`,
        // Add submitted_at column to recipients table if it doesn't exist
        `ALTER TABLE recipients ADD COLUMN submitted_at DATETIME`,
        // Add completed_pdf_path column to workflows table if it doesn't exist
        `ALTER TABLE workflows ADD COLUMN completed_pdf_path TEXT`,
        // Add send_completed_pdf column to recipients table if it doesn't exist
        `ALTER TABLE recipients ADD COLUMN send_completed_pdf BOOLEAN DEFAULT 0`,
        // Add send_audit_doc column to recipients table if it doesn't exist
        `ALTER TABLE recipients ADD COLUMN send_audit_doc BOOLEAN DEFAULT 0`,
        // Add audit_doc_path column to workflows table if it doesn't exist
        `ALTER TABLE workflows ADD COLUMN audit_doc_path TEXT`
      ];
      
      let index = 0;
      
      const runNext = () => {
        if (index >= migrations.length) {
          console.log('✅ All migrations completed successfully');
          resolve();
          return;
        }
        
        const migration = migrations[index];
        this.db.run(migration, (err) => {
          if (err) {
            // Ignore "duplicate column name" errors - column already exists
            if (err.message.includes('duplicate column name')) {
              console.log(`ℹ️ Migration ${index + 1} skipped - column already exists`);
            } else {
              console.error(`❌ Error running migration ${index + 1}:`, err);
              reject(err);
              return;
            }
          } else {
            console.log(`✅ Migration ${index + 1} completed successfully`);
          }
          
          index++;
          runNext();
        });
      };
      
      runNext();
    });
  }

  // Workflow methods
  async createWorkflow(uuid, documentUrl = null, metadata = {}) {
    return new Promise((resolve, reject) => {
      const id = `workflow_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const metadataJson = JSON.stringify(metadata);
      
      this.db.run(
        `INSERT INTO workflows (id, uuid, document_url, metadata) VALUES (?, ?, ?, ?)`,
        [id, uuid, documentUrl, metadataJson],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({ id, uuid, documentUrl, metadata });
        }
      );
    });
  }

  async getWorkflowByUuid(uuid) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM workflows WHERE uuid = ?`,
        [uuid],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (row && row.metadata) {
            try {
              row.metadata = JSON.parse(row.metadata);
            } catch (e) {
              row.metadata = {};
            }
          }
          
          resolve(row);
        }
      );
    });
  }

  async updateWorkflowStatus(workflowId, status) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE workflows SET status = ?, updated_at = datetime('now') WHERE id = ?`,
        [status, workflowId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({ changes: this.changes });
        }
      );
    });
  }

  // Helper method to generate unique recipient token
  generateRecipientToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Recipient methods
  async addRecipient(workflowId, recipientData) {
    return new Promise((resolve, reject) => {
      const { 
        recipientName, 
        email, 
        mobile, 
        recipientType = 'PRESCRIBER', 
        orderIndex = 0,
        sendCompletedPdf = false,
        sendAuditDoc = false
      } = recipientData;
      const uniqueToken = this.generateRecipientToken();
      
      this.db.run(
        `INSERT INTO recipients (workflow_id, recipient_name, email, mobile, recipient_type, order_index, unique_token, send_completed_pdf, send_audit_doc) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [workflowId, recipientName, email, mobile, recipientType, orderIndex, uniqueToken, sendCompletedPdf ? 1 : 0, sendAuditDoc ? 1 : 0],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({ id: this.lastID, uniqueToken, ...recipientData });
        }
      );
    });
  }

  async getRecipientsByWorkflow(workflowId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM recipients WHERE workflow_id = ? ORDER BY order_index`,
        [workflowId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows);
        }
      );
    });
  }

  async getRecipientByToken(token) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT r.*, w.uuid as workflow_uuid, w.document_url, w.status as workflow_status 
         FROM recipients r 
         JOIN workflows w ON r.workflow_id = w.id 
         WHERE r.unique_token = ?`,
        [token],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        }
      );
    });
  }

  async updateRecipientStatus(recipientId, status) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE recipients SET status = ? WHERE id = ?`,
        [status, recipientId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({ changes: this.changes });
        }
      );
    });
  }

  async updateRecipientFormData(recipientId, formData, updateSubmittedAt = true) {
    return new Promise((resolve, reject) => {
      const formDataJson = JSON.stringify(formData);
      
      // Choose query based on whether to update submitted_at
      const query = updateSubmittedAt 
        ? `UPDATE recipients SET form_data = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?`
        : `UPDATE recipients SET form_data = ? WHERE id = ?`;
      
      const params = updateSubmittedAt 
        ? [formDataJson, recipientId] 
        : [formDataJson, recipientId];
      
      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({ changes: this.changes });
      });
    });
  }

  async getWorkflowFormData(workflowId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT recipient_name, recipient_type, order_index, form_data, submitted_at, status 
         FROM recipients 
         WHERE workflow_id = ? AND form_data IS NOT NULL 
         ORDER BY order_index`,
        [workflowId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          
          const formDataHistory = rows.map(row => ({
            ...row,
            form_data: row.form_data ? JSON.parse(row.form_data) : {}
          }));
          
          resolve(formDataHistory);
        }
      );
    });
  }

  async getNextPendingRecipient(workflowId, currentOrderIndex) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM recipients 
         WHERE workflow_id = ? AND order_index > ? AND status = 'pending' 
         ORDER BY order_index LIMIT 1`,
        [workflowId, currentOrderIndex],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        }
      );
    });
  }

  // Notification methods
  async saveNotification(notificationData) {
    return new Promise((resolve, reject) => {
      const {
        workflowId,
        recipientId = null,
        type,
        recipientAddress,
        subject = null,
        message,
        status = 'pending',
        externalId = null,
        errorMessage = null
      } = notificationData;

      this.db.run(
        `INSERT INTO notifications 
         (workflow_id, recipient_id, type, recipient_address, subject, message, status, external_id, error_message, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
        [workflowId, recipientId, type, recipientAddress, subject, message, status, externalId, errorMessage, status],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({ id: this.lastID, ...notificationData });
        }
      );
    });
  }

  async getNotificationsByWorkflow(workflowId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM notifications WHERE workflow_id = ? ORDER BY created_at DESC`,
        [workflowId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows);
        }
      );
    });
  }

  async updateNotificationStatus(notificationId, status, externalId = null, errorMessage = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE notifications 
         SET status = ?, external_id = ?, error_message = ?, 
             sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END
         WHERE id = ?`,
        [status, externalId, errorMessage, status, notificationId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({ changes: this.changes });
        }
      );
    });
  }

  // Template methods
  async getTemplates() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM message_templates ORDER BY type, name`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          
          const templates = rows.map(row => ({
            ...row,
            variables: row.variables ? JSON.parse(row.variables) : []
          }));
          
          resolve(templates);
        }
      );
    });
  }

  async getTemplate(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM message_templates WHERE id = ?`,
        [id],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (row && row.variables) {
            try {
              row.variables = JSON.parse(row.variables);
            } catch (e) {
              row.variables = [];
            }
          }
          
          resolve(row);
        }
      );
    });
  }

  async saveTemplate(templateData) {
    return new Promise((resolve, reject) => {
      const { id, type, name, subject, content, variables } = templateData;
      const variablesJson = JSON.stringify(variables || []);
      
      this.db.run(
        `INSERT OR REPLACE INTO message_templates 
         (id, type, name, subject, content, variables, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, type, name, subject, content, variablesJson],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({ id, ...templateData });
        }
      );
    });
  }

  async initializeDefaultTemplates() {
    const defaultTemplates = [
      {
        id: 'sms_workflow_notification',
        type: 'sms',
        name: 'SMS Workflow Notification',
        subject: null,
        content: `Hi {{recipientName}}!

You've been added to a PDF workflow for completion.

{{message}}

Access your workflow: {{workflowUrl}}

This is an automated message from MVE PDF Workflow System.`,
        variables: ['recipientName', 'message', 'workflowUrl']
      },
      {
        id: 'email_workflow_notification',
        type: 'email',
        name: 'Email Workflow Notification',
        subject: 'PDF Workflow - Action Required',
        content: `Hi {{recipientName}},

You've been added to a PDF workflow for completion.

{{body}}

Access your workflow: {{workflowUrl}}

Best regards,
MVE PDF Workflow System`,
        variables: ['recipientName', 'body', 'workflowUrl']
      }
    ];

    for (const template of defaultTemplates) {
      try {
        const existing = await this.getTemplate(template.id);
        if (!existing) {
          await this.saveTemplate(template);
          console.log(`✅ Created default template: ${template.name}`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to initialize template ${template.id}:`, error);
      }
    }
  }

  // Utility methods
  async getWorkflowStats() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
           COUNT(*) as total_workflows,
           COUNT(CASE WHEN status = 'active' THEN 1 END) as active_workflows,
           COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_workflows
         FROM workflows`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows[0]);
        }
      );
    });
  }

  // Attachment methods
  async saveAttachment(attachmentData) {
    return new Promise((resolve, reject) => {
      const { workflowId, recipientId, originalFilename, storedFilename, fileSize, mimeType, uploadedBy } = attachmentData;
      
      this.db.run(
        `INSERT INTO attachments (workflow_id, recipient_id, original_filename, stored_filename, file_size, mime_type, uploaded_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [workflowId, recipientId, originalFilename, storedFilename, fileSize, mimeType, uploadedBy],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({ id: this.lastID, ...attachmentData });
        }
      );
    });
  }

  async getAttachmentsByWorkflow(workflowId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT a.*, r.recipient_name 
         FROM attachments a 
         LEFT JOIN recipients r ON a.recipient_id = r.unique_token 
         WHERE a.workflow_id = ? 
         ORDER BY a.created_at DESC`,
        [workflowId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }

  async getAttachmentsByRecipient(recipientId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM attachments WHERE recipient_id = ? ORDER BY created_at DESC`,
        [recipientId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }

  async getAttachmentById(attachmentId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM attachments WHERE id = ?`,
        [attachmentId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        }
      );
    });
  }

  async updateWorkflowCompletedPDF(workflowId, pdfPath) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE workflows SET completed_pdf_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [pdfPath, workflowId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes);
        }
      );
    });
  }

  async updateWorkflowAuditDoc(workflowId, auditDocPath) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE workflows SET audit_doc_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [auditDocPath, workflowId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes);
        }
      );
    });
  }

  async getCompletedWorkflows() {
    return new Promise(async (resolve, reject) => {
      try {
        // Get all completed workflows first
        const workflows = await new Promise((workflowResolve, workflowReject) => {
          this.db.all(
            `SELECT * FROM workflows WHERE status = 'completed' ORDER BY updated_at DESC`,
            (err, rows) => {
              if (err) workflowReject(err);
              else workflowResolve(rows);
            }
          );
        });
        
        // For each workflow, get its form data history
        const workflowsWithData = await Promise.all(
          workflows.map(async (workflow) => {
            const formDataHistory = await this.getWorkflowFormData(workflow.id);
            return {
              ...workflow,
              formDataHistory: formDataHistory
            };
          })
        );
        
        resolve(workflowsWithData);
      } catch (error) {
        reject(error);
      }
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('❌ Error closing database:', err);
        } else {
          console.log('✅ Database connection closed');
        }
      });
    }
  }
}

module.exports = Database;