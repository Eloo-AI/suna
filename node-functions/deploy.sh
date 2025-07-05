#!/bin/bash

# Deploy all Suna Cloud Functions to suna-deployment-1749244914

set -e

PROJECT_ID="suna-deployment-1749244914"
REGION="us-central1"
RUNTIME="nodejs20"
MEMORY="512MB"
TIMEOUT="60s"

echo "🚀 Deploying Suna Cloud Functions to project: $PROJECT_ID (10 functions at a time)"

# Set the project
gcloud config set project $PROJECT_ID

# Function to deploy a single function
deploy_function() {
    local name=$1
    local entry_point=$2
    local timeout=${3:-$TIMEOUT}
    local description=$4
    
    echo "📋 Deploying $description..."
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
echo "🔄 Starting parallel deployment - Batch 1 (10 functions)..."

# Batch 1: Legacy + FlowAgent Functions (10 functions)
deploy_function "suna-health" "health" "$TIMEOUT" "health check function"
deploy_function "suna-initiate" "initiateSession" "$TIMEOUT" "initiate session function"
deploy_function "suna-poll" "pollAndDownload" "$TIMEOUT" "poll and download function"
deploy_function "suna-stop-sandbox" "stopAndDeleteSandbox" "$TIMEOUT" "stop and delete sandbox function"
deploy_function "suna-stop-agent" "stopAgent" "$TIMEOUT" "stop agent function"
deploy_function "suna-send-prompt" "sendPrompt" "$TIMEOUT" "send prompt function"
deploy_function "suna-stream-response" "streamResponse" "$TIMEOUT" "stream response function"
deploy_function "flowagent-initiate" "flowagent-initiate" "$TIMEOUT" "FlowAgent initiate function"
deploy_function "flowagent-files" "flowagent-files" "$TIMEOUT" "FlowAgent files function"
deploy_function "flowagent-chat" "flowagent-chat" "$TIMEOUT" "FlowAgent chat function"

# Wait for batch 1 to complete
wait
echo "✅ Batch 1 completed!"

echo ""
echo "🔄 Starting parallel deployment - Batch 2 (6 functions)..."

# Batch 2: Remaining FlowAgent + Auth Functions (6 functions)
deploy_function "flowagent-new-phase" "flowagent-new-phase" "$TIMEOUT" "FlowAgent new phase function"
deploy_function "flowagent-close" "flowagent-close" "$TIMEOUT" "FlowAgent close function"
deploy_function "flowagent-status" "flowagent-status" "$TIMEOUT" "FlowAgent status function"
deploy_function "flowagent-stream" "flowagent-stream" "600s" "FlowAgent stream function"
deploy_function "flowagent-download" "flowagent-download" "$TIMEOUT" "FlowAgent download function"
deploy_function "auth-cookie" "auth-cookie" "$TIMEOUT" "auth cookie function"

# Wait for batch 2 to complete
wait
echo "✅ Batch 2 completed!"

echo ""
echo "✅ All functions deployed successfully!"
echo ""
echo "📄 Function URLs:"
echo ""
echo "Legacy Functions:"
echo "   Health: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-health"
echo "   Initiate Session: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-initiate"
echo "   Poll: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-poll"
echo "   Send Prompt: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-send-prompt"
echo "   Stream Response: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-stream-response"
echo "   Stop Agent: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-stop-agent"
echo "   Stop & Delete: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-stop-sandbox"
echo ""
echo "FlowAgent Functions (New):"
echo "   Initiate: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-initiate"
echo "   Files: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-files"
echo "   Chat: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-chat"
echo "   New Phase: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-new-phase"
echo "   Close: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-close"
echo "   Status: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-status"
echo "   Stream: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-stream"
echo "   Download: https://$REGION-$PROJECT_ID.cloudfunctions.net/flowagent-download"
echo "   Auth Cookie: https://$REGION-$PROJECT_ID.cloudfunctions.net/auth-cookie"
echo ""
echo "🔧 To view logs: gcloud functions logs read <function-name> --limit=50"
echo "🔧 To update environment: Edit .env.yaml and redeploy"
echo ""
echo "🎉 Deployment complete!" 