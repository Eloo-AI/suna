#!/bin/bash

# 🧪 Interactive Suna Cloud Functions Test Script
# Usage: ./test_deploy.sh [step] [agent_id]

BASE_URL="https://us-central1-suna-deployment-1749244914.cloudfunctions.net"
RESULTS_FILE="/tmp/suna_test_results.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Suna Cloud Functions Interactive Test"
echo "========================================"

# Function to check and get Firebase token
check_firebase_token() {
    if [ -z "$FIREBASE_TOKEN" ]; then
        echo -e "${RED}❌ FIREBASE_TOKEN not set${NC}"
        echo ""
        echo "To get a Firebase token:"
        echo "1. Open your Firebase app in browser"
        echo "2. Open browser console (F12)"
        echo "3. Run: firebase.auth().currentUser.getIdToken().then(console.log)"
        echo "4. Copy the token and run:"
        echo -e "   ${BLUE}export FIREBASE_TOKEN='your_token_here'${NC}"
        echo ""
        exit 1
    fi
    echo -e "🔑 Firebase token: ${GREEN}${FIREBASE_TOKEN:0:20}...${NC}"
}

# Function to save result to file
save_result() {
    local step=$1
    local result=$2
    echo "{\"step\": \"$step\", \"result\": $result, \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$RESULTS_FILE"
}

# Function to get agent_id from saved results
get_agent_id() {
    if [ -f "$RESULTS_FILE" ]; then
        AGENT_ID=$(cat "$RESULTS_FILE" | jq -r '.result.agent_run_id // empty' 2>/dev/null)
        if [ -n "$AGENT_ID" ] && [ "$AGENT_ID" != "null" ]; then
            echo "$AGENT_ID"
            return 0
        fi
    fi
    return 1
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [step] [agent_id]"
    echo ""
    echo "Steps:"
    echo "  health              - Test health endpoint"
    echo "  initiate            - Start new agent"
    echo "  poll [agent_id]     - Poll agent status"
    echo "  stop [agent_id]     - Stop agent and delete sandbox"
    echo "  all                 - Run complete test sequence"
    echo ""
    echo "Examples:"
    echo "  $0 health"
    echo "  $0 initiate"
    echo "  $0 poll 41cf5628-23ec-48bc-b39c-21e588097af6"
    echo "  $0 stop"  
    echo ""
}

# Function to test health
test_health() {
    echo -e "${BLUE}🏥 Testing Health Check...${NC}"
    echo "----------------------------------------"
    
    RESPONSE=$(curl -s -X GET "$BASE_URL/suna-health" \
        -H "Content-Type: application/json")
    
    echo "$RESPONSE" | jq .
    
    STATUS=$(echo "$RESPONSE" | jq -r '.status // empty')
    if [ "$STATUS" = "ok" ]; then
        echo -e "${GREEN}✅ Health check passed${NC}"
        echo ""
        echo -e "${YELLOW}Next step:${NC} $0 initiate"
    else
        echo -e "${RED}❌ Health check failed${NC}"
    fi
}

# Function to test initiate
test_initiate() {
    echo -e "${BLUE}🚀 Testing Agent Initiation...${NC}"
    echo "----------------------------------------"
    
    check_firebase_token
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/suna-initiate" \
        -H "Authorization: Bearer $FIREBASE_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "prompt": "Create a simple Python hello world script and save it to hello.txt",
            "model_name": "claude-sonnet-4"
        }')
    
    echo "$RESPONSE" | jq .
    save_result "initiate" "$RESPONSE"
    
    AGENT_ID=$(echo "$RESPONSE" | jq -r '.agent_run_id // empty')
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
    
    if [ "$SUCCESS" = "true" ] && [ -n "$AGENT_ID" ]; then
        echo -e "${GREEN}✅ Agent initiated successfully${NC}"
        echo -e "${YELLOW}Agent ID:${NC} $AGENT_ID"
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo "  $0 poll $AGENT_ID"
        echo "  $0 stop $AGENT_ID"
    else
        echo -e "${RED}❌ Agent initiation failed${NC}"
    fi
}

# Function to test poll
test_poll() {
    local agent_id=$1
    
    echo -e "${BLUE}📊 Testing Agent Polling...${NC}"
    echo "----------------------------------------"
    
    check_firebase_token
    
    # Try to get agent_id if not provided
    if [ -z "$agent_id" ]; then
        agent_id=$(get_agent_id)
        if [ -z "$agent_id" ]; then
            echo -e "${RED}❌ No agent_id provided and none found in results${NC}"
            echo "Usage: $0 poll <agent_id>"
            echo "Or run 'initiate' first to get an agent_id"
            exit 1
        fi
        echo -e "${YELLOW}Using saved agent ID:${NC} $agent_id"
    fi
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/suna-poll" \
        -H "Authorization: Bearer $FIREBASE_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"agent_run_id\": \"$agent_id\"}")
    
    echo "$RESPONSE" | jq .
    save_result "poll" "$RESPONSE"
    
    STATUS=$(echo "$RESPONSE" | jq -r '.status // empty')
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
    
    if [ "$SUCCESS" = "true" ]; then
        if [ "$STATUS" = "completed" ]; then
            FILES_COUNT=$(echo "$RESPONSE" | jq '.downloaded_files | length // 0')
            echo -e "${GREEN}✅ Agent completed! Downloaded $FILES_COUNT files${NC}"
            echo ""
            echo -e "${YELLOW}Next step:${NC} $0 stop $agent_id"
        else
            echo -e "${YELLOW}⏳ Agent status: $STATUS${NC}"
            echo ""
            echo -e "${YELLOW}Try again:${NC} $0 poll $agent_id"
        fi
    else
        echo -e "${RED}❌ Polling failed${NC}"
    fi
}

# Function to test stop
test_stop() {
    local agent_id=$1
    
    echo -e "${BLUE}🛑 Testing Stop and Delete Sandbox...${NC}"
    echo "----------------------------------------"
    
    check_firebase_token
    
    # Try to get agent_id if not provided
    if [ -z "$agent_id" ]; then
        agent_id=$(get_agent_id)
        if [ -z "$agent_id" ]; then
            echo -e "${RED}❌ No agent_id provided and none found in results${NC}"
            echo "Usage: $0 stop <agent_id>"
            echo "Or run 'initiate' first to get an agent_id"
            exit 1
        fi
        echo -e "${YELLOW}Using saved agent ID:${NC} $agent_id"
    fi
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/suna-stop-sandbox" \
        -H "Authorization: Bearer $FIREBASE_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"agent_run_id\": \"$agent_id\"}")
    
    echo "$RESPONSE" | jq .
    save_result "stop" "$RESPONSE"
    
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
    
    if [ "$SUCCESS" = "true" ]; then
        echo -e "${GREEN}✅ Agent stopped and sandbox deleted${NC}"
        echo ""
        echo -e "${YELLOW}Test complete!${NC} Run $0 initiate to start over"
    else
        echo -e "${RED}❌ Stop failed${NC}"
    fi
}

# Function to run all tests
test_all() {
    echo -e "${BLUE}🚀 Running Complete Test Sequence...${NC}"
    echo "========================================"
    
    test_health
    echo ""
    
    read -p "Press Enter to continue with agent initiation..."
    test_initiate
    echo ""
    
    # Get the agent ID from initiate results
    AGENT_ID=$(get_agent_id)
    if [ -z "$AGENT_ID" ]; then
        echo -e "${RED}❌ Could not get agent ID from initiate step${NC}"
        exit 1
    fi
    
    echo "Waiting 5 seconds for agent to start..."
    sleep 5
    
    # Poll until completed or max attempts
    POLL_COUNT=0
    MAX_POLLS=10
    
    while [ $POLL_COUNT -lt $MAX_POLLS ]; do
        echo -e "${YELLOW}Poll attempt $((POLL_COUNT + 1))/$MAX_POLLS${NC}"
        test_poll "$AGENT_ID"
        
        # Check if completed
        STATUS=$(cat "$RESULTS_FILE" | jq -r '.result.status // empty' 2>/dev/null)
        if [ "$STATUS" = "completed" ]; then
            break
        fi
        
        POLL_COUNT=$((POLL_COUNT + 1))
        if [ $POLL_COUNT -lt $MAX_POLLS ]; then
            echo "Waiting 5 seconds..."
            sleep 5
        fi
    done
    
    echo ""
    read -p "Press Enter to stop agent and delete sandbox..."
    test_stop "$AGENT_ID"
}

# Main script logic
case $1 in
    "health")
        test_health
        ;;
    "initiate")
        test_initiate
        ;;
    "poll")
        test_poll "$2"
        ;;
    "stop")
        test_stop "$2"
        ;;
    "all")
        test_all
        ;;
    *)
        show_usage
        ;;
esac 