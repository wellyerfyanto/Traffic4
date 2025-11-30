// public/logs.js - Logs Streaming untuk Real-time Monitoring
const express = require('express');
const router = express.Router();

// Store active SSE connections
const activeConnections = new Map();

router.get('/logs/stream/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Store this connection
    activeConnections.set(sessionId, res);

    // Send initial connection message
    const initialData = {
        type: 'connection',
        message: 'Connected to real-time logs',
        timestamp: new Date().toISOString()
    };
    
    res.write(`data: ${JSON.stringify(initialData)}\n\n`);

    // Send periodic heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
        const heartbeatData = {
            type: 'heartbeat',
            timestamp: new Date().toISOString()
        };
        res.write(`data: ${JSON.stringify(heartbeatData)}\n\n`);
    }, 30000);

    // Cleanup on connection close
    req.on('close', () => {
        clearInterval(heartbeat);
        activeConnections.delete(sessionId);
        console.log(`🔌 SSE connection closed for session: ${sessionId}`);
    });

    req.on('error', (err) => {
        console.error(`❌ SSE connection error for session ${sessionId}:`, err);
        clearInterval(heartbeat);
        activeConnections.delete(sessionId);
    });

    console.log(`🔌 New SSE connection for session: ${sessionId}`);
});

// Function to broadcast logs to all connected clients for a session
function broadcastLog(sessionId, logEntry) {
    const connection = activeConnections.get(sessionId);
    if (connection) {
        try {
            const eventData = {
                type: 'log',
                data: logEntry,
                timestamp: new Date().toISOString()
            };
            connection.write(`data: ${JSON.stringify(eventData)}\n\n`);
        } catch (error) {
            console.error(`❌ Error broadcasting log to session ${sessionId}:`, error);
            activeConnections.delete(sessionId);
        }
    }
}

// Function to broadcast session updates
function broadcastSessionUpdate(sessionId, sessionData) {
    const connection = activeConnections.get(sessionId);
    if (connection) {
        try {
            const eventData = {
                type: 'session_update',
                data: sessionData,
                timestamp: new Date().toISOString()
            };
            connection.write(`data: ${JSON.stringify(eventData)}\n\n`);
        } catch (error) {
            console.error(`❌ Error broadcasting session update to session ${sessionId}:`, error);
            activeConnections.delete(sessionId);
        }
    }
}

// Function to broadcast simulation activity
function broadcastSimulationActivity(sessionId, activityData) {
    const connection = activeConnections.get(sessionId);
    if (connection) {
        try {
            const eventData = {
                type: 'simulation_activity',
                data: activityData,
                timestamp: new Date().toISOString()
            };
            connection.write(`data: ${JSON.stringify(eventData)}\n\n`);
        } catch (error) {
            console.error(`❌ Error broadcasting simulation activity to session ${sessionId}:`, error);
            activeConnections.delete(sessionId);
        }
    }
}

// Function to get connection stats
function getConnectionStats() {
    return {
        totalConnections: activeConnections.size,
        activeSessions: Array.from(activeConnections.keys())
    };
}

// Cleanup inactive connections
setInterval(() => {
    const now = Date.now();
    // We rely on the request close event for cleanup
    // This is just a backup cleanup
    console.log(`📊 Active SSE connections: ${activeConnections.size}`);
}, 60000);

module.exports = {
    router,
    broadcastLog,
    broadcastSessionUpdate,
    broadcastSimulationActivity,
    getConnectionStats
};