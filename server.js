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

// Auto-looping configuration
const AUTO_LOOP_CONFIG = {
  enabled: process.env.AUTO_LOOP === 'true' || false,
  interval: parseInt(process.env.LOOP_INTERVAL) || 30 * 60 * 1000,
  maxSessions: parseInt(process.env.MAX_SESSIONS) || 10,
  targetUrl: process.env.DEFAULT_TARGET_URL || 'https://cryptoajah.blogspot.com'
};

// Global variable untuk auto-loop interval
let autoLoopInterval = null;

// Start auto-looping if enabled
if (AUTO_LOOP_CONFIG.enabled) {
  console.log('🔄 AUTO-LOOP: System starting with auto-looping enabled');
  startAutoLooping();
}

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
          proxyList: process.env.DEFAULT_PROXIES ? 
            process.env.DEFAULT_PROXIES.split(',').map(p => p.trim()).filter(p => p) : [],
          targetUrl: AUTO_LOOP_CONFIG.targetUrl,
          deviceType: Math.random() > 0.5 ? 'desktop' : 'mobile',
          isAutoLoop: true,
          maxRestarts: 5,
          proxyType: 'web'
        };

        await botManager.startNewSession(sessionConfig);
        
        console.log(`✅ AUTO-LOOP: Session started successfully`);
      } else {
        console.log(`⏸️ AUTO-LOOP: Maximum sessions reached (${activeSessions.length}/${AUTO_LOOP_CONFIG.maxSessions})`);
      }
    } catch (error) {
      console.error('❌ AUTO-LOOP: Error starting session:', error.message);
    }
  }, AUTO_LOOP_CONFIG.interval);
}

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

        // Validasi khusus untuk web proxy
        if (proxyType === 'web') {
            const webProxies = botManager.proxyHandler.getAllActiveProxies().webProxies;
            if (webProxies.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No active web proxies available. Please refresh proxies first.'
                });
            }
        }

        const sessionConfig = {
            profileCount: parseInt(profiles) || 1,
            proxyList: proxies ? proxies.split('\n')
                .map(p => p.trim())
                .filter(p => p && p.includes(':')) : [],
            targetUrl: targetUrl,
            deviceType: deviceType || 'desktop',
            isAutoLoop: autoLoop || false,
            maxRestarts: autoLoop ? 5 : 0,
            proxyType: proxyType
        };

        console.log(`Starting session with ${proxyType} proxy to ${targetUrl}`);

        const sessionId = await botManager.startNewSession(sessionConfig);
        
        res.json({ 
            success: true, 
            sessionId,
            message: `Session started with ${proxyType} proxy`
        });
    } catch (error) {
        console.error('Error starting session:', error);
        
        let errorMessage = error.message;
        let statusCode = 500;
        
        if (error.message.includes('No available')) {
            errorMessage = `No available ${proxyType} proxies. Try refreshing proxies.`;
            statusCode = 400;
        } else if (error.message.includes('PROXY_FAILURE')) {
            errorMessage = `Proxy connection failed: ${error.message}`;
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
      totalSessions: botManager.getAllSessions().length
    });
  } catch (error) {
    console.error('Error getting auto-loop status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Routes - PROXY MANAGEMENT
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
        '--window-size=1920,1080'
      ],
      ignoreDefaultArgs: ['--disable-extensions'],
      timeout: 60000
    });
    
    const page = await browser.newPage();
    
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(30000);
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    await page.goto('https://example.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 45000 
    });
    
    const title = await page.title();
    await browser.close();
    
    res.json({ 
      success: true, 
      message: 'Puppeteer test successful',
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

// Health check
app.get('/health', (req, res) => {
  const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running');
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    autoLoop: {
      enabled: AUTO_LOOP_CONFIG.enabled,
      activeSessions: activeSessions.length,
      maxSessions: AUTO_LOOP_CONFIG.maxSessions,
      interval: AUTO_LOOP_CONFIG.interval
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
    error: 'Internal server error' 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Puppeteer path: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'default'}`);
  console.log(`🔄 Auto-loop: ${AUTO_LOOP_CONFIG.enabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`⏰ Auto-loop interval: ${AUTO_LOOP_CONFIG.interval/60000} minutes`);
  console.log(`📈 Max sessions: ${AUTO_LOOP_CONFIG.maxSessions}`);
  console.log(`🎯 Target URL: ${AUTO_LOOP_CONFIG.targetUrl}`);
  console.log(`🆕 PROXY ENFORCEMENT: ENABLED`);
  console.log(`🌐 WEB PROXY METHODS: Direct URL & Form Fill`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  if (autoLoopInterval) {
    clearInterval(autoLoopInterval);
  }
  botManager.stopAllSessions();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  if (autoLoopInterval) {
    clearInterval(autoLoopInterval);
  }
  botManager.stopAllSessions();
  process.exit(0);
});
