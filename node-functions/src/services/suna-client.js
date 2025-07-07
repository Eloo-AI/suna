/**
 * Suna Client - Authentication and API operations for the Suna backend
 */

const axios = require('axios');
const FormData = require('form-data');

/**
 * Configuration object for the Suna client
 */
const config = {
  backend_url: process.env.BACKEND_URL || 'http://34.171.125.26:8000',
  supabase_url: process.env.SUPABASE_URL || 'https://nmwqprgbxtnikkmwhwyt.supabase.co',
  supabase_anon_key: process.env.SUPABASE_ANON_KEY,
  allowed_projects: (process.env.ALLOWED_FIREBASE_PROJECTS || '').split(','),
  org_domain: process.env.ELOO_ORG_DOMAIN || 'eloo.ai',
  service_account_email: process.env.SERVICE_ACCOUNT_EMAIL || 'suna-service@eloo.ai',
  service_account_password_secret: process.env.SERVICE_ACCOUNT_PASSWORD_SECRET || 'suna_service'
};

/**
 * Suna Client class for backend API operations
 */
class SunaClient {
  constructor() {
    this.accessToken = null;
    this.userId = null;
    this.currentUser = null;
  }

  /**
   * Authenticate with Supabase using email and password
   */
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

  /**
   * Get user accounts from Supabase
   */
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

  /**
   * Initiate a new agent session
   */
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

  /**
   * Get agent run status
   */
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

  /**
   * List files in a sandbox
   */
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

  /**
   * Download file content from sandbox
   */
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

  /**
   * Poll agent run status and download files when completed
   */
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

  /**
   * Stop agent and delete sandbox
   */
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

  /**
   * Stop agent without deleting sandbox
   */
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

  /**
   * Send a prompt to an existing thread
   */
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

  /**
   * Stream agent response
   */
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

  /**
   * Ensure sandbox is active for a project
   */
  async ensureSandboxActive(projectId) {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Supabase');
    }

    try {
      const response = await axios.post(`${config.backend_url}/api/project/${projectId}/sandbox/ensure-active`, {}, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to ensure sandbox active: ${error.message}`);
    }
  }

  /**
   * Set current user context
   */
  setCurrentUser(user) {
    this.currentUser = user;
  }
}

module.exports = { SunaClient, config };