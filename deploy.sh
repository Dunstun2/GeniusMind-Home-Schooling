#!/bin/bash
# Genius Minds Homeschooling - Deployment Script
# Usage: ./deploy.sh
# Pulls latest code from GitHub and restarts the application

set -e

APP_DIR="/home/vdranjxy/geniusminds"
LOG_FILE="$APP_DIR/logs/deploy.log"

echo "=================================="
echo "🚀 Deploying Genius Minds"
echo "=================================="
echo ""

# Ensure log directory exists
mkdir -p "$APP_DIR/logs"

# Log deployment start
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Deployment started" >> "$LOG_FILE"

# Navigate to app directory
cd "$APP_DIR"

# 1. Pull latest code
echo "📥 Pulling latest code from GitHub..."
git pull origin master >> "$LOG_FILE" 2>&1
echo "✅ Code pulled successfully"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Git pull completed" >> "$LOG_FILE"
echo ""

# 2. Verify code is valid
echo "🔍 Verifying Node.js syntax..."
node -c server.js
echo "✅ Syntax check passed"
echo ""

# 3. Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p tmp logs
echo "✅ Directories ready"
echo ""

# 4. Restart the app
echo "🔄 Restarting application..."
touch tmp/restart.txt
echo "✅ Restart signal sent to Node.js app"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Restart signal sent" >> "$LOG_FILE"
echo ""

# 5. Check app status
echo "🔍 Checking application status..."
if pgrep -f "node.*server.js" > /dev/null; then
    echo "✅ Application is running"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Application verified running" >> "$LOG_FILE"
else
    echo "⚠️  Application may need manual restart"
    echo "   Run: cd $APP_DIR && node server.js"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: Application not detected" >> "$LOG_FILE"
fi
echo ""

echo "=================================="
echo "✅ Deployment Complete!"
echo "=================================="
echo "📦 Latest commit: $(git log -1 --oneline)"
echo "📝 Full logs: $LOG_FILE"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Deployment completed successfully" >> "$LOG_FILE"

