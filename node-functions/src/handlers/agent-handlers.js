/**
 * Agent Handlers - All eloo-agent-* and flowagent-* function handlers
 * Extracted from index.js to provide a clean separation of concerns
 */

const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
const axios = require('axios');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { FlowAgentService } = require('../services/flowAgentService');
const { SunaClient } = require('../services/suna-client');
const logger = require('../utils/logger');

// Import middleware
const { corsMiddleware } = require('../middleware/cors');
const { rateLimitMiddleware } = require('../middleware/rate-limit');
const { authenticateRequest } = require('../middleware/auth');
const { ErrorHandler } = require('../middleware/error-handler');

// Import utilities
const config = require('../utils/config');
const { InputValidator } = require('../utils/validators');

// Initialize Secret Manager client
const secretClient = new SecretManagerServiceClient();

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
 * Get allowed origins for CORS
 */
const getAllowedOrigins = () => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (allowedOrigins) {
    return allowedOrigins.split(',').map(origin => origin.trim());
  }
  
  // Default to localhost for development
  const defaultOrigins = [
    'http://localhost:8080'
  ];
  
  console.warn('ALLOWED_ORIGINS not set, using default development origins:', defaultOrigins);
  return defaultOrigins;
};

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

// ===== ELOO-AGENT-* HANDLERS =====

/**
 * Send Prompt Cloud Function
 * POST /eloo-agent-send-prompt
 * Body: { thread_id: string, prompt: string, model_name?: string }
 * Returns: { success: boolean, agent_run_id: string, message: string }
 */
functions.http('eloo-agent-send-prompt', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const { thread_id, prompt, model_name } = req.body;
        
        // Validate thread ID
        if (!thread_id || typeof thread_id !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'Thread ID is required and must be a string'
          });
        }
        
        // UUID v4 format validation for thread ID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(thread_id)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid thread ID format'
          });
        }
        
        // Validate prompt
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Prompt is required and must be a non-empty string'
          });
        }
        
        // Validate model name if provided
        if (model_name && typeof model_name !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'Model name must be a string'
          });
        }

        // Get service account auth
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        const result = await client.sendPrompt(thread_id, prompt, model_name);
        
        res.json({
          success: true,
          threadId: thread_id,
          ...result
        });
      });
    });
  });
}));

/**
 * FlowAgent: Initiate Session
 * POST /eloo-agent-initiate
 * Body: { prompt, expectedFiles?, modelName? }
 * Returns: { threadId, sessionData }
 */
functions.http('eloo-agent-initiate', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const { prompt, modelName = 'claude-sonnet-4' } = req.body;
        
        // Validate inputs
        const validatedPrompt = InputValidator.validatePrompt(prompt);
        const validatedModel = InputValidator.validateModelName(modelName);

        const flowAgent = await getFlowAgentService();
        const result = await flowAgent.initiate(validatedPrompt, validatedModel, req.user);
        
        res.json(result);
      });
    });
  });
}));

/**
 * Stream Agent Responses - Real-time streaming for agent responses and file updates
 * GET /eloo-agent-stream?threadId=uuid&agentRunId=uuid
 * Returns: Server-Sent Events stream with real-time updates
 */
functions.http('eloo-agent-stream', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const threadId = req.params.threadId || req.query.threadId;
        const agentRunId = req.query.agentRunId; // Optional: for chat streaming
        
        // Validate thread ID
        if (!threadId || typeof threadId !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'Thread ID is required and must be a string'
          });
        }
        
        // UUID v4 format validation for thread ID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(threadId)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid thread ID format'
          });
        }
        
        // Validate agent run ID if provided
        if (agentRunId && !uuidRegex.test(agentRunId)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid agent run ID format'
          });
        }

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
  });
}));

/**
 * Agent Run Status - Get status of an agent run given a thread ID
 * GET /eloo-agent-runs?threadId=uuid
 * Returns: { success: boolean, status: string, threadId: string, agentRunId: string, ...runStatus }
 */
functions.http('eloo-agent-runs', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const { threadId } = req.query;
        
        // Validate thread ID
        const validatedThreadId = InputValidator.validateThreadId(threadId);
        
        const flowAgent = await getFlowAgentService();
        const sessionStatus = await flowAgent.getSessionStatus(validatedThreadId);
        
        if (!sessionStatus.success) {
          return res.status(404).json({
            success: false,
            error: 'Session not found or could not be recovered'
          });
        }
        
        // Get the current agent run ID from the session
        const agentRunId = sessionStatus.currentPhase?.agentRunId;
        
        if (!agentRunId) {
          return res.status(400).json({
            success: false,
            error: 'No active agent run found for this thread'
          });
        }
        
        // Get service account auth and call the getAgentRunStatus method
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        const runStatus = await client.getAgentRunStatus(agentRunId);
        
        res.json({
          success: true,
          threadId: validatedThreadId,
          agentRunId: agentRunId,
          ...runStatus
        });
      });
    });
  });
}));

/**
 * Ensure Sandbox Active - Ensure a sandbox is active for a given project ID
 * POST /eloo-agent-ensure-active
 * Body: { projectId: string }
 * Returns: { status: string, sandbox_id: string, message: string }
 */
functions.http('eloo-agent-ensure-active', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const { projectId } = req.body;
        
        // Validate project ID
        if (!projectId || typeof projectId !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'Project ID is required and must be a string'
          });
        }
       
        // Get service account auth
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        // Call ensure-active endpoint
        const result = await client.ensureSandboxActive(projectId);
        
        res.json(result);
      });
    });
  });
}));

/**
 * Agent Run Status - Get status of an agent run given an agent run ID
 * GET /eloo-agent-run-status?agentRunId=uuid
 * Returns: { success: boolean, agentRunId: string, ...runStatus }
 */
functions.http('eloo-agent-run-status', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const { agentRunId } = req.query;
        
        // Validate agent run ID
        if (!agentRunId || typeof agentRunId !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'Agent run ID is required and must be a string'
          });
        }
        
        // UUID v4 format validation for agent run ID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(agentRunId)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid agent run ID format'
          });
        }
        
        // Get service account auth
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        // Call getAgentRunStatus method directly
        const runStatus = await client.getAgentRunStatus(agentRunId);
        
        res.json({
          success: true,
          agentRunId: agentRunId,
          ...runStatus
        });
      });
    });
  });
}));

/**
 * Agent Sandbox Delete - Stop an agent run and delete its associated sandbox
 * DELETE /eloo-agent-sandbox-delete
 * Body: { agentRunId: string }
 * Returns: { success: boolean, agent_run_id: string, sandbox_id: string, message: string }
 */
functions.http('eloo-agent-sandbox-delete', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        // Only allow DELETE method
        if (req.method !== 'DELETE') {
          return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use DELETE method.'
          });
        }
        
        const { agentRunId } = req.body;
        
        // Validate agent run ID
        if (!agentRunId || typeof agentRunId !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'Agent run ID is required and must be a string'
          });
        }
        
        // UUID v4 format validation for agent run ID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(agentRunId)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid agent run ID format'
          });
        }
        
        // Get service account auth
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        try {
          // Get agent run details to find thread ID
          const runStatus = await client.getAgentRunStatus(agentRunId);
          const threadId = runStatus.threadId || runStatus.thread_id;

          if (!threadId) {
            return res.status(400).json({
              success: false,
              error: 'Could not derive thread_id from agent run'
            });
          }

          // Get thread details to find project ID
          const threadResponse = await axios.get(`${config.supabase_url}/rest/v1/threads?thread_id=eq.${threadId}`, {
            headers: {
              'apikey': config.supabase_anon_key,
              'Authorization': `Bearer ${client.accessToken}`
            }
          });

          if (!threadResponse.data || threadResponse.data.length === 0) {
            return res.status(404).json({
              success: false,
              error: 'Thread not found'
            });
          }

          const thread = threadResponse.data[0];
          const projectId = thread.project_id;

          if (!projectId) {
            return res.status(400).json({
              success: false,
              error: 'Project ID not found in thread'
            });
          }

          // Get project details to find sandbox ID
          const projectResponse = await axios.get(`${config.supabase_url}/rest/v1/projects?project_id=eq.${projectId}`, {
            headers: {
              'apikey': config.supabase_anon_key,
              'Authorization': `Bearer ${client.accessToken}`
            }
          });

          if (!projectResponse.data || projectResponse.data.length === 0) {
            return res.status(404).json({
              success: false,
              error: 'Project not found'
            });
          }

          const project = projectResponse.data[0];
          const sandboxId = project.sandbox?.sandbox_id || project.sandbox?.id;

          if (!sandboxId) {
            return res.status(400).json({
              success: false,
              error: 'Sandbox ID not found in project'
            });
          }

          // Stop agent
          const stopResult = await axios.post(`${config.backend_url}/api/agent-run/${agentRunId}/stop`, {}, {
            headers: {
              'Authorization': `Bearer ${client.accessToken}`
            }
          });

          // Delete sandbox
          const deleteResult = await axios.delete(`${config.backend_url}/api/sandboxes/${sandboxId}`, {
            headers: {
              'Authorization': `Bearer ${client.accessToken}`
            }
          });

          res.json({
            success: true,
            agent_run_id: agentRunId,
            sandbox_id: sandboxId,
            message: 'Agent stopped and sandbox deleted successfully'
          });

        } catch (error) {
          console.error('Stop and delete failed:', error.message);
          
          // Handle specific error cases
          if (error.response) {
            const status = error.response.status;
            const errorMessage = error.response.data?.message || error.message;
            
            if (status === 404) {
              return res.status(404).json({
                success: false,
                error: 'Agent run, thread, project, or sandbox not found'
              });
            } else if (status === 401) {
              return res.status(401).json({
                success: false,
                error: 'Authentication failed'
              });
            }
          }
          
          throw new Error(`Stop and delete failed: ${error.message}`);
        }
      });
    });
  });
}));

// ===== FLOWAGENT-* HANDLERS =====

/**
 * FlowAgent: Get Files
 * GET /flowagent-files?threadId=uuid&expectedFiles=[]
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
 * POST /flowagent-chat
 * Body: { threadId: string, message: string, modelName?: string }
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
 * POST /flowagent-new-phase
 * Body: { threadId: string, prompt: string, expectedFiles?: string[], modelName?: string }
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
 * POST /flowagent-close
 * Body: { threadId: string }
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
 * GET /flowagent-status?threadId=uuid
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
 * FlowAgent: Download Specific File
 * GET /flowagent-download?threadId=uuid&fileName=string&download=boolean
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

// ===== UTILITY HANDLERS =====

// ===== ADDITIONAL ELOO HANDLERS =====

/**
 * List Files - List all files in the sandbox workspace directory
 * GET /eloo-agent-list-files?sandboxId=uuid&filePath=/workspace
 * Returns: Array of files in the directory
 */
functions.http('eloo-agent-list-files', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const { sandboxId, filePath = '/workspace' } = req.query;
        
        // Validate sandbox ID
        if (!sandboxId || !InputValidator.isValidUUID(sandboxId)) {
          return res.status(400).json({
            success: false,
            error: 'Valid sandbox ID is required'
          });
        }
        
        try {
          const serviceAuth = await getServiceAccountAuth();
          const files = await serviceAuth.client.listSandboxFiles(sandboxId, filePath);
          
          res.json({
            success: true,
            sandboxId,
            filePath,
            files
          });
          
        } catch (error) {
          logger.error('File listing failed:', error);
          
          if (error.message.includes('Authentication')) {
            return res.status(401).json({
              success: false,
              error: 'Authentication failed'
            });
          }
          
          res.status(500).json({
            success: false,
            error: error.message || 'Failed to list files'
          });
        }
      });
    });
  });
}));

/**
 * Download File - Download a file from a sandbox
 * GET /eloo-download-file?sandboxId=uuid&fileName=filename
 * Returns: File content or 404 if not found
 */
functions.http('eloo-download-file', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const { sandboxId, fileName } = req.query;
        
        // Validate sandbox ID
        if (!sandboxId || typeof sandboxId !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'Sandbox ID is required and must be a string'
          });
        }
        
        // Validate file name
        if (!fileName || typeof fileName !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'File name is required and must be a string'
          });
        }
        
        // UUID v4 format validation for sandbox ID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(sandboxId)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid sandbox ID format'
          });
        }
        
        // Get service account auth
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        try {
          // Construct the file path with /workspace prefix
          const filePath = `/workspace/${fileName}`;
          
          // Download file content using the sandbox API
          const fileContent = await client.downloadFileContent(sandboxId, filePath);
          
          // Determine content type based on file extension
          const getContentType = (filename) => {
            const ext = filename.toLowerCase().split('.').pop();
            const contentTypes = {
              'html': 'text/html',
              'css': 'text/css',
              'js': 'application/javascript',
              'json': 'application/json',
              'txt': 'text/plain',
              'md': 'text/markdown',
              'py': 'text/plain',
              'ts': 'text/plain',
              'yml': 'text/yaml',
              'yaml': 'text/yaml',
              'xml': 'application/xml',
              'csv': 'text/csv',
              'sql': 'text/plain',
              'sh': 'text/plain',
              'env': 'text/plain'
            };
            return contentTypes[ext] || 'text/plain';
          };
          
          // Set appropriate headers
          res.setHeader('Content-Type', getContentType(fileName));
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          
          // Return the file content
          res.send(fileContent);
          
        } catch (error) {
          // If file not found or other error, return 404
          if (error.message.includes('not found') || error.message.includes('404')) {
            return res.status(404).json({
              success: false,
              error: 'File not found'
            });
          }
          
          // For other errors, return the error message
          throw error;
        }
      });
    });
  });
}));

/**
 * Get Messages - Get messages for a given thread ID
 * GET /eloo-get-messages?threadId=uuid&offset=0&limit=1000
 * Returns: Array of messages with agent information
 */
functions.http('eloo-get-messages', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    rateLimitMiddleware(req, res, async () => {
      await authenticateRequest(req, res, async () => {
        const { threadId, offset = 0, limit = 1000 } = req.query;
        
        // Validate thread ID
        if (!threadId || typeof threadId !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'Thread ID is required and must be a string'
          });
        }
        
        // UUID v4 format validation for thread ID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(threadId)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid thread ID format'
          });
        }
        
        // Validate offset and limit
        const offsetNum = parseInt(offset, 10);
        const limitNum = parseInt(limit, 10);
        
        if (isNaN(offsetNum) || offsetNum < 0) {
          return res.status(400).json({
            success: false,
            error: 'Offset must be a non-negative integer'
          });
        }
        
        if (isNaN(limitNum) || limitNum <= 0 || limitNum > 1000) {
          return res.status(400).json({
            success: false,
            error: 'Limit must be a positive integer between 1 and 1000'
          });
        }
        
        // Get service account auth
        const auth = await getServiceAccountAuth();
        const client = auth.client;
        client.setCurrentUser(req.user);
        
        try {
          // Construct the Supabase URL with query parameters
          const supabaseUrl = `${config.supabase_url}/rest/v1/messages`;
          const params = new URLSearchParams({
            'select': '*,agents:agent_id(name,avatar,avatar_color)',
            'thread_id': `eq.${threadId}`,
            'type': 'neq.cost',
            'order': 'created_at.asc',
            'offset': offsetNum.toString(),
            'limit': limitNum.toString()
          });
          
          // Add additional type filters (neq.summary, neq.status, neq.tool)
          params.append('type', 'neq.summary');
          params.append('type', 'neq.status');
          params.append('type', 'neq.tool');
          
          const fullUrl = `${supabaseUrl}?${params.toString()}`;
          
          // Make request to Supabase
          const response = await axios.get(fullUrl, {
            headers: {
              'apikey': config.supabase_anon_key,
              'Authorization': `Bearer ${client.accessToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          res.json({
            success: true,
            threadId: threadId,
            messages: response.data,
            count: response.data.length,
            offset: offsetNum,
            limit: limitNum
          });
          
        } catch (error) {
          // Handle Supabase errors
          if (error.response) {
            return res.status(error.response.status).json({
              success: false,
              error: error.response.data?.message || 'Supabase request failed'
            });
          }
          
          // For other errors, throw to be handled by ErrorHandler
          throw error;
        }
      });
    });
  });
}));

// ===== AUTH-COOKIE HANDLER =====

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

// ===== HELPER FUNCTIONS EXPORT =====

module.exports = {
  // Helper functions
  getServiceAccountAuth,
  getFlowAgentService,
  getServiceAccountPassword,
  getMimeType,
  getAllowedOrigins
};