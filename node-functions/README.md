# SUNA FlowAgent API Functions

This directory contains Google Cloud Functions that power the SUNA FlowAgent API - a real-time research automation system that integrates AI agents with live file monitoring and multi-phase workflows.

## Overview

FlowAgent enables sophisticated research workflows where AI agents create files in real-time while users can monitor progress, interact via chat, and guide the research through multiple phases. The system provides secure, scalable cloud functions with comprehensive input validation, error handling, and authentication.

This implementation includes both **legacy functions** (suna-*) and **new FlowAgent functions** (flowagent-*) with enhanced security and real-time capabilities.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Cloud          │    │   SUNA          │
│   Research      │◄──►│   Functions      │◄──►│   Backend       │
│   Dashboard     │    │   (Node.js)      │    │   (AI Agents)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Real-time     │    │   Secure Auth    │    │   File System   │
│   Updates       │    │   Rate Limiting  │    │   Monitoring    │
│   (SSE Stream)  │    │   Input Valid.   │    │   (Sandbox)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## FlowAgent Functions (New)

### 1. `flowagent-initiate` - Session Initiation
**Purpose**: Start new research sessions with AI agents and specify expected files.

**Endpoint**: `POST /flowagent-initiate`

**Usage**:
```javascript
const session = await flowAgent.initiate(
  "Analyze the cybersecurity market for SMBs", 
  ["market_analysis.html", "segments.json"],
  "claude-sonnet-4"
);
// Returns: { threadId, sessionData }
```

**Features**:
- Multi-phase workflow support
- Expected file specification  
- Model selection (Claude, GPT)
- User context tracking
- Comprehensive input validation

---

### 2. `flowagent-files` - Real-time File Monitoring
**Purpose**: Monitor and download files created by AI agents in real-time, without waiting for completion.

**Endpoint**: `GET /flowagent-files?threadId={id}`

**Usage**:
```javascript
const fileStatus = await flowAgent.getFiles(threadId);
// Returns newly downloaded files with full content
{
  newlyDownloaded: [
    { name: "report.html", content: "<html>...</html>", size: 1234 }
  ],
  fileStatuses: [
    { name: "report.html", status: "ready", downloadedAt: "2024-01-01T10:00:00Z" }
  ],
  summary: { expected: 2, ready: 1, pending: 1, error: 0 }
}
```

**Key Benefits**:
- **Early Access**: Get files as soon as they're created
- **Progressive Loading**: Show research results incrementally
- **Error Detection**: Know immediately if expected files aren't being created
- **Unexpected Files**: Discover additional files beyond expectations

---

### 3. `flowagent-new-phase` - Multi-Phase Workflows
**Purpose**: Enable complex research workflows with sequential phases that build on previous results.

**Endpoint**: `POST /flowagent-new-phase`

**Usage**:
```javascript
// Phase 1: Market Segmentation
await flowAgent.initiate("Analyze AI market segments", ["segments.json"]);

// User reviews segments, selects "Enterprise AI"

// Phase 2: Deep Dive Analysis
await flowAgent.newPhase(
  threadId,
  "Deep dive into Enterprise AI with competitive analysis",
  ["competitive_analysis.html", "companies.json"]
);
```

**Benefits**:
- **Structured Research**: Break complex research into logical phases
- **User Interaction**: Allow guided research with user input between phases
- **Cumulative Knowledge**: Each phase builds on previous findings
- **File Organization**: Track which files belong to which research phase

---

### 4. `flowagent-status` - Session Monitoring
**Purpose**: Real-time status monitoring for sessions, phases, and file progress.

**Endpoint**: `GET /flowagent-status?threadId={id}`

**Usage**:
```javascript
const status = await flowAgent.getStatus(threadId);
{
  status: "active",
  currentPhase: {
    phaseNumber: 2,
    prompt: "Analyze competitive landscape...",
    status: "running"
  },
  filesSummary: { total: 3, ready: 2, pending: 1 }
}
```

**Benefits**:
- **Health Monitoring**: Detect stuck or failed sessions
- **Progress Tracking**: Show detailed progress to users
- **Session Recovery**: Resume monitoring after page refresh
- **Resource Management**: Track active vs completed sessions

---

### 5. `flowagent-stream` - Real-time Updates (SSE)
**Purpose**: Provides real-time updates for file changes and chat responses through persistent Server-Sent Events.

**Endpoint**: `GET /flowagent-stream?threadId={id}&agentRunId={id}`

**Usage**:
```javascript
await flowAgent.startStream(threadId, (event) => {
  switch(event.type) {
    case 'files_updated':
      // New research files ready
      displayNewFiles(event.newFiles);
      break;
      
    case 'chat_response':
      // Streaming AI chat response
      appendToChatStream(event.data);
      break;
      
    case 'session_status':
      // Session state changed
      updateSessionStatus(event.status);
      break;
  }
});
```

**Benefits**:
- **Real-time UX**: Updates appear instantly without polling
- **Efficient**: Single connection handles all update types
- **Chat Streaming**: See AI responses as they're generated
- **Connection Management**: Automatic reconnection and heartbeat monitoring

---

### 6. `flowagent-download` - File Downloads
**Purpose**: On-demand download of specific files with proper browser download handling.

**Endpoint**: `GET /flowagent-download?threadId={id}&fileName={name}&download={true/false}`

**Usage**:
```javascript
// Display file content inline
const content = await flowAgent.downloadFile(threadId, 'report.html');
document.getElementById('report').innerHTML = content;

// Force browser download
await flowAgent.downloadFile(threadId, 'market_analysis.html', true);

// Save content to device
flowAgent.saveFileToDevice('report.html', content, 'text/html');
```

---

### 7. `flowagent-chat` - Interactive Chat
**Purpose**: Send chat messages to AI agents during research sessions.

**Endpoint**: `POST /flowagent-chat`

**Usage**:
```javascript
const response = await flowAgent.sendChat(
  threadId,
  "What are the top 3 pain points for SMB CISOs?",
  "claude-sonnet-4"
);
```

---

### 8. `flowagent-close` - Session Cleanup  
**Purpose**: Properly close research sessions and archive sandbox environments.

**Endpoint**: `POST /flowagent-close`

**Usage**:
```javascript
await flowAgent.closeSession(threadId);
// Stops agents, archives sandbox, downloads final files
```

---

### 9. `auth-cookie` - Secure SSE Authentication
**Purpose**: Set secure authentication cookies for Server-Sent Events (SSE) streams.

**Problem**: EventSource cannot send custom headers, creating authentication challenges for real-time streams.

**Solution**: Secure cookie-based authentication with HttpOnly, Secure, and SameSite protections.

**Security Features**:
- **HttpOnly**: Prevents XSS attacks
- **Secure**: HTTPS-only transmission
- **SameSite=Strict**: CSRF protection
- **Limited Lifetime**: 1-hour expiry

## Complete Workflow Example

```javascript
// 1. Start research session
const session = await flowAgent.initiate(
  "Analyze the cybersecurity market for SMBs",
  ["market_analysis.html", "segments.json"]
);

// 2. Set up real-time monitoring
await flowAgent.startStream(session.threadId, (event) => {
  if (event.type === 'files_updated') {
    displayNewFiles(event.newFiles);
  }
});

// 3. User interaction after phase 1
await flowAgent.newPhase(
  session.threadId,
  "Deep dive into Enterprise SMB cybersecurity needs",
  ["enterprise_analysis.html", "buyer_personas.json"]
);

// 4. Chat interaction
await flowAgent.sendChat(
  session.threadId, 
  "What are the top 3 pain points for SMB CISOs?"
);

// 5. Download specific files
const report = await flowAgent.downloadFile(session.threadId, 'enterprise_analysis.html');

// 6. Clean up when done
await flowAgent.closeSession(session.threadId);
```

## Security Features

All FlowAgent functions include comprehensive security:

- **Firebase Authentication**: JWT token validation for all requests
- **Input Validation**: Comprehensive validation with regex patterns and sanitization
- **Rate Limiting**: 60 requests/minute per user with proper headers
- **CORS Protection**: Domain-specific origin validation
- **Error Handling**: Sanitized error messages with unique tracking IDs
- **Path Traversal Protection**: File name validation prevents directory attacks
- **Secure Cookies**: HttpOnly, Secure, SameSite=Strict for SSE authentication

## Configuration

### Timeout Settings
- **Research Sessions**: 60 minutes (AI analysis can be thorough)
- **SSE Streams**: 60 minutes (users may leave dashboard open)
- **Chat Responses**: 5 minutes (interactive responses)
- **File Operations**: 30 seconds (should be fast)

### Rate Limiting
- **Limit**: 60 requests per minute per user
- **Window**: 1 minute sliding window
- **Headers**: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

## Authentication Architecture

### Service Account Approach (Implemented)

- **Single Supabase service account** (`suna-service@eloo.ai`) handles all backend operations
- **Password stored securely** in Google Cloud Secret Manager
- **Firebase authentication** validates user access to functions
- **Multi-project support** allows different Firebase projects to access functions

### Benefits

- **Security**: Single controlled service account with secure password storage
- **Simplicity**: No user mapping or account creation complexity
- **Cost**: Single Supabase user vs multiple users
- **Maintenance**: Easier monitoring and debugging

## Setup Instructions

### 1. Prerequisites

```bash
# Install gcloud CLI and authenticate
gcloud auth login
gcloud config set project suna-deployment-1749244914

# Enable required APIs
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### 2. Secret Manager Setup

```bash
# Create the secret for service account password
gcloud secrets create suna_service --data-file=-
# Type the actual password and press Ctrl+D

# Grant Cloud Functions access to the secret
gcloud secrets add-iam-policy-binding suna_service \
    --member="serviceAccount:suna-deployment-1749244914@appspot.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 3. Environment Configuration

Update `.env.yaml` with your configuration:

```yaml
BACKEND_URL: "http://34.171.125.26:8000"
SUPABASE_URL: "https://nmwqprgbxtnikkmwhwyt.supabase.co"
SUPABASE_ANON_KEY: "your_supabase_anon_key"
SERVICE_ACCOUNT_EMAIL: "suna-service@eloo.ai"
SERVICE_ACCOUNT_PASSWORD_SECRET: "suna_service"
ALLOWED_FIREBASE_PROJECTS: "market-research-agents,another-project"
ELOO_ORG_DOMAIN: "eloo.ai"
```

### 4. Supabase Service Account Setup

1. **Create service account** in Supabase Auth:
   - Email: `suna-service@eloo.ai`
   - Strong password (store in Secret Manager)

2. **Configure Supabase** (recommended):
   - Disable public user registration
   - Set up Row Level Security policies if needed

### 5. Deploy Functions

```bash
# Install dependencies
npm install

# Deploy all functions
./deploy.sh

# Or deploy individually
gcloud functions deploy suna-health --source . --entry-point health --runtime nodejs20 --trigger-http --allow-unauthenticated --env-vars-file .env.yaml
```

## Function Endpoints

After deployment, functions are available at:

### FlowAgent Functions (New)
```
https://us-central1-suna-deployment-1749244914.cloudfunctions.net/
├── flowagent-initiate      # Start research sessions
├── flowagent-files         # Monitor file creation
├── flowagent-chat          # Send chat messages  
├── flowagent-new-phase     # Multi-phase workflows
├── flowagent-close         # Session cleanup
├── flowagent-status        # Session monitoring
├── flowagent-stream        # Real-time updates (SSE)
├── flowagent-download      # File downloads
└── auth-cookie             # SSE authentication
```

### Legacy Functions
- `https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-health`
- `https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-initiate`
- `https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-poll`
- `https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-stop-sandbox`

## Usage

### Authentication

All functions (except health check) require Firebase authentication:

```javascript
// In your client application
const idToken = await user.getIdToken();

const response = await fetch(functionUrl, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({...})
});
```

### API Examples

**Initiate Agent:**
```bash
curl -X POST https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-initiate \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Create a simple Python hello world script", "model_name": "claude-sonnet-4"}'
```

**Poll Status:**
```bash
curl -X POST https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-poll \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_run_id": "your-agent-run-id"}'
```

**Stop and Delete:**
```bash
curl -X POST https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-stop-sandbox \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_run_id": "your-agent-run-id"}'
```

## Security Features

- **Multi-project Firebase authentication** with project allowlist
- **Organization domain validation** (optional)
- **Secure password storage** in Google Cloud Secret Manager
- **Service account isolation** - single controlled access point
- **Request logging** with Firebase user context

## Monitoring

```bash
# View function logs
gcloud functions logs read suna-initiate --limit=50
gcloud functions logs read suna-poll --limit=50
gcloud functions logs read suna-stop-sandbox --limit=50

# View all function logs
npm run logs
```

## Architecture

```
Firebase App (market-research-agents) 
    ↓ (Firebase ID Token)
Cloud Functions (suna-deployment-1749244914)
    ↓ (Service Account Auth)
Supabase (suna-service@eloo.ai)
    ↓ (Supabase JWT)
Suna Backend (34.171.125.26:8000)
```

## Troubleshooting

**Secret Manager Access Issues:**
```bash
# Check secret exists
gcloud secrets list

# Check permissions
gcloud secrets get-iam-policy suna_service

# Test secret access
gcloud secrets versions access latest --secret="suna_service"
```

**Function Authentication Issues:**
- Verify Firebase project ID in ALLOWED_FIREBASE_PROJECTS
- Check Firebase token validity and expiration
- Ensure organization domain matches (if ELOO_ORG_DOMAIN is set)

**Supabase Authentication Issues:**
- Verify service account exists and password is correct
- Check Supabase URL and anon key
- Ensure service account has necessary permissions

## 🚀 Quick Start

1. **Setup project**:
   ```bash
   cd node-functions
   gcloud config set project suna-deployment-1749244914
   gcloud auth login
   ```

2. **Configure environment**:
   ```bash
   # Edit .env.yaml with your Firebase project IDs
   nano .env.yaml
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Deploy all functions**:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

## 📁 Project Structure

```
node-functions/
├── index.js          # Main Cloud Functions implementation
├── package.json      # Dependencies and scripts
├── deploy.sh         # Deployment script
├── .env.yaml         # Environment variables template
└── README.md         # This file
```

## 🔧 Configuration

### Environment Variables (.env.yaml)

```yaml
# SUNA Backend Configuration
BACKEND_URL: "http://34.171.125.26:8000"
SUPABASE_URL: "https://nmwqprgbxtnikkmwhwyt.supabase.co"
SUPABASE_ANON_KEY: "your_supabase_anon_key"

# Service Account Authentication
SERVICE_ACCOUNT_EMAIL: "suna-service@eloo.ai"
SERVICE_ACCOUNT_PASSWORD_SECRET: "suna_service"

# Firebase Authentication
ALLOWED_FIREBASE_PROJECTS: "market-research-agents,another-project"
ELOO_ORG_DOMAIN: "eloo.ai"

# FlowAgent Security (New)
ALLOWED_ORIGINS: "https://yourapp.com,http://localhost:3000,http://localhost:5173"
NODE_ENV: "production"
```

**Required Variables:**
- `BACKEND_URL` - Suna backend server URL
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SERVICE_ACCOUNT_EMAIL` - Service account email
- `SERVICE_ACCOUNT_PASSWORD_SECRET` - Service account password secret
- `ALLOWED_FIREBASE_PROJECTS` - Comma-separated Firebase project IDs

**FlowAgent Security Variables:**
- `ALLOWED_ORIGINS` - Comma-separated allowed CORS origins for FlowAgent functions
- `NODE_ENV` - Environment (development/production) affects error detail disclosure

**Optional Variables:**
- `ELOO_ORG_DOMAIN` - Restrict access to organization domain

## 🌐 Deployed Functions

After deployment, functions are available at:

```
https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-health
https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-initiate
https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-poll
https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-stop-sandbox
```

### Function Endpoints

1. **Health Check** - `GET /suna-health`
   - No authentication required
   - Returns system status

2. **Initiate Agent** - `POST /suna-initiate`
   - Requires Firebase authentication
   - Starts agent and returns IDs
   - Body: `{ "prompt": "your prompt" }`

3. **Poll and Download** - `POST /suna-poll`
   - Requires Firebase authentication
   - Checks status and downloads files
   - Body: `{ "agent_run_id": "uuid" }`

4. **Stop and Delete Sandbox** - `POST /suna-stop-sandbox`
   - Requires Firebase authentication
   - Stops agent and deletes sandbox
   - Body: `{ "agent_run_id": "uuid" }`

## 🔐 Authentication

Functions use **multi-project Firebase authentication**:

1. **Frontend gets Firebase token**:
   ```javascript
   const token = await user.getIdToken();
   ```

2. **Include in requests**:
   ```javascript
   fetch('https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-initiate', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${token}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({ prompt: "Create a hello world script" })
   });
   ```

3. **Function validates token** from any allowed Firebase project

## 📊 Usage Examples

### JavaScript/TypeScript Frontend

```javascript
import { getAuth } from 'firebase/auth';

class SunaAPI {
  constructor() {
    this.baseUrl = 'https://us-central1-suna-deployment-1749244914.cloudfunctions.net';
  }

  async getAuthToken() {
    const auth = getAuth();
    const user = auth.currentUser;
    return await user.getIdToken();
  }

  async initiateAgent(prompt) {
    const token = await this.getAuthToken();
    const response = await fetch(`${this.baseUrl}/suna-initiate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt })
    });
    return response.json();
  }

  async pollAgent(agentRunId) {
    const token = await this.getAuthToken();
    const response = await fetch(`${this.baseUrl}/suna-poll`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agent_run_id: agentRunId })
    });
    return response.json();
  }

  async stopAgent(agentRunId) {
    const token = await this.getAuthToken();
    const response = await fetch(`${this.baseUrl}/suna-stop-sandbox`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agent_run_id: agentRunId })
    });
    return response.json();
  }
}

// Usage
const api = new SunaAPI();

// Start agent
const result = await api.initiateAgent("Create a hello world script");
console.log('Agent started:', result.agent_run_id);

// Poll for completion
let pollResult = await api.pollAgent(result.agent_run_id);
while (pollResult.status !== 'completed') {
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
  pollResult = await api.pollAgent(result.agent_run_id);
}

// Download files
console.log('Downloaded files:', pollResult.downloaded_files);

// Stop agent and clean up
await api.stopAgent(result.agent_run_id);
```

## 🛠️ Development

### Local Testing

```bash
# Install dependencies
npm install

# Start local function server (health check only)
npm start

# Test locally
curl http://localhost:8080
```

### View Logs

```bash
# View all logs
npm run logs

# View specific function logs
gcloud functions logs read suna-initiate --limit=50

# Real-time logs
gcloud functions logs tail suna-initiate
```

### Update Functions

```bash
# Update environment variables
nano .env.yaml

# Redeploy all functions
./deploy.sh

# Deploy single function
gcloud functions deploy suna-initiate --env-vars-file .env.yaml --source .
```

## 💰 Cost Optimization

**Free Tier (per month):**
- 2M function invocations
- 400,000 GB-seconds compute time
- 200,000 GHz-seconds CPU time

**Expected costs for moderate usage: $5-20/month**

## 🔒 Security Features

1. **Firebase Token Validation** - Multi-project support
2. **Organization Domain Check** - Optional @eloo.ai restriction
3. **CORS Protection** - Configurable origins
4. **Rate Limiting** - Built-in Cloud Functions limits
5. **Environment Variables** - Secure credential storage

## 📈 Monitoring

- **Google Cloud Console** - Function metrics and logs
- **Firebase Console** - Authentication metrics
- **Stackdriver** - Advanced monitoring and alerts

## 🚨 Troubleshooting

### Common Issues

1. **Authentication failed**: Check ALLOWED_FIREBASE_PROJECTS
2. **Function timeout**: Increase timeout in deploy.sh
3. **Permission denied**: Verify gcloud authentication
4. **Environment variables**: Check .env.yaml format

### Debug Commands

```bash
# Check deployment status
gcloud functions describe suna-initiate

# Test function directly
gcloud functions call suna-health

# View detailed logs
gcloud logging read "resource.type=cloud_function"
```

## 📊 Monitoring

### FlowAgent Function Logs
```bash
# View real-time FlowAgent logs
gcloud functions logs tail flowagent-initiate
gcloud functions logs tail flowagent-stream

# View recent logs with context
gcloud functions logs read flowagent-files --limit=50

# Monitor SSE stream connections
gcloud functions logs read flowagent-stream --filter="SSE" --limit=20

# Check authentication issues
gcloud functions logs read auth-cookie --filter="ERROR" --limit=10
```

### Performance Monitoring
```bash
# Check function execution times
gcloud functions describe flowagent-initiate --format="value(timeout)"

# Monitor rate limiting
gcloud functions logs read flowagent-initiate --filter="Rate limit exceeded"

# Check memory usage
gcloud functions logs read flowagent-stream --filter="memory"
```

## 🚨 Troubleshooting

### FlowAgent Specific Issues

**SSE Authentication Failures:**
```bash
# Check cookie endpoint
curl -X POST https://us-central1-suna-deployment-1749244914.cloudfunctions.net/auth-cookie \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -d '{"action":"set"}'

# Verify CORS settings
gcloud functions logs read auth-cookie --filter="CORS blocked"
```

**File Download Issues:**
```bash
# Test file endpoint
curl "https://us-central1-suna-deployment-1749244914.cloudfunctions.net/flowagent-files?threadId=test-123" \
  -H "Authorization: Bearer $FIREBASE_TOKEN"

# Check file validation errors
gcloud functions logs read flowagent-download --filter="Invalid file name"
```

**Rate Limiting Issues:**
```bash
# Check rate limit headers
curl -I "https://us-central1-suna-deployment-1749244914.cloudfunctions.net/flowagent-status?threadId=test" \
  -H "Authorization: Bearer $FIREBASE_TOKEN"

# Monitor rate limit logs
gcloud functions logs read flowagent-initiate --filter="X-RateLimit"
```

## 📞 Support

For issues or questions:
1. **Check function-specific logs**: `gcloud functions logs read flowagent-[function-name]`
2. **Verify environment variables**: Ensure ALLOWED_ORIGINS and NODE_ENV are set
3. **Test authentication**: Try auth-cookie endpoint first
4. **Monitor real-time**: Use `gcloud functions logs tail` for live debugging
5. **Check CORS**: Verify origins in ALLOWED_ORIGINS match your frontend
6. **Contact development team** with specific error IDs from logs

---

*This API powers intelligent research workflows with real-time AI agent integration, secure file handling, and interactive multi-phase research capabilities.* 