const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

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

// CORS configuration
const corsOptions = {
  origin: true, // Allow all origins for now, can be restricted later
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

const corsMiddleware = cors(corsOptions);

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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    
    const token = authHeader.substring(7);
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

  async initiateAgent(prompt, modelName = 'claude-sonnet-4') {
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

      // Initiate agent
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
      console.error('Agent initiation failed:', error.message);
      throw new Error(`Agent initiation failed: ${error.message}`);
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

  setCurrentUser(user) {
    this.currentUser = user;
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
 * Initiate Agent Cloud Function
 */
functions.http('initiateAgent', async (req, res) => {
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
        
        const result = await client.initiateAgent(prompt, model_name);
        
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