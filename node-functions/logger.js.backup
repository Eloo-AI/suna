const { Logging } = require('@google-cloud/logging');
const { ErrorReporting } = require('@google-cloud/error-reporting');

/**
 * GCP Cloud Logging service for FlowAgent observability
 * Provides structured logging with trace correlation across the entire flow
 */
class FlowAgentLogger {
  constructor() {
    this.logging = new Logging();
    this.errorReporting = new ErrorReporting();
    this.log = this.logging.log('flowagent');
    
    // Log levels
    this.levels = {
      DEBUG: 'DEBUG',
      INFO: 'INFO', 
      WARNING: 'WARNING',
      ERROR: 'ERROR',
      CRITICAL: 'CRITICAL'
    };
  }

  /**
   * Generate a new trace ID for request correlation
   */
  generateTraceId() {
    return `flowagent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create structured log entry with FlowAgent context
   */
  createLogEntry(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    
    return {
      timestamp,
      severity: level,
      message,
      labels: {
        service: 'flowagent',
        component: metadata.component || 'unknown',
        threadId: metadata.threadId || null,
        traceId: metadata.traceId || null,
        agentType: metadata.agentType || null,
        phase: metadata.phase || null,
        operation: metadata.operation || null
      },
      jsonPayload: {
        ...metadata,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    };
  }

  /**
   * Log FlowAgent session initiation
   */
  logSessionStart(traceId, threadId, agentType, phase, expectedFiles, additionalData = {}) {
    const entry = this.createLogEntry(this.levels.INFO, 'FlowAgent session initiated', {
      component: 'session',
      operation: 'initiate',
      traceId,
      threadId,
      agentType,
      phase,
      expectedFiles,
      expectedFileCount: expectedFiles.length,
      promptLength: additionalData.promptLength,
      modelName: additionalData.modelName,
      userEmail: additionalData.userEmail
    });

    this.log.write(entry);
    console.log(`[${traceId}] Session started: ${threadId} (${agentType} phase ${phase})`);
  }

  /**
   * Log file polling attempts
   */
  logFileCheck(traceId, threadId, attempt, maxAttempts, fileStatuses, additionalData = {}) {
    const readyFiles = fileStatuses.filter(f => f.status === 'ready');
    const pendingFiles = fileStatuses.filter(f => f.status === 'pending');
    
    const entry = this.createLogEntry(this.levels.INFO, 'FlowAgent file check', {
      component: 'files',
      operation: 'check',
      traceId,
      threadId,
      attempt,
      maxAttempts,
      progress: `${readyFiles.length}/${fileStatuses.length}`,
      readyFiles: readyFiles.map(f => f.name),
      pendingFiles: pendingFiles.map(f => f.name),
      duration: additionalData.duration,
      sandboxId: additionalData.sandboxId
    });

    this.log.write(entry);
    
    if (attempt % 5 === 0 || readyFiles.length > 0) {
      console.log(`[${traceId}] File check ${attempt}/${maxAttempts}: ${readyFiles.length}/${fileStatuses.length} ready`);
    }
  }

  /**
   * Log successful file downloads
   */
  logFileDownload(traceId, threadId, fileName, size, additionalData = {}) {
    const entry = this.createLogEntry(this.levels.INFO, 'FlowAgent file downloaded', {
      component: 'files',
      operation: 'download',
      traceId,
      threadId,
      fileName,
      fileSize: size,
      fileSizeKB: Math.round(size / 1024),
      downloadDuration: additionalData.duration,
      unexpected: additionalData.unexpected || false
    });

    this.log.write(entry);
    console.log(`[${traceId}] Downloaded: ${fileName} (${Math.round(size / 1024)}KB)`);
  }

  /**
   * Log phase completion
   */
  logPhaseComplete(traceId, threadId, agentType, phase, artifacts, duration, additionalData = {}) {
    const entry = this.createLogEntry(this.levels.INFO, 'FlowAgent phase completed', {
      component: 'phase',
      operation: 'complete',
      traceId,
      threadId,
      agentType,
      phase,
      artifactsGenerated: artifacts.map(a => ({ name: a.name, type: a.type })),
      artifactCount: artifacts.length,
      totalDuration: duration,
      totalDurationMinutes: Math.round(duration / 60000),
      filesDownloaded: additionalData.filesDownloaded || 0,
      pollingAttempts: additionalData.pollingAttempts || 0
    });

    this.log.write(entry);
    console.log(`[${traceId}] Phase ${phase} completed: ${artifacts.length} artifacts in ${Math.round(duration / 60000)}min`);
  }

  /**
   * Log warnings (e.g., slow operations, missing files)
   */
  logWarning(traceId, threadId, message, additionalData = {}) {
    const entry = this.createLogEntry(this.levels.WARNING, message, {
      component: additionalData.component || 'general',
      operation: additionalData.operation || 'warning',
      traceId,
      threadId,
      ...additionalData
    });

    this.log.write(entry);
    console.warn(`[${traceId}] WARNING: ${message}`);
  }

  /**
   * Log errors with automatic error reporting
   */
  logError(traceId, threadId, error, context = {}) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : null;
    
    const entry = this.createLogEntry(this.levels.ERROR, `FlowAgent error: ${errorMessage}`, {
      component: context.component || 'general',
      operation: context.operation || 'error',
      traceId,
      threadId,
      errorType: error.constructor.name,
      errorStack,
      ...context
    });

    this.log.write(entry);
    
    // Report to GCP Error Reporting
    this.errorReporting.report(error, {
      user: context.userEmail || 'unknown',
      httpRequest: context.httpRequest,
      serviceContext: {
        service: 'flowagent',
        version: '1.0.0'
      }
    });

    console.error(`[${traceId}] ERROR: ${errorMessage}`);
  }

  /**
   * Log timeout events
   */
  logTimeout(traceId, threadId, operation, duration, context = {}) {
    const entry = this.createLogEntry(this.levels.ERROR, 'FlowAgent operation timeout', {
      component: context.component || 'general',
      operation: 'timeout',
      traceId,
      threadId,
      timeoutOperation: operation,
      duration,
      durationMinutes: Math.round(duration / 60000),
      maxAttempts: context.maxAttempts,
      lastStatus: context.lastStatus,
      expectedFiles: context.expectedFiles
    });

    this.log.write(entry);
    console.error(`[${traceId}] TIMEOUT: ${operation} after ${Math.round(duration / 60000)}min`);
  }

  /**
   * Log session recovery attempts
   */
  logSessionRecovery(traceId, threadId, success, additionalData = {}) {
    const level = success ? this.levels.INFO : this.levels.WARNING;
    const message = success ? 'FlowAgent session recovered' : 'FlowAgent session recovery failed';
    
    const entry = this.createLogEntry(level, message, {
      component: 'session',
      operation: 'recovery',
      traceId,
      threadId,
      recoverySuccess: success,
      recoveryMethod: additionalData.method || 'database',
      agentType: additionalData.agentType,
      phase: additionalData.phase,
      error: additionalData.error
    });

    this.log.write(entry);
    console.log(`[${traceId}] Session recovery: ${success ? 'SUCCESS' : 'FAILED'}`);
  }

  /**
   * Create a trace context for request correlation
   */
  createTraceContext(req) {
    // Extract trace from headers or generate new one
    const traceId = req.headers['x-trace-id'] || this.generateTraceId();
    const threadId = req.query.threadId || req.body?.threadId || null;
    
    return {
      traceId,
      threadId,
      userAgent: req.headers['user-agent'],
      clientIP: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      timestamp: Date.now()
    };
  }

  /**
   * Middleware to add trace context to all requests
   */
  traceMiddleware() {
    return (req, res, next) => {
      req.trace = this.createTraceContext(req);
      
      // Add trace ID to response headers
      res.set('X-Trace-ID', req.trace.traceId);
      
      // Log request start
      const entry = this.createLogEntry(this.levels.DEBUG, 'FlowAgent request received', {
        component: 'api',
        operation: 'request',
        traceId: req.trace.traceId,
        threadId: req.trace.threadId,
        method: req.method,
        path: req.path,
        userAgent: req.trace.userAgent,
        clientIP: req.trace.clientIP
      });
      
      this.log.write(entry);
      next();
    };
  }
}

// Export singleton instance
module.exports = new FlowAgentLogger();