# Suna Cloud Functions

Cloud Functions for Suna Agent API with multi-project Firebase authentication and Google Cloud Secret Manager integration.

## Overview

This implementation provides four HTTP Cloud Functions that interface with the Suna backend using a **service account approach**:

1. **suna-health** - Health check and configuration verification
2. **suna-initiate** - Start new agent sessions
3. **suna-poll** - Poll agent status and download results
4. **suna-stop-sandbox** - Stop agents and delete sandboxes

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
BACKEND_URL: "http://34.171.125.26:8000"
SUPABASE_URL: "https://nmwqprgbxtnikkmwhwyt.supabase.co"
SUPABASE_ANON_KEY: "your_supabase_anon_key"
SERVICE_ACCOUNT_EMAIL: "suna-service@eloo.ai"
SERVICE_ACCOUNT_PASSWORD_SECRET: "suna_service"
ALLOWED_FIREBASE_PROJECTS: "market-research-agents,another-project"
ELOO_ORG_DOMAIN: "eloo.ai"
```

**Required Variables:**
- `BACKEND_URL` - Suna backend server URL
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SERVICE_ACCOUNT_EMAIL` - Service account email
- `SERVICE_ACCOUNT_PASSWORD_SECRET` - Service account password secret
- `ALLOWED_FIREBASE_PROJECTS` - Comma-separated Firebase project IDs

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

## 📞 Support

For issues or questions:
1. Check the logs: `npm run logs`
2. Verify environment variables
3. Test with health endpoint first
4. Contact development team 