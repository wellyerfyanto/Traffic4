// public/script.js - Frontend Logic Lengkap dengan semua fitur
document.addEventListener('DOMContentLoaded', function() {
    loadSystemStatus();
    checkAutoLoopStatus();
    loadProxyStatus(); // Load proxy status on page load
    
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
            alert('✅ Proxies refreshed successfully!');
        } else {
            alert('❌ Error refreshing proxies: ' + result.error);
        }
        
        refreshBtn.disabled = false;
        refreshBtn.textContent = originalText;
    } catch (error) {
        alert('❌ Network error: ' + error.message);
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
            const totalActive = result.webProxies.length + result.freshProxies.length + result.vpnExtensions.length;
            alert(`✅ Proxy testing completed!\n\n🌐 Web Proxies: ${result.webProxies.length}/20\n🆕 Fresh Proxies: ${result.freshProxies.length}/50\n🛡️ VPN Extensions: ${result.vpnExtensions.length}/10\n\nTotal Active: ${totalActive}`);
        } else {
            alert('❌ Error testing proxies: ' + result.error);
        }
    } catch (error) {
        alert('❌ Network error: ' + error.message);
    }
}

function displayProxyStatus(proxyData) {
    // Display Web Proxies
    const webProxyList = document.getElementById('webProxyList');
    webProxyList.innerHTML = `
        <strong>🌐 Web Proxies (${proxyData.webProxies.length}/20):</strong>
        <div class="proxy-list">
            ${proxyData.webProxies.slice(0, 5).map(proxy => `
                <div class="proxy-item active">
                    ${proxy.url}
                </div>
            `).join('')}
            ${proxyData.webProxies.length > 5 ? 
                `<div style="color: #7f8c8d; font-style: italic;">
                    ... dan ${proxyData.webProxies.length - 5} web proxy lainnya
                </div>` : ''}
        </div>
    `;
    
    // Display Fresh Proxies
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
    
    // Display VPN Extensions
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
    
    // Update last update time
    document.getElementById('lastProxyUpdate').textContent = 
        new Date(proxyData.lastUpdate).toLocaleString();
}

// Load proxy status on page load
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
            proxyType: document.querySelector('input[name="proxyType"]:checked')?.value || 'web'
        };

        const response = await fetch('/api/start-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        
        if (result.success) {
            alert('✅ Sessions started successfully! Redirecting to monitoring...');
            setTimeout(() => {
                window.location.href = '/monitoring';
            }, 2000);
        } else {
            alert('❌ Error: ' + result.error);
        }
    } catch (error) {
        alert('❌ Network error: ' + error.message);
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

        // Validasi input
        if (!config.targetUrl) {
            alert('❌ Please enter target URL');
            return;
        }

        if (config.interval < 300000) {
            alert('❌ Interval minimum 5 menit');
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
            alert('❌ ' + result.error);
        }
    } catch (error) {
        alert('❌ Network error: ' + error.message);
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
            alert('❌ ' + result.error);
        }
    } catch (error) {
        alert('❌ Network error: ' + error.message);
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
            alert('✅ Puppeteer test passed! System ready to use.\n\nChrome Path: ' + (result.chromePath || 'Default'));
        } else {
            alert('❌ Puppeteer test failed: ' + result.error);
        }
        
        testBtn.disabled = false;
        testBtn.textContent = originalText;
    } catch (error) {
        alert('❌ Test error: ' + error.message);
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
                alert('✅ All sessions cleared!');
                loadSystemStatus();
                checkAutoLoopStatus();
            } else {
                alert('❌ Error: ' + result.error);
            }
        })
        .catch(error => {
            alert('❌ Network error: ' + error.message);
        });
    }
}

// Utility function untuk format time
function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
}

// Auto-check status setiap 30 detik
setInterval(() => {
    checkAutoLoopStatus();
    loadProxyStatus();
}, 30000);