// bot/sessionManager.js - Session Management
class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.sessionLogs = new Map();
        this.sessionCount = 0;
    }

    generateSessionId() {
        this.sessionCount++;
        return `session_${Date.now()}_${this.sessionCount}_${Math.random().toString(36).substr(2, 9)}`;
    }

    createSession(config) {
        const sessionId = this.generateSessionId();
        
        const session = {
            id: sessionId,
            config: config,
            status: 'running',
            logs: [],
            startTime: new Date(),
            currentStep: 0,
            deviceType: config.deviceType || 'desktop',
            proxyType: config.proxyType || 'web',
            isAutoLoop: config.isAutoLoop || false,
            restartCount: 0,
            maxRestarts: config.maxRestarts || 3
        };
        
        this.sessions.set(sessionId, session);
        this.sessionLogs.set(sessionId, []);
        
        this.log(sessionId, 'SESSION_CREATED', `Session created with config: ${JSON.stringify({
            deviceType: config.deviceType,
            proxyType: config.proxyType,
            profiles: config.profileCount,
            target: config.targetUrl
        })}`);
        
        return session;
    }

    updateSession(sessionId, updates) {
        if (this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId);
            Object.assign(session, updates);
            this.sessions.set(sessionId, session);
            
            if (updates.status) {
                this.log(sessionId, 'SESSION_UPDATED', `Status changed to: ${updates.status}`);
            }
            if (updates.currentStep) {
                this.log(sessionId, 'STEP_UPDATED', `Current step: ${updates.currentStep}`);
            }
        }
    }

    stopSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId);
            session.status = 'stopped';
            session.endTime = new Date();
            this.sessions.set(sessionId, session);
            
            this.log(sessionId, 'SESSION_STOPPED', 'Session stopped manually');
        }
    }

    pauseSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId);
            session.status = 'paused';
            this.sessions.set(sessionId, session);
            
            this.log(sessionId, 'SESSION_PAUSED', 'Session paused');
        }
    }

    resumeSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId);
            session.status = 'running';
            this.sessions.set(sessionId, session);
            
            this.log(sessionId, 'SESSION_RESUMED', 'Session resumed');
        }
    }

    log(sessionId, step, message) {
        const timestamp = new Date().toLocaleString('id-ID');
        const logEntry = { timestamp, step, message };
        
        if (this.sessionLogs.has(sessionId)) {
            const logs = this.sessionLogs.get(sessionId);
            logs.push(logEntry);
            
            // Batasi log history untuk menghindari memory overflow
            if (logs.length > 1000) {
                logs.splice(0, 200); // Hapus 200 log tertua
            }
        }
        
        // Juga log ke console
        const logMessage = `[${sessionId}] ${step}: ${message}`;
        console.log(logMessage);
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    getSessionLogs(sessionId) {
        return this.sessionLogs.get(sessionId) || [];
    }

    getAllSessions() {
        const sessions = [];
        for (const [sessionId, session] of this.sessions) {
            sessions.push({
                id: sessionId,
                status: session.status,
                startTime: session.startTime,
                endTime: session.endTime,
                currentStep: session.currentStep,
                config: session.config,
                deviceType: session.deviceType,
                proxyType: session.proxyType,
                isAutoLoop: session.isAutoLoop,
                restartCount: session.restartCount,
                maxRestarts: session.maxRestarts,
                duration: session.endTime ? 
                    session.endTime - session.startTime : 
                    Date.now() - session.startTime
            });
        }
        return sessions;
    }

    getActiveSessions() {
        return this.getAllSessions().filter(s => s.status === 'running');
    }

    getStoppedSessions() {
        return this.getAllSessions().filter(s => s.status === 'stopped');
    }

    getSessionStats() {
        const allSessions = this.getAllSessions();
        const activeSessions = this.getActiveSessions();
        const stoppedSessions = this.getStoppedSessions();
        
        return {
            total: allSessions.length,
            active: activeSessions.length,
            stopped: stoppedSessions.length,
            byDeviceType: this.groupByDeviceType(allSessions),
            byProxyType: this.groupByProxyType(allSessions),
            byStatus: this.groupByStatus(allSessions)
        };
    }

    groupByDeviceType(sessions) {
        const groups = {};
        sessions.forEach(session => {
            const type = session.deviceType || 'desktop';
            if (!groups[type]) groups[type] = 0;
            groups[type]++;
        });
        return groups;
    }

    groupByProxyType(sessions) {
        const groups = {};
        sessions.forEach(session => {
            const type = session.proxyType || 'web';
            if (!groups[type]) groups[type] = 0;
            groups[type]++;
        });
        return groups;
    }

    groupByStatus(sessions) {
        const groups = {};
        sessions.forEach(session => {
            const status = session.status;
            if (!groups[status]) groups[status] = 0;
            groups[status]++;
        });
        return groups;
    }

    clearSessionLogs(sessionId) {
        if (this.sessionLogs.has(sessionId)) {
            this.sessionLogs.set(sessionId, []);
            this.log(sessionId, 'LOGS_CLEARED', 'Session logs cleared');
        }
    }

    clearAllSessions() {
        const sessionCount = this.sessions.size;
        const logCount = this.sessionLogs.size;
        
        this.sessions.clear();
        this.sessionLogs.clear();
        this.sessionCount = 0;
        
        console.log(`🧹 Cleared all sessions: ${sessionCount} sessions, ${logCount} logs`);
    }

    cleanupOldSessions(maxAgeHours = 24) {
        const now = Date.now();
        const maxAge = maxAgeHours * 60 * 60 * 1000;
        let cleanedCount = 0;
        
        for (const [sessionId, session] of this.sessions) {
            const sessionAge = now - session.startTime.getTime();
            if (sessionAge > maxAge) {
                this.sessions.delete(sessionId);
                this.sessionLogs.delete(sessionId);
                cleanedCount++;
            }
        }
        
        console.log(`🧹 Cleaned up ${cleanedCount} old sessions (older than ${maxAgeHours} hours)`);
        return cleanedCount;
    }

    // Export session data untuk backup
    exportSessionData(sessionId) {
        const session = this.getSession(sessionId);
        const logs = this.getSessionLogs(sessionId);
        
        if (!session) return null;
        
        return {
            session: session,
            logs: logs,
            exportTime: new Date(),
            totalLogs: logs.length
        };
    }

    // Import session data
    importSessionData(sessionData) {
        if (!sessionData || !sessionData.session) {
            throw new Error('Invalid session data format');
        }
        
        const session = sessionData.session;
        this.sessions.set(session.id, session);
        this.sessionLogs.set(session.id, sessionData.logs || []);
        
        this.log(session.id, 'SESSION_IMPORTED', 'Session imported from backup');
        return session.id;
    }
}

module.exports = SessionManager;