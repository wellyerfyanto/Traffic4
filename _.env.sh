# _.env.txt - MODIFIED
NODE_ENV=production
PORT=3000
SESSION_SECRET=your-super-secret-key-here-change-this
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Auto-loop Configuration
AUTO_LOOP=true
LOOP_INTERVAL=1800000
MAX_SESSIONS=5
DEFAULT_TARGET_URL=https://github.com
DEFAULT_PROXIES=

# Security & Proxy Enforcement
ENABLE_HELMET=true
ENABLE_CORS=true
FORCE_PROXY=true
NO_DIRECT_CONNECTION=true