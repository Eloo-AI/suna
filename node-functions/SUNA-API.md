# Suna API Documentation

This document describes the Suna Agent API for integrating conversational AI agents into client applications. The API provides session-based interactions with Claude agents that can create, modify, and iterate on code artifacts.

## Overview

Suna provides a conversational AI experience where users can:
1. **Start sessions** with initial prompts to create artifacts
2. **Send follow-up prompts** to modify or discuss existing artifacts  
3. **Download completed work** as files
4. **Stream real-time responses** during agent processing

## Base URL

```
https://us-central1-suna-deployment-1749244914.cloudfunctions.net
```

## Authentication

All endpoints (except health) require Firebase authentication:

```javascript
// Include Firebase ID token in Authorization header
headers: {
  'Authorization': `Bearer ${firebaseIdToken}`,
  'Content-Type': 'application/json'
}
```

## Core API Flow

### 1. Session Initiation
Start a new session with an initial prompt.

**Endpoint:** `POST /suna-initiate`

**Request:**
```json
{
  "prompt": "create a hello world html page",
  "model_name": "claude-sonnet-4"
}
```

**Response:**
```json
{
  "success": true,
  "thread_id": "976bee28-ecad-41a9-868b-9d10c1d25cc5",
  "project_id": "8c5b1a3c-acd0-4454-b1b0-6c731aa8230f",
  "project_name": "Project Name",
  "agent_run_id": "339d4a99-1ec2-4d83-8ba7-95447b86c5a3",
  "sandbox_id": "ba3cc40d-109b-4102-936b-39c65ae50229",
  "user": {
    "firebase_uid": "user123",
    "firebase_email": "user@example.com",
    "firebase_project": "your-firebase-project"
  }
}
```

### 2. Poll and Download Artifacts
Check session status and download completed files.

**Endpoint:** `POST /suna-poll`

**Request:**
```json
{
  "agent_run_id": "339d4a99-1ec2-4d83-8ba7-95447b86c5a3"
}
```

**Response (In Progress):**
```json
{
  "success": true,
  "status": "running",
  "run_status": {
    "id": "339d4a99-1ec2-4d83-8ba7-95447b86c5a3",
    "threadId": "976bee28-ecad-41a9-868b-9d10c1d25cc5",
    "status": "running",
    "startedAt": "2025-06-30T12:47:43.170935+00:00",
    "completedAt": null,
    "error": null
  }
}
```

**Response (Completed):**
```json
{
  "success": true,
  "status": "completed",
  "thread_id": "976bee28-ecad-41a9-868b-9d10c1d25cc5",
  "project_id": "8c5b1a3c-acd0-4454-b1b0-6c731aa8230f",
  "sandbox_id": "ba3cc40d-109b-4102-936b-39c65ae50229",
  "downloaded_files": [
    {
      "name": "index.html",
      "path": "/workspace/index.html",
      "content": "<!DOCTYPE html>...",
      "size": 234
    }
  ],
  "run_status": {
    "id": "339d4a99-1ec2-4d83-8ba7-95447b86c5a3",
    "status": "completed",
    "completedAt": "2025-06-30T12:48:30.350311+00:00"
  }
}
```

### 3. Send Follow-up Prompts
Send additional prompts to existing sessions for modifications or questions.

**Endpoint:** `POST /suna-send-prompt`

**Request:**
```json
{
  "thread_id": "976bee28-ecad-41a9-868b-9d10c1d25cc5",
  "prompt": "make the background blue and add a button",
  "model_name": "claude-sonnet-4"
}
```

**Response:**
```json
{
  "success": true,
  "agent_run_id": "d331070e-b177-4469-a1b0-eaa9b8171699",
  "thread_id": "976bee28-ecad-41a9-868b-9d10c1d25cc5"
}
```

### 4. Stream Real-time Responses
Get streaming responses during agent processing.

**Endpoint:** `GET /suna-stream-response`

**Query Parameters:**
- `agent_run_id`: The agent run ID from send-prompt response
- `token`: Supabase access token (obtained from your backend)

**Request:**
```
GET /suna-stream-response?agent_run_id=d331070e-b177-4469-a1b0-eaa9b8171699&token=YOUR_SUPABASE_TOKEN
```

**Response:** Server-Sent Events (SSE) stream
```
data: {"message_id": "abc123", "type": "assistant", "content": "{\"role\": \"assistant\", \"content\": \"I'll help you...\"}", "sequence": 0}

data: {"message_id": "def456", "type": "status", "content": "{\"status_type\": \"tool_started\", \"tool_name\": \"str_replace\"}", "sequence": 1}

data: {"type": "status", "status": "completed", "message": "Agent run completed successfully"}

data: [DONE]
```

## Utility Endpoints

### Health Check
Check API status and configuration.

**Endpoint:** `GET /suna-health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-07-02T12:00:00.000Z",
  "config": {
    "backend_url": "http://34.171.125.26:8000",
    "allowed_projects": ["your-firebase-project"],
    "org_domain": "eloo.ai"
  }
}
```

### Stop Agent
Stop running agent without deleting sandbox.

**Endpoint:** `POST /suna-stop-agent`

**Request:**
```json
{
  "agent_run_id": "339d4a99-1ec2-4d83-8ba7-95447b86c5a3"
}
```

### Stop and Delete Sandbox
Stop agent and clean up all resources.

**Endpoint:** `POST /suna-stop-sandbox`

**Request:**
```json
{
  "agent_run_id": "339d4a99-1ec2-4d83-8ba7-95447b86c5a3"
}
```

## Complete Integration Example

```javascript
class SunaAPI {
  constructor(firebaseApp) {
    this.baseUrl = 'https://us-central1-suna-deployment-1749244914.cloudfunctions.net';
    this.auth = getAuth(firebaseApp);
  }

  async getAuthToken() {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');
    return await user.getIdToken();
  }

  async request(endpoint, data = null) {
    const token = await this.getAuthToken();
    const config = {
      method: data ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (data) config.body = JSON.stringify(data);
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, config);
    return response.json();
  }

  // Start new session
  async initiateSession(prompt, modelName = 'claude-sonnet-4') {
    return this.request('/suna-initiate', { prompt, model_name: modelName });
  }

  // Poll for completion and download files
  async pollAndDownload(agentRunId) {
    return this.request('/suna-poll', { agent_run_id: agentRunId });
  }

  // Send follow-up prompt
  async sendPrompt(threadId, prompt, modelName = 'claude-sonnet-4') {
    return this.request('/suna-send-prompt', { 
      thread_id: threadId, 
      prompt, 
      model_name: modelName 
    });
  }

  // Stream responses (requires Supabase token)
  async streamResponse(agentRunId, supabaseToken) {
    const token = await this.getAuthToken();
    const url = `${this.baseUrl}/suna-stream-response?agent_run_id=${agentRunId}&token=${supabaseToken}`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    return response.body; // ReadableStream for SSE processing
  }

  // Stop agent
  async stopAgent(agentRunId) {
    return this.request('/suna-stop-agent', { agent_run_id: agentRunId });
  }

  // Clean up completely
  async cleanup(agentRunId) {
    return this.request('/suna-stop-sandbox', { agent_run_id: agentRunId });
  }
}

// Usage Example
const suna = new SunaAPI(firebaseApp);

// 1. Start session
const session = await suna.initiateSession("Create a React component for a todo list");
console.log('Session started:', session.thread_id);

// 2. Poll until complete
let result;
do {
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  result = await suna.pollAndDownload(session.agent_run_id);
} while (result.status !== 'completed');

console.log('Files created:', result.downloaded_files.map(f => f.name));

// 3. Send follow-up
const followUp = await suna.sendPrompt(session.thread_id, "Add styling with CSS");

// 4. Stream real-time response (if you have Supabase token)
const stream = await suna.streamResponse(followUp.agent_run_id, supabaseToken);
// Process SSE stream...

// 5. Get final result
const finalResult = await suna.pollAndDownload(followUp.agent_run_id);
console.log('Updated files:', finalResult.downloaded_files);

// 6. Cleanup
await suna.cleanup(followUp.agent_run_id);
```

## File Types Supported

The API automatically downloads these file types from the agent's workspace:

- **Web**: `.html`, `.css`, `.js`, `.ts`
- **Data**: `.json`, `.xml`, `.csv`, `.yaml`, `.yml`
- **Code**: `.py`, `.sql`, `.sh`
- **Config**: `.env`, `.md`, `.txt`

## Error Handling

All endpoints return errors in this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing required parameters)
- `401` - Unauthorized (invalid or missing Firebase token)
- `500` - Internal Server Error (backend issues)

## Rate Limits

- **Cloud Functions**: 100,000 invocations per 100 seconds
- **Concurrent executions**: 1,000 per region
- **Timeout**: 60 seconds per function call

## Best Practices

1. **Polling**: Wait 2-5 seconds between poll requests
2. **Cleanup**: Always call stop/cleanup when done
3. **Error handling**: Implement retry logic for network failures
4. **Token refresh**: Handle Firebase token expiration
5. **Streaming**: Process SSE data incrementally for better UX

## Security

- All communication uses HTTPS
- Firebase authentication required for all operations
- Service account isolation prevents cross-user access
- Organization domain validation available
- No sensitive data logged or stored in function logs