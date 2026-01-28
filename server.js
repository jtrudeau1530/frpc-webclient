const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const toml = require('toml');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

const app = express();

// Load configuration
let config;
try {
  config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
} catch (error) {
  console.error('Error loading config.json. Please copy config.example.json to config.json and configure it.');
  process.exit(1);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: config.secureCookie || false, // Set to true if using HTTPS
    httpOnly: true, // Prevent client-side JavaScript access
    maxAge: 3600000 // 1 hour
  }
}));

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later.'
});

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

// Helper function to read TOML file
function readFrpcConfig() {
  try {
    const configContent = fs.readFileSync(config.frpcConfigPath, 'utf8');
    return toml.parse(configContent);
  } catch (error) {
    throw new Error(`Error reading FRPC config: ${error.message}`);
  }
}

// Helper function to write TOML file
function writeFrpcConfig(configObj) {
  try {
    // Create backup if enabled
    if (config.enableBackups) {
      const backupDir = config.backupDir || path.dirname(config.frpcConfigPath);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `frpc.toml.${timestamp}.backup`);
      fs.copyFileSync(config.frpcConfigPath, backupPath);
      
      // Keep only last 10 backups
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('frpc.toml.') && f.endsWith('.backup'))
        .sort()
        .reverse();
      backups.slice(10).forEach(f => {
        fs.unlinkSync(path.join(backupDir, f));
      });
    }

    // Convert config object to TOML format
    const tomlContent = configToToml(configObj);
    fs.writeFileSync(config.frpcConfigPath, tomlContent, 'utf8');
  } catch (error) {
    throw new Error(`Error writing FRPC config: ${error.message}`);
  }
}

// Helper function to convert config object to TOML format
function configToToml(obj) {
  let tomlStr = '';
  
  // Write top-level properties first
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'object' || value === null) {
      tomlStr += `${key} = ${tomlValue(value)}\n`;
    }
  }
  
  // Write sections (proxies)
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      tomlStr += `\n[${key}]\n`;
      for (const [subKey, subValue] of Object.entries(value)) {
        tomlStr += `${subKey} = ${tomlValue(subValue)}\n`;
      }
    }
  }
  
  return tomlStr;
}

// Helper function to format TOML values
function tomlValue(value) {
  if (typeof value === 'string') {
    return `"${value.replace(/"/g, '\\"')}"`;
  } else if (typeof value === 'number') {
    return value;
  } else if (typeof value === 'boolean') {
    return value;
  } else if (Array.isArray(value)) {
    return `[${value.map(v => tomlValue(v)).join(', ')}]`;
  }
  return `"${value}"`;
}

// Helper function to validate service name
function validateServiceName(name) {
  // Only allow alphanumeric, hyphens, underscores, and dots
  return /^[a-zA-Z0-9_.-]+$/.test(name);
}

// Helper function to restart FRPC service
async function restartFrpcService() {
  try {
    const serviceName = config.frpcServiceName || 'frpc';
    if (!validateServiceName(serviceName)) {
      throw new Error('Invalid service name');
    }
    await execPromise(`sudo systemctl restart ${serviceName}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Routes

// Login endpoint
app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username === config.username && await bcrypt.compare(password, config.passwordHash)) {
      req.session.authenticated = true;
      req.session.username = username;
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Check authentication status
app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

// Reserved top-level configuration keys that are not proxies
const RESERVED_CONFIG_KEYS = [
  'serverAddr', 'serverPort', 'auth', 'user', 'token', 'log', 'transport',
  'loginFailExit', 'protocol', 'tls', 'dnsServer', 'start', 'adminAddr',
  'adminPort', 'adminUser', 'adminPwd', 'assetsDir', 'poolCount',
  'tcpMux', 'tcpMuxKeepaliveInterval', 'logFile', 'logLevel', 'logMaxDays'
];

// Helper function to check if a key is a proxy configuration
function isProxyConfig(key, value) {
  // Reserved keys are not proxies
  if (RESERVED_CONFIG_KEYS.includes(key)) {
    return false;
  }
  // Proxies are objects with a 'type' field
  return typeof value === 'object' && value !== null && value.type;
}

// Get all proxies
app.get('/api/proxies', requireAuth, (req, res) => {
  try {
    const frpcConfig = readFrpcConfig();
    const proxies = {};
    
    // Extract proxy configurations
    for (const [key, value] of Object.entries(frpcConfig)) {
      if (isProxyConfig(key, value)) {
        proxies[key] = value;
      }
    }
    
    res.json({ proxies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single proxy
app.get('/api/proxies/:name', requireAuth, (req, res) => {
  try {
    const frpcConfig = readFrpcConfig();
    const proxyName = req.params.name;
    
    if (frpcConfig[proxyName]) {
      res.json({ proxy: frpcConfig[proxyName] });
    } else {
      res.status(404).json({ error: 'Proxy not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new proxy
app.post('/api/proxies', requireAuth, (req, res) => {
  try {
    const { name, proxyConfig } = req.body;
    
    if (!name || !proxyConfig) {
      return res.status(400).json({ error: 'Name and proxy configuration are required' });
    }
    
    // Validate proxy name
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return res.status(400).json({ error: 'Invalid proxy name. Use only alphanumeric characters, hyphens, and underscores.' });
    }
    
    // Prevent overwriting reserved configuration keys
    if (RESERVED_CONFIG_KEYS.includes(name)) {
      return res.status(400).json({ error: 'Cannot use reserved configuration key as proxy name' });
    }
    
    const frpcConfig = readFrpcConfig();
    
    if (frpcConfig[name]) {
      return res.status(400).json({ error: 'Proxy with this name already exists' });
    }
    
    frpcConfig[name] = proxyConfig;
    writeFrpcConfig(frpcConfig);
    
    res.json({ success: true, message: 'Proxy created successfully' });
  } catch (error) {
    console.error('Error creating proxy:', error);
    res.status(500).json({ error: 'Failed to create proxy' });
  }
});

// Update existing proxy
app.put('/api/proxies/:name', requireAuth, (req, res) => {
  try {
    const proxyName = req.params.name;
    const { proxyConfig } = req.body;
    
    if (!proxyConfig) {
      return res.status(400).json({ error: 'Proxy configuration is required' });
    }
    
    // Prevent modifying reserved configuration keys
    if (RESERVED_CONFIG_KEYS.includes(proxyName)) {
      return res.status(400).json({ error: 'Cannot modify reserved configuration key' });
    }
    
    const frpcConfig = readFrpcConfig();
    
    if (!frpcConfig[proxyName]) {
      return res.status(404).json({ error: 'Proxy not found' });
    }
    
    // Ensure it's actually a proxy configuration
    if (!isProxyConfig(proxyName, frpcConfig[proxyName])) {
      return res.status(400).json({ error: 'Cannot modify non-proxy configuration' });
    }
    
    frpcConfig[proxyName] = proxyConfig;
    writeFrpcConfig(frpcConfig);
    
    res.json({ success: true, message: 'Proxy updated successfully' });
  } catch (error) {
    console.error('Error updating proxy:', error);
    res.status(500).json({ error: 'Failed to update proxy' });
  }
});

// Delete proxy
app.delete('/api/proxies/:name', requireAuth, (req, res) => {
  try {
    const proxyName = req.params.name;
    
    // Prevent deleting reserved configuration keys
    if (RESERVED_CONFIG_KEYS.includes(proxyName)) {
      return res.status(400).json({ error: 'Cannot delete reserved configuration key' });
    }
    
    const frpcConfig = readFrpcConfig();
    
    if (!frpcConfig[proxyName]) {
      return res.status(404).json({ error: 'Proxy not found' });
    }
    
    // Ensure it's actually a proxy configuration
    if (!isProxyConfig(proxyName, frpcConfig[proxyName])) {
      return res.status(400).json({ error: 'Cannot delete non-proxy configuration' });
    }
    
    delete frpcConfig[proxyName];
    writeFrpcConfig(frpcConfig);
    
    res.json({ success: true, message: 'Proxy deleted successfully' });
  } catch (error) {
    console.error('Error deleting proxy:', error);
    res.status(500).json({ error: 'Failed to delete proxy' });
  }
});

// Restart FRPC service
app.post('/api/restart', requireAuth, async (req, res) => {
  try {
    const result = await restartFrpcService();
    if (result.success) {
      res.json({ success: true, message: 'FRPC service restarted successfully' });
    } else {
      res.status(500).json({ error: `Failed to restart service: ${result.error}` });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get service status
app.get('/api/status', requireAuth, async (req, res) => {
  try {
    const serviceName = config.frpcServiceName || 'frpc';
    if (!validateServiceName(serviceName)) {
      throw new Error('Invalid service name');
    }
    const { stdout } = await execPromise(`systemctl is-active ${serviceName}`);
    const isActive = stdout.trim() === 'active';
    res.json({ active: isActive, service: serviceName });
  } catch (error) {
    res.json({ active: false, service: config.frpcServiceName || 'frpc' });
  }
});

// Start server
const PORT = config.port || 8080;
app.listen(PORT, () => {
  console.log(`FRPC Web Client running on port ${PORT}`);
  console.log(`Configuration file: ${config.frpcConfigPath}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
