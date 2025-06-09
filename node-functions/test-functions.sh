#!/bin/bash

# 🧪 Suna Cloud Functions Test Script
# Set your Firebase token before running this script

BASE_URL="https://us-central1-suna-deployment-1749244914.cloudfunctions.net"

echo "🧪 Testing Suna Cloud Functions..."
echo "============================================"

# Check if Firebase token is set
if [ -z "$FIREBASE_TOKEN" ]; then
    echo "❌ Please set FIREBASE_TOKEN environment variable:"
    echo "   export FIREBASE_TOKEN='your_firebase_id_token_here'"
    echo ""
    echo "To get a Firebase token:"
    echo "1. Open your Firebase app"
    echo "2. In browser console: firebase.auth().currentUser.getIdToken().then(console.log)"
    echo "3. Copy the token and export it"
    echo ""
    exit 1
fi

echo "🔑 Firebase token: ${FIREBASE_TOKEN:0:20}..."
echo ""

# 1. Health Check
echo "🏥 Testing Health Check..."
echo "----------------------------------------"
curl -s -X GET "$BASE_URL/suna-health" \
  -H "Content-Type: application/json" | jq '.'
echo -e "\n"

# 2. Initiate Agent
echo "🚀 Testing Agent Initiation..."
echo "----------------------------------------"
INITIATE_RESPONSE=$(curl -s -X POST "$BASE_URL/suna-initiate" \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a simple Python hello world script and save it to hello.txt",
    "model_name": "claude-sonnet-4"
  }')

echo "$INITIATE_RESPONSE" | jq '.'

# Extract agent_run_id from response
AGENT_RUN_ID=$(echo "$INITIATE_RESPONSE" | jq -r '.agent_run_id // empty')

if [ -z "$AGENT_RUN_ID" ] || [ "$AGENT_RUN_ID" = "null" ]; then
    echo "❌ Failed to get agent_run_id from initiate response"
    echo "Response: $INITIATE_RESPONSE"
    exit 1
fi

echo -e "\n✅ Agent initiated with ID: $AGENT_RUN_ID"
echo ""

# 3. Poll Agent Status
echo "📊 Testing Agent Polling..."
echo "----------------------------------------"
POLL_COUNT=0
MAX_POLLS=10

while [ $POLL_COUNT -lt $MAX_POLLS ]; do
    echo "Poll attempt $((POLL_COUNT + 1))/$MAX_POLLS..."
    
    POLL_RESPONSE=$(curl -s -X POST "$BASE_URL/suna-poll" \
      -H "Authorization: Bearer $FIREBASE_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"agent_run_id\": \"$AGENT_RUN_ID\"}")
    
    echo "$POLL_RESPONSE" | jq '.'
    
    STATUS=$(echo "$POLL_RESPONSE" | jq -r '.status // empty')
    
    if [ "$STATUS" = "completed" ]; then
        echo "✅ Agent completed successfully!"
        break
    elif [ "$STATUS" = "failed" ] || [ "$STATUS" = "error" ]; then
        echo "❌ Agent failed"
        break
    else
        echo "⏳ Agent status: $STATUS - waiting 5 seconds..."
        sleep 5
    fi
    
    POLL_COUNT=$((POLL_COUNT + 1))
done

echo ""

# 4. Stop and Delete Sandbox
echo "🛑 Testing Stop and Delete Sandbox..."
echo "----------------------------------------"
curl -s -X POST "$BASE_URL/suna-stop-sandbox" \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"agent_run_id\": \"$AGENT_RUN_ID\"}" | jq '.'

echo ""
echo "🎉 All tests completed!"
echo "============================================"

# 5. Function URLs Summary
echo ""
echo "📋 Function URLs:"
echo "   Health:   $BASE_URL/suna-health"
echo "   Initiate: $BASE_URL/suna-initiate"
echo "   Poll:     $BASE_URL/suna-poll"
echo "   Stop:     $BASE_URL/suna-stop-sandbox"
echo ""
echo "📚 View logs:"
echo "   gcloud functions logs read suna-health --limit=10"
echo "   gcloud functions logs read suna-initiate --limit=10"
echo "   gcloud functions logs read suna-poll --limit=10"
echo "   gcloud functions logs read suna-stop-sandbox --limit=10" 