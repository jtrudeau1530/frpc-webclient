let currentProxies = {};

// Check authentication on page load
checkAuth();

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        
        if (data.authenticated) {
            showMainApp();
        } else {
            showLogin();
        }
    } catch (error) {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    loadProxies();
    loadServiceStatus();
}

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMainApp();
        } else {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        errorDiv.textContent = 'Connection error';
        errorDiv.classList.remove('hidden');
    }
});

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    showLogin();
}

async function loadProxies() {
    try {
        const response = await fetch('/api/proxies');
        const data = await response.json();
        
        if (response.ok) {
            currentProxies = data.proxies;
            renderProxies(data.proxies);
        }
    } catch (error) {
        console.error('Error loading proxies:', error);
    }
}

function renderProxies(proxies) {
    const container = document.getElementById('proxyList');
    
    if (Object.keys(proxies).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <h3>No proxies configured</h3>
                <p>Click "Add Proxy" to create your first proxy configuration</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = Object.entries(proxies).map(([name, config]) => `
        <div class="proxy-item">
            <div class="proxy-info">
                <h3>${escapeHtml(name)}</h3>
                <div class="proxy-details">
                    <span><strong>Type:</strong> ${escapeHtml(config.type || 'N/A')}</span>
                    <span><strong>Local:</strong> ${escapeHtml(config.localIP || config.local_ip || 'N/A')}:${escapeHtml(String(config.localPort || config.local_port || 'N/A'))}</span>
                    <span><strong>Remote:</strong> ${escapeHtml(String(config.remotePort || config.remote_port || 'N/A'))}</span>
                    ${config.customDomains || config.custom_domains ? `<span><strong>Domain:</strong> ${escapeHtml(config.customDomains || config.custom_domains)}</span>` : ''}
                </div>
            </div>
            <div class="proxy-actions">
                <button class="btn btn-primary" onclick="editProxy('${escapeHtml(name)}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteProxy('${escapeHtml(name)}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function loadServiceStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        const statusDiv = document.getElementById('serviceStatus');
        if (data.active) {
            statusDiv.className = 'status-indicator active';
            statusDiv.innerHTML = '<span class="status-dot"></span><span>Service Active</span>';
        } else {
            statusDiv.className = 'status-indicator inactive';
            statusDiv.innerHTML = '<span class="status-dot"></span><span>Service Inactive</span>';
        }
    } catch (error) {
        console.error('Error loading service status:', error);
    }
}

function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add Proxy';
    document.getElementById('editMode').value = 'false';
    document.getElementById('proxyForm').reset();
    document.getElementById('proxyName').disabled = false;
    document.getElementById('modalError').classList.add('hidden');
    document.getElementById('proxyModal').classList.add('active');
}

function editProxy(name) {
    const proxy = currentProxies[name];
    
    document.getElementById('modalTitle').textContent = 'Edit Proxy';
    document.getElementById('editMode').value = 'true';
    document.getElementById('originalName').value = name;
    document.getElementById('proxyName').value = name;
    document.getElementById('proxyName').disabled = true;
    document.getElementById('proxyType').value = proxy.type || 'tcp';
    document.getElementById('localIP').value = proxy.localIP || proxy.local_ip || '';
    document.getElementById('localPort').value = proxy.localPort || proxy.local_port || '';
    document.getElementById('remotePort').value = proxy.remotePort || proxy.remote_port || '';
    document.getElementById('customDomain').value = proxy.customDomains || proxy.custom_domains || '';
    document.getElementById('modalError').classList.add('hidden');
    document.getElementById('proxyModal').classList.add('active');
}

function closeModal() {
    document.getElementById('proxyModal').classList.remove('active');
}

document.getElementById('proxyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const isEdit = document.getElementById('editMode').value === 'true';
    const name = document.getElementById('proxyName').value;
    const errorDiv = document.getElementById('modalError');
    
    const proxyConfig = {
        type: document.getElementById('proxyType').value,
        localIP: document.getElementById('localIP').value,
        localPort: parseInt(document.getElementById('localPort').value),
        remotePort: parseInt(document.getElementById('remotePort').value)
    };
    
    const customDomain = document.getElementById('customDomain').value;
    if (customDomain) {
        proxyConfig.customDomains = customDomain;
    }
    
    try {
        const url = isEdit ? `/api/proxies/${encodeURIComponent(name)}` : '/api/proxies';
        const method = isEdit ? 'PUT' : 'POST';
        const body = isEdit ? { proxyConfig } : { name, proxyConfig };
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            closeModal();
            loadProxies();
        } else {
            errorDiv.textContent = data.error || 'Operation failed';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        errorDiv.textContent = 'Connection error';
        errorDiv.classList.remove('hidden');
    }
});

async function deleteProxy(name) {
    if (!confirm(`Are you sure you want to delete proxy "${name}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/proxies/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadProxies();
        } else {
            alert('Failed to delete proxy');
        }
    } catch (error) {
        alert('Connection error');
    }
}

async function restartService() {
    if (!confirm('Are you sure you want to restart the FRPC service?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/restart', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Service restarted successfully');
            setTimeout(loadServiceStatus, 2000);
        } else {
            alert('Failed to restart service: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Connection error');
    }
}

// Auto-refresh service status every 30 seconds
setInterval(loadServiceStatus, 30000);
