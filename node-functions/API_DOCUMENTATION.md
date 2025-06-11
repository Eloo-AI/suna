# Suna Cloud Functions API Documentation

## Overview

The Suna Cloud Functions provide a REST API for interacting with Suna AI agents. These functions handle agent initiation, status polling, file downloads, and cleanup operations.

**Base URL**: `https://us-central1-suna-deployment-1749244914.cloudfunctions.net`

## Authentication

All endpoints except `/suna-health` require **Firebase Authentication**. Include your Firebase ID token in the `Authorization` header:

```
Authorization: Bearer <your_firebase_id_token>
```

### Getting a Firebase Token

1. In your Firebase-authenticated web app, open browser console
2. Run: `firebase.auth().currentUser.getIdToken().then(console.log)`
3. Copy the returned token

## Endpoints

### 1. Health Check

**GET** `/suna-health`

Check API status and configuration.

**Authentication**: None required

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-06-08T11:17:22.681Z",
  "config": {
    "backend_url": "http://34.171.125.26:8000",
    "allowed_projects": ["market-research-agents"],
    "org_domain": "eloo.ai"
  }
}
```

**cURL Example**:
```bash
curl -X GET "https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-health"
```

---

### 2. Initiate Agent

**POST** `/suna-initiate`

Start a new AI agent with a given prompt.

**Authentication**: Required

**Request Body**:
```json
{
  "prompt": "Create a market analysis report in JSON format",
  "model_name": "claude-sonnet-4"  // optional, defaults to claude-sonnet-4
}
```

**Response**:
```json
{
  "success": true,
  "thread_id": "e77f0259-abbc-4c15-9eaf-24eb69f95b0c",
  "project_id": "e4a44d13-71b4-43fc-99c3-25987e41c830",
  "project_name": "Market Analysis Report",
  "agent_run_id": "314e777c-58e1-4f24-b2d4-188f95efc026",
  "sandbox_id": "f91c81c6-2286-4e55-b587-3a8bef1892ab",
  "user": {
    "firebase_uid": "4gI9AXiLbBhfQKraTGmURODXq8h2",
    "firebase_email": "gal@eloo.ai",
    "firebase_project": "market-research-agents"
  }
}
```

**Key Field**: Save the `agent_run_id` to poll status and download results.

**cURL Example**:
```bash
curl -X POST "https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-initiate" \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a Python script to analyze sales data",
    "model_name": "claude-sonnet-4"
  }'
```

---

### 3. Poll Agent Status & Download Files

**POST** `/suna-poll`

Check agent execution status and download completed files.

**Authentication**: Required

**Request Body**:
```json
{
  "agent_run_id": "314e777c-58e1-4f24-b2d4-188f95efc026"
}
```

**Response (Running)**:
```json
{
  "success": true,
  "status": "running",
  "run_status": {
    "id": "314e777c-58e1-4f24-b2d4-188f95efc026",
    "threadId": "e77f0259-abbc-4c15-9eaf-24eb69f95b0c",
    "status": "running",
    "startedAt": "2025-06-08T11:17:35.216129+00:00",
    "completedAt": null,
    "error": null
  }
}
```

**Response (Completed)**:
```json
{
  "success": true,
  "status": "completed",
  "thread_id": "e77f0259-abbc-4c15-9eaf-24eb69f95b0c",
  "project_id": "e4a44d13-71b4-43fc-99c3-25987e41c830",
  "sandbox_id": "f91c81c6-2286-4e55-b587-3a8bef1892ab",
  "downloaded_files": [
    {
      "name": "report.json",
      "path": "/workspace/report.json",
      "content": "{\n  \"market_size\": \"$5.2B\",\n  \"competitors\": [...],\n  \"growth_rate\": \"15%\"\n}",
      "size": 267
    },
    {
      "name": "summary.txt",
      "path": "/workspace/summary.txt", 
      "content": "Market Analysis Summary:\n- Market size: $5.2B\n- Key competitors: 5\n- Growth rate: 15% annually",
      "size": 98
    }
  ],
  "run_status": {
    "id": "314e777c-58e1-4f24-b2d4-188f95efc026",
    "threadId": "e77f0259-abbc-4c15-9eaf-24eb69f95b0c",
    "status": "completed",
    "startedAt": "2025-06-08T11:17:35.216129+00:00",
    "completedAt": "2025-06-08T11:17:51.495434+00:00",
    "error": null
  }
}
```

**Supported File Types**: 
- `.json`, `.txt`, `.py`, `.js`, `.ts`, `.html`, `.css`, `.md`, `.yml`, `.yaml`, `.xml`, `.csv`, `.sql`, `.sh`, `.env`

**File Content**: Complete file contents are included in the `content` field as strings.

**cURL Example**:
```bash
curl -X POST "https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-poll" \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_run_id": "314e777c-58e1-4f24-b2d4-188f95efc026"}'
```

---

### 4. Stop Agent (Keep Sandbox)

**POST** `/suna-stop-agent`

Stop a running agent while keeping the sandbox environment.

**Authentication**: Required

**Request Body**:
```json
{
  "agent_run_id": "314e777c-58e1-4f24-b2d4-188f95efc026"
}
```

**Response**:
```json
{
  "success": true,
  "agent_run_id": "314e777c-58e1-4f24-b2d4-188f95efc026",
  "sandbox_id": "f91c81c6-2286-4e55-b587-3a8bef1892ab",
  "message": "Agent stopped and sandbox stopped successfully"
}
```

**cURL Example**:
```bash
curl -X POST "https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-stop-agent" \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_run_id": "314e777c-58e1-4f24-b2d4-188f95efc026"}'
```

---

### 5. Stop Agent & Delete Sandbox

**POST** `/suna-stop-sandbox`

Stop a running agent and delete its sandbox environment.

**Authentication**: Required

**Request Body**:
```json
{
  "agent_run_id": "314e777c-58e1-4f24-b2d4-188f95efc026"
}
```

**Response**:
```json
{
  "success": true,
  "agent_run_id": "314e777c-58e1-4f24-b2d4-188f95efc026",
  "sandbox_id": "f91c81c6-2286-4e55-b587-3a8bef1892ab",
  "message": "Agent stopped and sandbox deleted successfully"
}
```

**cURL Example**:
```bash
curl -X POST "https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-stop-sandbox" \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_run_id": "314e777c-58e1-4f24-b2d4-188f95efc026"}'
```

## Usage Flow

### Basic Workflow

1. **Health Check** (optional)
2. **Initiate Agent** → Get `agent_run_id`
3. **Poll Status** → Wait until `status: "completed"`
4. **Download Files** → Extract from `downloaded_files` array
5. **Stop & Cleanup** → Delete sandbox

### Example JavaScript Integration

```javascript
class SunaAPI {
  constructor(firebaseToken) {
    this.baseURL = 'https://us-central1-suna-deployment-1749244914.cloudfunctions.net';
    this.token = firebaseToken;
  }

  async initiateAgent(prompt, modelName = 'claude-sonnet-4') {
    const response = await fetch(`${this.baseURL}/suna-initiate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, model_name: modelName })
    });
    return response.json();
  }

  async pollAgent(agentRunId) {
    const response = await fetch(`${this.baseURL}/suna-poll`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agent_run_id: agentRunId })
    });
    return response.json();
  }

  async stopAgent(agentRunId) {
    const response = await fetch(`${this.baseURL}/suna-stop-agent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agent_run_id: agentRunId })
    });
    return response.json();
  }

  async stopAndDeleteSandbox(agentRunId) {
    const response = await fetch(`${this.baseURL}/suna-stop-sandbox`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agent_run_id: agentRunId })
    });
    return response.json();
  }

  // Helper: Poll until completion
  async waitForCompletion(agentRunId, maxAttempts = 30, intervalMs = 5000) {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.pollAgent(agentRunId);
      
      if (result.status === 'completed') {
        return result;
      }
      
      if (result.status === 'failed') {
        throw new Error('Agent execution failed');
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error('Agent execution timeout');
  }
}

// Usage
const api = new SunaAPI(firebaseToken);

const { agent_run_id } = await api.initiateAgent(
  "Create a JSON report with market analysis"
);

const result = await api.waitForCompletion(agent_run_id);

// Extract files
result.downloaded_files.forEach(file => {
  console.log(`File: ${file.name}`);
  console.log(`Content: ${file.content}`);
});

await api.stopAgent(agent_run_id);
```

## Error Handling

### Error Response Format
```json
{
  "error": "Authentication failed: Token verification failed for all allowed projects"
}
```

### Common Error Codes

- **401 Unauthorized**: Invalid or missing Firebase token
- **400 Bad Request**: Missing required parameters
- **500 Internal Server Error**: Backend service issues

### Error Examples

**Missing Token**:
```json
{
  "error": "Missing or invalid authorization header"
}
```

**Invalid Agent ID**:
```json
{
  "error": "Failed to get agent status: Agent run not found"
}
```

## Rate Limits & Timeouts

- **Function Timeout**: 60 seconds per request
- **Authentication**: Firebase tokens expire in ~1 hour
- **Agent Execution**: Can take several minutes depending on complexity
- **Polling**: Recommended interval: 5-10 seconds

## Security

- **Firebase Authentication**: All requests validated against allowed projects
- **Service Account**: Backend operations use dedicated Supabase service account
- **Secrets Management**: Passwords stored in Google Cloud Secret Manager
- **Domain Restriction**: Optional restriction to `@eloo.ai` email addresses

## Support

For issues or questions about the API:
- Check function logs in GCP Console
- Verify Firebase token validity
- Ensure prompt clarity for better agent performance

---

*Last updated: 2025-06-08* 