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

class TrafficGenerator {
  constructor() {
    this.activeSessions = new Map();
    this.sessionLogs = new Map();
    this.proxyHandler = new ProxyHandler();
    this.autoRestartEnabled = true;
    
    // Start auto-update proxies
    this.proxyHandler.startAutoUpdate();
  }

  async startNewSession(config) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.log(sessionId, 'SESSION_INIT', 'Initializing new session with PROXY ENFORCEMENT...');
    
    // Validasi: HARUS ada proxy
    if (!config.proxyType) {
      throw new Error('Proxy type is REQUIRED. No direct connections allowed.');
    }

    // Setup proxies dengan test sebelum digunakan
    await this.setupAndTestProxiesForSession(sessionId, config);

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
      proxyInfo: config.selectedProxy || null
    });

    this.log(sessionId, 'SESSION_STARTED', 
      `Session started with ${config.profileCount} profiles | Device: ${config.deviceType} | Proxy: ${config.proxyType} | User Agent: ${this.activeSessions.get(sessionId).userAgent.substring(0, 50)}...`
    );
    
    // Execute session dengan error handling yang lebih baik
    this.executeSessionWithRetry(sessionId, config).catch(error => {
      this.log(sessionId, 'SESSION_ERROR', `Session failed: ${error.message}`);
      this.stopSession(sessionId);
    });

    return sessionId;
  }

  async setupAndTestProxiesForSession(sessionId, config) {
    const proxyType = config.proxyType || 'web';
    
    try {
      // Dapatkan proxy yang belum digunakan untuk session ini
      const selectedProxy = this.proxyHandler.getProxyByType(proxyType, sessionId);
      
      if (!selectedProxy) {
        throw new Error(`No available ${proxyType} proxies`);
      }

      // Test proxy sebelum digunakan
      this.log(sessionId, 'PROXY_TEST', `Testing proxy before use...`);
      const proxyTestResult = await this.proxyHandler.testProxyBeforeUse(selectedProxy, sessionId);
      
      if (!proxyTestResult) {
        throw new Error(`Proxy test failed for ${proxyType}`);
      }

      config.selectedProxy = selectedProxy;
      this.log(sessionId, 'PROXY_READY', 
        `Proxy ready: ${this.getProxyDisplay(selectedProxy)}`
      );

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

  async executeSessionWithRetry(sessionId, config, retryCount = 0) {
    const maxRetries = 2;
    
    try {
      await this.executeSession(sessionId, config);
    } catch (error) {
      const isNetworkError = error.message.includes('timeout') || 
                            error.message.includes('TIMED_OUT') ||
                            error.message.includes('NETWORK') ||
                            error.message.includes('ERR_') ||
                            error.message.includes('Navigation');
      
      if (retryCount < maxRetries && isNetworkError) {
        const delay = Math.pow(2, retryCount) * 10000;
        this.log(sessionId, 'RETRY_ATTEMPT', 
          `Network error, retrying in ${delay/1000}s... (${retryCount + 1}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        await this.executeSessionWithRetry(sessionId, config, retryCount + 1);
      } else {
        this.log(sessionId, 'SESSION_FAILED', 
          `Session failed after ${retryCount + 1} attempts: ${error.message}`);
        this.stopSession(sessionId);
      }
    }
  }

  async executeSession(sessionId, config) {
    let browser;
    try {
      // STEP 1: Launch Browser dengan PROXY
      this.log(sessionId, 'STEP_1', 'Launching browser with PROXY ENFORCEMENT...');
      browser = await this.launchBrowserWithTimeout({...config, sessionId}, 60000);
      
      const page = await browser.newPage();
      
      // Configure page timeouts
      page.setDefaultTimeout(45000);
      page.setDefaultNavigationTimeout(60000);

      // Gunakan user agent random untuk session ini
      const userAgent = this.activeSessions.get(sessionId).userAgent;
      await page.setUserAgent(userAgent);
      await page.setViewport({ 
        width: config.deviceType === 'mobile' ? 375 : 1280, 
        height: config.deviceType === 'mobile' ? 667 : 720 
      });

      // VERIFIKASI PROXY: Test IP address sebelum melanjutkan
      await this.verifyProxyConnection(page, sessionId);

      // Block resources yang tidak penting
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      this.log(sessionId, 'STEP_1_COMPLETE', 
        `Browser launched with ${config.deviceType} | User Agent: ${userAgent.substring(0, 80)}...`);

      // STEP 2: Navigate to Target dengan proxy
      this.log(sessionId, 'STEP_2', `Navigating to: ${config.targetUrl} with proxy...`);
      
      try {
        const response = await page.goto(config.targetUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        
        if (!response) {
          this.log(sessionId, 'NAVIGATION_WARNING', 'Navigation completed but no response object');
        } else if (!response.ok() && response.status() !== 304) {
          this.log(sessionId, 'NAVIGATION_WARNING', 
            `Navigation completed with status: ${response.status()} ${response.statusText()}`);
        }

        this.log(sessionId, 'STEP_2_COMPLETE', 'Successfully navigated with proxy');

        // Execute all steps dengan fitur baru
        await this.executeAllSteps(page, sessionId, config);

        this.log(sessionId, 'SESSION_COMPLETED', 'All steps completed with proxy');

      } catch (navError) {
        this.log(sessionId, 'NAVIGATION_ERROR', `Navigation failed with proxy: ${navError.message}`);
        throw navError;
      }

    } catch (error) {
      this.log(sessionId, 'EXECUTION_ERROR', `Error during session execution: ${error.message}`);
      throw error;
    } finally {
      if (browser) {
        try {
          await browser.close();
          this.log(sessionId, 'BROWSER_CLOSED', 'Browser closed successfully');
        } catch (closeError) {
          this.log(sessionId, 'BROWSER_CLOSE_ERROR', `Error closing browser: ${closeError.message}`);
        }
      }
    }
  }

  async verifyProxyConnection(page, sessionId) {
    try {
      this.log(sessionId, 'PROXY_VERIFY', 'Verifying proxy connection...');
      
      // Test dengan service yang menampilkan IP
      await page.goto('https://api.ipify.org?format=json', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      
      const ipData = await page.evaluate(() => document.body.textContent);
      const ipInfo = JSON.parse(ipData);
      
      this.log(sessionId, 'PROXY_VERIFIED', `Current IP: ${ipInfo.ip} - Proxy working correctly`);
      
      return true;
    } catch (error) {
      this.log(sessionId, 'PROXY_VERIFY_FAILED', 
        `Proxy verification failed: ${error.message}. Session will be terminated.`);
      throw new Error(`PROXY_FAILURE: Cannot verify proxy connection`);
    }
  }

  async launchBrowserWithTimeout(config, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Browser launch timeout after ${timeout}ms`));
      }, timeout);

      try {
        const browser = await this.launchBrowser(config);
        clearTimeout(timeoutId);
        resolve(browser);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  async launchBrowser(config) {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--lang=en-US,en;q=0.9',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-web-security',
      '--disable-features=site-per-process',
      '--window-size=1920,1080',
      // BLOCK direct connections
      '--proxy-bypass-list=<-loopback>',
      '--ignore-certificate-errors-spki-list',
      '--ignore-certificate-errors'
    ];

    // FORCE proxy usage - tidak ada koneksi langsung
    if (config.selectedProxy) {
      const proxy = config.selectedProxy;
      
      if (proxy.url && !proxy.url.includes('http')) {
        // Fresh proxy format ip:port
        args.push(`--proxy-server=http://${proxy.ip}:${proxy.port}`);
      } else if (proxy.url) {
        // Web proxy URL
        args.push(`--proxy-server=${proxy.url}`);
      }
      
      this.log(config.sessionId, 'PROXY_APPLIED', 
        `Proxy enforced: ${this.getProxyDisplay(proxy)}`
      );
    } else {
      throw new Error('NO_PROXY: Cannot launch browser without proxy configuration');
    }

    const launchOptions = {
      headless: "new",
      args: args,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      ignoreHTTPSErrors: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      timeout: 60000
    };

    console.log('Launching browser with PROXY ENFORCEMENT:', {
      headless: launchOptions.headless,
      hasProxy: !!config.selectedProxy,
      proxyType: config.proxyType,
      userAgent: config.userAgent ? 'custom' : 'default'
    });

    return await puppeteer.launch(launchOptions);
  }

  async executeAllSteps(page, sessionId, config) {
    const steps = [
      {
        name: 'STEP_3',
        action: async () => {
          this.log(sessionId, 'STEP_3', 'Starting human-like scroll simulation...');
          await this.humanScroll(page);
        },
        successMessage: 'Scroll simulation completed',
        timeout: 30000
      },
      {
        name: 'STEP_4', 
        action: async () => {
          this.log(sessionId, 'STEP_4', 'Looking for random post to click...');
          const clicked = await this.clickRandomLink(page);
          if (!clicked) {
            this.log(sessionId, 'STEP_4_SKIP', 'No suitable links found, skipping click step');
          }
        },
        successMessage: 'Random click completed',
        timeout: 15000
      },
      {
        name: 'STEP_5',
        action: async () => {
          this.log(sessionId, 'STEP_5', 'Checking for Google ads...');
          await this.skipGoogleAds(page);
        },
        successMessage: 'Ads handled',
        timeout: 10000
      },
      {
        name: 'STEP_GOOGLE_ADS',
        action: async () => {
          this.log(sessionId, 'STEP_GOOGLE_ADS', 'Attempting to click Google ads...');
          const adClicked = await this.clickGoogleAdsAndReturn(page, sessionId, config.targetUrl);
          if (!adClicked) {
            this.log(sessionId, 'STEP_GOOGLE_ADS_SKIP', 'No Google ads found, skipping ad click step');
          }
        },
        successMessage: 'Google ads process completed',
        timeout: 60000
      },
      {
        name: 'STEP_READING_AFTER_ADS',
        action: async () => {
          this.log(sessionId, 'STEP_READING_AFTER_ADS', 'Simulasi membaca setelah iklan...');
          await this.simulateRealisticReading(page, sessionId, config.deviceType);
        },
        successMessage: 'Reading simulation after ads completed',
        timeout: 90000
      },
      {
        name: 'STEP_POST_LINKS',
        action: async () => {
          this.log(sessionId, 'STEP_POST_LINKS', 'Membuka link postingan lain...');
          await this.clickMultiplePostLinks(page, sessionId);
        },
        successMessage: 'Berhasil membuka beberapa postingan',
        timeout: 30000
      },
      {
        name: 'STEP_READING_BEFORE_CLEANUP',
        action: async () => {
          this.log(sessionId, 'STEP_READING_BEFORE_CLEANUP', 
            'Simulasi membaca realistis sebelum cleanup...');
          await this.simulateRealisticReading(page, sessionId, config.deviceType);
        },
        successMessage: 'Final reading simulation completed',
        timeout: 90000
      },
      {
        name: 'STEP_CLEANUP',
        action: async () => {
          this.log(sessionId, 'STEP_CLEANUP', 'Clearing cache and cookies...');
          await this.clearCache(page);
        },
        successMessage: 'Cache cleared',
        timeout: 5000
      }
    ];

    for (const step of steps) {
      try {
        // Update session current step
        if (this.activeSessions.has(sessionId)) {
          this.activeSessions.get(sessionId).currentStep = step.name;
        }

        await Promise.race([
          step.action(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Step ${step.name} timeout`)), step.timeout)
          )
        ]);
        
        this.log(sessionId, `${step.name}_COMPLETE`, step.successMessage);
        
        // Random delay antara steps (2-5 detik)
        await page.waitForTimeout(Math.random() * 3000 + 2000);
        
      } catch (stepError) {
        this.log(sessionId, `${step.name}_ERROR`, 
          `Step failed but continuing: ${stepError.message}`);
      }
    }
  }

  // METHOD BARU: Simulasi membaca realistis
  async simulateRealisticReading(page, sessionId, deviceType) {
    try {
      this.log(sessionId, 'READING_SIMULATION_START', 
        `Memulai simulasi membaca realistis (${deviceType})...`);

      const totalDuration = 45000 + Math.random() * 15000;
      const startTime = Date.now();
      
      const viewport = await page.viewport();
      const screenWidth = viewport.width;
      const screenHeight = viewport.height;
      
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = viewport.height;
      const maxScroll = pageHeight - viewportHeight;

      this.log(sessionId, 'READING_SETUP', 
        `Durasi: ${Math.round(totalDuration/1000)}s, Scroll area: 0-${maxScroll}px`);

      let lastScrollY = 0;
      let readingDirection = 1;
      let consecutiveSameDirection = 0;

      while (Date.now() - startTime < totalDuration) {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / totalDuration;

        const scrollBehavior = await this.calculateScrollBehavior(
          progress, 
          maxScroll, 
          lastScrollY, 
          readingDirection,
          consecutiveSameDirection
        );

        lastScrollY = scrollBehavior.newPosition;
        readingDirection = scrollBehavior.direction;
        consecutiveSameDirection = scrollBehavior.consecutiveCount;

        await page.evaluate((targetY) => {
          window.scrollTo({
            top: targetY,
            behavior: 'smooth'
          });
        }, scrollBehavior.newPosition);

        this.log(sessionId, 'SCROLL_ACTION', 
          `Scroll to ${scrollBehavior.newPosition}px (${readingDirection > 0 ? '↓' : '↑'})`);

        await this.simulateHumanMovements(page, deviceType, screenWidth, screenHeight, lastScrollY);

        if (Math.random() < 0.3) {
          const pauseTime = 1000 + Math.random() * 3000;
          this.log(sessionId, 'READING_PAUSE', `Berhenti membaca ${pauseTime/1000}s`);
          await page.waitForTimeout(pauseTime);
          
          await this.simulateMicroInteractions(page, deviceType, screenWidth, screenHeight);
        }

        const actionDelay = 2000 + Math.random() * 3000;
        await page.waitForTimeout(actionDelay);
      }

      await page.evaluate(() => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      });

      this.log(sessionId, 'READING_SIMULATION_END', 
        'Simulasi membaca selesai - kembali ke atas halaman');

    } catch (error) {
      this.log(sessionId, 'READING_SIMULATION_ERROR', 
        `Error selama simulasi membaca: ${error.message}`);
    }
  }

  async calculateScrollBehavior(progress, maxScroll, lastScrollY, currentDirection, consecutiveCount) {
    let baseSpeed;
    if (progress < 0.3) {
      baseSpeed = 150 + Math.random() * 200;
    } else if (progress < 0.7) {
      baseSpeed = 200 + Math.random() * 300;
    } else {
      baseSpeed = 100 + Math.random() * 150;
    }

    let newDirection = currentDirection;
    if (consecutiveCount > 3 || Math.random() < 0.15) {
      newDirection = -currentDirection;
      consecutiveCount = 0;
    } else {
      consecutiveCount++;
    }

    let newPosition = lastScrollY + (baseSpeed * newDirection);
    
    if (newPosition < 0) {
      newPosition = 0;
      newDirection = 1;
      consecutiveCount = 0;
    } else if (newPosition > maxScroll) {
      newPosition = maxScroll;
      newDirection = -1;
      consecutiveCount = 0;
    }

    newPosition += (Math.random() * 100 - 50);

    return {
      newPosition: Math.max(0, Math.min(maxScroll, Math.round(newPosition))),
      direction: newDirection,
      consecutiveCount: consecutiveCount
    };
  }

  async simulateHumanMovements(page, deviceType, screenWidth, screenHeight, scrollY) {
    try {
      if (deviceType === 'desktop') {
        const moveCount = 2 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < moveCount; i++) {
          const x = Math.random() * screenWidth;
          const y = Math.random() * (screenHeight * 0.8) + (screenHeight * 0.1);
          
          const viewportY = y + scrollY;
          
          await page.mouse.move(x, viewportY, {
            steps: 10 + Math.floor(Math.random() * 20)
          });

          if (Math.random() < 0.2) {
            await page.mouse.down();
            await page.waitForTimeout(50 + Math.random() * 100);
            await page.mouse.up();
            
            await page.evaluate((x, y) => {
              const element = document.elementFromPoint(x, y);
              if (element && element.style) {
                const originalOutline = element.style.outline;
                element.style.outline = '2px solid #3498db';
                setTimeout(() => {
                  element.style.outline = originalOutline;
                }, 500);
              }
            }, x, y);
          }

          await page.waitForTimeout(300 + Math.random() * 700);
        }
      } else {
        const touchCount = 1 + Math.floor(Math.random() * 2);
        
        for (let i = 0; i < touchCount; i++) {
          const x = Math.random() * screenWidth;
          const y = Math.random() * (screenHeight * 0.7) + (screenHeight * 0.15);
          
          await page.touchscreen.tap(x, y);
          
          if (Math.random() < 0.3) {
            const deltaX = (Math.random() * 100 - 50);
            const deltaY = (Math.random() * 80 - 40);
            
            await page.touchscreen.drag({
              x: x,
              y: y
            }, {
              x: x + deltaX,
              y: y + deltaY
            });
          }

          await page.waitForTimeout(500 + Math.random() * 1000);
        }
      }
    } catch (error) {
      // Ignore movement errors
    }
  }

  async simulateMicroInteractions(page, deviceType, screenWidth, screenHeight) {
    try {
      if (Math.random() < 0.4) {
        await page.evaluate(() => {
          const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div');
          if (elements.length > 0) {
            const randomElement = elements[Math.floor(Math.random() * elements.length)];
            const selection = window.getSelection();
            const range = document.createRange();
            
            if (randomElement.childNodes.length > 0) {
              range.selectNodeContents(randomElement);
              selection.removeAllRanges();
              selection.addRange(range);
              
              setTimeout(() => {
                selection.removeAllRanges();
              }, 1000 + Math.random() * 2000);
            }
          }
        });
      }

      if (Math.random() < 0.3) {
        await page.evaluate(() => {
          const clickableElements = document.querySelectorAll(
            'button, a, [onclick], [role="button"], input[type="button"], input[type="submit"]'
          );
          if (clickableElements.length > 0) {
            const randomElement = clickableElements[Math.floor(Math.random() * clickableElements.length)];
            if (randomElement.offsetWidth > 0 && randomElement.offsetHeight > 0) {
              randomElement.style.backgroundColor = '#e3f2fd';
              setTimeout(() => {
                randomElement.style.backgroundColor = '';
              }, 1000);
            }
          }
        });
      }
    } catch (error) {
      // Ignore micro-interaction errors
    }
  }

  // ... (method-method lainnya seperti clickMultiplePostLinks, clickGoogleAdsAndReturn, dll tetap sama)
  // [Method-method lain yang sudah ada sebelumnya...]

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
                   !href.includes('logout') &&
                   !href.includes('signout') &&
                   href !== window.location.href &&
                   text.length > 0 &&
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
          `Menemukan ${postLinks.length} postingan, akan membuka ${linksToOpen.length}`);

        for (let i = 0; i < linksToOpen.length; i++) {
          const link = linksToOpen[i];
          this.log(sessionId, 'OPENING_POST', 
            `Membuka postingan ${i+1}/${linksToOpen.length}: ${link.text}`);

          await page.evaluate((href) => {
            const linkElement = document.querySelector(`a[href="${href}"]`);
            if (linkElement) {
              linkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              setTimeout(() => {
                linkElement.click();
              }, 1000);
            }
          }, link.href);

          await page.waitForTimeout(5000);
          
          await this.humanScroll(page);
          
          await page.waitForTimeout(3000);

          if (i < linksToOpen.length - 1) {
            await page.goBack();
            await page.waitForTimeout(2000);
          }
        }

        this.log(sessionId, 'POST_LINKS_COMPLETE', 
          `Berhasil membuka ${linksToOpen.length} postingan`);
        return true;
      } else {
        this.log(sessionId, 'NO_POST_LINKS', 'Tidak menemukan link postingan');
        return false;
      }
    } catch (error) {
      this.log(sessionId, 'POST_LINKS_ERROR', `Error: ${error.message}`);
      return false;
    }
  }

  // ... (method-method lainnya yang sudah ada)

  log(sessionId, step, message) {
    const timestamp = new Date().toLocaleString('id-ID');
    const logEntry = { timestamp, step, message };
    
    if (this.sessionLogs.has(sessionId)) {
      const logs = this.sessionLogs.get(sessionId);
      if (logs.length > 1000) {
        logs.splice(0, 200);
      }
      logs.push(logEntry);
    }
    
    const logMessage = `[${sessionId}] ${step}: ${message}`;
    
    if (step.includes('ERROR') || step.includes('FAILED')) {
      console.error('❌', logMessage);
    } else if (step.includes('WARNING')) {
      console.warn('⚠️', logMessage);
    } else if (step.includes('READING') || step.includes('SCROLL')) {
      console.log('📖', logMessage);
    } else if (step.includes('MOUSE') || step.includes('TOUCH')) {
      console.log('👆', logMessage);
    } else {
      console.log('✅', logMessage);
    }
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

  stopSession(sessionId) {
    if (this.activeSessions.has(sessionId)) {
      this.activeSessions.get(sessionId).status = 'stopped';
      this.log(sessionId, 'SESSION_STOPPED', 'Session stopped');
    }
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

  setAutoRestart(enabled) {
    this.autoRestartEnabled = enabled;
    console.log(`🔄 Auto-restart ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }
}

module.exports = TrafficGenerator;