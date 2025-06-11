#!/bin/bash

# GCP Docker Compose Reset Script for Suna
set -e

# Configuration
GCP_INSTANCE="suna-server"
GCP_ZONE="us-central1-a"
GCP_PROJECT="suna-deployment-1749244914"

echo "🔄 Restarting Suna Docker Compose on GCP instance: $GCP_INSTANCE"
echo "⚠️  Warning: This will stop and remove containers, then restart services!"

# Function to run commands on the remote instance
run_remote() {
    gcloud compute ssh $GCP_INSTANCE --zone=$GCP_ZONE --project=$GCP_PROJECT --command="$1"
}

# Confirmation prompt
read -p "Are you sure you want to restart the server? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Restart cancelled"
    exit 1
fi

echo "⚙️  Configuring system settings for Redis..."
run_remote "
    # Fix Redis memory overcommit warning
    echo 'Configuring memory overcommit for Redis...'
    sudo sysctl vm.overcommit_memory=1
    
    # Make the setting persistent across reboots
    if ! grep -q 'vm.overcommit_memory = 1' /etc/sysctl.conf 2>/dev/null; then
        echo 'vm.overcommit_memory = 1' | sudo tee -a /etc/sysctl.conf
        echo 'Memory overcommit setting added to /etc/sysctl.conf'
    else
        echo 'Memory overcommit setting already exists in /etc/sysctl.conf'
    fi
"

echo "🛑 Stopping all Docker Compose services..."
run_remote "
    cd suna || { echo 'suna directory not found'; exit 1; }
    docker-compose down --remove-orphans || true
"

echo "🗑️  Removing containers..."
run_remote "
    cd suna
    # Remove only the containers from this compose project
    docker-compose rm -f || true
"

echo "🚀 Starting services..."
run_remote "
    cd suna
    docker-compose up -d --build
    
    echo 'Waiting for services to start...'
    sleep 30
    
    echo 'Service status:'
    docker-compose ps
"

echo "📦 Pulling latest code (optional)..."
read -p "Do you want to pull the latest code from Git? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    run_remote "
        cd suna
        git fetch origin
        git reset --hard origin/main || git reset --hard origin/master
        git clean -fd
    "
    echo "✅ Code updated to latest version"
fi

echo ""
echo "✅ Restart complete!"
echo ""
echo "🔧 To check service status:"
echo "   gcloud compute ssh $GCP_INSTANCE --zone=$GCP_ZONE --project=$GCP_PROJECT --command='cd suna && docker-compose ps'"
echo ""
echo "📝 To view logs:"
echo "   gcloud compute ssh $GCP_INSTANCE --zone=$GCP_ZONE --project=$GCP_PROJECT --command='cd suna && docker-compose logs -f'"
echo ""
echo "🌐 Services should be available at:"
gcloud compute instances describe $GCP_INSTANCE --zone=$GCP_ZONE --project=$GCP_PROJECT --format="value(networkInterfaces[0].accessConfigs[0].natIP)" 2>/dev/null | while read IP; do
    echo "   Backend API: http://$IP:8000"
    echo "   Frontend: http://$IP:3000"
    echo "   RabbitMQ Management: http://$IP:15672"
done 