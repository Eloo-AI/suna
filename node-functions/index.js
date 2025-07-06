const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { FlowAgentService } = require('./flowAgentService');
const logger = require('./logger');

// Initialize tracing for distributed tracing
require('@google-cloud/trace-agent').start();

// Initialize Secret Manager client
const secretClient = new SecretManagerServiceClient();

// Configuration from environment variables
const config = {
  backend_url: process.env.BACKEND_URL || 'http://34.171.125.26:8000',
  supabase_url: process.env.SUPABASE_URL || 'https://nmwqprgbxtnikkmwhwyt.supabase.co',
  supabase_anon_key: process.env.SUPABASE_ANON_KEY,
  allowed_projects: (process.env.ALLOWED_FIREBASE_PROJECTS || '').split(','),
  org_domain: process.env.ELOO_ORG_DOMAIN || 'eloo.ai',
  service_account_email: process.env.SERVICE_ACCOUNT_EMAIL || 'suna-service@eloo.ai',
  service_account_password_secret: process.env.SERVICE_ACCOUNT_PASSWORD_SECRET || 'suna_service'
};

// Cache for secrets and auth
let serviceAccountAuth = null;
let cachedPassword = null;

// Global FlowAgent service instance
let flowAgentService = null;

/**
 * Get password from Google Cloud Secret Manager
 */
async function getServiceAccountPassword() {
  if (cachedPassword) {
    return cachedPassword;
  }

  try {
    const projectId = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'suna-deployment-1749244914';
    const secretName = `projects/${projectId}/secrets/${config.service_account_password_secret}/versions/latest`;
    
    console.log(`Fetching secret: ${secretName}`);
    
    const [version] = await secretClient.accessSecretVersion({
      name: secretName
    });

    const password = version.payload.data.toString();
    cachedPassword = password; // Cache for subsequent calls
    
    console.log('Successfully retrieved service account password from Secret Manager');
    return password;
    
  } catch (error) {
    console.error('Failed to retrieve password from Secret Manager:', error.message);
    throw new Error(`Secret Manager access failed: ${error.message}`);
  }
};

// CORS configuration - Security hardened
const getAllowedOrigins = () => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (allowedOrigins) {
    return allowedOrigins.split(',').map(origin => origin.trim());
  }
  
  // Default to localhost for development
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://localhost:3000',
    'https://localhost:5173'
  ];
  
  console.warn('ALLOWED_ORIGINS not set, using default development origins:', defaultOrigins);
  return defaultOrigins;
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Trace-ID'],
  credentials: true,
  maxAge: 86400 // Cache preflight for 24 hours
};

const corsMiddleware = cors(corsOptions);

// Rate limiting configuration
const rateLimitStore = new Map(); // In-memory store for rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute per user

/**
 * Simple rate limiting middleware
 */
function rateLimitMiddleware(req, res, next) {
  try {
    // Get user identifier from IP and user ID (if authenticated)
    const userKey = req.user?.uid || req.ip || req.headers['x-forwarded-for'] || 'anonymous';
    const now = Date.now();
    
    // Clean old entries
    for (const [key, data] of rateLimitStore.entries()) {
      if (now - data.firstRequest > RATE_LIMIT_WINDOW) {
        rateLimitStore.delete(key);
      }
    }
    
    // Get current user's request data
    const userData = rateLimitStore.get(userKey) || {
      requests: 0,
      firstRequest: now
    };
    
    // Reset window if expired
    if (now - userData.firstRequest > RATE_LIMIT_WINDOW) {
      userData.requests = 0;
      userData.firstRequest = now;
    }
    
    // Check rate limit
    if (userData.requests >= RATE_LIMIT_MAX_REQUESTS) {
      console.warn(`Rate limit exceeded for user: ${userKey}`);
      return res.status(429).json({
        error: {
          message: 'Too many requests, please try again later',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - userData.firstRequest)) / 1000)
        }
      });
    }
    
    // Increment request count
    userData.requests++;
    rateLimitStore.set(userKey, userData);
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX_REQUESTS - userData.requests));
    res.setHeader('X-RateLimit-Reset', Math.ceil((userData.firstRequest + RATE_LIMIT_WINDOW) / 1000));
    
    next();
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    // Continue without rate limiting if there's an error
    next();
  }
};

// Input validation utilities
const InputValidator = {
  /**
   * Validate and sanitize thread ID
   */
  validateThreadId(threadId) {
    if (!threadId || typeof threadId !== 'string') {
      throw new Error('Thread ID is required and must be a string');
    }
    
    // UUID v4 format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(threadId)) {
      throw new Error('Invalid thread ID format');
    }
    
    return threadId.toLowerCase();
  },

  /**
   * Validate prompt input
   */
  validatePrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required and must be a string');
    }
    
    if (prompt.length < 10) {
      throw new Error('Prompt must be at least 10 characters long');
    }
    
    if (prompt.length > 50000) {
      throw new Error('Prompt exceeds maximum length of 50,000 characters');
    }
    
    // Remove potentially dangerous content
    const sanitized = prompt
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocols
      .trim();
    
    return sanitized;
  },

  /**
   * Validate expected files array
   */
  validateExpectedFiles(expectedFiles) {
    if (!Array.isArray(expectedFiles)) {
      throw new Error('Expected files must be an array');
    }
    
    if (expectedFiles.length > 20) {
      throw new Error('Too many expected files (maximum 20)');
    }
    
    const validatedFiles = expectedFiles.map(fileName => {
      if (!fileName || typeof fileName !== 'string') {
        throw new Error('File name must be a non-empty string');
      }
      
      // Validate file name format
      const fileNameRegex = /^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+$/;
      if (!fileNameRegex.test(fileName)) {
        throw new Error(`Invalid file name format: ${fileName}`);
      }
      
      // Check for path traversal
      if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        throw new Error(`Invalid file name (path traversal detected): ${fileName}`);
      }
      
      return fileName.toLowerCase();
    });
    
    // Check for duplicates
    const unique = [...new Set(validatedFiles)];
    if (unique.length !== validatedFiles.length) {
      throw new Error('Duplicate file names detected');
    }
    
    return validatedFiles;
  },

  /**
   * Validate model name
   */
  validateModelName(modelName) {
    if (!modelName || typeof modelName !== 'string') {
      return 'claude-sonnet-4'; // Default
    }
    
    const allowedModels = [
      'claude-sonnet-4',
      'claude-haiku-3',
      'claude-opus-3',
      'gpt-4',
      'gpt-3.5-turbo'
    ];
    
    if (!allowedModels.includes(modelName)) {
      throw new Error(`Invalid model name. Allowed models: ${allowedModels.join(', ')}`);
    }
    
    return modelName;
  },

  /**
   * Validate chat message
   */
  validateMessage(message) {
    if (!message || typeof message !== 'string') {
      throw new Error('Message is required and must be a string');
    }
    
    if (message.length < 1) {
      throw new Error('Message cannot be empty');
    }
    
    if (message.length > 10000) {
      throw new Error('Message exceeds maximum length of 10,000 characters');
    }
    
    // Sanitize message
    const sanitized = message
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .trim();
    
    return sanitized;
  }
};

// Error handling utilities
const ErrorHandler = {
  /**
   * Generate unique error ID for tracking
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Sanitize error messages for client response
   */
  sanitizeErrorMessage(error, isDevelopment = false) {
    if (isDevelopment) {
      return error.message || 'Unknown error occurred';
    }

    // Map internal errors to safe public messages
    const errorMap = {
      'ValidationError': 'Invalid input provided',
      'AuthenticationError': 'Authentication failed',
      'AuthorizationError': 'Access denied',
      'NotFoundError': 'Resource not found',
      'TimeoutError': 'Request timed out',
      'RateLimitError': 'Too many requests, please try again later',
      'ServiceUnavailableError': 'Service temporarily unavailable'
    };

    const errorType = error.constructor.name;
    return errorMap[errorType] || 'An unexpected error occurred';
  },

  /**
   * Get appropriate HTTP status code for error
   */
  getStatusCode(error) {
    const statusMap = {
      'ValidationError': 400,
      'AuthenticationError': 401,
      'AuthorizationError': 403,
      'NotFoundError': 404,
      'TimeoutError': 408,
      'RateLimitError': 429,
      'ServiceUnavailableError': 503
    };

    return statusMap[error.constructor.name] || 500;
  },

  /**
   * Create standardized error response
   */
  createErrorResponse(error, context = '') {
    const errorId = this.generateErrorId();
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // Log full error details
    console.error(`[${errorId}] Error in ${context}:`, {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Return sanitized response
    return {
      error: {
        id: errorId,
        message: this.sanitizeErrorMessage(error, isDevelopment),
        code: error.code || 'INTERNAL_ERROR',
        ...(isDevelopment && { details: error.message })
      }
    };
  },

  /**
   * Async error wrapper for endpoints
   */
  asyncHandler(fn) {
    return async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        const statusCode = this.getStatusCode(error);
        const errorResponse = this.createErrorResponse(error, req.path);
        res.status(statusCode).json(errorResponse);
      }
    };
  }
};

// Multi-project Firebase authentication
const firebaseApps = new Map();

/**
 * Initialize Firebase app for a specific project
 */
function initializeFirebaseApp(projectId) {
  if (firebaseApps.has(projectId)) {
    return firebaseApps.get(projectId);
  }

  try {
    const app = admin.initializeApp({
      projectId: projectId
    }, projectId);
    
    firebaseApps.set(projectId, app);
    console.log(`Initialized Firebase app for project: ${projectId}`);
    return app;
  } catch (error) {
    console.error(`Failed to initialize Firebase app for project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Verify Firebase token from any allowed project
 */
async function verifyFirebaseToken(token) {
  if (!token) {
    throw new Error('No authentication token provided');
  }

  // Try each allowed project to verify the token
  for (const projectId of config.allowed_projects) {
    if (!projectId.trim()) continue;
    
    try {
      const app = initializeFirebaseApp(projectId);
      const auth = admin.auth(app);
      const decoded = await auth.verifyIdToken(token);
      
      // Optional: Check organization domain
      if (config.org_domain && decoded.email) {
        if (!decoded.email.endsWith(`@${config.org_domain}`)) {
          console.warn(`User ${decoded.email} not from organization domain ${config.org_domain}`);
          // Uncomment to enforce: throw new Error('User not from allowed organization');
        }
      }
      
      console.log(`Token verified for user ${decoded.email} from project ${projectId}`);
      return {
        uid: decoded.uid,
        email: decoded.email,
        projectId: projectId,
        decodedToken: decoded
      };
    } catch (error) {
      console.log(`Token verification failed for project ${projectId}: ${error.message}`);
      continue;
    }
  }
  
  throw new Error('Token verification failed for all allowed projects');
}

/**
 * Middleware to authenticate requests
 */
async function authenticateRequest(req, res, next) {
  try {
    let token = null;
    
    // Try to get token from Authorization header first (preferred)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // Fallback to secure cookie for SSE streams (since EventSource can't send headers)
      const cookies = req.headers.cookie;
      if (cookies) {
        const cookieMatch = cookies.match(/flowagent_auth=([^;]+)/);
        if (cookieMatch) {
          token = cookieMatch[1];
        }
      }
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Missing authentication token (header or cookie)' });
    }
    
    const user = await verifyFirebaseToken(token);
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication failed:', error);
    res.status(401).json({ error: 'Authentication failed: ' + error.message });
  }
}

/**
 * Suna Client class (same as before but adapted for Cloud Functions)
 */
class SunaClient {
  constructor() {
    this.accessToken = null;
    this.userId = null;
  }

  async authenticateWithSupabase(email, password) {
    const authUrl = `${config.supabase_url}/auth/v1/token?grant_type=password`;
    
    try {
      const response = await axios.post(authUrl, {
        email: email,
        password: password
      }, {
        headers: {
          'apikey': config.supabase_anon_key,
          'Authorization': `Bearer ${config.supabase_anon_key}`,
          'Content-Type': 'application/json'
        }
      });
      
      this.accessToken = response.data.access_token;
      this.userId = response.data.user.id;
      
      return {
        success: true,
        access_token: this.accessToken,
        user_id: this.userId
      };
    } catch (error) {
      console.error('Supabase auth failed:', error.message);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  async getAccounts() {
    try {
      const response = await axios.post(`${config.supabase_url}/rest/v1/rpc/get_accounts`, {}, {
        headers: {
          'apikey': config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get accounts: ${error.message}`);
    }
  }

  async initiateSession(prompt, modelName = 'claude-sonnet-4') {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Supabase');
    }

    try {
      // Health check
      await axios.get(`${config.backend_url}/api/health`);
      
      // Get accounts
      const accounts = await this.getAccounts();
      if (!accounts.length) {
        throw new Error('No accounts found');
      }

      // Create form data
      const formData = new FormData();
      formData.append('prompt', prompt);
      formData.append('model_name', modelName);
      formData.append('enable_thinking', 'false');
      formData.append('reasoning_effort', 'low');
      formData.append('stream', 'true');
      formData.append('enable_context_manager', 'false');

      // Initiate session
      const response = await axios.post(`${config.backend_url}/api/agent/initiate`, formData, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          ...formData.getHeaders()
        }
      });

      const { thread_id, agent_run_id } = response.data;

      // Get thread details
      const threadResponse = await axios.get(`${config.supabase_url}/rest/v1/threads?thread_id=eq.${thread_id}`, {
        headers: {
          'apikey': config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const thread = threadResponse.data[0];
      const project_id = thread.project_id;

      // Get project details
      const projectResponse = await axios.get(`${config.supabase_url}/rest/v1/projects?project_id=eq.${project_id}`, {
        headers: {
          'apikey': config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const project = projectResponse.data[0];
      const sandbox_id = project.sandbox.sandbox_id || project.sandbox.id;

      return {
        success: true,
        thread_id,
        project_id,
        project_name: project.name,
        agent_run_id,
        sandbox_id,
        user: {
          firebase_uid: this.currentUser?.uid,
          firebase_email: this.currentUser?.email,
          firebase_project: this.currentUser?.projectId
        }
      };

    } catch (error) {
      console.error('Session initiation failed:', error.message);
      throw new Error(`Session initiation failed: ${error.message}`);
    }
  }

  async getAgentRunStatus(agentRunId) {
    try {
      const response = await axios.get(`${config.backend_url}/api/agent-run/${agentRunId}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get agent status: ${error.message}`);
    }
  }

  async listSandboxFiles(sandboxId, filePath = '/workspace') {
    try {
      const response = await axios.get(`${config.backend_url}/api/sandboxes/${sandboxId}/files?path=${encodeURIComponent(filePath)}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      return response.data.files || [];
    } catch (error) {
      console.warn('File listing failed (workspace may be inactive):', error.message);
      return [];
    }
  }

  async downloadFileContent(sandboxId, filePath) {
    try {
      const response = await axios.get(`${config.backend_url}/api/sandboxes/${sandboxId}/files/content?path=${encodeURIComponent(filePath)}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  async pollAndDownload(agentRunId) {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Supabase');
    }

    try {
      // Get agent run status
      const runStatus = await this.getAgentRunStatus(agentRunId);
      const status = runStatus.status;

      if (status === 'completed') {
        // Need to derive other IDs from agent run
        const threadId = runStatus.threadId || runStatus.thread_id;
        
        if (!threadId) {
          throw new Error('Could not derive thread_id from agent run');
        }

        // Get thread and project details
        const threadResponse = await axios.get(`${config.supabase_url}/rest/v1/threads?thread_id=eq.${threadId}`, {
          headers: {
            'apikey': config.supabase_anon_key,
            'Authorization': `Bearer ${this.accessToken}`
          }
        });

        const thread = threadResponse.data[0];
        const projectId = thread.project_id;

        const projectResponse = await axios.get(`${config.supabase_url}/rest/v1/projects?project_id=eq.${projectId}`, {
          headers: {
            'apikey': config.supabase_anon_key,
            'Authorization': `Bearer ${this.accessToken}`
          }
        });

        const project = projectResponse.data[0];
        const sandboxId = project.sandbox.sandbox_id || project.sandbox.id;

        // List and download files
        const files = await this.listSandboxFiles(sandboxId);
        
        // Download common text-based file types (not just .txt)
        const downloadableExtensions = ['.txt', '.json', '.py', '.js', '.ts', '.html', '.css', '.md', '.yml', '.yaml', '.xml', '.csv', '.sql', '.sh', '.env'];
        const downloadableFiles = files.filter(f => 
          !f.is_dir && downloadableExtensions.some(ext => f.name.toLowerCase().endsWith(ext))
        );

        const downloadedFiles = [];
        for (const file of downloadableFiles) {
          const filePath = `/workspace/${file.name}`;
          try {
            const content = await this.downloadFileContent(sandboxId, filePath);
            downloadedFiles.push({
              name: file.name,
              path: filePath,
              content: content,
              size: content.length
            });
          } catch (error) {
            console.warn(`Failed to download ${file.name}: ${error.message}`);
          }
        }

        return {
          success: true,
          status: 'completed',
          thread_id: threadId,
          project_id: projectId,
          sandbox_id: sandboxId,
          downloaded_files: downloadedFiles,
          run_status: runStatus
        };

      } else {
        return {
          success: true,
          status: status,
          run_status: runStatus
        };
      }

    } catch (error) {
      console.error('Polling failed:', error.message);
      throw new Error(`Polling failed: ${error.message}`);
    }
  }

  async stopAndDeleteSandbox(agentRunId) {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Supabase');
    }

    try {
      // Get agent run details to find sandbox_id
      const runStatus = await this.getAgentRunStatus(agentRunId);
      const threadId = runStatus.threadId || runStatus.thread_id;

      if (!threadId) {
        throw new Error('Could not derive thread_id from agent run');
      }

      // Get project and sandbox IDs
      const threadResponse = await axios.get(`${config.supabase_url}/rest/v1/threads?thread_id=eq.${threadId}`, {
        headers: {
          'apikey': config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const thread = threadResponse.data[0];
      const projectId = thread.project_id;

      const projectResponse = await axios.get(`${config.supabase_url}/rest/v1/projects?project_id=eq.${projectId}`, {
        headers: {
          'apikey': config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const project = projectResponse.data[0];
      const sandboxId = project.sandbox.sandbox_id || project.sandbox.id;

      // Stop agent
      const stopResult = await axios.post(`${config.backend_url}/api/agent-run/${agentRunId}/stop`, {}, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      // Delete sandbox
      const deleteResult = await axios.delete(`${config.backend_url}/api/sandboxes/${sandboxId}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      return {
        success: true,
        agent_run_id: agentRunId,
        sandbox_id: sandboxId,
        message: 'Agent stopped and sandbox deleted successfully'
      };

    } catch (error) {
      console.error('Stop and delete failed:', error.message);
      throw new Error(`Stop and delete failed: ${error.message}`);
    }
  }

  async stopAgent(agentRunId) {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Supabase');
    }

    try {
      // Get agent run details to find sandbox_id
      const runStatus = await this.getAgentRunStatus(agentRunId);
      const threadId = runStatus.threadId || runStatus.thread_id;

      if (!threadId) {
        throw new Error('Could not derive thread_id from agent run');
      }

      // Get project and sandbox IDs
      const threadResponse = await axios.get(`${config.supabase_url}/rest/v1/threads?thread_id=eq.${threadId}`, {
        headers: {
          'apikey': config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const thread = threadResponse.data[0];
      const projectId = thread.project_id;

      const projectResponse = await axios.get(`${config.supabase_url}/rest/v1/projects?project_id=eq.${projectId}`, {
        headers: {
          'apikey': config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const project = projectResponse.data[0];
      const sandboxId = project.sandbox.sandbox_id || project.sandbox.id;

      // Stop agent
      const stopResult = await axios.post(`${config.backend_url}/api/agent-run/${agentRunId}/stop`, {}, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      // Stop sandbox (don't delete it)
      const stopSandboxResult = await axios.post(`${config.backend_url}/api/sandboxes/${sandboxId}/stop`, {}, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      return {
        success: true,
        agent_run_id: agentRunId,
        sandbox_id: sandboxId,
        message: 'Agent stopped and sandbox stopped successfully'
      };

    } catch (error) {
      console.error('Stop agent failed:', error.message);
      throw new Error(`Stop agent failed: ${error.message}`);
    }
  }

  async sendPrompt(threadId, prompt, modelName = 'claude-sonnet-4') {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Supabase');
    }

    try {
      // Send user message
      await axios.post(`${config.supabase_url}/rest/v1/messages`, {
        content: JSON.stringify({"role":"user","content":prompt}),
        is_llm_message: true,
        thread_id: threadId,
        type: "user"
      }, {
        headers: {
          'apikey': config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // Start agent for the thread
      const startResponse = await axios.post(`${config.backend_url}/api/thread/${threadId}/agent/start`, {
        model_name: modelName,
        enable_thinking: false,
        reasoning_effort: 'low',
        stream: true
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const { agent_run_id } = startResponse.data;

      return {
        success: true,
        agent_run_id,
        thread_id: threadId
      };

    } catch (error) {
      console.error('Send prompt failed:', error.message);
      throw new Error(`Send prompt failed: ${error.message}`);
    }
  }

  async streamResponse(agentRunId, token) {
    try {
      const response = await axios.get(`${config.backend_url}/api/agent-run/${agentRunId}/stream?token=${token}`, {
        responseType: 'stream',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Stream response failed: ${error.message}`);
    }
  }

  setCurrentUser(user) {
    this.currentUser = user;
  }
}

/**
 * Get or create FlowAgent service instance
 */
async function getFlowAgentService() {
  if (!flowAgentService) {
    const auth = await getServiceAccountAuth();
    flowAgentService = new FlowAgentService(config, auth.client);
  }
  return flowAgentService;
}

/**
 * Get service account authentication (cached)
 */
async function getServiceAccountAuth() {
  if (serviceAccountAuth && serviceAccountAuth.expires > Date.now()) {
    return serviceAccountAuth;
  }

  try {
    const password = await getServiceAccountPassword();
    const client = new SunaClient();
    
    console.log(`Authenticating service account: ${config.service_account_email}`);
    
    const authResult = await client.authenticateWithSupabase(
      config.service_account_email, 
      password
    );
    
    serviceAccountAuth = {
      client: client,
      access_token: authResult.access_token,
      user_id: authResult.user_id,
      expires: Date.now() + 55 * 60 * 1000 // Cache for 55 minutes
    };
    
    console.log('Service account authentication successful');
    return serviceAccountAuth;
    
  } catch (error) {
    console.error('Service account authentication failed:', error.message);
    throw new Error(`Service account auth failed: ${error.message}`);
  }
}

/**
 * Initiate Session Cloud Function
 */
functions.http('initiateSession', async (req, res) => {
  corsMiddleware(req, res, async () => {
    try {
      await authenticateRequest(req, res, async () => {
        const { prompt, model_name } = req.body;
        
        if (!prompt) {
          return res.status(400).json({ error: 'Prompt is required' });
        }

        // Use service account for Supabase operations
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        const result = await client.initiateSession(prompt, model_name);
        
        res.json(result);
      });
    } catch (error) {
      console.error('Error in initiateAgent:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Poll and Download Cloud Function
 */
functions.http('pollAndDownload', async (req, res) => {
  corsMiddleware(req, res, async () => {
    try {
      await authenticateRequest(req, res, async () => {
        const { agent_run_id } = req.body;
        
        if (!agent_run_id) {
          return res.status(400).json({ error: 'Agent run ID is required' });
        }

        // Use service account for Supabase operations
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        const result = await client.pollAndDownload(agent_run_id);
        
        res.json(result);
      });
    } catch (error) {
      console.error('Error in pollAndDownload:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Stop and Delete Sandbox Cloud Function
 */
functions.http('stopAndDeleteSandbox', async (req, res) => {
  corsMiddleware(req, res, async () => {
    try {
      await authenticateRequest(req, res, async () => {
        const { agent_run_id } = req.body;
        
        if (!agent_run_id) {
          return res.status(400).json({ error: 'Agent run ID is required' });
        }

        // Use service account for Supabase operations
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        const result = await client.stopAndDeleteSandbox(agent_run_id);
        
        res.json(result);
      });
    } catch (error) {
      console.error('Error in stopAndDeleteSandbox:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Stop Agent Cloud Function
 */
functions.http('stopAgent', async (req, res) => {
  corsMiddleware(req, res, async () => {
    try {
      await authenticateRequest(req, res, async () => {
        const { agent_run_id } = req.body;
        
        if (!agent_run_id) {
          return res.status(400).json({ error: 'Agent run ID is required' });
        }

        // Use service account for Supabase operations
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        const result = await client.stopAgent(agent_run_id);
        
        res.json(result);
      });
    } catch (error) {
      console.error('Error in stopAgent:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Send Prompt Cloud Function
 */
functions.http('sendPrompt', async (req, res) => {
  corsMiddleware(req, res, async () => {
    try {
      await authenticateRequest(req, res, async () => {
        const { thread_id, prompt, model_name } = req.body;
        
        if (!thread_id || !prompt) {
          return res.status(400).json({ error: 'Thread ID and prompt are required' });
        }

        // Use service account for Supabase operations
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        const result = await client.sendPrompt(thread_id, prompt, model_name);
        
        res.json(result);
      });
    } catch (error) {
      console.error('Error in sendPrompt:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Stream Response Cloud Function
 */
functions.http('streamResponse', async (req, res) => {
  corsMiddleware(req, res, async () => {
    try {
      await authenticateRequest(req, res, async () => {
        const { agent_run_id, token } = req.query;
        
        if (!agent_run_id || !token) {
          return res.status(400).json({ error: 'Agent run ID and token are required' });
        }

        // Use service account for Supabase operations
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        // Set up SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        });
        
        try {
          const stream = await client.streamResponse(agent_run_id, token);
          
          stream.on('data', (chunk) => {
            res.write(`data: ${chunk}\n\n`);
          });
          
          stream.on('end', () => {
            res.write('data: [DONE]\n\n');
            res.end();
          });
          
          stream.on('error', (error) => {
            console.error('Stream error:', error);
            res.write(`data: {"error": "${error.message}"}\n\n`);
            res.end();
          });
          
        } catch (error) {
          res.write(`data: {"error": "${error.message}"}\n\n`);
          res.end();
        }
      });
    } catch (error) {
      console.error('Error in streamResponse:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Health check function
 */
functions.http('health', (req, res) => {
  corsMiddleware(req, res, () => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      config: {
        backend_url: config.backend_url,
        allowed_projects: config.allowed_projects,
        org_domain: config.org_domain
      }
    });
  });
});

// ===== FLOWAGENT API ENDPOINTS =====

/**
 * FlowAgent: Initiate Session
 * POST /api/flowagent/initiate
 * Body: { prompt, expectedFiles?, modelName? }
 * Returns: { threadId, sessionData }
 */
functions.http('flowagent-initiate', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const { prompt, expectedFiles = [], modelName = 'claude-sonnet-4' } = req.body;
        
        // Validate inputs
        const validatedPrompt = InputValidator.validatePrompt(prompt);
        const validatedFiles = InputValidator.validateExpectedFiles(expectedFiles);
        const validatedModel = InputValidator.validateModelName(modelName);

        const flowAgent = await getFlowAgentService();
        const result = await flowAgent.initiate(validatedPrompt, validatedFiles, validatedModel, req.user);
        
        res.json(result);
      });
    });
  });
}));

/**
 * FlowAgent: Get Files
 * GET /api/flowagent/:threadId/files
 * Returns: { fileStatuses, newlyDownloaded, allFiles, summary }
 */
functions.http('flowagent-files', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const threadId = req.params.threadId || req.query.threadId;
        const expectedFiles = req.query.expectedFiles || [];
        const traceId = req.headers['x-trace-id'];
        
        // Validate thread ID
        const validatedThreadId = InputValidator.validateThreadId(threadId);
        
        // Validate expected files (convert to array if single value)
        let validatedExpectedFiles = [];
        if (expectedFiles) {
          validatedExpectedFiles = Array.isArray(expectedFiles) ? expectedFiles : [expectedFiles];
          validatedExpectedFiles = validatedExpectedFiles.filter(f => f && typeof f === 'string');
        }

        const flowAgent = await getFlowAgentService();
        const result = await flowAgent.getFiles(validatedThreadId, traceId, validatedExpectedFiles);
        
        res.json(result);
      });
    });
  });
}));

/**
 * FlowAgent: Send Chat
 * POST /api/flowagent/:threadId/chat
 * Body: { message, modelName? }
 * Returns: { agentRunId } (streaming via WebSocket)
 */
functions.http('flowagent-chat', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
      const threadId = req.params.threadId || req.body.threadId;
      const { message, modelName = 'claude-sonnet-4' } = req.body;
      
      // Validate inputs
      const validatedThreadId = InputValidator.validateThreadId(threadId);
      const validatedMessage = InputValidator.validateMessage(message);
      const validatedModel = InputValidator.validateModelName(modelName);

      const flowAgent = await getFlowAgentService();
      const result = await flowAgent.sendChat(validatedThreadId, validatedMessage, validatedModel);
      
      res.json(result);
    });
  });
  });
}));

/**
 * FlowAgent: New Phase
 * POST /api/flowagent/:threadId/new-phase
 * Body: { prompt, expectedFiles?, modelName? }
 * Returns: { phaseNumber, agentRunId, expectedFiles }
 */
functions.http('flowagent-new-phase', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    await authenticateRequest(req, res, async () => {
      const threadId = req.params.threadId || req.body.threadId;
      const { prompt, expectedFiles = [], modelName = 'claude-sonnet-4' } = req.body;
      
      // Validate inputs
      const validatedThreadId = InputValidator.validateThreadId(threadId);
      const validatedPrompt = InputValidator.validatePrompt(prompt);
      const validatedFiles = InputValidator.validateExpectedFiles(expectedFiles);
      const validatedModel = InputValidator.validateModelName(modelName);

      const flowAgent = await getFlowAgentService();
      const result = await flowAgent.newPhase(validatedThreadId, validatedPrompt, validatedFiles, validatedModel);
      
      res.json(result);
    });
  });
}));

/**
 * FlowAgent: Close Session
 * POST /api/flowagent/:threadId/close
 * Returns: { finalFiles, summary }
 */
functions.http('flowagent-close', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    await authenticateRequest(req, res, async () => {
      const threadId = req.params.threadId || req.body.threadId;
      
      // Validate thread ID
      const validatedThreadId = InputValidator.validateThreadId(threadId);

      const flowAgent = await getFlowAgentService();
      const result = await flowAgent.closeSession(validatedThreadId);
      
      res.json(result);
    });
  });
}));

/**
 * FlowAgent: Get Session Status
 * GET /api/flowagent/:threadId/status
 * Returns: { status, expectedFiles, currentPhase, filesSummary }
 */
functions.http('flowagent-status', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    await authenticateRequest(req, res, async () => {
      const threadId = req.params.threadId || req.query.threadId;
      
      // Validate thread ID
      const validatedThreadId = InputValidator.validateThreadId(threadId);

      const flowAgent = await getFlowAgentService();
      const result = await flowAgent.getSessionStatus(validatedThreadId);
      
      res.json(result);
    });
  });
}));

/**
 * FlowAgent: Real-time Updates Stream (Server-Sent Events)
 * GET /api/flowagent/:threadId/stream
 * Returns: SSE stream with file updates and chat responses
 */
functions.http('flowagent-stream', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    await authenticateRequest(req, res, async () => {
      const threadId = req.params.threadId || req.query.threadId;
      const agentRunId = req.query.agentRunId; // Optional: for chat streaming
      
      // Validate thread ID
      const validatedThreadId = InputValidator.validateThreadId(threadId);

      // Set up SSE headers with secure CORS
      const allowedOrigins = getAllowedOrigins();
      const origin = req.headers.origin;
      const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': 'Cache-Control, Authorization',
        'Access-Control-Allow-Credentials': 'true'
      });

        const flowAgent = await getFlowAgentService();
        let streamActive = true;
        let fileMonitorInterval;
        let chatStreamActive = false;

        // Send initial session status
        const initialStatus = flowAgent.getSessionStatus(threadId);
        res.write(`data: ${JSON.stringify({
          type: 'session_status',
          ...initialStatus
        })}\n\n`);

        // Start file monitoring
        fileMonitorInterval = setInterval(async () => {
          if (!streamActive) return;
          
          try {
            const files = await flowAgent.getFiles(threadId, req.headers['x-trace-id']);
            if (files.newlyDownloaded.length > 0) {
              res.write(`data: ${JSON.stringify({
                type: 'files_updated',
                threadId: threadId,
                newFiles: files.newlyDownloaded,
                summary: files.summary
              })}\n\n`);
            }
          } catch (error) {
            console.warn('FlowAgent SSE: File monitoring error', { threadId, error: error.message });
            // Send sanitized error to client
            if (streamActive) {
              res.write(`data: ${JSON.stringify({
                type: 'error',
                threadId: threadId,
                error: ErrorHandler.sanitizeErrorMessage(error)
              })}\n\n`);
            }
          }
        }, 10000); // Check files every 10 seconds

        // If agentRunId provided, also stream chat responses
        if (agentRunId && !chatStreamActive) {
          chatStreamActive = true;
          try {
            const auth = await getServiceAccountAuth();
            const chatStream = await auth.client.streamResponse(agentRunId, auth.access_token);
            
            chatStream.on('data', (chunk) => {
              if (streamActive) {
                const chunkStr = chunk.toString();
                res.write(`data: ${JSON.stringify({
                  type: 'chat_response',
                  threadId: threadId,
                  agentRunId: agentRunId,
                  data: chunkStr,
                  isComplete: false
                })}\n\n`);
              }
            });
            
            chatStream.on('end', () => {
              if (streamActive) {
                res.write(`data: ${JSON.stringify({
                  type: 'chat_response',
                  threadId: threadId,
                  agentRunId: agentRunId,
                  data: '[DONE]',
                  isComplete: true
                })}\n\n`);
              }
              chatStreamActive = false;
            });
            
            chatStream.on('error', (error) => {
              if (streamActive) {
                res.write(`data: ${JSON.stringify({
                  type: 'error',
                  threadId: threadId,
                  error: ErrorHandler.sanitizeErrorMessage(error)
                })}\n\n`);
              }
              chatStreamActive = false;
            });
            
          } catch (chatError) {
            res.write(`data: ${JSON.stringify({
              type: 'error',
              threadId: threadId,
              error: ErrorHandler.sanitizeErrorMessage(chatError)
            })}\n\n`);
            chatStreamActive = false;
          }
        }

        // Keep connection alive with heartbeat
        const heartbeat = setInterval(() => {
          if (streamActive) {
            res.write(`data: ${JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            })}\n\n`);
          }
        }, 30000); // Send heartbeat every 30 seconds

        // Cleanup on client disconnect
        req.on('close', () => {
          streamActive = false;
          if (fileMonitorInterval) clearInterval(fileMonitorInterval);
          if (heartbeat) clearInterval(heartbeat);
          console.log('FlowAgent SSE: Client disconnected', { threadId });
        });

        // Cleanup after 10 minutes to prevent long-running functions
        setTimeout(() => {
          if (streamActive) {
            streamActive = false;
            if (fileMonitorInterval) clearInterval(fileMonitorInterval);
            if (heartbeat) clearInterval(heartbeat);
            res.write(`data: ${JSON.stringify({
              type: 'stream_timeout',
              message: 'Stream closed due to timeout'
            })}\n\n`);
            res.end();
          }
        }, 600000); // 10 minutes

      });
  });
})); 

/**
 * FlowAgent: Download Specific File
 * GET /api/flowagent/:threadId/download/:fileName
 * Returns: File content with appropriate headers for download
 */
functions.http('flowagent-download', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const threadId = req.params.threadId || req.query.threadId;
        const fileName = req.params.fileName || req.query.fileName;
        const download = req.query.download === 'true'; // Force download vs display
        const traceId = req.headers['x-trace-id'] || logger.generateTraceId();
        
        // Validate inputs
        const validatedThreadId = InputValidator.validateThreadId(threadId);
        
        if (!fileName || typeof fileName !== 'string') {
          throw new Error('File name is required');
        }
        
        // Validate file name (prevent path traversal)
        if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
          throw new Error('Invalid file name');
        }

        const flowAgent = await getFlowAgentService();
        let session = flowAgent.activeSessions.get(validatedThreadId);
        
        // If session not in memory, try to recover from backend
        if (!session) {
          console.log('FlowAgent: Session not in memory for download, attempting recovery', { threadId: validatedThreadId });
          try {
            session = await flowAgent.recoverSession(validatedThreadId);
          } catch (recoveryError) {
            console.error('FlowAgent: Session recovery failed for download', { threadId: validatedThreadId, error: recoveryError.message });
            return res.status(404).json({ 
              error: 'Session not found and recovery failed',
              details: 'The research session may have expired. Please start a new session.' 
            });
          }
        }
        
        // Try to get file content directly from sandbox (more reliable than session cache)
        let content;
        try {
          const filePath = `/workspace/${fileName}`;
          content = await flowAgent.sunaClient.downloadFileContent(session.sandboxId, filePath);
          
          // Log successful download with structured logging
          logger.logFileDownload(traceId, validatedThreadId, fileName, content.length, {
            sandboxId: session.sandboxId,
            requestType: download ? 'download' : 'display',
            userEmail: req.user?.email
          });
          
          console.log('FlowAgent: File downloaded successfully', { 
            threadId: validatedThreadId, 
            fileName, 
            fileSize: content.length,
            sandboxId: session.sandboxId 
          });
          
        } catch (downloadError) {
          console.error('FlowAgent: Failed to download file from sandbox', { 
            threadId: validatedThreadId, 
            fileName, 
            sandboxId: session.sandboxId,
            error: downloadError.message 
          });
          
          // Check if file exists in session cache as fallback
          const fileData = session.files && session.files[fileName];
          if (fileData && fileData.content) {
            content = fileData.content;
            console.log('FlowAgent: Using cached file content as fallback', { fileName });
          } else {
            // Log download failure
            logger.logError(traceId, validatedThreadId, new Error(`File download failed: ${fileName}`), {
              component: 'download',
              operation: 'file_access',
              fileName,
              sandboxId: session.sandboxId,
              originalError: downloadError.message
            });
            
            return res.status(404).json({ 
              error: 'File not found or not accessible',
              details: `File "${fileName}" could not be retrieved from the research session. It may not exist or may not be ready yet.`
            });
          }
        }
        
        // Set appropriate headers for file download
        const mimeType = getMimeType(fileName);
        const disposition = download ? 'attachment' : 'inline';
        
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
        res.setHeader('Content-Length', content.length);
        res.setHeader('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour
        
        // Send file content
        res.send(content);
      });
    });
  });
}));

/**
 * Get MIME type for file extension
 */
function getMimeType(fileName) {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeTypes = {
    'html': 'text/html',
    'json': 'application/json',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'pdf': 'application/pdf',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'svg': 'image/svg+xml',
    'js': 'application/javascript',
    'css': 'text/css',
    'xml': 'application/xml',
    'yaml': 'text/yaml',
    'yml': 'text/yaml',
    'md': 'text/markdown'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Auth Cookie Endpoint - Set secure authentication cookies for SSE
 * POST /auth-cookie
 * Used to set HttpOnly cookies for EventSource authentication since SSE can't send headers
 */
functions.http('auth-cookie', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    await authenticateRequest(req, res, async () => {
      const { action } = req.body;
      
      if (action === 'set') {
        // Extract token from Authorization header (already validated by authenticateRequest)
        const authHeader = req.headers.authorization;
        const token = authHeader.replace('Bearer ', '');
        
        // Set secure, HttpOnly cookie
        const cookieOptions = [
          'HttpOnly',
          'Secure', // Only send over HTTPS
          'SameSite=Strict', // CSRF protection
          'Path=/',
          `Max-Age=3600` // 1 hour expiry
        ];
        
        // Set the auth cookie
        res.setHeader('Set-Cookie', `flowagent_auth=${token}; ${cookieOptions.join('; ')}`);
        
        res.json({ 
          success: true, 
          message: 'Authentication cookie set successfully' 
        });
      } else {
        res.status(400).json({ 
          error: 'Invalid action. Use "set" to set authentication cookie.' 
        });
      }
    });
  });
}));