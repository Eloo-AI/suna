#!/bin/bash

# Deploy a single Suna Cloud Function
# Usage: ./scripts/deploy-single.sh <function-name>

set -e

if [ $# -eq 0 ]; then
    echo "❌ Usage: $0 <function-name>"
    echo ""
    echo "Available functions:"
    echo "  eloo-agent-initiate"
    echo "  eloo-agent-send-prompt" 
    echo "  eloo-agent-run-status"
    echo "  eloo-agent-runs"
    echo "  eloo-agent-ensure-active"
    echo "  eloo-agent-stream"
    echo "  flowagent-files"
    echo "  flowagent-chat"
    echo "  flowagent-new-phase"
    echo "  flowagent-close"
    echo "  flowagent-status"
    echo "  flowagent-download"
    echo "  eloo-download-file"
    echo "  eloo-get-messages"
    echo "  auth-cookie"
    echo "  health"
    exit 1
fi

FUNCTION_NAME=$1
PROJECT_ID="suna-deployment-1749244914"
REGION="us-central1"
RUNTIME="nodejs20"
MEMORY="512MB"
TIMEOUT="60s"

# Set custom timeouts for specific functions
case $FUNCTION_NAME in
    "eloo-agent-stream")
        TIMEOUT="600s"
        ;;
    "eloo-agent-initiate"|"eloo-agent-send-prompt"|"flowagent-*")
        TIMEOUT="60s"
        ;;
    *)
        TIMEOUT="60s"
        ;;
esac

echo "🚀 Deploying $FUNCTION_NAME to project: $PROJECT_ID"

# Validate environment
if [ ! -f ".env.yaml" ]; then
    echo "❌ Error: .env.yaml file not found"
    exit 1
fi

if [ ! -f "src/index.js" ]; then
    echo "❌ Error: src/index.js file not found"
    exit 1
fi

# Set the project
gcloud config set project $PROJECT_ID

echo "📋 Deploying $FUNCTION_NAME..."
gcloud functions deploy $FUNCTION_NAME \
    --runtime $RUNTIME \
    --trigger-http \
    --allow-unauthenticated \
    --env-vars-file .env.yaml \
    --source . \
    --entry-point $FUNCTION_NAME \
    --memory $MEMORY \
    --timeout $TIMEOUT \
    --region $REGION

echo ""
echo "✅ Function deployed successfully!"
echo "🔗 URL: https://$REGION-$PROJECT_ID.cloudfunctions.net/$FUNCTION_NAME"
echo ""
echo "🔧 Test: curl https://$REGION-$PROJECT_ID.cloudfunctions.net/$FUNCTION_NAME"
echo "🔧 Logs: gcloud functions logs read $FUNCTION_NAME --limit=50"