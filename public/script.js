// public/script.js - Frontend Logic Lengkap dengan semua fitur
document.addEventListener('DOMContentLoaded', function() {
    loadSystemStatus();
    checkAutoLoopStatus();
    loadProxyStatus();
    
    document.getElementById('botConfig').addEventListener('submit', async function(e) {
        e.preventDefault();
        await startSessions();
    });
});

// Proxy Management Functions
async function refreshProxies() {
    try {
        const refreshBtn = document.querySelector('button[onclick="refreshProxies()"]');
        const originalText = refreshBtn.textContent;
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
        
        const response = await fetch('/api/proxies/refresh', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            displayProxyStatus(result);
            showNotification('✅ Proxies refreshed successfully!', 'success');
        } else {
            showNotification('❌ Error refreshing proxies: ' + result.error, 'error');
        }
        
        refreshBtn.disabled = false;
        refreshBtn.textContent = originalText;
    } catch (error) {
        showNotification('❌ Network error: ' + error.message, 'error');
    }
}

async function testAllProxies() {
    try {
        const response = await fetch('/api/proxies/refresh', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            displayProxyStatus(result);
            
            const webStats = result.webProxies.filter(p => p.working).length;
            const freshStats = result.freshProxies.length;
            const vpnStats = result.vpnExtensions.length;
            const total = webStats + freshStats + vpnStats;
            
            showNotification(
                `✅ Proxy testing completed!<br><br>
                🌐 Web Proxies: ${webStats}/25 aktif<br>
                🆕 Fresh Proxies: ${freshStats}/50 aktif<br>
                🛡️ VPN Extensions: ${vpnStats}/10 aktif<br><br>
                📊 Total Active: ${total} proxy`, 
                'success',
                8000
            );
        } else {
            showNotification('❌ Error testing proxies: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('❌ Network error: ' + error.message, 'error');
    }
}

function displayProxyStatus(proxyData) {
    const activeWebProxies = proxyData.webProxies.filter(p => p.working);
    
    const webProxyList = document.getElementById('webProxyList');
    webProxyList.innerHTML = `
        <strong>🌐 Web Proxies (${activeWebProxies.length}/${proxyData.webProxies.length}):</strong>
        <div class="proxy-list">
            ${activeWebProxies.slice(0, 8).map(proxy => `
                <div class="proxy-item active" title="${proxy.name} - Method: ${proxy.method}">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>${proxy.name}</span>
                        <small style="background: #3498db; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.7em;">
                            ${proxy.method}
                        </small>
                    </div>
                    <div style="font-size: 0.8em; color: #7f8c8d; margin-top: 4px;">
                        ${proxy.url.replace('https://', '').replace('www.', '')}
                    </div>
                </div>
            `).join('')}
            ${activeWebProxies.length > 8 ? 
                `<div style="color: #7f8c8d; font-style: italic;">
                    ... dan ${activeWebProxies.length - 8} web proxy lainnya
                </div>` : 
                activeWebProxies.length === 0 ?
                `<div style="color: #e74c3c; background: #fadbd8; padding: 10px; border-radius: 5px; text-align: center;">
                    ❌ Tidak ada web proxy aktif<br>
                    <small>Klik "Refresh Proxies" untuk memperbarui</small>
                </div>` : ''
            }
        </div>
    `;

    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'background: #ecf0f1; padding: 10px; border-radius: 5px; margin-top: 10px; font-size: 0.9em;';
    statsDiv.innerHTML = `
        <strong>📊 Proxy Statistics:</strong><br>
        • Web Proxies: ${activeWebProxies.length} aktif<br>
        • Fresh Proxies: ${proxyData.freshProxies.length} aktif<br>
        • VPN Extensions: ${proxyData.vpnExtensions.length} aktif<br>
        • Total: ${activeWebProxies.length + proxyData.freshProxies.length + proxyData.vpnExtensions.length} proxy aktif
    `;
    webProxyList.appendChild(statsDiv);
    
    const freshProxyList = document.getElementById('freshProxyList');
    freshProxyList.innerHTML = `
        <strong>🆕 Fresh Proxies (${proxyData.freshProxies.length}/50):</strong>
        <div class="proxy-list">
            ${proxyData.freshProxies.slice(0, 5).map(proxy => `
                <div class="proxy-item active">
                    ${proxy.ip}:${proxy.port}
                </div>
            `).join('')}
            ${proxyData.freshProxies.length > 5 ? 
                `<div style="color: #7f8c8d; font-style: italic;">
                    ... dan ${proxyData.freshProxies.length - 5} fresh proxy lainnya
                </div>` : ''}
        </div>
    `;
    
    const vpnExtensionList = document.getElementById('vpnExtensionList');
    vpnExtensionList.innerHTML = `
        <strong>🛡️ VPN Extensions (${proxyData.vpnExtensions.length}/10):</strong>
        <div class="proxy-list">
            ${proxyData.vpnExtensions.slice(0, 5).map(vpn => `
                <div class="proxy-item active">
                    ${vpn.name}
                </div>
            `).join('')}
            ${proxyData.vpnExtensions.length > 5 ? 
                `<div style="color: #7f8c8d; font-style: italic;">
                    ... dan ${proxyData.vpnExtensions.length - 5} VPN lainnya
                </div>` : ''}
        </div>
    `;
    
    document.getElementById('lastProxyUpdate').textContent = 
        new Date(proxyData.lastUpdate).toLocaleString();
}

async function loadProxyStatus() {
    try {
        const response = await fetch('/api/proxies/status');
        const result = await response.json();
        
        if (result.success) {
            displayProxyStatus(result);
        }
    } catch (error) {
        console.error('Error loading proxy status:', error);
        document.getElementById('lastProxyUpdate').textContent = 'Error loading';
    }
}

// Session Management
async function startSessions() {
    const startBtn = document.getElementById('startBtn');
    const originalText = startBtn.textContent;
    
    try {
        startBtn.disabled = true;
        startBtn.textContent = 'Starting...';
        
        const formData = {
            targetUrl: document.getElementById('targetUrl').value,
            profiles: document.getElementById('profiles').value,
            deviceType: document.getElementById('deviceType').value,
            proxies: document.getElementById('proxies')?.value || '',
            autoLoop: document.getElementById('autoLoop').checked,
            proxyType: document.querySelector('input[name="proxyType"]:checked')?.value
        };

        if (!formData.proxyType) {
            alert('❌ PROXY REQUIRED: Please select proxy type (Web, Fresh, or VPN)');
            return;
        }

        const response = await fetch('/api/start-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification('✅ Sessions started with PROXY ENFORCEMENT! Redirecting to monitoring...', 'success');
            setTimeout(() => {
                window.location.href = '/monitoring';
            }, 2000);
        } else {
            showNotification('❌ Error: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('❌ Network error: ' + error.message, 'error');
    } finally {
        startBtn.disabled = false;
        startBtn.textContent = originalText;
    }
}

// Auto-loop functions
async function startAutoLoop() {
    try {
        const config = {
            interval: parseInt(document.getElementById('loopInterval').value) * 60 * 1000,
            maxSessions: parseInt(document.getElementById('maxSessions').value),
            targetUrl: document.getElementById('targetUrl').value || 'https://github.com'
        };

        if (!config.targetUrl) {
            showNotification('❌ Please enter target URL', 'error');
            return;
        }

        if (config.interval < 300000) {
            showNotification('❌ Interval minimum 5 menit', 'error');
            return;
        }

        const response = await fetch('/api/auto-loop/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();
        
        if (result.success) {
            document.getElementById('autoLoopStatus').innerHTML = 
                `<div style="color: #27ae60; background: #d5f4e6; padding: 15px; border-radius: 8px; border-left: 4px solid #27ae60;">
                    <strong>✅ ${result.message}</strong><br>
                    ⏰ Interval: ${config.interval/60000} menit<br>
                    📊 Max Sessions: ${config.maxSessions}<br>
                    🌐 Target: ${config.targetUrl}<br>
                    <small>Auto-loop akan berjalan terus hingga di-stop manual</small>
                </div>`;
                
            setTimeout(checkAutoLoopStatus, 10000);
        } else {
            showNotification('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('❌ Network error: ' + error.message, 'error');
    }
}

async function stopAutoLoop() {
    if (!confirm('Are you sure you want to stop AUTO-LOOP? Semua session akan berhenti.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/auto-loop/stop', {
            method: 'POST'
        });

        const result = await response.json();
        
        if (result.success) {
            document.getElementById('autoLoopStatus').innerHTML = 
                `<div style="color: #e74c3c; background: #fadbd8; padding: 15px; border-radius: 8px; border-left: 4px solid #e74c3c;">
                    ⏹️ <strong>${result.message}</strong><br>
                    <small>Auto-loop telah dihentikan. Session manual masih bisa dijalankan.</small>
                </div>`;
        } else {
            showNotification('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('❌ Network error: ' + error.message, 'error');
    }
}

async function checkAutoLoopStatus() {
    try {
        const response = await fetch('/api/auto-loop/status');
        const result = await response.json();

        const statusDiv = document.getElementById('autoLoopStatus');
        if (result.success) {
            const statusColor = result.config.enabled ? '#27ae60' : '#e74c3c';
            const statusText = result.config.enabled ? '🟢 RUNNING' : '🔴 STOPPED';
            const statusBg = result.config.enabled ? '#d5f4e6' : '#fadbd8';
            
            statusDiv.innerHTML = `
                <div style="background: ${statusBg}; padding: 15px; border-radius: 8px; border-left: 4px solid ${statusColor};">
                    <strong>Auto-Loop Status: ${statusText}</strong><br>
                    ⏰ Interval: ${result.config.interval/60000} menit<br>
                    📊 Max Sessions: ${result.config.maxSessions}<br>
                    🎯 Active Sessions: <strong>${result.activeSessions}/${result.config.maxSessions}</strong><br>
                    🌐 Target: ${result.config.targetUrl}<br>
                    <small>Last checked: ${new Date().toLocaleTimeString()}</small>
                </div>
            `;
            
            if (result.config.enabled) {
                setTimeout(checkAutoLoopStatus, 10000);
            }
        }
    } catch (error) {
        document.getElementById('autoLoopStatus').innerHTML = 
            `<div style="color: #e74c3c;">
                ❌ Cannot connect to server
            </div>`;
    }
}

// System functions
async function testPuppeteer() {
    try {
        const testBtn = document.querySelector('button[onclick="testPuppeteer()"]');
        const originalText = testBtn.textContent;
        testBtn.disabled = true;
        testBtn.textContent = 'Testing...';
        
        const response = await fetch('/api/test-puppeteer');
        const result = await response.json();
        
        if (result.success) {
            showNotification('✅ Puppeteer test passed! System ready to use.\n\nChrome Path: ' + (result.chromePath || 'Default'), 'success');
        } else {
            showNotification('❌ Puppeteer test failed: ' + result.error, 'error');
        }
        
        testBtn.disabled = false;
        testBtn.textContent = originalText;
    } catch (error) {
        showNotification('❌ Test error: ' + error.message, 'error');
    }
}

async function loadSystemStatus() {
    try {
        const response = await fetch('/api/test-puppeteer');
        const result = await response.json();
        
        const statusDiv = document.getElementById('systemStatus');
        
        if (result.success) {
            statusDiv.innerHTML = `
                <div style="color: #27ae60; background: #d5f4e6; padding: 15px; border-radius: 8px; border-left: 4px solid #27ae60;">
                    ✅ <strong>System Ready</strong><br>
                    📍 Chrome Path: ${result.chromePath || 'Default'}<br>
                    💡 Message: ${result.message}<br>
                    <small>Semua sistem berfungsi dengan baik</small>
                </div>
            `;
        } else {
            statusDiv.innerHTML = `
                <div style="color: #e74c3c; background: #fadbd8; padding: 15px; border-radius: 8px; border-left: 4px solid #e74c3c;">
                    ❌ <strong>System Error</strong><br>
                    📍 Error: ${result.error}<br>
                    <small>Periksa konfigurasi Puppeteer</small>
                </div>
            `;
        }
    } catch (error) {
        document.getElementById('systemStatus').innerHTML = `
            <div style="color: #e74c3c; background: #fadbd8; padding: 15px; border-radius: 8px; border-left: 4px solid #e74c3c;">
                ❌ <strong>Connection Error</strong><br>
                📍 Cannot connect to server<br>
                <small>Pastikan server sedang berjalan</small>
            </div>
        `;
    }
}

function goToMonitoring() {
    window.location.href = '/monitoring';
}

function goToConfig() {
    window.location.href = '/';
}

function clearSessions() {
    if (confirm('Are you sure you want to stop ALL sessions and clear logs?')) {
        fetch('/api/clear-sessions', {
            method: 'POST'
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                showNotification('✅ All sessions cleared!', 'success');
                loadSystemStatus();
                checkAutoLoopStatus();
            } else {
                showNotification('❌ Error: ' + result.error, 'error');
            }
        })
        .catch(error => {
            showNotification('❌ Network error: ' + error.message, 'error');
        });
    }
}

// Utility function untuk format time
function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
}

// Fungsi notifikasi
function showNotification(message, type, duration = 5000) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        background: ${type === 'success' ? '#27ae60' : '#e74c3c'};
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 400px;
    `;
    notification.innerHTML = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, duration);
}

// Auto-check status setiap 30 detik
setInterval(() => {
    checkAutoLoopStatus();
    loadProxyStatus();
}, 30000);