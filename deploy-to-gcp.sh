#!/bin/bash

# GCP Deployment Script for Suna
set -e

# Configuration
GCP_INSTANCE="suna-server"
GCP_ZONE="us-central1-a"
GCP_PROJECT="suna-deployment-1749244914"
REPO_URL="https://github.com/your-username/suna.git"  # Replace with your repo URL

echo "🚀 Deploying Suna to GCP instance: $GCP_INSTANCE"

# Function to run commands on the remote instance
run_remote() {
    gcloud compute ssh $GCP_INSTANCE --zone=$GCP_ZONE --project=$GCP_PROJECT --command="$1"
}

# Step 1: Clone or update the repository
echo "📦 Setting up code repository..."
run_remote "
    if [ -d suna ]; then
        cd suna && git pull
    else
        git clone $REPO_URL
        cd suna
    fi
"

# Step 2: Create environment file (you'll need to customize this)
echo "⚙️  Setting up environment variables..."
gcloud compute ssh $GCP_INSTANCE --zone=$GCP_ZONE --project=$GCP_PROJECT --command="
cat > suna/.env << 'EOF'
# Environment Configuration
ENV_MODE=production

# LLM API Keys (add your keys here)
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
GOOGLE_API_KEY=your_google_ai_key_here

# Supabase Configuration (add your Supabase details)
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Redis Configuration (using local Redis from docker-compose)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here
REDIS_SSL=false

# API Keys for various services
TAVILY_API_KEY=your_tavily_api_key_here
RAPID_API_KEY=your_rapid_api_key_here
FIRECRAWL_API_KEY=your_firecrawl_api_key_here
FIRECRAWL_URL=https://api.firecrawl.dev

# Daytona Configuration
DAYTONA_API_KEY=your_daytona_api_key_here
DAYTONA_SERVER_URL=your_daytona_server_url_here
DAYTONA_TARGET=your_daytona_target_here

# Model Configuration
MODEL_TO_USE=google/gemini-2.5-pro-preview
EOF
"

# Step 3: Build and start services
echo "🐳 Building and starting Docker containers..."
run_remote "
    cd suna
    # Stop any existing containers
    docker-compose down || true
    
    # Build and start containers
    docker-compose up -d --build
    
    # Wait for services to be ready
    echo 'Waiting for services to start...'
    sleep 30
    
    # Check status
    docker-compose ps
"

# Step 4: Show deployment info
echo "✅ Deployment complete!"
echo ""
echo "📋 Instance Information:"
gcloud compute instances describe $GCP_INSTANCE --zone=$GCP_ZONE --project=$GCP_PROJECT --format="value(networkInterfaces[0].accessConfigs[0].natIP)" | while read IP; do
    echo "   🌐 External IP: $IP"
    echo "   🔗 Backend API: http://$IP:8000"
    echo "   📊 RabbitMQ Management: http://$IP:15672 (guest/guest)"
    echo ""
done

echo "🔧 To connect to the instance:"
echo "   gcloud compute ssh $GCP_INSTANCE --zone=$GCP_ZONE --project=$GCP_PROJECT"
echo ""
echo "📝 To view logs:"
echo "   gcloud compute ssh $GCP_INSTANCE --zone=$GCP_ZONE --project=$GCP_PROJECT --command='cd suna && docker-compose logs -f'"
echo ""
echo "⚠️  Don't forget to:"
echo "   1. Update the .env file with your actual API keys"
echo "   2. Configure your domain/DNS if needed"
echo "   3. Set up SSL/HTTPS for production" 