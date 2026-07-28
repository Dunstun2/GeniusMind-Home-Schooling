#!/bin/bash
# Simple deployment script for Genius Minds
# Run this after pushing code to GitHub

set -e  # Exit on error

echo "🚀 Starting deployment..."
echo ""

# Navigate to app directory
cd /home/vdranjxy/geniusminds

# 1. Pull latest code
echo "📥 Pulling latest code from GitHub..."
git pull origin master
echo "✅ Code pulled successfully"
echo ""

# 2. Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p tmp
mkdir -p logs
echo "✅ Directories ready"
echo ""

# 3. Restart the app by touching restart.txt
echo "🔄 Restarting application..."
touch tmp/restart.txt
echo "✅ Restart signal sent"
echo ""

# 4. Check if app is running
echo "🔍 Checking application status..."
if pgrep -f "node.*server.js" > /dev/null; then
    echo "✅ Application is running"
else
    echo "⚠️  Application may need manual restart"
    echo "   Run: cd /home/vdranjxy/geniusminds && node server.js"
fi
echo ""

echo "✅ Deployment complete!"
echo "📦 Latest commit: $(git log -1 --oneline)"
