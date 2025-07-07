#!/bin/bash

# Deploy all Suna Cloud Functions to suna-deployment-1749244914
# Updated for refactored architecture - only active functions

set -e

PROJECT_ID="suna-deployment-1749244914"
REGION="us-central1"
RUNTIME="nodejs20"
MEMORY="512MB"
TIMEOUT="60s"

echo "🚀 Deploying Suna Cloud Functions to project: $PROJECT_ID"
echo "📁 Using refactored architecture with src/ directory"

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

# Function to deploy a single function
deploy_function() {
    local name=$1
    local entry_point=$2
    local timeout=${3:-$TIMEOUT}
    local description=$4
    
    echo "📋 Deploying $name ($description)..."
    gcloud functions deploy $name \
        --runtime $RUNTIME \
        --trigger-http \
        --allow-unauthenticated \
        --env-vars-file .env.yaml \
        --source . \
        --entry-point $entry_point \
        --memory $MEMORY \
        --timeout $timeout \
        --region $REGION \
        --quiet &
}

echo ""
echo "🔄 Starting parallel deployment - Batch 1: Core Agent Functions"

# Batch 1: Core eloo-agent functions
deploy_function "eloo-agent-initiate" "eloo-agent-initiate" "60s" "Agent session initiation"
deploy_function "eloo-agent-send-prompt" "eloo-agent-send-prompt" "60s" "Send prompts to agents"
deploy_function "eloo-agent-run-status" "eloo-agent-run-status" "30s" "Get agent run status"
deploy_function "eloo-agent-runs" "eloo-agent-runs" "30s" "Get all agent runs for thread"
deploy_function "eloo-agent-ensure-active" "eloo-agent-ensure-active" "30s" "Ensure sandbox is active"
deploy_function "eloo-agent-stream" "eloo-agent-stream" "600s" "Real-time agent streaming"
deploy_function "eloo-agent-list-files" "eloo-agent-list-files" "30s" "List sandbox workspace files"

# Wait for batch 1
wait
echo "✅ Batch 1 completed!"

echo ""
echo "🔄 Starting parallel deployment - Batch 2: FlowAgent Functions"

# Batch 2: FlowAgent functions
deploy_function "flowagent-files" "flowagent-files" "60s" "FlowAgent file management"
deploy_function "flowagent-chat" "flowagent-chat" "60s" "FlowAgent chat interface"
deploy_function "flowagent-new-phase" "flowagent-new-phase" "60s" "FlowAgent phase management"
deploy_function "flowagent-close" "flowagent-close" "60s" "FlowAgent session cleanup"
deploy_function "flowagent-status" "flowagent-status" "30s" "FlowAgent status checks"
deploy_function "flowagent-download" "flowagent-download" "60s" "FlowAgent file downloads"

# Wait for batch 2
wait
echo "✅ Batch 2 completed!"

echo ""
echo "🔄 Starting parallel deployment - Batch 3: Utility Functions"

# Batch 3: Utility functions
deploy_function "eloo-download-file" "eloo-download-file" "60s" "File download utility"
deploy_function "eloo-get-messages" "eloo-get-messages" "30s" "Message retrieval utility"
deploy_function "auth-cookie" "auth-cookie" "30s" "Authentication cookie management"
deploy_function "health" "health" "30s" "Health check endpoint"

# Wait for batch 3
wait
echo "✅ Batch 3 completed!"

echo ""
echo "✅ All functions deployed successfully!"
echo ""
echo "📄 Function URLs:"
echo ""
echo "🤖 Agent Functions:"
echo "   Initiate: https://$REGION-$PROJECT_ID.cloudfunctions.net/eloo-agent-initiate"
echo "   Send Prompt: https://$REGION-$PROJECT_ID.cloudfunctions.net/eloo-agent-send-prompt"
echo "   Run Status: https://$REGION-$PROJECT_ID.cloudfunctions.net/eloo-agent-run-status"
echo "   All Runs: https://$REGION-$PROJECT_ID.cloudfunctions.net/eloo-agent-runs"
echo "   Ensure Active: https://$REGION-$PROJECT_ID.cloudfunctions.net/eloo-agent-ensure-active"
echo "   Stream: https://$REGION-$PROJECT_ID.cloudfunctions.net/eloo-agent-stream"
echo "   List Files: https://$REGION-$PROJECT_ID.cloudfunctions.net/eloo-agent-list-files"
echo ""
echo "🔄 FlowAgent Functions:"
echo "   Files: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-files"
echo "   Chat: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-chat"
echo "   New Phase: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-new-phase"
echo "   Close: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-close"
echo "   Status: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-status"
echo "   Download: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-download"
echo ""
echo "🛠️ Utility Functions:"
echo "   Download File: https://$REGION-$PROJECT_ID.cloudfunctions.net/eloo-download-file"
echo "   Get Messages: https://$REGION-$PROJECT_ID.cloudfunctions.net/eloo-get-messages"
echo "   Auth Cookie: https://$REGION-$PROJECT_ID.cloudfunctions.net/auth-cookie"
echo "   Health: https://$REGION-$PROJECT_ID.cloudfunctions.net/health"
echo ""
echo "🔧 Management Commands:"
echo "   View logs: gcloud functions logs read <function-name> --limit=50"
echo "   Update env: Edit .env.yaml and redeploy"
echo "   Test health: curl https://$REGION-$PROJECT_ID.cloudfunctions.net/health"
echo ""
echo "🎉 Deployment complete! All 17 active functions deployed."