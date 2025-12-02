[file name]: server.js
[file content begin]
const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'github-traffic-bot-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Import bot modules
const TrafficGenerator = require('./bot/trafficGenerator');
const botManager = new TrafficGenerator();

// Enhanced error handling untuk Puppeteer
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
});

// Auto-looping configuration dengan retry mechanism - TAMBAHKAN HEALTH CHECK
const AUTO_LOOP_CONFIG = {
  enabled: process.env.AUTO_LOOP === 'true' || false,
  interval: parseInt(process.env.LOOP_INTERVAL) || 30 * 60 * 1000, // 30 menit default
  maxSessions: parseInt(process.env.MAX_SESSIONS) || 5, // Kurangi dari 10 ke 5 untuk stabilitas
  targetUrl: process.env.DEFAULT_TARGET_URL || 'https://cryptoajah.blogspot.com',
  retryCount: 0,
  maxRetries: 3, // Kurangi dari 5 ke 3
  healthCheckInterval: 60000, // Check kesehatan setiap 1 menit
  maxSessionDuration: 10 * 60 * 1000 // 10 menit maksimal per session
};

let autoLoopInterval = null;
let sessionHealthCheckInterval = null;

// Enhanced auto-loop dengan exponential backoff
function startAutoLooping() {
  if (autoLoopInterval) {
    clearInterval(autoLoopInterval);
  }

  autoLoopInterval = setInterval(async () => {
    try {
      const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running');
      
      if (activeSessions.length < AUTO_LOOP_CONFIG.maxSessions) {
        console.log(`🔄 AUTO-LOOP: Starting new automated session (${activeSessions.length + 1}/${AUTO_LOOP_CONFIG.maxSessions})`);
        
        const sessionConfig = {
          profileCount: 1,
          targetUrl: AUTO_LOOP_CONFIG.targetUrl,
          deviceType: Math.random() > 0.5 ? 'desktop' : 'mobile',
          isAutoLoop: true,
          maxRestarts: 3,
          proxyType: 'web'
        };

        await botManager.startNewSession(sessionConfig);
        
        AUTO_LOOP_CONFIG.retryCount = 0;
        console.log(`✅ AUTO-LOOP: Session started successfully`);
      }
    } catch (error) {
      console.error('❌ AUTO-LOOP: Error starting session:', error.message);
      AUTO_LOOP_CONFIG.retryCount++;
      
      if (AUTO_LOOP_CONFIG.retryCount >= AUTO_LOOP_CONFIG.maxRetries) {
        console.error('🚨 AUTO-LOOP: Max retries reached, pausing auto-loop');
        AUTO_LOOP_CONFIG.enabled = false;
        clearInterval(autoLoopInterval);
      }
    }
  }, AUTO_LOOP_CONFIG.interval);
}

// TAMBAHKAN: Session Health Check System
function startSessionHealthCheck() {
  if (sessionHealthCheckInterval) {
    clearInterval(sessionHealthCheckInterval);
  }

  sessionHealthCheckInterval = setInterval(() => {
    try {
      const sessions = botManager.getAllSessions();
      const now = Date.now();
      let cleanedCount = 0;
      
      sessions.forEach(session => {
        if (session.status === 'running') {
          const sessionDuration = now - new Date(session.startTime).getTime();
          
          // Auto-stop session yang berjalan terlalu lama
          if (sessionDuration > AUTO_LOOP_CONFIG.maxSessionDuration) {
            console.log(`🕒 HEALTH CHECK: Stopping session ${session.id} (exceeded ${AUTO_LOOP_CONFIG.maxSessionDuration/60000} minutes)`);
            botManager.stopSession(session.id);
            cleanedCount++;
          }
          
          // Log session yang berjalan lama
          if (sessionDuration > 5 * 60 * 1000) {
            console.log(`⏱️ HEALTH CHECK: Session ${session.id} running for ${Math.round(sessionDuration/60000)}m`);
          }
        }
      });
      
      if (cleanedCount > 0) {
        console.log(`🧹 HEALTH CHECK: Cleaned ${cleanedCount} old sessions`);
      }
      
    } catch (error) {
      console.error('❌ HEALTH CHECK: Error:', error.message);
    }
  }, AUTO_LOOP_CONFIG.healthCheckInterval);
}

// Start systems if enabled
if (AUTO_LOOP_CONFIG.enabled) {
  console.log('🔄 AUTO-LOOP: System starting with auto-looping enabled');
  startAutoLooping();
}

// Start health check system
console.log('🏥 HEALTH CHECK: Starting session health monitoring');
startSessionHealthCheck();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/monitoring', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'monitoring.html'));
});

// API Routes - SESSION MANAGEMENT
app.post('/api/start-session', async (req, res) => {
    try {
        const { profiles, proxies, targetUrl, deviceType, autoLoop, proxyType } = req.body;
        
        if (!targetUrl) {
            return res.status(400).json({
                success: false,
                error: 'Target URL is required'
            });
        }

        if (!proxyType) {
            return res.status(400).json({
                success: false,
                error: 'Proxy type is REQUIRED. Choose web, fresh, or vpn.'
            });
        }

        const sessionConfig = {
            profileCount: parseInt(profiles) || 1,
            proxyList: proxies ? proxies.split('\n')
                .map(p => p.trim())
                .filter(p => p && p.includes(':')) : [],
            targetUrl: targetUrl,
            deviceType: deviceType || 'desktop',
            isAutoLoop: autoLoop || false,
            maxRestarts: autoLoop ? 3 : 0,
            proxyType: proxyType
        };

        console.log(`🚀 Starting session with ${proxyType} proxy to ${targetUrl}`);

        const sessionId = await botManager.startNewSession(sessionConfig);
        
        res.json({ 
            success: true, 
            sessionId,
            message: `Session started with ${proxyType} proxy`
        });
    } catch (error) {
        console.error('❌ Error starting session:', error.message);
        
        let errorMessage = error.message;
        let statusCode = 500;
        
        if (error.message.includes('No available')) {
            errorMessage = `No available ${proxyType} proxies. Try refreshing proxies.`;
            statusCode = 400;
        }
        
        res.status(statusCode).json({ 
            success: false, 
            error: errorMessage 
        });
    }
});

app.get('/api/session-logs/:sessionId', (req, res) => {
  try {
    const logs = botManager.getSessionLogs(req.params.sessionId);
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Error getting session logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/all-sessions', (req, res) => {
  try {
    const sessions = botManager.getAllSessions();
    res.json({ success: true, sessions });
  } catch (error) {
    console.error('Error getting all sessions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/stop-session/:sessionId', (req, res) => {
  try {
    botManager.stopSession(req.params.sessionId);
    res.json({ success: true, message: 'Session stopped' });
  } catch (error) {
    console.error('Error stopping session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/stop-all-sessions', (req, res) => {
  try {
    botManager.stopAllSessions();
    res.json({ success: true, message: 'All sessions stopped' });
  } catch (error) {
    console.error('Error stopping all sessions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/clear-sessions', (req, res) => {
  try {
    botManager.clearAllSessions();
    res.json({ success: true, message: 'All sessions cleared' });
  } catch (error) {
    console.error('Error clearing sessions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Routes - AUTO-LOOP MANAGEMENT
app.post('/api/auto-loop/start', (req, res) => {
  try {
    const { interval, maxSessions, targetUrl } = req.body;
    
    AUTO_LOOP_CONFIG.enabled = true;
    AUTO_LOOP_CONFIG.interval = interval || AUTO_LOOP_CONFIG.interval;
    AUTO_LOOP_CONFIG.maxSessions = maxSessions || AUTO_LOOP_CONFIG.maxSessions;
    AUTO_LOOP_CONFIG.targetUrl = targetUrl || AUTO_LOOP_CONFIG.targetUrl;
    
    startAutoLooping();
    
    res.json({
      success: true,
      message: `Auto-looping started with ${AUTO_LOOP_CONFIG.interval/60000} minute intervals`,
      config: AUTO_LOOP_CONFIG
    });
  } catch (error) {
    console.error('Error starting auto-loop:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auto-loop/stop', (req, res) => {
  try {
    AUTO_LOOP_CONFIG.enabled = false;
    if (autoLoopInterval) {
      clearInterval(autoLoopInterval);
      autoLoopInterval = null;
    }
    
    res.json({
      success: true,
      message: 'Auto-looping stopped'
    });
  } catch (error) {
    console.error('Error stopping auto-loop:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/auto-loop/status', (req, res) => {
  try {
    const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running');
    
    res.json({
      success: true,
      config: AUTO_LOOP_CONFIG,
      activeSessions: activeSessions.length,
      totalSessions: botManager.getAllSessions().length,
      healthCheck: {
        enabled: true,
        interval: AUTO_LOOP_CONFIG.healthCheckInterval,
        maxSessionDuration: AUTO_LOOP_CONFIG.maxSessionDuration
      }
    });
  } catch (error) {
    console.error('Error getting auto-loop status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Routes - PROXY MANAGEMENT (DIPERBARUI)
app.get('/api/proxies/status', (req, res) => {
  try {
    const proxies = botManager.proxyHandler.getAllActiveProxies();
    res.json({ 
      success: true, 
      ...proxies 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ ENDPOINT BARU: Detail Proxy dengan Usage Tracking
app.get('/api/proxies/detailed', (req, res) => {
  try {
    const allProxies = botManager.proxyHandler.getAllActiveProxies();
    const stats = botManager.proxyHandler.getStats();
    
    res.json({ 
      success: true, 
      ...allProxies,
      detailedStats: stats,
      sessionUsage: Array.from(botManager.proxyHandler.usedProxies.entries()).map(([sessionId, proxies]) => ({
        sessionId,
        proxiesUsed: Array.from(proxies).slice(0, 5)
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/proxies/refresh', async (req, res) => {
  try {
    await botManager.proxyHandler.updateProxies();
    const proxies = botManager.proxyHandler.getAllActiveProxies();
    
    res.json({ 
      success: true, 
      message: 'Proxies refreshed successfully',
      ...proxies
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ ENDPOINT BARU: Get Proxy Stats dengan Detail
app.get('/api/proxies/stats', (req, res) => {
  try {
    const allProxies = botManager.proxyHandler.getAllActiveProxies();
    const stats = botManager.proxyHandler.getStats();
    
    const activeFreshProxies = allProxies.freshProxies || [];
    const proxyTypes = {};
    
    activeFreshProxies.forEach(proxy => {
      const type = proxy.protocol || proxy.type || 'unknown';
      if (!proxyTypes[type]) proxyTypes[type] = 0;
      proxyTypes[type]++;
    });
    
    res.json({
      success: true,
      stats: stats,
      proxyTypes: proxyTypes,
      activeFreshProxies: activeFreshProxies.map(p => ({
        address: `${p.ip}:${p.port}`,
        type: p.protocol || p.type,
        country: p.country || 'unknown',
        source: p.source || 'unknown'
      })).slice(0, 20) // Batasi 20 pertama
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ ENDPOINT BARU: Manual Add Proxy
app.post('/api/proxies/add-manual', async (req, res) => {
  try {
    const { proxyString } = req.body;
    
    if (!proxyString) {
      return res.status(400).json({
        success: false,
        error: 'Proxy string is required (format: ip:port)'
      });
    }
    
    const result = botManager.proxyHandler.addManualProxy(proxyString);
    
    if (result) {
      const proxies = botManager.proxyHandler.getAllActiveProxies();
      res.json({
        success: true,
        message: 'Manual proxy added successfully',
        ...proxies
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid proxy format. Use: ip:port'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ ENDPOINT BARU: Clear All Proxies
app.post('/api/proxies/clear', async (req, res) => {
  try {
    botManager.proxyHandler.clearProxies();
    
    res.json({
      success: true,
      message: 'All proxies cleared'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Routes - SYSTEM MANAGEMENT
app.get('/api/test-puppeteer', async (req, res) => {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ 
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=site-per-process',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--window-size=1920,1080',
        '--disable-features=AdBlock' // Pastikan tidak memblokir iklan
      ],
      ignoreDefaultArgs: ['--disable-extensions'],
      timeout: 60000
    });
    
    const page = await browser.newPage();
    
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(30000);
    
    // TIDAK ADA REQUEST INTERCEPTION - Biarkan semua iklan dimuat
    // Ini penting untuk impressions iklan
    
    await page.goto('https://example.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 45000 
    });
    
    const title = await page.title();
    await browser.close();
    
    res.json({ 
      success: true, 
      message: 'Puppeteer test successful - No ad blocking enabled',
      title: title
    });
  } catch (error) {
    console.error('Puppeteer test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      chromePath: process.env.PUPPETEER_EXECUTABLE_PATH 
    });
  }
});

// ✅ ENDPOINT BARU: Test Proxy Connection
app.post('/api/test-proxy', async (req, res) => {
  try {
    const { proxyString } = req.body;
    
    if (!proxyString) {
      return res.status(400).json({
        success: false,
        error: 'Proxy string is required (format: ip:port)'
      });
    }
    
    const isWorking = await botManager.proxyHandler.testProxyConnection(proxyString, 'http');
    
    res.json({
      success: true,
      working: isWorking,
      message: isWorking ? 'Proxy is working' : 'Proxy is not working',
      proxy: proxyString
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Routes - SYSTEM HEALTH
app.get('/api/system/health', (req, res) => {
  try {
    const sessions = botManager.getAllSessions();
    const activeSessions = sessions.filter(s => s.status === 'running');
    const memoryUsage = process.memoryUsage();
    
    // Get proxy stats
    const proxyStats = botManager.proxyHandler.getStats();
    
    res.json({
      success: true,
      system: {
        uptime: process.uptime(),
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
        },
        nodeVersion: process.version,
        platform: process.platform
      },
      sessions: {
        total: sessions.length,
        running: activeSessions.length,
        stopped: sessions.filter(s => s.status === 'stopped').length,
        error: sessions.filter(s => s.status === 'error').length
      },
      proxies: proxyStats,
      autoLoop: AUTO_LOOP_CONFIG,
      healthCheck: {
        enabled: true,
        lastCheck: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ ENDPOINT BARU: Get Current Proxy Usage per Session
app.get('/api/sessions/proxy-info', (req, res) => {
  try {
    const sessions = botManager.getAllSessions();
    
    const sessionProxyInfo = sessions.map(session => ({
      sessionId: session.id,
      status: session.status,
      proxyType: session.config?.proxyType || 'unknown',
      proxyInfo: session.proxyInfo ? {
        type: session.proxyInfo.type || session.proxyInfo.protocol || 'unknown',
        address: session.proxyInfo.ip ? 
          `${session.proxyInfo.ip}:${session.proxyInfo.port}` : 
          session.proxyInfo.url || 'unknown'
      } : null,
      deviceType: session.config?.deviceType || 'desktop',
      startTime: session.startTime
    }));
    
    res.json({
      success: true,
      sessions: sessionProxyInfo,
      total: sessions.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running');
  const memoryUsage = process.memoryUsage();
  const proxyStats = botManager.proxyHandler.getStats();
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    system: {
      uptime: Math.round(process.uptime()) + 's',
      memory: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
    },
    sessions: {
      total: botManager.getAllSessions().length,
      running: activeSessions.length
    },
    proxies: {
      total: proxyStats.total,
      fresh: proxyStats.fresh,
      web: proxyStats.web,
      vpn: proxyStats.vpn
    },
    autoLoop: {
      enabled: AUTO_LOOP_CONFIG.enabled,
      activeSessions: activeSessions.length,
      maxSessions: AUTO_LOOP_CONFIG.maxSessions,
      interval: AUTO_LOOP_CONFIG.interval
    },
    healthCheck: {
      enabled: true,
      maxSessionDuration: AUTO_LOOP_CONFIG.maxSessionDuration
    }
  });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: `API endpoint not found: ${req.method} ${req.originalUrl}` 
  });
});

app.use((req, res) => {
  if (req.url.startsWith('/api/')) {
    res.status(404).json({ 
      success: false, 
      error: 'API endpoint not found' 
    });
  } else {
    res.status(404).send(`
      <html>
        <head><title>404 - Page Not Found</title></head>
        <body>
          <h1>404 - Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
          <a href="/">Go to Home Page</a>
        </body>
      </html>
    `);
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`
  🚀 Server running on port ${PORT}
  📊 Environment: ${process.env.NODE_ENV || 'development'}
  🔧 Puppeteer path: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'default'}
  🔄 Auto-loop: ${AUTO_LOOP_CONFIG.enabled ? 'ENABLED' : 'DISABLED'}
  ⏰ Auto-loop interval: ${AUTO_LOOP_CONFIG.interval/60000} minutes
  📈 Max sessions: ${AUTO_LOOP_CONFIG.maxSessions}
  🎯 Target URL: ${AUTO_LOOP_CONFIG.targetUrl}
  🏥 Health Check: ENABLED (every ${AUTO_LOOP_CONFIG.healthCheckInterval/1000}s)
  ⏱️ Max session duration: ${AUTO_LOOP_CONFIG.maxSessionDuration/60000} minutes
  
  📋 API Endpoints Available:
  • GET  /api/all-sessions           - Get all sessions
  • GET  /api/proxies/status         - Get proxy status
  • GET  /api/proxies/detailed       - Get detailed proxy info
  • GET  /api/proxies/stats          - Get proxy statistics
  • GET  /api/sessions/proxy-info    - Get proxy usage per session
  • POST /api/proxies/refresh        - Refresh all proxies
  • POST /api/proxies/add-manual     - Add manual proxy
  • POST /api/test-proxy             - Test proxy connection
  • GET  /api/system/health          - System health check
  • GET  /health                     - Quick health check
  
  ⚠️  IMPORTANT: Ad blocking is DISABLED for ad impressions
  `);
});

// Handle graceful shutdown
function gracefulShutdown(signal) {
  return () => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    // Stop auto-loop
    if (autoLoopInterval) {
      clearInterval(autoLoopInterval);
      autoLoopInterval = null;
    }
    
    // Stop health check
    if (sessionHealthCheckInterval) {
      clearInterval(sessionHealthCheckInterval);
      sessionHealthCheckInterval = null;
    }
    
    // Stop all sessions
    botManager.stopAllSessions();
    
    // Close server
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('⏰ Could not close connections in time, forcing shutdown');
      process.exit(1);
    }, 10000);
  };
}

process.on('SIGINT', gracefulShutdown('SIGINT'));
process.on('SIGTERM', gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('🚨 UNCAUGHT EXCEPTION:', err);
  
  // Attempt graceful shutdown
  gracefulShutdown('UNCAUGHT_EXCEPTION')();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});
[file content end]