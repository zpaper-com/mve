import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from './logger';
import { config } from './env';
import { verifyToken } from '../middleware/auth';
import { 
  SocketData, 
  WorkflowUpdateEvent, 
  AttachmentUploadEvent,
  AuthenticatedRequest 
} from '../types';

export class WebSocketService {
  private io: SocketServer;
  private connectedClients = new Map<string, any>();

  constructor(httpServer: HttpServer) {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: config.cors.origins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        const sessionId = socket.handshake.query.sessionId as string;
        const recipientId = socket.handshake.query.recipientId as string;

        let user: any = null;

        // Try to authenticate with JWT token
        if (token) {
          try {
            user = await verifyToken(token);
            logger.debug('Socket authenticated with JWT', {
              socketId: socket.id,
              userId: user.sub,
            });
          } catch (error) {
            logger.debug('Socket JWT authentication failed', {
              socketId: socket.id,
              error: (error as Error).message,
            });
          }
        }

        // Store user data and session info
        const socketData: SocketData = {
          userId: user?.sub,
          sessionId,
          recipientId,
        };

        socket.data = socketData;

        logger.info('Socket connected', {
          socketId: socket.id,
          userId: user?.sub || 'anonymous',
          sessionId,
          recipientId,
        });

        next();
      } catch (error) {
        logger.error('Socket authentication error', {
          socketId: socket.id,
          error: (error as Error).message,
        });
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      const socketData = socket.data as SocketData;
      
      // Store client connection
      this.connectedClients.set(socket.id, {
        socket,
        userId: socketData.userId,
        sessionId: socketData.sessionId,
        recipientId: socketData.recipientId,
        connectedAt: new Date(),
      });

      // Join session room if sessionId is provided
      if (socketData.sessionId) {
        socket.join(`session:${socketData.sessionId}`);
        logger.debug('Socket joined session room', {
          socketId: socket.id,
          sessionId: socketData.sessionId,
        });
      }

      // Join recipient room if recipientId is provided
      if (socketData.recipientId) {
        socket.join(`recipient:${socketData.recipientId}`);
        logger.debug('Socket joined recipient room', {
          socketId: socket.id,
          recipientId: socketData.recipientId,
        });
      }

      // Handle workflow status request
      socket.on('workflow:status', async (data) => {
        try {
          logger.debug('Workflow status requested', {
            socketId: socket.id,
            sessionId: data.sessionId,
          });
          
          // Emit current status (would be populated by workflow service)
          socket.emit('workflow:status', {
            sessionId: data.sessionId,
            status: 'active',
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error('Error handling workflow status request', {
            socketId: socket.id,
            error: (error as Error).message,
          });
          socket.emit('error', { message: 'Failed to get workflow status' });
        }
      });

      // Handle form data updates
      socket.on('form:update', async (data) => {
        try {
          logger.debug('Form data update received', {
            socketId: socket.id,
            sessionId: socketData.sessionId,
            fieldCount: Object.keys(data.formData || {}).length,
          });

          // Broadcast to other clients in the same session
          if (socketData.sessionId) {
            socket.to(`session:${socketData.sessionId}`).emit('form:updated', {
              recipientId: socketData.recipientId,
              formData: data.formData,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (error) {
          logger.error('Error handling form update', {
            socketId: socket.id,
            error: (error as Error).message,
          });
          socket.emit('error', { message: 'Failed to update form data' });
        }
      });

      // Handle attachment upload notifications
      socket.on('attachment:uploaded', async (data) => {
        try {
          logger.debug('Attachment upload notification received', {
            socketId: socket.id,
            attachmentId: data.attachmentId,
            sessionId: socketData.sessionId,
          });

          // Broadcast to other clients in the same session
          if (socketData.sessionId) {
            const event: AttachmentUploadEvent = {
              type: 'attachment_uploaded',
              sessionId: socketData.sessionId,
              attachment: data.attachment,
            };

            socket.to(`session:${socketData.sessionId}`).emit('attachment:uploaded', event);
          }
        } catch (error) {
          logger.error('Error handling attachment upload notification', {
            socketId: socket.id,
            error: (error as Error).message,
          });
          socket.emit('error', { message: 'Failed to notify attachment upload' });
        }
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        logger.info('Socket disconnected', {
          socketId: socket.id,
          reason,
          userId: socketData.userId || 'anonymous',
          sessionId: socketData.sessionId,
        });

        // Remove from connected clients
        this.connectedClients.delete(socket.id);
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error('Socket error', {
          socketId: socket.id,
          error: error.message,
          userId: socketData.userId || 'anonymous',
        });
      });
    });
  }

  // Broadcast workflow update to all clients in a session
  public broadcastWorkflowUpdate(event: WorkflowUpdateEvent): void {
    try {
      this.io.to(`session:${event.sessionId}`).emit('workflow:updated', event);
      
      logger.debug('Workflow update broadcasted', {
        sessionId: event.sessionId,
        recipientId: event.recipientId,
        status: event.status,
      });
    } catch (error) {
      logger.error('Error broadcasting workflow update', {
        sessionId: event.sessionId,
        error: (error as Error).message,
      });
    }
  }

  // Broadcast attachment upload to all clients in a session
  public broadcastAttachmentUpload(event: AttachmentUploadEvent): void {
    try {
      this.io.to(`session:${event.sessionId}`).emit('attachment:uploaded', event);
      
      logger.debug('Attachment upload broadcasted', {
        sessionId: event.sessionId,
        attachmentId: event.attachment.id,
      });
    } catch (error) {
      logger.error('Error broadcasting attachment upload', {
        sessionId: event.sessionId,
        error: (error as Error).message,
      });
    }
  }

  // Send notification to specific recipient
  public notifyRecipient(recipientId: string, event: string, data: any): void {
    try {
      this.io.to(`recipient:${recipientId}`).emit(event, data);
      
      logger.debug('Notification sent to recipient', {
        recipientId,
        event,
      });
    } catch (error) {
      logger.error('Error sending notification to recipient', {
        recipientId,
        event,
        error: (error as Error).message,
      });
    }
  }

  // Get connection statistics
  public getConnectionStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    anonymousConnections: number;
    sessionConnections: { [sessionId: string]: number };
  } {
    const connections = Array.from(this.connectedClients.values());
    const sessionConnections: { [sessionId: string]: number } = {};

    connections.forEach(conn => {
      if (conn.sessionId) {
        sessionConnections[conn.sessionId] = (sessionConnections[conn.sessionId] || 0) + 1;
      }
    });

    return {
      totalConnections: connections.length,
      authenticatedConnections: connections.filter(conn => conn.userId).length,
      anonymousConnections: connections.filter(conn => !conn.userId).length,
      sessionConnections,
    };
  }

  // Close specific connection
  public disconnectClient(socketId: string): void {
    const client = this.connectedClients.get(socketId);
    if (client) {
      client.socket.disconnect(true);
      this.connectedClients.delete(socketId);
      
      logger.info('Client disconnected manually', { socketId });
    }
  }

  // Shutdown WebSocket server
  public async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close(() => {
        logger.info('WebSocket server closed');
        resolve();
      });
    });
  }
}