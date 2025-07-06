# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Deployment
```bash
# Deploy all functions to Google Cloud
./deploy.sh

# Deploy individual function
gcloud functions deploy suna-health --source . --entry-point health --runtime nodejs20 --trigger-http --allow-unauthenticated --env-vars-file .env.yaml
```

### Development
```bash
# Install dependencies
npm install

# Start local function server (health check only)
npm start

# View function logs
npm run logs

# View logs for specific function
gcloud functions logs read suna-initiate --limit=50
```

### Testing
```bash
# Test health endpoint locally
curl http://localhost:8080

# Test deployed health endpoint
curl https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-health

# Test session initiation
curl -X POST https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-initiate \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "create a hello world html page", "model_name": "claude-sonnet-4"}'

# Test sending prompt to existing session
curl -X POST https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-send-prompt \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"thread_id": "THREAD_ID", "prompt": "make it colorful"}'

# Test streaming response
curl "https://us-central1-suna-deployment-1749244914.cloudfunctions.net/suna-stream-response?agent_run_id=AGENT_RUN_ID&token=SUPABASE_TOKEN" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

## Architecture Overview

This is a Google Cloud Functions project that provides a secure API layer between Firebase-authenticated clients and the Suna Agent backend system.

### Core Components

**Authentication Flow:**
- Multi-project Firebase token validation (configured in `ALLOWED_FIREBASE_PROJECTS`)
- Service account approach using single Supabase account for all backend operations
- Google Cloud Secret Manager for secure password storage

**Main Functions (index.js):**
- `health` - Unauthenticated health check
- `initiateSession` - Start new agent sessions with initial prompt
- `pollAndDownload` - Poll agent status and download completed files
- `sendPrompt` - Send additional prompts to existing sessions
- `streamResponse` - Stream real-time responses from agents
- `stopAndDeleteSandbox` - Stop agents and clean up sandboxes
- `stopAgent` - Stop agents without deleting sandbox

**SunaClient Class:**
- Handles Supabase authentication with service account
- Manages all backend API interactions (agent lifecycle, file operations)
- Implements caching for authentication tokens

### Key Architecture Patterns

**Service Account Pattern:** Single `suna-service@eloo.ai` account handles all Supabase operations instead of per-user accounts, providing better security and cost control.

**Multi-Project Support:** Functions validate Firebase tokens from multiple configured projects, enabling use across different Firebase applications.

**Secret Management:** Service account password stored in Google Cloud Secret Manager (`suna_service` secret) with proper IAM permissions.

## Environment Configuration

Required `.env.yaml` variables:
- `BACKEND_URL` - Suna backend server endpoint
- `SUPABASE_URL` - Supabase project URL  
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SERVICE_ACCOUNT_EMAIL` - Service account email for backend auth
- `SERVICE_ACCOUNT_PASSWORD_SECRET` - Secret Manager secret name for password
- `ALLOWED_FIREBASE_PROJECTS` - Comma-separated list of allowed Firebase project IDs

Optional:
- `ELOO_ORG_DOMAIN` - Restrict access to organization domain

## Security Model

**Authentication Chain:**
1. Client authenticates with Firebase
2. Client sends Firebase ID token to Cloud Function
3. Function validates token against allowed Firebase projects
4. Function uses cached service account credentials for Supabase
5. Function performs operations on behalf of authenticated user

**Security Features:**
- Firebase token validation with project allowlisting
- Optional organization domain validation
- Secure credential storage in Secret Manager
- CORS protection with configurable origins
- Request logging with Firebase user context

## File Operations

The system handles agent sandbox file operations through the backend API:
- Lists files in `/workspace` directory
- Downloads common text-based file types (`.txt`, `.json`, `.py`, `.js`, `.ts`, `.html`, `.css`, `.md`, `.yml`, `.yaml`, `.xml`, `.csv`, `.sql`, `.sh`, `.env`)
- Returns file content as base64 or text depending on type