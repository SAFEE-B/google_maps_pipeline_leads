#!/bin/bash

echo "🚀 Starting Naqvi AI Project Redis Setup..."
echo

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker is running"
echo

echo "🔄 Starting Redis and Redis Commander..."
docker-compose up -d

if [ $? -eq 0 ]; then
    echo
    echo "✅ Redis services started successfully!"
    echo
    echo "📊 Services running:"
    echo "   • Redis: localhost:6379"
    echo "   • Redis Commander: http://localhost:8081"
    echo
    echo "🧪 Testing Redis connection..."
    sleep 3
    if docker exec naqvi-ai-redis redis-cli ping &> /dev/null; then
        echo "✅ Redis is responding to ping"
    else
        echo "⚠️  Redis may still be starting up..."
    fi
    echo
    echo "🎯 Your Redis setup is ready for the Naqvi AI Project!"
    echo "   You can now start the Backend server."
else
    echo "❌ Failed to start Redis services"
    echo "Please check the error messages above"
    exit 1
fi

echo 