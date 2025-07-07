# API Reference

Complete reference for all Suna Cloud Functions endpoints.

## Authentication

All endpoints (except health) require Firebase authentication via Bearer token:

```http
Authorization: Bearer <firebase-id-token>
```

For Server-Sent Events (SSE), authentication can also be provided via cookie:
```http
Cookie: flowagent_auth=<firebase-id-token>
```

## 🤖 Agent Functions

### POST /eloo-agent-initiate
Start a new agent session.

**Request:**
```json
{
  "prompt": "Create a hello world HTML page",
  "modelName": "claude-sonnet-4"
}
```

**Response:**
```json
{
  "success": true,
  "threadId": "uuid",
  "sessionData": {
    "projectId": "uuid",
    "sandboxId": "uuid", 
    "agentRunId": "uuid",
    "status": "initiated"
  }
}
```

### POST /eloo-agent-send-prompt
Send a prompt to an existing thread.

**Request:**
```json
{
  "thread_id": "uuid",
  "prompt": "Make it colorful",
  "model_name": "claude-sonnet-4"
}
```

**Response:**
```json
{
  "success": true,
  "threadId": "uuid",
  "agent_run_id": "uuid",
  "message": "Prompt sent successfully"
}
```

### GET /eloo-agent-run-status?agentRunId=uuid
Get status of a specific agent run.

**Response:**
```json
{
  "success": true,
  "agentRunId": "uuid",
  "status": "completed",
  "created_at": "2025-01-01T00:00:00Z",
  "completed_at": "2025-01-01T00:05:00Z"
}
```

### GET /eloo-agent-runs?threadId=uuid
Get all agent runs for a thread.

**Response:**
```json
{
  "success": true,
  "threadId": "uuid", 
  "runs": [
    {
      "agent_run_id": "uuid",
      "status": "completed",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### POST /eloo-agent-ensure-active
Ensure a sandbox is active for a project.

**Request:**
```json
{
  "projectId": "uuid"
}
```

**Response:**
```json
{
  "status": "success",
  "sandbox_id": "uuid",
  "message": "Sandbox is active"
}
```

### GET /eloo-agent-stream?threadId=uuid&agentRunId=uuid
Real-time streaming of agent responses via Server-Sent Events.

**Response:** Text/event-stream with events:
```
data: {"type": "session_status", "status": "initiated"}

data: {"type": "files_updated", "newFiles": [...]}

data: {"type": "agent_response", "content": "Hello!"}
```

## 🔄 FlowAgent Functions

### GET /flowagent-files?threadId=uuid&expectedFiles[]=file1.html
Get files from a FlowAgent session.

**Response:**
```json
{
  "success": true,
  "threadId": "uuid",
  "fileStatuses": [
    {
      "name": "file1.html",
      "status": "ready",
      "size": 1024,
      "downloadedAt": "2025-01-01T00:05:00Z"
    }
  ],
  "newlyDownloaded": [...],
  "summary": {
    "expected": 1,
    "ready": 1,
    "pending": 0
  }
}
```

### POST /flowagent-chat
Send a chat message in a FlowAgent session.

**Request:**
```json
{
  "threadId": "uuid",
  "message": "Can you explain this code?",
  "modelName": "claude-sonnet-4"
}
```

**Response:**
```json
{
  "success": true,
  "threadId": "uuid",
  "agentRunId": "uuid",
  "message": "Chat message sent, streaming available via WebSocket"
}
```

### POST /flowagent-new-phase
Start a new phase in a FlowAgent workflow.

**Request:**
```json
{
  "threadId": "uuid",
  "prompt": "Add CSS styling",
  "expectedFiles": ["styles.css"],
  "modelName": "claude-sonnet-4"
}
```

**Response:**
```json
{
  "success": true,
  "threadId": "uuid", 
  "phaseNumber": 2,
  "agentRunId": "uuid",
  "expectedFiles": ["styles.css"]
}
```

### POST /flowagent-close
Close a FlowAgent session.

**Request:**
```json
{
  "threadId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "threadId": "uuid",
  "finalFiles": [...],
  "summary": {
    "phases": 2,
    "totalFiles": 3,
    "duration": 300000
  }
}
```

### GET /flowagent-status?threadId=uuid
Get FlowAgent session status.

**Response:**
```json
{
  "success": true,
  "threadId": "uuid",
  "status": "active",
  "currentPhase": {
    "phaseNumber": 1,
    "agentRunId": "uuid",
    "status": "running"
  }
}
```

### GET /flowagent-download?threadId=uuid&fileName=file.html
Download a specific file from a FlowAgent session.

**Response:** File content with appropriate headers.

## 🛠️ Utility Functions

### GET /eloo-download-file?sandboxId=uuid&fileName=file.html
Download a file directly from a sandbox.

**Response:** File content with appropriate headers.

### GET /eloo-get-messages?threadId=uuid&offset=0&limit=100
Get messages for a thread.

**Response:**
```json
{
  "success": true,
  "threadId": "uuid",
  "messages": [
    {
      "id": "uuid",
      "content": "Hello!",
      "type": "user",
      "created_at": "2025-01-01T00:00:00Z",
      "agents": {
        "name": "Claude",
        "avatar": "url",
        "avatar_color": "#blue"
      }
    }
  ],
  "count": 1,
  "offset": 0,
  "limit": 100
}
```

### POST /auth-cookie
Set authentication cookie for SSE streams.

**Request:**
```json
{
  "token": "firebase-id-token"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cookie set successfully"
}
```

### GET /health
Health check endpoint (no authentication required).

**Response:**
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00Z",
  "instance_id": "single"
}
```

## Error Responses

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common HTTP status codes:
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Rate Limiting

- **Limit:** 60 requests per minute per user
- **Headers:** 
  - `X-RateLimit-Limit: 60`
  - `X-RateLimit-Remaining: 45`
  - `X-RateLimit-Reset: 1640995200`

## CORS

Configurable allowed origins via `ALLOWED_ORIGINS` environment variable.
Default: `http://localhost:8080`