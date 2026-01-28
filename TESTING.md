# Testing Guide

This document provides instructions for testing the FRPC Web Client.

## Prerequisites

1. Node.js installed (v14+)
2. Dependencies installed: `npm install`
   - This downloads: express, express-rate-limit, bcryptjs, express-session, toml
   - The install.sh script automatically runs `npm install --production`
3. Test configuration file created

## Quick Test Setup

1. Create a test configuration:
```bash
cp config.example.json config.json
```

2. Generate a password hash:
```bash
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('admin123', 10));"
```

3. Update `config.json` with the hash and test settings:
```json
{
  "port": 8080,
  "frpcConfigPath": "./test-frpc.toml",
  "sessionSecret": "test-secret-change-in-production",
  "secureCookie": false,
  "username": "admin",
  "passwordHash": "YOUR_GENERATED_HASH",
  "enableBackups": true,
  "backupDir": "/tmp/frpc-backups",
  "frpcServiceName": "frpc"
}
```

4. Create a test TOML file:
```bash
cp frpc.toml.example test-frpc.toml
```

5. Start the server:
```bash
node server.js
```

## Testing Checklist

### Authentication
- [ ] Navigate to http://localhost:8080
- [ ] Verify login page appears
- [ ] Test invalid credentials (should fail)
- [ ] Test valid credentials (admin/admin123)
- [ ] Verify redirect to main interface

### Proxy Management
- [ ] View existing proxies from test-frpc.toml
- [ ] Click "Add Proxy" button
- [ ] Fill in proxy details:
  - Name: test-proxy
  - Type: tcp
  - Local IP: 127.0.0.1
  - Local Port: 8080
  - Remote Port: 8888
- [ ] Save proxy
- [ ] Verify proxy appears in list
- [ ] Click "Edit" on the proxy
- [ ] Modify a field
- [ ] Save changes
- [ ] Verify changes reflected in UI
- [ ] Delete the proxy
- [ ] Confirm deletion

### Service Management
- [ ] Check service status indicator
- [ ] Click "Restart Service" button
  - Note: This will fail if frpc service is not installed
  - Expected behavior: Shows error message gracefully

### Security Testing
- [ ] Test rate limiting by attempting multiple logins
- [ ] Verify session timeout after 1 hour
- [ ] Test logout functionality
- [ ] Verify unauthorized access is blocked (try accessing /api/proxies without login)

### Configuration Backups
- [ ] Make a configuration change
- [ ] Check backup directory for backup file
- [ ] Verify backup contains previous configuration

## API Testing

You can test the API endpoints using curl:

### Login
```bash
curl -c cookies.txt -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Get Proxies
```bash
curl -b cookies.txt http://localhost:8080/api/proxies
```

### Create Proxy
```bash
curl -b cookies.txt -X POST http://localhost:8080/api/proxies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "api-test",
    "proxyConfig": {
      "type": "tcp",
      "localIP": "127.0.0.1",
      "localPort": 3000,
      "remotePort": 3000
    }
  }'
```

### Update Proxy
```bash
curl -b cookies.txt -X PUT http://localhost:8080/api/proxies/api-test \
  -H "Content-Type: application/json" \
  -d '{
    "proxyConfig": {
      "type": "tcp",
      "localIP": "127.0.0.1",
      "localPort": 3001,
      "remotePort": 3001
    }
  }'
```

### Delete Proxy
```bash
curl -b cookies.txt -X DELETE http://localhost:8080/api/proxies/api-test
```

### Logout
```bash
curl -b cookies.txt -X POST http://localhost:8080/api/logout
```

## Common Issues

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::8080
```
Solution: Change the port in config.json or stop the process using port 8080

### Cannot Read Configuration File
```
Error reading FRPC config
```
Solution: Verify frpcConfigPath in config.json points to a valid TOML file

### Service Restart Fails
```
Failed to restart service
```
Solution: Ensure sudoers rule is configured or test in development mode without service restart

## Development Mode

For development with auto-reload:
```bash
npm run dev
```

This uses nodemon to automatically restart the server when files change.

## Production Testing

1. Follow installation instructions in README.md
2. Test with actual frpc.toml configuration
3. Verify systemd service is running
4. Test service restart functionality
5. Test from remote machine
6. Verify HTTPS configuration if internet-exposed
