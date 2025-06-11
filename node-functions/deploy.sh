#!/bin/bash

# Deploy all Suna Cloud Functions to suna-deployment-1749244914

set -e

PROJECT_ID="suna-deployment-1749244914"
REGION="us-central1"
RUNTIME="nodejs20"
MEMORY="512MB"
TIMEOUT="60s"

echo "🚀 Deploying Suna Cloud Functions to project: $PROJECT_ID"

# Set the project
gcloud config set project $PROJECT_ID

# Deploy health check function first
echo "📋 Deploying health check function..."
gcloud functions deploy suna-health \
  --runtime $RUNTIME \
  --trigger-http \
  --allow-unauthenticated \
  --env-vars-file .env.yaml \
  --source . \
  --entry-point health \
  --memory $MEMORY \
  --timeout $TIMEOUT \
  --region $REGION

# Deploy initiate agent function
echo "🎯 Deploying initiate agent function..."
gcloud functions deploy suna-initiate \
  --runtime $RUNTIME \
  --trigger-http \
  --allow-unauthenticated \
  --env-vars-file .env.yaml \
  --source . \
  --entry-point initiateAgent \
  --memory $MEMORY \
  --timeout $TIMEOUT \
  --region $REGION

# Deploy poll and download function
echo "📥 Deploying poll and download function..."
gcloud functions deploy suna-poll \
  --runtime $RUNTIME \
  --trigger-http \
  --allow-unauthenticated \
  --env-vars-file .env.yaml \
  --source . \
  --entry-point pollAndDownload \
  --memory $MEMORY \
  --timeout $TIMEOUT \
  --region $REGION

# Deploy stop and delete sandbox function
echo "🛑 Deploying stop and delete sandbox function..."
gcloud functions deploy suna-stop-sandbox \
  --runtime $RUNTIME \
  --trigger-http \
  --allow-unauthenticated \
  --env-vars-file .env.yaml \
  --source . \
  --entry-point stopAndDeleteSandbox \
  --memory $MEMORY \
  --timeout $TIMEOUT \
  --region $REGION

# Deploy stop agent function
echo "🛑 Deploying stop agent function..."
gcloud functions deploy suna-stop-agent \
  --runtime $RUNTIME \
  --trigger-http \
  --allow-unauthenticated \
  --env-vars-file .env.yaml \
  --source . \
  --entry-point stopAgent \
  --memory $MEMORY \
  --timeout $TIMEOUT \
  --region $REGION

echo ""
echo "✅ All functions deployed successfully!"
echo ""
echo "📄 Function URLs:"
echo "   Health: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-health"
echo "   Initiate: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-initiate"
echo "   Poll: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-poll"
echo "   Stop Agent: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-stop-agent"
echo "   Stop & Delete: https://$REGION-$PROJECT_ID.cloudfunctions.net/suna-stop-sandbox"
echo ""
echo "🔧 To view logs: gcloud functions logs read <function-name> --limit=50"
echo "🔧 To update environment: Edit .env.yaml and redeploy"
echo ""
echo "🎉 Deployment complete!" 