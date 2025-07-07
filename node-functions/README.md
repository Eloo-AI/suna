# Suna Cloud Functions

A secure, scalable API layer for the Suna Agent system, built with Google Cloud Functions and featuring multi-project Firebase authentication.

> **✨ Recently Refactored** - This project has been completely reorganized with improved architecture, removed obsolete functions, and enhanced documentation.

## 🚀 Quick Start

```bash
# Deploy all functions
./scripts/deploy.sh

# Deploy single function
./scripts/deploy-single.sh health

# Test health endpoint
curl https://us-central1-suna-deployment-1749244914.cloudfunctions.net/health
```

## 📁 Project Structure

```
node-functions/
├── src/                    # Source code (NEW)
│   ├── handlers/           # HTTP function handlers
│   ├── middleware/         # Middleware components  
│   ├── services/          # Business logic services
│   ├── utils/             # Utilities and helpers
│   └── index.js           # Main entry point
├── scripts/               # Deployment scripts (NEW)
├── docs/                  # Documentation (NEW)
└── package.json
```

## 🔌 Available Functions (16 Active)

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

## ✅ What's New in This Refactor

### Removed Obsolete Functions ❌
- `initiateSession` (replaced by `eloo-agent-initiate`)
- `pollAndDownload` (replaced by agent functions)
- `stopAndDeleteSandbox` (replaced by agent functions)
- `stopAgent` (replaced by agent functions)

### Improved Architecture ✨
- **Modular file structure** with clear separation of concerns
- **Middleware extraction** for reusable components
- **Service layer** for business logic
- **Utility functions** for common operations
- **Comprehensive documentation** with API reference

### Enhanced Deployment 🚀
- **Batched deployment** for optimal performance
- **Single function deployment** script
- **Environment validation** and error handling
- **16 active functions** (down from 20, +4 removed)

## 📚 Documentation

- **[API Reference](./docs/API.md)** - Complete endpoint documentation
- **[Deployment Guide](./docs/DEPLOYMENT.md)** - Setup and deployment
- **[README](./docs/README.md)** - Detailed project overview
- **[CLAUDE.md](./CLAUDE.md)** - Developer guidance

## 🔒 Security Features

- **Multi-project Firebase Authentication** - Support for multiple Firebase projects
- **Rate Limiting** - 60 requests per minute per user
- **CORS Protection** - Configurable allowed origins
- **Input Validation** - Comprehensive sanitization and validation
- **Secret Management** - Google Cloud Secret Manager integration

## 🔧 Environment Configuration

Required `.env.yaml` variables:
```yaml
BACKEND_URL: "http://34.171.125.26:8000"
SUPABASE_URL: "https://nmwqprgbxtnikkmwhwyt.supabase.co"
SUPABASE_ANON_KEY: "your-supabase-anon-key"
SERVICE_ACCOUNT_EMAIL: "suna-service@eloo.ai"
SERVICE_ACCOUNT_PASSWORD_SECRET: "suna_service"
ALLOWED_FIREBASE_PROJECTS: "project1,project2,project3"
```

## 🚀 Deployment Strategy

Optimized batched deployment:
1. **Batch 1:** Core agent functions (6 functions)
2. **Batch 2:** FlowAgent functions (6 functions)
3. **Batch 3:** Utility functions (4 functions)

## 📊 Performance Improvements

- **16 active functions** (4 obsolete removed)
- **Parallel deployment** for faster releases
- **Modular architecture** for better maintainability
- **Reduced code duplication** across functions
- **Consistent error handling** and validation

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

1. Follow the new file structure in `src/`
2. Use existing middleware patterns
3. Add proper input validation and error handling
4. Update documentation for new endpoints
5. Test thoroughly before deployment

## 📄 License

MIT - See LICENSE file for details