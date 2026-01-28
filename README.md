# FRPC Web Client

A secure web-based management panel for FRP (Fast Reverse Proxy) client configuration. This tool allows you to manage your FRP proxies through a user-friendly web interface with authentication, automatic backups, and service restart capabilities.

## Features

- 🔐 **Secure Authentication** - Password-protected access with bcrypt encryption
- 📝 **Easy Proxy Management** - Add, edit, and delete proxy configurations through a web UI
- 💾 **Automatic Backups** - Configuration backups before every change
- 🔄 **Service Control** - Restart FRP service directly from the web interface
- 📊 **Service Status** - Real-time monitoring of FRP service status
- 🛡️ **Rate Limiting** - Protection against brute-force login attempts
- 🚀 **Auto-Restart** - Systemd service ensures the web client stays running
- 🌐 **Internet-Ready** - Secure design suitable for internet exposure

## Requirements

- Node.js 14.x or higher
- Linux system with systemd
- FRP client installed at `/opt/frp/` (configurable)
- Root/sudo access for installation

## Quick Installation

1. Clone the repository:
```bash
git clone https://github.com/jtrudeau1530/frpc-webclient.git
cd frpc-webclient
```

2. Run the installation script:
```bash
sudo ./install.sh
```

The installer will:
- Install Node.js if not present
- Install dependencies
- Create a configuration file
- Set up systemd service with auto-restart
- Configure sudoers for service restart
- Start the web client

3. Access the web interface at `http://YOUR_SERVER_IP:8080`

Default credentials:
- Username: `admin`
- Password: (set during installation)

## Manual Installation

If you prefer manual installation:

1. Install dependencies:
```bash
npm install --production
```

2. Create configuration file:
```bash
cp config.example.json config.json
```

3. Generate a password hash:
```bash
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('your-password', 10));"
```

4. Edit `config.json` with your settings:
```json
{
  "port": 8080,
  "frpcConfigPath": "/opt/frp/frpc.toml",
  "sessionSecret": "CHANGE_TO_RANDOM_STRING",
  "username": "admin",
  "passwordHash": "YOUR_BCRYPT_HASH",
  "enableBackups": true,
  "backupDir": "/opt/frp/backups",
  "frpcServiceName": "frpc"
}
```

5. Start the server:
```bash
node server.js
```

## Configuration

### config.json Options

| Option | Description | Default |
|--------|-------------|---------|
| `port` | Port for web interface | `8080` |
| `frpcConfigPath` | Path to frpc.toml | `/opt/frp/frpc.toml` |
| `sessionSecret` | Secret for session encryption | (required) |
| `secureCookie` | Enable secure cookie flag (HTTPS only) | `false` |
| `username` | Login username | `admin` |
| `passwordHash` | Bcrypt hashed password | (required) |
| `enableBackups` | Enable automatic backups | `true` |
| `backupDir` | Backup directory | `/opt/frp/backups` |
| `frpcServiceName` | Name of FRP systemd service | `frpc` |

### Changing Password

To change the admin password:

1. Generate new hash:
```bash
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('new-password', 10));"
```

2. Update `passwordHash` in `config.json`

3. Restart the service:
```bash
sudo systemctl restart frpc-webclient
```

## Security Recommendations

### For Internet Exposure

1. **Use HTTPS**: Set up a reverse proxy (nginx/caddy) with SSL:

Example nginx configuration:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

2. **Use Strong Passwords**: Generate strong passwords using:
```bash
openssl rand -base64 32
```

3. **Enable Firewall**: Only allow necessary ports:
```bash
sudo ufw allow 8080/tcp
sudo ufw enable
```

4. **Regular Updates**: Keep Node.js and dependencies updated:
```bash
cd /opt/frpc-webclient
npm update
sudo systemctl restart frpc-webclient
```

5. **Monitor Logs**: Regularly check logs for suspicious activity:
```bash
journalctl -u frpc-webclient -f
```

## Usage

### Adding a Proxy

1. Click "Add Proxy" button
2. Fill in the proxy details:
   - **Name**: Unique identifier for the proxy
   - **Type**: TCP, UDP, HTTP, HTTPS, STCP, or XTCP
   - **Local IP**: IP address of the local service (e.g., 127.0.0.1)
   - **Local Port**: Port of the local service
   - **Remote Port**: Port on the FRP server
   - **Custom Domain**: (Optional) For HTTP/HTTPS proxies
3. Click "Save Proxy"
4. (Optional) Click "Restart Service" to apply changes

### Editing a Proxy

1. Click "Edit" on the proxy you want to modify
2. Update the configuration
3. Click "Save Proxy"
4. Restart the service to apply changes

### Deleting a Proxy

1. Click "Delete" on the proxy
2. Confirm the deletion
3. Restart the service to apply changes

### Restarting FRP Service

Click the "Restart Service" button in the header. This requires proper sudoers configuration (handled by the installer).

## Troubleshooting

### Service won't start

Check logs:
```bash
journalctl -u frpc-webclient -n 50
```

Common issues:
- Missing config.json file
- Invalid JSON in config.json
- Port already in use
- Missing dependencies

### Cannot restart FRP service

Ensure sudoers rule is configured:
```bash
sudo cat /etc/sudoers.d/frpc-webclient
```

Should contain:
```
root ALL=(ALL) NOPASSWD: /bin/systemctl restart frpc
```

### Configuration not saving

Check permissions:
```bash
ls -la /opt/frp/frpc.toml
```

Ensure the web client has write access to the configuration file.

### Web interface not accessible

1. Check if service is running:
```bash
systemctl status frpc-webclient
```

2. Check firewall:
```bash
sudo ufw status
```

3. Check port binding:
```bash
netstat -tuln | grep 8080
```

## System Management

### View Logs
```bash
journalctl -u frpc-webclient -f
```

### Restart Service
```bash
sudo systemctl restart frpc-webclient
```

### Stop Service
```bash
sudo systemctl stop frpc-webclient
```

### Check Status
```bash
sudo systemctl status frpc-webclient
```

### Disable Auto-Start
```bash
sudo systemctl disable frpc-webclient
```

### Re-enable Auto-Start
```bash
sudo systemctl enable frpc-webclient
```

## Uninstallation

To remove the FRPC Web Client:

```bash
# Stop and disable service
sudo systemctl stop frpc-webclient
sudo systemctl disable frpc-webclient

# Remove service file
sudo rm /etc/systemd/system/frpc-webclient.service
sudo systemctl daemon-reload

# Remove installation directory
sudo rm -rf /opt/frpc-webclient

# Remove sudoers rule
sudo rm /etc/sudoers.d/frpc-webclient

# Remove backups (optional)
sudo rm -rf /opt/frp/backups
```

## Development

### Running in Development Mode

```bash
npm install  # Install dev dependencies
npm run dev  # Start with nodemon for auto-reload
```

### Project Structure

```
frpc-webclient/
├── server.js              # Express server and API
├── public/
│   ├── index.html         # Web interface
│   └── app.js            # Client-side JavaScript
├── config.json            # Configuration (created during install)
├── config.example.json    # Configuration template
├── package.json           # Dependencies
├── frpc-webclient.service # Systemd service file
├── install.sh            # Installation script
└── README.md             # This file
```

## API Endpoints

### Authentication
- `POST /api/login` - Login with username/password
- `POST /api/logout` - Logout current session
- `GET /api/auth/status` - Check authentication status

### Proxy Management
- `GET /api/proxies` - List all proxies
- `GET /api/proxies/:name` - Get specific proxy
- `POST /api/proxies` - Create new proxy
- `PUT /api/proxies/:name` - Update proxy
- `DELETE /api/proxies/:name` - Delete proxy

### Service Control
- `GET /api/status` - Get FRP service status
- `POST /api/restart` - Restart FRP service

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on GitHub.
