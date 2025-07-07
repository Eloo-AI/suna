# Deployment Guide

Complete guide for deploying and managing Suna Cloud Functions.

## Prerequisites

### 1. Google Cloud Setup
```bash
# Install Google Cloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Authenticate
gcloud auth login
gcloud auth application-default login

# Set project
gcloud config set project suna-deployment-1749244914
```

### 2. Environment Configuration

Create `.env.yaml` in the project root:

```yaml
BACKEND_URL: "http://34.171.125.26:8000"
SUPABASE_URL: "https://nmwqprgbxtnikkmwhwyt.supabase.co"
SUPABASE_ANON_KEY: "your-supabase-anon-key"
SERVICE_ACCOUNT_EMAIL: "suna-service@eloo.ai"
SERVICE_ACCOUNT_PASSWORD_SECRET: "suna_service"
ALLOWED_FIREBASE_PROJECTS: "project1,project2,project3"
ALLOWED_ORIGINS: "https://app.eloo.ai,http://localhost:8080"
ELOO_ORG_DOMAIN: "eloo.ai"
```

### 3. Secret Manager Setup

Store the service account password in Google Cloud Secret Manager:

```bash
# Create secret
echo "your-service-account-password" | gcloud secrets create suna_service --data-file=-

# Grant access to Cloud Functions service account
gcloud secrets add-iam-policy-binding suna_service \
    --member="serviceAccount:suna-deployment-1749244914@appspot.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

## Deployment Options

### Option 1: Deploy All Functions (Recommended)

```bash
# Deploy all 16 functions in parallel batches
./scripts/deploy.sh
```

This will deploy functions in optimized batches:
- **Batch 1:** Core agent functions (6 functions)
- **Batch 2:** FlowAgent functions (6 functions)
- **Batch 3:** Utility functions (4 functions)

### Option 2: Deploy Single Function

```bash
# Deploy specific function
./scripts/deploy-single.sh eloo-agent-initiate

# Examples
./scripts/deploy-single.sh health
./scripts/deploy-single.sh eloo-agent-stream
./scripts/deploy-single.sh flowagent-files
```

### Option 3: Manual Deployment

```bash
# Deploy single function manually
gcloud functions deploy eloo-agent-initiate \
    --runtime nodejs20 \
    --trigger-http \
    --allow-unauthenticated \
    --env-vars-file .env.yaml \
    --source . \
    --entry-point eloo-agent-initiate \
    --memory 512MB \
    --timeout 60s \
    --region us-central1
```

## Function Configuration

### Memory and Timeout Settings

| Function Type | Memory | Timeout | Reason |
|---------------|---------|---------|---------|
| Agent Functions | 512MB | 60s | AI processing |
| Stream Functions | 512MB | 600s | Long-running streams |
| Utility Functions | 512MB | 30s | Quick operations |
| Health Check | 512MB | 30s | Simple check |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | Yes | Suna backend server endpoint |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SERVICE_ACCOUNT_EMAIL` | Yes | Service account for backend auth |
| `SERVICE_ACCOUNT_PASSWORD_SECRET` | Yes | Secret Manager secret name |
| `ALLOWED_FIREBASE_PROJECTS` | Yes | Comma-separated Firebase project IDs |
| `ALLOWED_ORIGINS` | No | CORS allowed origins |
| `ELOO_ORG_DOMAIN` | No | Organization domain restriction |

## Post-Deployment Verification

### 1. Test Health Endpoint
```bash
curl https://us-central1-suna-deployment-1749244914.cloudfunctions.net/health
```

Expected response:
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00Z",
  "instance_id": "single"
}
```

### 2. Test Authentication
```bash
# Get Firebase token (replace with actual token)
TOKEN="your-firebase-id-token"

# Test authenticated endpoint
curl -X POST \
  https://us-central1-suna-deployment-1749244914.cloudfunctions.net/eloo-agent-initiate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello world", "modelName": "claude-sonnet-4"}'
```

### 3. Check Function URLs

All deployed functions will be available at:
```
https://us-central1-suna-deployment-1749244914.cloudfunctions.net/<function-name>
```

## Monitoring and Troubleshooting

### View Logs
```bash
# View logs for specific function
gcloud functions logs read eloo-agent-initiate --limit=50

# Follow logs in real-time
gcloud functions logs tail eloo-agent-initiate

# View all function logs
npm run logs
```

### Common Issues and Solutions

#### 1. Authentication Failures
```bash
# Check secret exists
gcloud secrets versions list suna_service

# Verify IAM permissions
gcloud secrets get-iam-policy suna_service
```

#### 2. Environment Variables
```bash
# Check deployed environment
gcloud functions describe eloo-agent-initiate --region=us-central1
```

#### 3. CORS Issues
```bash
# Update CORS origins in .env.yaml
ALLOWED_ORIGINS: "https://yourapp.com,http://localhost:3000"

# Redeploy affected functions
./scripts/deploy-single.sh eloo-agent-initiate
```

#### 4. Timeout Issues
```bash
# Increase timeout for specific function
gcloud functions deploy eloo-agent-stream \
    --timeout 600s \
    --update-env-vars-file .env.yaml
```

### Performance Monitoring

#### View Function Metrics
```bash
# Function invocations
gcloud logging read "resource.type=cloud_function" --limit=50

# Error rates
gcloud logging read "resource.type=cloud_function AND severity>=ERROR" --limit=20
```

#### Rate Limiting Monitoring
Functions include rate limiting headers:
- `X-RateLimit-Limit: 60`
- `X-RateLimit-Remaining: 45` 
- `X-RateLimit-Reset: 1640995200`

## Security Considerations

### 1. Service Account Permissions
The service account should have minimal required permissions:
- Secret Manager Secret Accessor
- Cloud Functions Invoker (if calling other functions)

### 2. Firebase Project Security
- Use separate Firebase projects for different environments
- Regularly rotate service account passwords
- Monitor authentication logs

### 3. CORS Configuration
- Restrict `ALLOWED_ORIGINS` to trusted domains only
- Avoid using `*` in production
- Use HTTPS origins only in production

### 4. Environment Variables
- Never commit `.env.yaml` to version control
- Use Secret Manager for sensitive values
- Regularly audit environment variables

## Scaling and Performance

### Auto-scaling
Cloud Functions automatically scale based on traffic:
- **Concurrency:** Up to 1000 concurrent executions per function
- **Cold starts:** ~1-2 seconds for Node.js functions
- **Warm instances:** Reused for subsequent requests

### Optimization Tips
1. **Keep dependencies minimal** - Faster cold starts
2. **Reuse connections** - Cache database/API connections
3. **Optimize memory** - Right-size memory allocation
4. **Use HTTP/2** - Better connection reuse
5. **Enable compression** - Reduce response sizes

## Backup and Recovery

### Code Backup
- All code is in Git repository
- Environment variables in secure storage
- Secrets in Google Cloud Secret Manager

### Configuration Backup
```bash
# Export current function configuration
gcloud functions describe eloo-agent-initiate --region=us-central1 > function-config-backup.yaml
```

### Disaster Recovery
1. **Code:** Restore from Git repository
2. **Secrets:** Recreate in Secret Manager
3. **Environment:** Redeploy with backed-up `.env.yaml`
4. **Test:** Verify all endpoints after recovery

## Cost Optimization

### Monitoring Costs
```bash
# View Cloud Functions usage
gcloud billing accounts list
gcloud billing projects describe suna-deployment-1749244914
```

### Cost Reduction Strategies
1. **Optimize memory allocation** - Lower memory = lower cost
2. **Reduce timeout values** - Faster failures = lower cost
3. **Monitor unused functions** - Delete if not needed
4. **Use appropriate regions** - Choose cost-effective regions
5. **Implement caching** - Reduce external API calls