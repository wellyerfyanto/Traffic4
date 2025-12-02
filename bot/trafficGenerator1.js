[file name]: trafficGenerator.js
[file content begin]
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ProxyHandler = require('./proxyHandler');

puppeteer.use(StealthPlugin());

// User Agents terbaru 2025
const MODERN_USER_AGENTS = {
    desktop: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
    ],
    mobile: [
        'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
    ]
};

// Enhanced configuration dengan exponential backoff
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 10000,
  maxDelay: 60000,
  factor: 2
};

class TrafficGenerator {
  constructor() {
    this.activeSessions = new Map();
    this.sessionLogs = new Map();
    this.proxyHandler = new ProxyHandler();
    this.autoRestartEnabled = true;
    
    this.proxyHandler.startAutoUpdate();
  }

  async startNewSession(config) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.log(sessionId, 'SESSION_INIT', 'Initializing new session...');
    
    if (!config.proxyType) {
      throw new Error('Proxy type is REQUIRED. No direct connections allowed.');
    }

    try {
      await this.setupAndTestProxiesForSession(sessionId, config);
    } catch (proxyError) {
      this.log(sessionId, 'PROXY_SETUP_FAILED', `Proxy setup failed: ${proxyError.message}`);
      throw proxyError;
    }

    this.sessionLogs.set(sessionId, []);
    this.activeSessions.set(sessionId, {
      id: sessionId,
      config: config,
      status: 'running',
      startTime: new Date(),
      currentStep: 0,
      isAutoLoop: config.isAutoLoop || false,
      restartCount: 0,
      maxRestarts: config.maxRestarts || 3,
      userAgent: this.getRandomUserAgent(config.deviceType),
      proxyInfo: config.selectedProxy || null,
      retryCount: 0
    });

    this.log(sessionId, 'SESSION_STARTED', 
      `Session started with ${config.profileCount} profiles | Device: ${config.deviceType} | Proxy: ${config.proxyType}`
    );
    
    // Jalankan session
    this.executeSessionWithEnhancedRetry(sessionId, config).catch(error => {
      this.log(sessionId, 'SESSION_ERROR', `Session failed: ${error.message}`);
      this.stopSession(sessionId);
    });

    return sessionId;
  }

  async setupAndTestProxiesForSession(sessionId, config) {
    const proxyType = config.proxyType || 'web';
    
    try {
      const selectedProxy = this.proxyHandler.getProxyByType(proxyType, sessionId);
      
      if (!selectedProxy) {
        throw new Error(`No available ${proxyType} proxies`);
      }

      this.log(sessionId, 'PROXY_SELECTED', 
        `Selected ${proxyType} proxy: ${this.getProxyDisplay(selectedProxy)} - Type: ${selectedProxy.type || selectedProxy.protocol}`
      );
      config.selectedProxy = selectedProxy;

    } catch (error) {
      this.log(sessionId, 'PROXY_ERROR', `Proxy setup failed: ${error.message}`);
      throw new Error(`Cannot start session without working proxy: ${error.message}`);
    }
  }

  getProxyDisplay(proxy) {
    if (proxy.url) return proxy.url;
    if (proxy.ip && proxy.port) return `${proxy.ip}:${proxy.port}`;
    if (proxy.name) return proxy.name;
    return 'Unknown proxy';
  }

  getRandomUserAgent(deviceType) {
    const agents = MODERN_USER_AGENTS[deviceType] || MODERN_USER_AGENTS.desktop;
    return agents[Math.floor(Math.random() * agents.length)];
  }

  async executeSessionWithEnhancedRetry(sessionId, config, retryCount = 0) {
    try {
      await this.executeSession(sessionId, config);
    } catch (error) {
      const shouldRetry = this.shouldRetry(error, retryCount);
      
      if (shouldRetry) {
        const delay = this.calculateRetryDelay(retryCount);
        
        this.log(sessionId, 'RETRY_ATTEMPT', 
          `Attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries} after ${delay/1000}s - ${error.message}`);
        
        if (error.message.includes('proxy') || error.message.includes('Proxy')) {
          this.log(sessionId, 'PROXY_ROTATION', 'Rotating proxy for retry...');
          await this.rotateProxyForSession(sessionId, config);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        await this.executeSessionWithEnhancedRetry(sessionId, config, retryCount + 1);
      } else {
        this.log(sessionId, 'SESSION_FAILED', 
          `Max retries exceeded (${retryCount + 1} attempts): ${error.message}`);
        this.stopSession(sessionId);
      }
    }
  }

  shouldRetry(error, retryCount) {
    if (retryCount >= RETRY_CONFIG.maxRetries) {
      return false;
    }

    const retryableErrors = [
      'timeout', 'TIMED_OUT', 'NETWORK', 'ERR_', 'Navigation',
      'ProtocolError', 'Target closed', 'Session closed', 'proxy',
      'browser', 'page'
    ];

    const nonRetryableErrors = [
      'No available proxies',
      'Proxy setup failed',
      'Cannot start session without working proxy'
    ];

    // Jangan retry untuk error proxy yang fatal
    if (nonRetryableErrors.some(keyword => error.message.includes(keyword))) {
      return false;
    }

    return retryableErrors.some(keyword => 
      error.message.includes(keyword)
    );
  }

  calculateRetryDelay(retryCount) {
    const delay = RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.factor, retryCount);
    return Math.min(delay, RETRY_CONFIG.maxDelay);
  }

  async rotateProxyForSession(sessionId, config) {
    try {
        const newProxy = this.proxyHandler.getFreshProxyForSession(sessionId, config.proxyType);
        if (newProxy) {
            config.selectedProxy = newProxy;
            this.log(sessionId, 'PROXY_ROTATED', `Rotated to new proxy: ${this.getProxyDisplay(newProxy)}`);
        }
    } catch (error) {
        this.log(sessionId, 'PROXY_ROTATE_FAILED', `Proxy rotation failed: ${error.message}`);
    }
  }

  // Browser Launch dengan konfigurasi proxy yang benar
  async launchBrowser(sessionId, config) {
    try {
      this.log(sessionId, 'BROWSER_LAUNCH', 'Launching browser...');
      
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=site-per-process',
        '--window-size=1920,1080'
      ];

      // Tambahkan proxy server jika menggunakan fresh proxy
      if (config.proxyType === 'fresh' && config.selectedProxy) {
        const proxy = config.selectedProxy;
        if (proxy.ip && proxy.port) {
          const proxyUrl = `${proxy.protocol || 'http'}://${proxy.ip}:${proxy.port}`;
          args.push(`--proxy-server=${proxyUrl}`);
          this.log(sessionId, 'PROXY_SET', `Using fresh proxy: ${proxyUrl}`);
        }
      }

      // TIDAK ADA BLOKIR IKLAN - Biarkan semua request
      args.push('--disable-features=AdBlock');
      args.push('--disable-blink-features=AutomationControlled');

      const launchOptions = {
        headless: "new",
        args: args,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        ignoreHTTPSErrors: true,
        timeout: 120000
      };

      const browser = await puppeteer.launch(launchOptions);
      this.log(sessionId, 'BROWSER_LAUNCH_SUCCESS', 'Browser launched');
      return browser;
      
    } catch (error) {
      this.log(sessionId, 'BROWSER_LAUNCH_ERROR', `Browser launch failed: ${error.message}`);
      throw error;
    }
  }

  async executeSession(sessionId, config) {
    let browser = null;
    let page = null;
    
    try {
      // Step 1: Launch Browser
      browser = await this.launchBrowser(sessionId, config);
      
      // Step 2: Create Page - TANPA BLOKIR REQUEST
      page = await browser.newPage();
      page.setDefaultTimeout(90000);
      page.setDefaultNavigationTimeout(120000);

      const userAgent = this.activeSessions.get(sessionId).userAgent;
      await page.setUserAgent(userAgent);
      await page.setViewport({ 
        width: config.deviceType === 'mobile' ? 375 : 1280, 
        height: config.deviceType === 'mobile' ? 667 : 720 
      });

      // TIDAK ADA REQUEST INTERCEPTION - Biarkan semua iklan dan content
      // Ini penting untuk impressions iklan

      // Add error handlers
      page.on('error', (error) => {
        this.log(sessionId, 'PAGE_ERROR', `Page error: ${error.message}`);
      });
      
      page.on('pageerror', (error) => {
        this.log(sessionId, 'PAGE_CONSOLE_ERROR', `Console error: ${error.message}`);
      });

      // Step 3: Navigate dengan Proxy
      this.log(sessionId, 'STEP_NAVIGATE', `Navigating to: ${config.targetUrl}`);
      
      if (config.proxyType === 'web') {
        await this.executeWebProxyFlow(page, sessionId, config);
      } else {
        await page.goto(config.targetUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 120000
        });
      }

      this.log(sessionId, 'NAVIGATION_SUCCESS', 'Successfully navigated to target');
      
      // Tunggu sedikit untuk memastikan semua iklan dimuat
      await page.waitForTimeout(3000);
      
      // Step 4: Execute ALL Features (TANPA MENGHAPUS IKLAN)
      await this.executeAllFeatures(page, sessionId, config);

      this.log(sessionId, 'SESSION_COMPLETED', 'All steps completed successfully');

    } catch (error) {
      this.log(sessionId, 'EXECUTION_ERROR', `Error during session execution: ${error.message}`);
      throw error;
    } finally {
      if (browser) {
        try {
          await browser.close();
          this.log(sessionId, 'BROWSER_CLOSED', 'Browser closed');
        } catch (closeError) {
          this.log(sessionId, 'BROWSER_CLOSE_ERROR', `Error closing browser: ${closeError.message}`);
        }
      }
    }
  }

  // KEMBALIKAN FITUR-FITUR PENUH TANPA BLOKIR IKLAN:
  async executeAllFeatures(page, sessionId, config) {
    const features = [
      {
        name: 'HUMAN_SCROLL',
        action: async () => {
          this.log(sessionId, 'FEATURE_SCROLL', 'Starting human-like scroll simulation...');
          await this.humanLikeScroll(page, sessionId);
        },
        timeout: 45000
      },
      {
        name: 'MOUSE_MOVEMENT',
        action: async () => {
          this.log(sessionId, 'FEATURE_MOUSE', 'Simulating mouse movements...');
          await this.simulateMouseMovements(page, sessionId, config.deviceType);
        },
        timeout: 30000
      },
      {
        name: 'READING_SIMULATION',
        action: async () => {
          this.log(sessionId, 'FEATURE_READING', 'Simulating realistic reading...');
          await this.simulateRealisticReading(page, sessionId, config.deviceType);
        },
        timeout: 60000
      },
      {
        name: 'VIEW_ADS', // Ubah dari HANDLE_ADS menjadi VIEW_ADS
        action: async () => {
          this.log(sessionId, 'FEATURE_ADS', 'Viewing ads for impressions...');
          await this.viewAdsForImpressions(page, sessionId);
        },
        timeout: 30000
      },
      {
        name: 'CLICK_POSTS',
        action: async () => {
          this.log(sessionId, 'FEATURE_CLICK_POSTS', 'Clicking multiple post links...');
          await this.clickMultiplePostLinks(page, sessionId);
        },
        timeout: 45000
      },
      {
        name: 'TOUCH_SIMULATION',
        action: async () => {
          if (config.deviceType === 'mobile') {
            this.log(sessionId, 'FEATURE_TOUCH', 'Simulating mobile touch interactions...');
            await this.simulateTouchInteractions(page, sessionId);
          }
        },
        timeout: 20000
      },
      {
        name: 'TEXT_SELECTION',
        action: async () => {
          this.log(sessionId, 'FEATURE_TEXT_SELECT', 'Simulating text selection...');
          await this.simulateTextSelection(page, sessionId);
        },
        timeout: 15000
      },
      {
        name: 'MICRO_INTERACTIONS',
        action: async () => {
          this.log(sessionId, 'FEATURE_MICRO', 'Performing micro-interactions...');
          await this.performMicroInteractions(page, sessionId);
        },
        timeout: 20000
      }
    ];

    for (const feature of features) {
      try {
        if (!this.activeSessions.has(sessionId) || this.activeSessions.get(sessionId).status !== 'running') {
          break;
        }

        this.activeSessions.get(sessionId).currentStep = feature.name;
        
        await Promise.race([
          feature.action(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Feature ${feature.name} timeout`)), feature.timeout)
          )
        ]);
        
        this.log(sessionId, `${feature.name}_COMPLETE`, `Feature completed`);
        
        // Random delay antara features
        await page.waitForTimeout(2000 + Math.random() * 3000);
        
      } catch (featureError) {
        this.log(sessionId, `${feature.name}_ERROR`, 
          `Feature failed but continuing: ${featureError.message}`);
      }
    }
  }

  // FITUR 1: Human-like Scroll (naik-turun)
  async humanLikeScroll(page, sessionId) {
    try {
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = await page.evaluate(() => window.innerHeight);
      const maxScroll = pageHeight - viewportHeight;

      if (maxScroll <= 0) return;

      // Pattern scroll seperti manusia: naik, turun, naik sedikit, turun
      const scrollPattern = [0.3, 0.7, 0.5, 0.9, 0.2, 0.6, 0.4, 0.8];
      
      for (const ratio of scrollPattern) {
        const scrollTo = Math.floor(ratio * maxScroll);
        
        await page.evaluate((scrollPos) => {
          window.scrollTo({
            top: scrollPos,
            behavior: 'smooth'
          });
        }, scrollTo);
        
        // Varying pause times
        const pauseTime = 800 + Math.random() * 2200;
        await page.waitForTimeout(pauseTime);
        
        // Sometimes scroll back a little
        if (Math.random() < 0.3) {
          const backScroll = Math.max(0, scrollTo - 100);
          await page.evaluate((scrollPos) => {
            window.scrollTo({
              top: scrollPos,
              behavior: 'smooth'
            });
          }, backScroll);
          
          await page.waitForTimeout(500 + Math.random() * 1000);
        }
      }
    } catch (error) {
      this.log(sessionId, 'SCROLL_ERROR', `Scroll simulation error: ${error.message}`);
    }
  }

  // FITUR 2: Mouse Movement Simulation (Desktop only)
  async simulateMouseMovements(page, sessionId, deviceType) {
    if (deviceType !== 'desktop') return;
    
    try {
      const viewport = await page.viewport();
      const movements = [
        { x: 100, y: 200 },
        { x: 300, y: 150 },
        { x: 500, y: 300 },
        { x: 700, y: 250 },
        { x: 900, y: 350 }
      ];
      
      for (const movement of movements) {
        if (movement.x > viewport.width || movement.y > viewport.height) continue;
        
        await page.mouse.move(movement.x, movement.y, { steps: 10 + Math.random() * 20 });
        await page.waitForTimeout(300 + Math.random() * 700);
        
        // Random click sometimes
        if (Math.random() < 0.2) {
          await page.mouse.click(movement.x, movement.y, { delay: 100 });
          await page.waitForTimeout(800 + Math.random() * 1200);
        }
      }
    } catch (error) {
      this.log(sessionId, 'MOUSE_ERROR', `Mouse simulation error: ${error.message}`);
    }
  }

  // FITUR 3: Realistic Reading Simulation
  async simulateRealisticReading(page, sessionId, deviceType) {
    try {
      const totalDuration = 40000 + Math.random() * 20000;
      const startTime = Date.now();
      
      let lastScrollY = 0;
      let readingSpeed = 80 + Math.random() * 120; // pixels per second
      
      while (Date.now() - startTime < totalDuration) {
        // Calculate scroll position based on reading speed
        const elapsed = (Date.now() - startTime) / 1000;
        const newScrollY = Math.min(lastScrollY + (readingSpeed * elapsed), 
          await page.evaluate(() => document.body.scrollHeight) - await page.evaluate(() => window.innerHeight));
        
        await page.evaluate((scrollTo) => {
          window.scrollTo({
            top: scrollTo,
            behavior: 'smooth'
          });
        }, newScrollY);
        
        lastScrollY = newScrollY;
        
        // Random reading pauses
        if (Math.random() < 0.3) {
          const pauseTime = 1500 + Math.random() * 3500;
          this.log(sessionId, 'READING_PAUSE', `Pausing for ${Math.round(pauseTime/1000)}s`);
          await page.waitForTimeout(pauseTime);
        }
        
        await page.waitForTimeout(2000 + Math.random() * 3000);
      }
    } catch (error) {
      this.log(sessionId, 'READING_ERROR', `Reading simulation error: ${error.message}`);
    }
  }

  // FITUR 4: View Ads for Impressions (TANPA KLIK/MENGHAPUS)
  async viewAdsForImpressions(page, sessionId) {
    try {
      this.log(sessionId, 'VIEWING_ADS', 'Waiting for ads to load and generate impressions...');
      
      // Biarkan iklan dimuat dengan menunggu lebih lama
      await page.waitForTimeout(8000);
      
      // Scroll melalui halaman untuk menampilkan iklan
      await this.humanLikeScroll(page, sessionId);
      
      // Tunggu lagi untuk impressions
      await page.waitForTimeout(5000);
      
      // Hover di area iklan untuk engagement
      await page.evaluate(() => {
        const adElements = document.querySelectorAll('[class*="ad"], [id*="ad"], .adsbygoogle, .ad-container, .advertisement');
        if (adElements.length > 0) {
          // Trigger mouseover event untuk engagement
          adElements.forEach((ad, index) => {
            if (index < 3) { // Hanya 3 pertama
              const event = new MouseEvent('mouseover', {
                view: window,
                bubbles: true,
                cancelable: true
              });
              ad.dispatchEvent(event);
            }
          });
        }
      });
      
      this.log(sessionId, 'ADS_VIEWED', 'Ads viewed for impressions (no clicks/blocking)');
      
    } catch (error) {
      this.log(sessionId, 'ADS_ERROR', `Ad viewing error: ${error.message}`);
    }
  }

  // FITUR 5: Click Multiple Post Links
  async clickMultiplePostLinks(page, sessionId) {
    try {
      const postLinks = await page.$$eval('a[href]', anchors => 
        anchors
          .filter(a => {
            const href = a.href;
            const text = a.textContent.trim();
            return href && 
                   !href.includes('#') && 
                   !href.startsWith('javascript:') &&
                   !href.includes('mailto:') &&
                   !href.includes('tel:') &&
                   href !== window.location.href &&
                   text.length > 5 &&
                   a.offsetWidth > 0 &&
                   a.offsetHeight > 0 &&
                   (href.includes('/p/') || 
                    href.includes('/post/') || 
                    href.includes('/article/') ||
                    href.includes('/blog/') ||
                    text.length > 10);
          })
          .map(a => ({ 
            href: a.href, 
            text: a.textContent.trim().substring(0, 30) 
          }))
      );

      if (postLinks.length > 0) {
        const linksToOpen = postLinks
          .sort(() => 0.5 - Math.random())
          .slice(0, Math.min(3, postLinks.length));

        this.log(sessionId, 'POST_LINKS_FOUND', 
          `Found ${postLinks.length} posts, opening ${linksToOpen.length}`);

        for (let i = 0; i < linksToOpen.length; i++) {
          const link = linksToOpen[i];
          this.log(sessionId, 'OPENING_POST', 
            `Opening post ${i+1}/${linksToOpen.length}: ${link.text}`);

          // Scroll to link and click
          await page.evaluate((href) => {
            const linkElement = document.querySelector(`a[href="${href}"]`);
            if (linkElement) {
              linkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                linkElement.click();
              }, 1000);
            }
          }, link.href);

          await page.waitForTimeout(8000);
          
          // Do some reading on the post
          await this.humanLikeScroll(page, sessionId);
          
          await page.waitForTimeout(5000);

          // Go back to main page (except for last post)
          if (i < linksToOpen.length - 1) {
            await page.goBack();
            await page.waitForTimeout(5000);
          }
        }

        this.log(sessionId, 'POSTS_COMPLETE', 
          `Successfully opened ${linksToOpen.length} posts`);
        return true;
      }
      return false;
    } catch (error) {
      this.log(sessionId, 'POSTS_ERROR', `Error with posts: ${error.message}`);
      return false;
    }
  }

  // FITUR 6: Touch Simulation (Mobile only)
  async simulateTouchInteractions(page, sessionId) {
    try {
      // Simulate tap
      const viewport = await page.viewport();
      const tapX = Math.random() * (viewport.width - 100) + 50;
      const tapY = Math.random() * (viewport.height - 100) + 50;
      
      await page.touchscreen.tap(tapX, tapY);
      await page.waitForTimeout(1000);
      
      // Simulate swipe
      await page.touchscreen.touchStart(tapX, tapY);
      await page.waitForTimeout(100);
      await page.touchscreen.touchMove(tapX + 100, tapY);
      await page.waitForTimeout(100);
      await page.touchscreen.touchEnd();
      
      this.log(sessionId, 'TOUCH_SIMULATED', 'Touch interactions simulated');
    } catch (error) {
      this.log(sessionId, 'TOUCH_ERROR', `Touch simulation error: ${error.message}`);
    }
  }

  // FITUR 7: Text Selection Simulation
  async simulateTextSelection(page, sessionId) {
    try {
      const hasText = await page.evaluate(() => {
        const paragraphs = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, span');
        return paragraphs.length > 0;
      });
      
      if (hasText && Math.random() < 0.4) {
        await page.evaluate(() => {
          const paragraphs = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, span');
          if (paragraphs.length > 0) {
            const randomPara = paragraphs[Math.floor(Math.random() * paragraphs.length)];
            const range = document.createRange();
            range.selectNodeContents(randomPara);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            
            // Highlight effect
            randomPara.style.backgroundColor = '#ffffcc';
            setTimeout(() => {
              randomPara.style.backgroundColor = '';
              selection.removeAllRanges();
            }, 1500);
          }
        });
        
        this.log(sessionId, 'TEXT_SELECTED', 'Text selection simulated');
        await page.waitForTimeout(2000);
      }
    } catch (error) {
      this.log(sessionId, 'TEXT_ERROR', `Text selection error: ${error.message}`);
    }
  }

  // FITUR 8: Micro Interactions
  async performMicroInteractions(page, sessionId) {
    try {
      // Random button hover
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, .btn, [role="button"]');
        if (buttons.length > 0) {
          const randomButton = buttons[Math.floor(Math.random() * buttons.length)];
          randomButton.style.backgroundColor = '#f0f0f0';
          setTimeout(() => {
            randomButton.style.backgroundColor = '';
          }, 1000);
        }
      });
      
      // Input field focus
      await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="text"], input[type="search"], textarea');
        if (inputs.length > 0) {
          const randomInput = inputs[Math.floor(Math.random() * inputs.length)];
          randomInput.focus();
          setTimeout(() => {
            randomInput.blur();
          }, 1500);
        }
      });
      
      this.log(sessionId, 'MICRO_INTERACTIONS', 'Micro-interactions performed');
      await page.waitForTimeout(3000);
    } catch (error) {
      this.log(sessionId, 'MICRO_ERROR', `Micro-interactions error: ${error.message}`);
    }
  }

  // Web Proxy Flow (Simplified but functional)
  async executeWebProxyFlow(page, sessionId, config) {
    const webProxy = config.selectedProxy;
    
    try {
      if (webProxy.method === 'direct_url' && webProxy.pattern) {
        const directUrl = this.proxyHandler.encodeUrlForProxy(config.targetUrl, webProxy.pattern);
        await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } else {
        await page.goto(webProxy.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        
        // Try to find and fill input
        const inputFound = await this.findAndFillInput(page, config.targetUrl);
        if (inputFound) {
          await page.keyboard.press('Enter');
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        }
      }
      
      await page.waitForTimeout(3000);
    } catch (error) {
      this.log(sessionId, 'WEB_PROXY_ERROR', `Web proxy failed: ${error.message}`);
      throw error;
    }
  }

  async findAndFillInput(page, targetUrl) {
    const inputSelectors = [
      'input[type="url"]',
      'input[name="url"]',
      'input[name="u"]',
      'input[name="q"]',
      'input[placeholder*="URL"]',
      'input[placeholder*="url"]',
      'input#url',
      'input.url'
    ];

    for (const selector of inputSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await element.type(targetUrl, { delay: 50 });
          return true;
        }
      } catch (error) {
        continue;
      }
    }
    return false;
  }

  stopSession(sessionId) {
    if (this.activeSessions.has(sessionId)) {
      const session = this.activeSessions.get(sessionId);
      session.status = 'stopped';
      session.endTime = new Date();
      this.log(sessionId, 'SESSION_STOPPED', 'Session stopped');
    }
  }

  log(sessionId, step, message) {
    const timestamp = new Date().toLocaleString('id-ID');
    const logEntry = { timestamp, step, message };
    
    if (this.sessionLogs.has(sessionId)) {
      const logs = this.sessionLogs.get(sessionId);
      logs.push(logEntry);
      if (logs.length > 500) {
        logs.splice(0, 100);
      }
    }
    
    console.log(`[${sessionId}] ${step}: ${message}`);
  }

  getSessionLogs(sessionId) {
    return this.sessionLogs.get(sessionId) || [];
  }

  getAllSessions() {
    const sessions = [];
    for (const [sessionId, session] of this.activeSessions) {
      sessions.push({
        id: sessionId,
        status: session.status,
        startTime: session.startTime,
        currentStep: session.currentStep,
        config: session.config,
        isAutoLoop: session.isAutoLoop,
        restartCount: session.restartCount,
        maxRestarts: session.maxRestarts,
        userAgent: session.userAgent,
        proxyInfo: session.proxyInfo
      });
    }
    return sessions;
  }

  stopAllSessions() {
    for (const [sessionId] of this.activeSessions) {
      this.stopSession(sessionId);
    }
    this.log('SYSTEM', 'ALL_SESSIONS_STOPPED', 'All sessions stopped');
  }

  clearAllSessions() {
    this.activeSessions.clear();
    this.sessionLogs.clear();
    this.log('SYSTEM', 'ALL_SESSIONS_CLEARED', 'All sessions and logs cleared');
  }
}

module.exports = TrafficGenerator;
[file content end]