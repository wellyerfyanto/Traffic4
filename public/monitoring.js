// Monitoring page JavaScript dengan semua fitur baru
let currentSessionId = null;
let refreshInterval = null;
let simulationActivityLog = [];

document.addEventListener('DOMContentLoaded', function() {
    loadSessions();
    startAutoRefresh();
    initializeSimulationDisplay();
});

function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        loadSessions();
        if (currentSessionId) {
            loadLogs(currentSessionId);
        }
        updateSimulationActivity();
    }, 3000);
}

function initializeSimulationDisplay() {
    // Tambahkan progress bar untuk scroll
    const progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress';
    progressBar.id = 'globalScrollProgress';
    progressBar.style.width = '0%';
    document.body.appendChild(progressBar);
}

async function loadSessions() {
    try {
        const response = await fetch('/api/all-sessions');
        const result = await response.json();
        
        if (result.success) {
            updateSessionsSummary(result.sessions);
            updateSessionsList(result.sessions);
            updateSessionSelector(result.sessions);
            updateSimulationStats(result.sessions);
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

function updateSessionsSummary(sessions) {
    const summary = {
        total: sessions.length,
        running: sessions.filter(s => s.status === 'running').length,
        stopped: sessions.filter(s => s.status === 'stopped').length,
        error: sessions.filter(s => s.status === 'error').length
    };
    
    const summaryHTML = `
        <div class="summary-card">
            <h3>${summary.total}</h3>
            <p>Total Sessions</p>
        </div>
        <div class="summary-card" style="background: linear-gradient(135deg, #27ae60, #2ecc71);">
            <h3>${summary.running}</h3>
            <p>Running</p>
        </div>
        <div class="summary-card" style="background: linear-gradient(135deg, #e74c3c, #c0392b);">
            <h3>${summary.stopped}</h3>
            <p>Stopped</p>
        </div>
        <div class="summary-card" style="background: linear-gradient(135deg, #f39c12, #e67e22);">
            <h3>${summary.error}</h3>
            <p>Errors</p>
        </div>
    `;
    
    document.getElementById('sessionsSummary').innerHTML = summaryHTML;
}

function updateSessionsList(sessions) {
    const container = document.getElementById('sessionsContainer');
    
    if (sessions.length === 0) {
        container.innerHTML = '<p>No active sessions. Go to configuration to start sessions.</p>';
        return;
    }
    
    const sessionsHTML = sessions.map(session => `
        <div class="session-item">
            <div class="session-header">
                <span class="session-id">${session.id}</span>
                <span class="session-status status-${session.status}">${session.status.toUpperCase()}</span>
            </div>
            <div class="session-details">
                <div class="session-detail">
                    <strong>Start Time:</strong> ${new Date(session.startTime).toLocaleString()}
                </div>
                <div class="session-detail">
                    <strong>Device Type:</strong> ${session.config.deviceType}
                </div>
                <div class="session-detail">
                    <strong>Profiles:</strong> ${session.config.profileCount}
                </div>
                <div class="session-detail">
                    <strong>Proxy Type:</strong> ${session.config.proxyType || 'web'}
                </div>
                <div class="session-detail">
                    <strong>Current Step:</strong> ${session.currentStep || 'Not started'}
                </div>
                ${session.config.isAutoLoop ? `
                <div class="session-detail" style="border-left-color: #f39c12;">
                    <strong>Auto-Loop:</strong> 🔄 Enabled (${session.restartCount || 0}/${session.maxRestarts || 0})
                </div>
                ` : ''}
            </div>
            <div class="session-actions">
                <button onclick="selectSession('${session.id}')">📋 View Logs</button>
                <button onclick="stopSession('${session.id}')">⏹️ Stop</button>
                ${session.config.isAutoLoop ? `
                <button onclick="toggleAutoLoop('${session.id}')">🔄 Auto: ON</button>
                ` : ''}
            </div>
        </div>
    `).join('');
    
    container.innerHTML = sessionsHTML;
}

function updateSessionSelector(sessions) {
    const selector = document.getElementById('sessionSelector');
    const currentValue = selector.value;
    
    selector.innerHTML = '<option value="">Pilih session untuk melihat logs...</option>' +
        sessions.map(session => 
            `<option value="${session.id}" ${session.id === currentValue ? 'selected' : ''}>
                ${session.id} (${session.status}) - ${session.config.deviceType}
            </option>`
        ).join('');
    
    if (currentSessionId && !sessions.find(s => s.id === currentSessionId)) {
        currentSessionId = null;
    }
}

function updateSimulationStats(sessions) {
    const runningSessions = sessions.filter(s => s.status === 'running');
    
    if (runningSessions.length > 0) {
        // Update device type display
        const currentSession = runningSessions[0];
        document.getElementById('currentDevice').textContent = currentSession.config.deviceType;
        
        // Update activity type based on current step
        const currentStep = currentSession.currentStep || '';
        let activityType = 'Idle';
        
        if (currentStep.includes('READING')) {
            activityType = '📖 Reading Simulation';
        } else if (currentStep.includes('SCROLL')) {
            activityType = '🖱️ Scrolling';
        } else if (currentStep.includes('CLICK')) {
            activityType = '👆 Clicking';
        } else if (currentStep.includes('ADS')) {
            activityType = '📢 Handling Ads';
        } else if (currentStep.includes('NAVIGATION')) {
            activityType = '🧭 Navigating';
        }
        
        document.getElementById('currentActivity').textContent = activityType;
        
        // Update scroll progress (simulasi)
        const scrollProgress = document.getElementById('scrollProgress');
        const scrollPercent = document.getElementById('scrollPercent');
        const progress = Math.floor(Math.random() * 100);
        scrollProgress.style.width = `${progress}%`;
        scrollPercent.textContent = `${progress}%`;
    } else {
        document.getElementById('currentDevice').textContent = 'Unknown';
        document.getElementById('currentActivity').textContent = 'Idle';
        document.getElementById('scrollProgress').style.width = '0%';
        document.getElementById('scrollPercent').textContent = '0%';
    }
}

async function selectSession(sessionId) {
    currentSessionId = sessionId;
    document.getElementById('sessionSelector').value = sessionId;
    await loadLogs(sessionId);
}

async function loadLogs(sessionId) {
    if (!sessionId) return;
    
    try {
        const response = await fetch(`/api/session-logs/${sessionId}`);
        const result = await response.json();
        
        if (result.success) {
            displayLogs(result.logs);
            updateSimulationActivityFromLogs(result.logs);
        }
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

function displayLogs(logs) {
    const container = document.getElementById('logContainer');
    
    if (logs.length === 0) {
        container.innerHTML = '<p>No logs available for this session.</p>';
        return;
    }
    
    const logsHTML = logs.slice(-100).map(log => {
        const logClass = log.step.includes('ERROR') ? 'log-error' : 
                        log.step.includes('WARNING') ? 'log-warning' :
                        log.step.includes('COMPLETE') ? 'log-success' :
                        log.step.includes('READING') || log.step.includes('SCROLL') ? 'log-info' : '';
        
        // Icon berdasarkan jenis log
        let icon = '✅';
        if (log.step.includes('ERROR')) icon = '❌';
        else if (log.step.includes('WARNING')) icon = '⚠️';
        else if (log.step.includes('READING')) icon = '📖';
        else if (log.step.includes('SCROLL')) icon = '🖱️';
        else if (log.step.includes('CLICK')) icon = '👆';
        else if (log.step.includes('MOUSE') || log.step.includes('TOUCH')) icon = '🎯';
        else if (log.step.includes('ADS')) icon = '📢';
        
        return `
            <div class="log-entry ${logClass}">
                <span class="log-timestamp">[${log.timestamp}]</span>
                <span class="log-step">${icon} ${log.step}</span>
                <span class="log-message">${log.message}</span>
            </div>
        `;
    }).join('');
    
    container.innerHTML = logsHTML;
    container.scrollTop = container.scrollHeight;
}

function updateSimulationActivityFromLogs(logs) {
    const recentLogs = logs.slice(-10).reverse();
    const activityContainer = document.getElementById('simulationActivity');
    
    let activityHTML = '';
    
    for (const log of recentLogs) {
        if (log.step.includes('READING') || log.step.includes('SCROLL') || 
            log.step.includes('MOUSE') || log.step.includes('TOUCH') ||
            log.step.includes('CLICK')) {
            
            let activityIcon = '⚡';
            let activityText = log.message;
            
            if (log.step.includes('READING')) {
                activityIcon = '📖';
                activityText = `Membaca: ${log.message}`;
            } else if (log.step.includes('SCROLL')) {
                activityIcon = '🖱️';
                // Extract scroll position from message
                const scrollMatch = log.message.match(/Scroll to (\d+)px/);
                if (scrollMatch) {
                    activityText = `Scroll ke posisi: ${scrollMatch[1]}px`;
                } else {
                    activityText = log.message;
                }
            } else if (log.step.includes('MOUSE')) {
                activityIcon = '🎯';
                activityText = `Gerakan mouse: ${log.message}`;
            } else if (log.step.includes('TOUCH')) {
                activityIcon = '👆';
                activityText = `Sentuhan: ${log.message}`;
            } else if (log.step.includes('CLICK')) {
                activityIcon = '🔗';
                activityText = `Klik: ${log.message}`;
            }
            
            activityHTML += `<div>${activityIcon} ${activityText}</div>`;
        }
    }
    
    if (activityHTML === '') {
        activityHTML = '<div>🔄 Menunggu aktivitas simulasi...</div>';
    }
    
    activityContainer.innerHTML = activityHTML;
    activityContainer.scrollTop = activityContainer.scrollHeight;
}

function updateSimulationActivity() {
    // Update global scroll progress bar
    const progressBar = document.getElementById('globalScrollProgress');
    const randomProgress = Math.floor(Math.random() * 100);
    progressBar.style.width = `${randomProgress}%`;
    
    // Add random simulation events
    if (Math.random() < 0.3) {
        const events = [
            '🎯 Mouse movement simulated',
            '👆 Touch interaction generated',
            '📖 Reading pause detected',
            '🖱️ Scroll behavior updated',
            '🔍 Element highlight active',
            '⚡ Micro-interaction completed'
        ];
        
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        addSimulationEvent(randomEvent);
    }
}

function addSimulationEvent(event) {
    simulationActivityLog.unshift({
        timestamp: new Date().toLocaleTimeString(),
        event: event
    });
    
    // Keep only last 10 events
    if (simulationActivityLog.length > 10) {
        simulationActivityLog = simulationActivityLog.slice(0, 10);
    }
    
    const activityContainer = document.getElementById('simulationActivity');
    const activityHTML = simulationActivityLog.map(item => 
        `<div>🕒 [${item.timestamp}] ${item.event}</div>`
    ).join('');
    
    activityContainer.innerHTML = activityHTML;
}

async function stopSession(sessionId) {
    try {
        const response = await fetch(`/api/stop-session/${sessionId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        if (result.success) {
            alert('Session stopped successfully');
            loadSessions();
        }
    } catch (error) {
        alert('Error stopping session: ' + error.message);
    }
}

async function stopAllSessions() {
    if (!confirm('Are you sure you want to stop ALL sessions?')) return;
    
    try {
        const response = await fetch('/api/stop-all-sessions', {
            method: 'POST'
        });
        
        const result = await response.json();
        if (result.success) {
            alert('All sessions stopped');
            loadSessions();
        }
    } catch (error) {
        alert('Error stopping sessions: ' + error.message);
    }
}

async function clearAllSessions() {
    if (!confirm('Are you sure you want to clear ALL sessions and logs?')) return;
    
    try {
        const response = await fetch('/api/clear-sessions', {
            method: 'POST'
        });
        
        const result = await response.json();
        if (result.success) {
            alert('All sessions cleared');
            loadSessions();
            document.getElementById('logContainer').innerHTML = '<p>Logs cleared.</p>';
            document.getElementById('simulationActivity').innerHTML = '<div>🔄 Menunggu aktivitas simulasi...</div>';
            simulationActivityLog = [];
        }
    } catch (error) {
        alert('Error clearing sessions: ' + error.message);
    }
}

function refreshLogs() {
    if (currentSessionId) {
        loadLogs(currentSessionId);
    }
}

function clearLogs() {
    document.getElementById('logContainer').innerHTML = '<p>Logs cleared from view.</p>';
}

function goToConfig() {
    window.location.href = '/';
}

async function toggleAutoLoop(sessionId) {
    if (!confirm('Toggle auto-loop for this session?')) return;
    
    try {
        // Implement toggle auto-loop logic here
        alert('Auto-loop toggle feature coming soon');
    } catch (error) {
        alert('Error toggling auto-loop: ' + error.message);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case 'r':
                e.preventDefault();
                refreshLogs();
                break;
            case 'm':
                e.preventDefault();
                goToConfig();
                break;
            case 'c':
                e.preventDefault();
                clearLogs();
                break;
        }
    }
});