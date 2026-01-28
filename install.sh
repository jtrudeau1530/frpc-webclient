#!/bin/bash

# FRPC Web Client Installation Script
# This script installs the FRPC Web Client as a systemd service

set -e

echo "====================================="
echo "FRPC Web Client Installation Script"
echo "====================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo ""

# Set installation directory
INSTALL_DIR="/opt/frpc-webclient"
echo "Installation directory: $INSTALL_DIR"

# Create installation directory
if [ -d "$INSTALL_DIR" ]; then
    echo "Directory $INSTALL_DIR already exists. Backing up..."
    mv "$INSTALL_DIR" "$INSTALL_DIR.backup.$(date +%s)"
fi

mkdir -p "$INSTALL_DIR"

# Copy files to installation directory
echo "Copying files..."
cp package.json "$INSTALL_DIR/"
cp server.js "$INSTALL_DIR/"
cp frpc-webclient.service "$INSTALL_DIR/"
cp -r public "$INSTALL_DIR/"
cd "$INSTALL_DIR"

# Install dependencies
echo "Installing dependencies..."
echo "  - Running: npm install --production"
echo "  - This will download: express, express-rate-limit, bcryptjs, express-session, toml"
npm install --production

# Create config file if it doesn't exist
if [ ! -f "$INSTALL_DIR/config.json" ]; then
    echo ""
    echo "Creating configuration file..."
    
    # Prompt for password
    echo "Please enter a password for the admin user:"
    read -s PASSWORD
    echo ""
    echo "Confirm password:"
    read -s PASSWORD_CONFIRM
    echo ""
    
    if [ "$PASSWORD" != "$PASSWORD_CONFIRM" ]; then
        echo "Passwords do not match!"
        exit 1
    fi
    
    # Generate password hash using Node.js (securely via stdin)
    PASSWORD_HASH=$(node -e "const bcrypt = require('bcryptjs'); const readline = require('readline'); const rl = readline.createInterface({input: process.stdin}); rl.on('line', (line) => {console.log(bcrypt.hashSync(line, 10)); process.exit();});" <<< "$PASSWORD")
    
    # Generate random session secret
    SESSION_SECRET=$(openssl rand -hex 32)
    
    # Create config.json
    cat > "$INSTALL_DIR/config.json" <<EOF
{
  "port": 8080,
  "frpcConfigPath": "/opt/frp/frpc.toml",
  "sessionSecret": "$SESSION_SECRET",
  "secureCookie": false,
  "username": "admin",
  "passwordHash": "$PASSWORD_HASH",
  "enableBackups": true,
  "backupDir": "/opt/frp/backups",
  "frpcServiceName": "frpc"
}
EOF
    
    chmod 600 "$INSTALL_DIR/config.json"
    echo "Configuration file created at $INSTALL_DIR/config.json"
else
    echo "Configuration file already exists at $INSTALL_DIR/config.json"
fi

# Create backup directory
mkdir -p /opt/frp/backups

# Install systemd service
echo ""
echo "Installing systemd service..."
cp "$INSTALL_DIR/frpc-webclient.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable frpc-webclient.service

# Add sudoers rule for service restart
SUDOERS_FILE="/etc/sudoers.d/frpc-webclient"
if [ ! -f "$SUDOERS_FILE" ]; then
    echo "Creating sudoers rule for service restart..."
    echo "root ALL=(ALL) NOPASSWD: /bin/systemctl restart frpc" > "$SUDOERS_FILE"
    chmod 440 "$SUDOERS_FILE"
fi

# Start the service
echo "Starting FRPC Web Client service..."
systemctl start frpc-webclient.service

echo ""
echo "====================================="
echo "Installation Complete!"
echo "====================================="
echo ""
echo "Service Status:"
systemctl status frpc-webclient.service --no-pager || true
echo ""
echo "Access the web interface at: http://YOUR_SERVER_IP:8080"
echo "Username: admin"
echo "Password: (the password you entered during installation)"
echo ""
echo "Useful commands:"
echo "  - View logs: journalctl -u frpc-webclient -f"
echo "  - Restart service: systemctl restart frpc-webclient"
echo "  - Stop service: systemctl stop frpc-webclient"
echo "  - Service status: systemctl status frpc-webclient"
echo ""
echo "Configuration file: $INSTALL_DIR/config.json"
echo ""
echo "IMPORTANT: To access from the internet, configure your firewall to allow port 8080"
echo "           and consider setting up HTTPS with a reverse proxy (nginx, caddy, etc.)"
echo ""
