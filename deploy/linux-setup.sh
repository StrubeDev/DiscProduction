#!/bin/bash
# Linux Production Setup for Jamly Discord Bot
# Optimized for Ubuntu/Debian systems

echo "🎵 Setting up Jamly Discord Bot for Linux Production..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install FFmpeg (essential for audio processing)
sudo apt install -y ffmpeg

# Install Python 3 and pip (for yt-dlp)
sudo apt install -y python3 python3-pip

# Install yt-dlp (YouTube downloader)
pip3 install --user yt-dlp

# Verify installations
echo "📋 Verifying installations..."
node --version
npm --version
ffmpeg -version | head -1
yt-dlp --version
python3 --version

# Install PM2 for process management
sudo npm install -g pm2

# Create systemd service for auto-start
sudo tee /etc/systemd/system/jamly-bot.service > /dev/null <<EOF
[Unit]
Description=Jamly Discord Music Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node bot.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Set up log rotation
sudo tee /etc/logrotate.d/jamly-bot > /dev/null <<EOF
$(pwd)/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 $USER $USER
}
EOF

# Create logs directory
mkdir -p logs

# Install dependencies
npm install

echo "✅ Linux setup complete!"
echo ""
echo "🚀 To start the bot:"
echo "   npm start"
echo ""
echo "🔧 To run with PM2:"
echo "   pm2 start bot.js --name jamly-bot"
echo "   pm2 startup"
echo "   pm2 save"
echo ""
echo "📊 To monitor:"
echo "   pm2 monit"
echo "   pm2 logs jamly-bot"
