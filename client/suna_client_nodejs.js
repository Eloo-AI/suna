const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');

// Load configuration from file or environment
let config = {
  backend_url: process.env.BACKEND_URL || 'http://34.171.125.26:8000',
  supabase_url: process.env.SUPABASE_URL || 'https://nmwqprgbxtnikkmwhwyt.supabase.co',
  supabase_anon_key: process.env.SUPABASE_ANON_KEY || 'your_key_here',
  port: process.env.PORT || 3000
};

// Try to load config from test_config.json
try {
  const configData = require('./test_config.json');
  config = {
    backend_url: configData.backend_url || config.backend_url,
    supabase_url: configData.supabase_url || config.supabase_url,
    supabase_anon_key: configData.supabase_anon_key || config.supabase_anon_key,
    port: config.port
  };
  console.log('Loaded configuration from test_config.json');
} catch (error) {
  console.log('Using environment/default configuration (test_config.json not found)');
}

class SunaClient {
  constructor(config) {
    this.config = config;
    this.accessToken = null;
    this.userId = null;
  }

  /**
   * Authenticate with Supabase
   */
  async authenticateWithSupabase(email, password) {
    const authUrl = `${this.config.supabase_url}/auth/v1/token?grant_type=password`;
    
    try {
      const response = await axios.post(authUrl, {
        email: email,
        password: password
      }, {
        headers: {
          'apikey': this.config.supabase_anon_key,
          'Authorization': `Bearer ${this.config.supabase_anon_key}`,
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
   * Health check
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.config.backend_url}/api/health`);
      return response.data;
    } catch (error) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }

  /**
   * Get user accounts
   */
  async getAccounts() {
    try {
      const response = await axios.post(`${this.config.supabase_url}/rest/v1/rpc/get_accounts`, {}, {
        headers: {
          'apikey': this.config.supabase_anon_key,
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
   * Initiate agent - Port of initiate_only()
   */
  async initiateAgent(prompt, modelName = 'claude-sonnet-4') {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Call authenticateWithSupabase first.');
    }

    try {
      // Health check
      await this.healthCheck();
      
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
      const response = await axios.post(`${this.config.backend_url}/api/agent/initiate`, formData, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          ...formData.getHeaders()
        }
      });

      const { thread_id, agent_run_id } = response.data;

      // Get thread details
      const threadResponse = await axios.get(`${this.config.supabase_url}/rest/v1/threads?thread_id=eq.${thread_id}`, {
        headers: {
          'apikey': this.config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const thread = threadResponse.data[0];
      const project_id = thread.project_id;

      // Get project details
      const projectResponse = await axios.get(`${this.config.supabase_url}/rest/v1/projects?project_id=eq.${project_id}`, {
        headers: {
          'apikey': this.config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const project = projectResponse.data[0];
      const sandbox_id = project.sandbox.sandbox_id || project.sandbox.id;

      console.log('Agent initiated successfully:', { thread_id, agent_run_id, project_id, sandbox_id });

      return {
        success: true,
        thread_id,
        project_id,
        project_name: project.name,
        agent_run_id,
        sandbox_id
      };

    } catch (error) {
      console.error('Agent initiation failed:', error.message);
      throw new Error(`Agent initiation failed: ${error.message}`);
    }
  }

  /**
   * Get agent run status
   */
  async getAgentRunStatus(agentRunId) {
    try {
      const response = await axios.get(`${this.config.backend_url}/api/agent-run/${agentRunId}`, {
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
   * List sandbox files
   */
  async listSandboxFiles(sandboxId, filePath = '/workspace') {
    try {
      const response = await axios.get(`${this.config.backend_url}/api/sandboxes/${sandboxId}/files?path=${encodeURIComponent(filePath)}`, {
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
   * Download file content
   */
  async downloadFileContent(sandboxId, filePath) {
    try {
      const response = await axios.get(`${this.config.backend_url}/api/sandboxes/${sandboxId}/files/content?path=${encodeURIComponent(filePath)}`, {
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
   * Poll and download - Port of poll_and_download()
   */
  async pollAndDownload(agentRunId) {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Call authenticateWithSupabase first.');
    }

    try {
      // Get agent run status
      const runStatus = await this.getAgentRunStatus(agentRunId);
      const status = runStatus.status;

      console.log(`Agent status: ${status}`);

      if (status === 'completed') {
        // Need to derive other IDs from agent run
        const threadId = runStatus.threadId || runStatus.thread_id;
        
        if (!threadId) {
          throw new Error('Could not derive thread_id from agent run');
        }

        // Get thread details to find project_id
        const threadResponse = await axios.get(`${this.config.supabase_url}/rest/v1/threads?thread_id=eq.${threadId}`, {
          headers: {
            'apikey': this.config.supabase_anon_key,
            'Authorization': `Bearer ${this.accessToken}`
          }
        });

        const thread = threadResponse.data[0];
        const projectId = thread.project_id;

        // Get project details to find sandbox_id
        const projectResponse = await axios.get(`${this.config.supabase_url}/rest/v1/projects?project_id=eq.${projectId}`, {
          headers: {
            'apikey': this.config.supabase_anon_key,
            'Authorization': `Bearer ${this.accessToken}`
          }
        });

        const project = projectResponse.data[0];
        const sandboxId = project.sandbox.sandbox_id || project.sandbox.id;

        // List and download files
        const files = await this.listSandboxFiles(sandboxId);
        const txtFiles = files.filter(f => !f.is_dir && f.name.endsWith('.txt'));

        const downloadedFiles = [];
        for (const file of txtFiles) {
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
   * Stop agent run
   */
  async stopAgentRun(agentRunId) {
    try {
      const response = await axios.post(`${this.config.backend_url}/api/agent-run/${agentRunId}/stop`, {}, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to stop agent: ${error.message}`);
    }
  }

  /**
   * Delete sandbox
   */
  async deleteSandbox(sandboxId) {
    try {
      const response = await axios.delete(`${this.config.backend_url}/api/sandboxes/${sandboxId}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to delete sandbox: ${error.message}`);
    }
  }

  /**
   * Stop and delete sandbox - Port of stop_agent_and_delete_sandbox()
   */
  async stopAndDeleteSandbox(agentRunId) {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Call authenticateWithSupabase first.');
    }

    try {
      // Get agent run details to find sandbox_id
      const runStatus = await this.getAgentRunStatus(agentRunId);
      const threadId = runStatus.threadId || runStatus.thread_id;

      if (!threadId) {
        throw new Error('Could not derive thread_id from agent run');
      }

      // Get project and sandbox IDs
      const threadResponse = await axios.get(`${this.config.supabase_url}/rest/v1/threads?thread_id=eq.${threadId}`, {
        headers: {
          'apikey': this.config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const thread = threadResponse.data[0];
      const projectId = thread.project_id;

      const projectResponse = await axios.get(`${this.config.supabase_url}/rest/v1/projects?project_id=eq.${projectId}`, {
        headers: {
          'apikey': this.config.supabase_anon_key,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const project = projectResponse.data[0];
      const sandboxId = project.sandbox.sandbox_id || project.sandbox.id;

      // Stop agent
      const stopResult = await this.stopAgentRun(agentRunId);
      console.log('Agent stopped:', stopResult);

      // Delete sandbox
      const deleteResult = await this.deleteSandbox(sandboxId);
      console.log('Sandbox deleted:', deleteResult);

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
}

// Express API Server
const app = express();
app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Create client instance
const client = new SunaClient(config);

// Routes
app.post('/auth', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const result = await client.authenticateWithSupabase(email, password);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.post('/initiate', async (req, res) => {
  try {
    const { prompt, email, password, model_name } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // Authenticate if credentials provided
    if (email && password) {
      await client.authenticateWithSupabase(email, password);
    }
    
    const result = await client.initiateAgent(prompt, model_name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/poll', async (req, res) => {
  try {
    const { agent_run_id, email, password } = req.body;
    
    if (!agent_run_id) {
      return res.status(400).json({ error: 'Agent run ID is required' });
    }
    
    // Authenticate if credentials provided
    if (email && password) {
      await client.authenticateWithSupabase(email, password);
    }
    
    const result = await client.pollAndDownload(agent_run_id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/stop-sandbox', async (req, res) => {
  try {
    const { agent_run_id, email, password } = req.body;
    
    if (!agent_run_id) {
      return res.status(400).json({ error: 'Agent run ID is required' });
    }
    
    // Authenticate if credentials provided
    if (email && password) {
      await client.authenticateWithSupabase(email, password);
    }
    
    const result = await client.stopAndDeleteSandbox(agent_run_id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// CLI interface
async function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log('Usage: node suna_client_nodejs.js <command> [options]');
    console.log('Commands: auth, initiate, poll, stop-sandbox, server');
    return;
  }
  
  const client = new SunaClient(config);
  
  try {
    switch (command) {
      case 'auth':
        const email = args[1];
        const password = args[2];
        if (!email || !password) {
          console.log('Usage: node suna_client_nodejs.js auth <email> <password>');
          return;
        }
        const authResult = await client.authenticateWithSupabase(email, password);
        console.log('Authentication successful:', authResult);
        break;
        
      case 'initiate':
        const prompt = args[1];
        const authEmail = args[2];
        const authPassword = args[3];
        if (!prompt || !authEmail || !authPassword) {
          console.log('Usage: node suna_client_nodejs.js initiate "<prompt>" <email> <password>');
          return;
        }
        await client.authenticateWithSupabase(authEmail, authPassword);
        const initiateResult = await client.initiateAgent(prompt);
        console.log('Agent initiated:', initiateResult);
        break;
        
      case 'poll':
        const agentRunId = args[1];
        const pollEmail = args[2];
        const pollPassword = args[3];
        if (!agentRunId || !pollEmail || !pollPassword) {
          console.log('Usage: node suna_client_nodejs.js poll <agent_run_id> <email> <password>');
          return;
        }
        await client.authenticateWithSupabase(pollEmail, pollPassword);
        const pollResult = await client.pollAndDownload(agentRunId);
        console.log('Poll result:', JSON.stringify(pollResult, null, 2));
        break;
        
      case 'stop-sandbox':
        const stopAgentRunId = args[1];
        const stopEmail = args[2];
        const stopPassword = args[3];
        if (!stopAgentRunId || !stopEmail || !stopPassword) {
          console.log('Usage: node suna_client_nodejs.js stop-sandbox <agent_run_id> <email> <password>');
          return;
        }
        await client.authenticateWithSupabase(stopEmail, stopPassword);
        const stopResult = await client.stopAndDeleteSandbox(stopAgentRunId);
        console.log('Stop result:', stopResult);
        break;
        
      case 'server':
        console.log(`Starting Suna API server on port ${config.port}...`);
        app.listen(config.port, () => {
          console.log(`🚀 Suna API server running on http://localhost:${config.port}`);
          console.log('Available endpoints:');
          console.log('  POST /auth - Authenticate');
          console.log('  POST /initiate - Start agent');
          console.log('  POST /poll - Check status and download files');
          console.log('  POST /stop-sandbox - Stop and delete sandbox');
          console.log('  GET /health - Health check');
        });
        break;
        
      default:
        console.log('Unknown command:', command);
        console.log('Available commands: auth, initiate, poll, stop-sandbox, server');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for use as module
module.exports = { SunaClient, config };

// Run CLI if called directly
if (require.main === module) {
  runCLI();
} 