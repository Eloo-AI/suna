# Suna Cloud Functions

A secure, scalable API layer for the Suna Agent system, built with Google Cloud Functions and featuring multi-project Firebase authentication.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Deploy all functions
./scripts/deploy.sh

# Deploy single function
./scripts/deploy-single.sh health

# View logs
npm run logs

# Test health endpoint
curl https://us-central1-suna-deployment-1749244914.cloudfunctions.net/health
```

## 📁 Project Structure

```
node-functions/
├── src/
│   ├── handlers/           # HTTP function handlers
│   │   ├── agent-handlers.js    # Agent & FlowAgent functions
│   │   └── health-handler.js    # Health check function
│   ├── middleware/         # Middleware components
│   │   ├── auth.js             # Firebase authentication
│   │   ├── cors.js             # CORS configuration
│   │   ├── rate-limit.js       # Rate limiting
│   │   └── error-handler.js    # Error handling
│   ├── services/          # Business logic services
│   │   ├── suna-client.js      # Supabase/Backend client
│   │   └── flow-agent-service.js # FlowAgent service
│   ├── utils/             # Utilities and helpers
│   │   ├── config.js           # Configuration management
│   │   ├── validators.js       # Input validation
│   │   └── logger.js           # Logging utilities
│   └── index.js           # Main entry point
├── scripts/               # Deployment scripts
│   ├── deploy.sh              # Deploy all functions
│   └── deploy-single.sh       # Deploy single function
├── docs/                  # Documentation
│   ├── README.md              # This file
│   ├── API.md                 # API documentation
│   └── DEPLOYMENT.md          # Deployment guide
└── package.json
```

## 🔌 Available Functions

### 🤖 Agent Functions (`eloo-agent-*`)
- **eloo-agent-initiate** - Start new agent sessions
- **eloo-agent-send-prompt** - Send prompts to existing sessions
- **eloo-agent-run-status** - Get status of specific agent runs
- **eloo-agent-runs** - Get all agent runs for a thread
- **eloo-agent-ensure-active** - Ensure sandbox is active
- **eloo-agent-stream** - Real-time streaming responses

### 🔄 FlowAgent Functions (`flowagent-*`)
- **flowagent-files** - File management for sessions
- **flowagent-chat** - Chat interface for sessions
- **flowagent-new-phase** - Start new workflow phases
- **flowagent-close** - Close and cleanup sessions
- **flowagent-status** - Get session status
- **flowagent-download** - Download specific files

### 🛠️ Utility Functions
- **eloo-download-file** - Download files from sandbox
- **eloo-get-messages** - Retrieve thread messages
- **auth-cookie** - Authentication cookie management
- **health** - Health check endpoint

## 🔒 Security Features

- **Multi-project Firebase Authentication** - Support for multiple Firebase projects
- **Rate Limiting** - 60 requests per minute per user
- **CORS Protection** - Configurable allowed origins
- **Input Validation** - Comprehensive sanitization and validation
- **Secret Management** - Google Cloud Secret Manager integration
- **Organization Domain Restriction** - Optional email domain validation

## 📚 Documentation

- [API Reference](./API.md) - Detailed endpoint documentation
- [Deployment Guide](./DEPLOYMENT.md) - Setup and deployment instructions
- [CLAUDE.md](../CLAUDE.md) - Developer guidance for Claude Code

## 🔧 Environment Configuration

Required `.env.yaml` variables:
- `BACKEND_URL` - Suna backend server endpoint
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SERVICE_ACCOUNT_EMAIL` - Service account email
- `SERVICE_ACCOUNT_PASSWORD_SECRET` - Secret Manager secret name
- `ALLOWED_FIREBASE_PROJECTS` - Comma-separated Firebase project IDs

Optional:
- `ALLOWED_ORIGINS` - CORS allowed origins
- `ELOO_ORG_DOMAIN` - Organization domain restriction

## 🚀 Deployment

The project uses a batched deployment strategy for optimal performance:

1. **Batch 1**: Core agent functions (6 functions)
2. **Batch 2**: FlowAgent functions (6 functions)  
3. **Batch 3**: Utility functions (4 functions)

Total: **16 active functions** (4 obsolete functions removed)

## 📊 Monitoring

- **Structured Logging** - JSON-formatted logs with trace correlation
- **Error Tracking** - Comprehensive error handling and reporting
- **Health Checks** - Backend connectivity monitoring
- **Rate Limit Metrics** - Request tracking and limiting

## 🧪 Testing

```bash
# Test health endpoint
curl https://us-central1-suna-deployment-1749244914.cloudfunctions.net/health

# Test with authentication
curl -X POST https://us-central1-suna-deployment-1749244914.cloudfunctions.net/eloo-agent-initiate \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello world", "modelName": "claude-sonnet-4"}'
```

## 🤝 Contributing

1. Follow the established file structure
2. Use the existing middleware patterns
3. Add proper input validation
4. Include comprehensive error handling
5. Update documentation for new endpoints

## 📄 License

MIT - See LICENSE file for details