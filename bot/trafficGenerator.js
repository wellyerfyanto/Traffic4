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
    
    this.log(sessionId, 'SESSION_INIT', 'Initializing new session with ENHANCED PROXY...');
    
    if (!config.proxyType) {
      throw new Error('Proxy type is REQUIRED. No direct connections allowed.');
    }

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
      proxyInfo: config.selectedProxy || null,
      retryCount: 0
    });

    this.log(sessionId, 'SESSION_STARTED', 
      `Session started with ${config.profileCount} profiles | Device: ${config.deviceType} | Proxy: ${config.proxyType}`
    );
    
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
      'ProtocolError', 'Target closed', 'Session closed', 'proxy'
    ];

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
            
            const proxyTestResult = await this.proxyHandler.testProxyBeforeUse(newProxy, sessionId);
            if (!proxyTestResult) {
                throw new Error('New proxy test failed');
            }
        }
    } catch (error) {
        this.log(sessionId, 'PROXY_ROTATE_FAILED', `Proxy rotation failed: ${error.message}`);
    }
  }

  async executeSession(sessionId, config) {
    let browser;
    try {
      this.log(sessionId, 'STEP_1', 'Launching browser dengan ENHANCED timeout...');
      
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
        '--single-process'
      ];

      const launchOptions = {
        headless: "new",
        args: args,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        ignoreHTTPSErrors: true,
        ignoreDefaultArgs: ['--disable-extensions'],
        timeout: 120000
      };

      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();
      
      page.setDefaultTimeout(120000);
      page.setDefaultNavigationTimeout(150000);

      const userAgent = this.activeSessions.get(sessionId).userAgent;
      await page.setUserAgent(userAgent);
      await page.setViewport({ 
        width: config.deviceType === 'mobile' ? 375 : 1280, 
        height: config.deviceType === 'mobile' ? 667 : 720 
      });

      if (config.proxyType === 'web') {
        await this.executeEnhancedWebProxyFlow(page, sessionId, config);
      } else {
        await this.verifyProxyConnection(page, sessionId);
        
        this.log(sessionId, 'STEP_2', `Navigating to: ${config.targetUrl}`);
        await page.goto(config.targetUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 120000
        });
      }

      this.log(sessionId, 'STEP_2_COMPLETE', 'Successfully navigated with proxy');

      await this.executeAllSteps(page, sessionId, config);

      this.log(sessionId, 'SESSION_COMPLETED', 'All steps completed successfully');

    } catch (error) {
      this.log(sessionId, 'EXECUTION_ERROR', `Error during session execution: ${error.message}`);
      throw error;
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          this.log(sessionId, 'BROWSER_CLOSE_ERROR', `Error closing browser: ${closeError.message}`);
        }
      }
    }
  }

  async executeEnhancedWebProxyFlow(page, sessionId, config) {
    const webProxy = config.selectedProxy;
    
    try {
      this.log(sessionId, 'ENHANCED_WEB_PROXY', `Starting ENHANCED web proxy: ${webProxy.name}`);

      if (webProxy.method === 'direct_url' && webProxy.pattern) {
        await this.executeDirectUrlMethod(page, sessionId, config, webProxy);
      } else if (webProxy.method === 'form_fill') {
        await this.executeEnhancedFormFillMethod(page, sessionId, config, webProxy);
      } else {
        await this.executeAutoDetectMethod(page, sessionId, config, webProxy);
      }

      await this.verifyTargetLoaded(page, sessionId, config.targetUrl);

      this.log(sessionId, 'WEB_PROXY_SUCCESS', `Successfully loaded through ${webProxy.name}`);

    } catch (error) {
      this.log(sessionId, 'WEB_PROXY_FAILED', `Web proxy ${webProxy.name} failed: ${error.message}`);
      
      await this.tryFallbackMethods(page, sessionId, config, webProxy, error);
    }
  }

  async executeDirectUrlMethod(page, sessionId, config, webProxy) {
    const directUrl = this.proxyHandler.encodeUrlForProxy(config.targetUrl, webProxy.pattern);
    
    this.log(sessionId, 'DIRECT_URL_METHOD', `Using direct URL: ${directUrl}`);
    
    await page.goto(directUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(10000);
  }

  async executeEnhancedFormFillMethod(page, sessionId, config, webProxy) {
    this.log(sessionId, 'ENHANCED_FORM_FILL', `Using ENHANCED form fill for ${webProxy.name}`);
    
    await page.goto(webProxy.url, {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });

    await page.waitForTimeout(3000);

    const inputFilled = await this.enhancedFindAndFillInput(page, sessionId, config.targetUrl, webProxy);
    if (!inputFilled) {
      throw new Error('Cannot find URL input field after multiple attempts');
    }

    await page.waitForTimeout(2000);

    const submitted = await this.enhancedSubmitForm(page, sessionId, webProxy);
    
    if (!submitted) {
      this.log(sessionId, 'ENTER_FALLBACK', 'Using Enter key as final fallback');
      await page.keyboard.press('Enter');
    }

    await page.waitForNavigation({ 
      waitUntil: 'domcontentloaded', 
      timeout: 20000 
    }).catch(() => {
      this.log(sessionId, 'NAV_TIMEOUT', 'Navigation timeout, continuing with current page...');
    });

    await page.waitForTimeout(5000);
  }

  async enhancedFindAndFillInput(page, sessionId, targetUrl, webProxy) {
    const allInputSelectors = [
      ...webProxy.inputSelectors,
      'input[type="url"]',
      'input[name="url"]',
      'input[name="u"]',
      'input[name="q"]',
      'input[name="search"]',
      'input[name="query"]',
      'input[placeholder*="URL"]',
      'input[placeholder*="url"]',
      'input[placeholder*="Enter URL"]',
      'input[placeholder*="Website"]',
      'input[placeholder*="address"]',
      'input[placeholder*="Enter website"]',
      'input[placeholder*="Paste URL"]',
      'input#url',
      'input.url',
      '.url-input input',
      '.proxy-input input',
      '.search-input input',
      'input.form-control',
      'input[class*="url"]',
      'input[class*="proxy"]',
      'input[class*="search"]',
      'input[onblur*="url"]',
      'input[onfocus*="url"]',
      'textarea[name="url"]',
      'textarea[name="u"]',
      'textarea[name="q"]',
      'textarea[placeholder*="URL"]',
      'textarea[placeholder*="url"]',
      'textarea#url',
      'input[type="text"]',
      'input:not([type])',
      'textarea'
    ];

    this.log(sessionId, 'INPUT_SEARCH', `Searching for input field among ${allInputSelectors.length} selectors`);

    for (const selector of allInputSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await page.evaluate((el) => {
            const style = window.getComputedStyle(el);
            return el.offsetWidth > 0 && 
                   el.offsetHeight > 0 && 
                   style.visibility !== 'hidden' && 
                   style.display !== 'none';
          }, element);

          if (isVisible) {
            await element.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            
            await element.type(targetUrl, { delay: 100 });
            
            await page.evaluate((el) => {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
            }, element);

            this.log(sessionId, 'INPUT_FOUND', `Found and filled input: ${selector}`);
            return true;
          }
        }
      } catch (error) {
        continue;
      }
    }

    this.log(sessionId, 'INPUT_NOT_FOUND', 'No visible URL input field found after exhaustive search');
    return false;
  }

  async enhancedSubmitForm(page, sessionId, webProxy) {
    const allSubmitSelectors = [
      ...webProxy.submitSelectors,
      'input[type="submit"]',
      'button[type="submit"]',
      'input[type="button"][value*="Go"]',
      'input[type="button"][value*="GO"]',
      'input[type="button"][value*="Browse"]',
      'input[type="button"][value*="Surf"]',
      'input[type="button"][value*="Visit"]',
      'input[type="button"][value*="Proxy"]',
      'input[type="button"][value*="Submit"]',
      'input[type="button"][value*="Load"]',
      'input[type="button"][value*="Open"]',
      'button:contains("Go")',
      'button:contains("GO")',
      'button:contains("Browse")',
      'button:contains("Surf")',
      'button:contains("Visit")',
      'button:contains("Proxy")',
      'button:contains("Submit")',
      'button:contains("Load")',
      'button:contains("Open")',
      'button:contains("Start")',
      'button:contains("Begin")',
      '.submit-btn',
      '.go-button',
      '.proxy-button',
      '.browse-button',
      '.surf-button',
      '.visit-button',
      '.btn-primary',
      '.btn-success',
      '.btn-lg',
      '.btn-block',
      '#submit',
      '#go',
      '#btnSubmit',
      '#btnGo',
      '#btnBrowse',
      'form button',
      'form input[type="submit"]',
      'form input[type="button"]',
      'button.btn',
      'input.btn',
      'a.btn',
      'a.button'
    ];

    this.log(sessionId, 'SUBMIT_SEARCH', `Searching for submit button among ${allSubmitSelectors.length} selectors`);

    for (const selector of allSubmitSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await page.evaluate((el) => {
            const style = window.getComputedStyle(el);
            return el.offsetWidth > 0 && 
                   el.offsetHeight > 0 && 
                   style.visibility !== 'hidden' && 
                   style.display !== 'none';
          }, element);

          if (isVisible) {
            await element.click();
            this.log(sessionId, 'SUBMIT_FOUND', `Clicked submit button: ${selector}`);
            return true;
          }
        }
      } catch (error) {
        continue;
      }
    }

    for (const selector of allSubmitSelectors) {
      try {
        const clicked = await page.evaluate((sel) => {
          const element = document.querySelector(sel);
          if (element) {
            element.click();
            return true;
          }
          return false;
        }, selector);

        if (clicked) {
          this.log(sessionId, 'SUBMIT_JS', `Used JavaScript click: ${selector}`);
          return true;
        }
      } catch (error) {
        continue;
      }
    }

    try {
      const formSubmitted = await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        for (let form of forms) {
          const urlInputs = form.querySelectorAll('input[type="url"], input[name="url"], input[name="u"], input[name="q"]');
          if (urlInputs.length > 0) {
            form.submit();
            return true;
          }
        }
        return false;
      });

      if (formSubmitted) {
        this.log(sessionId, 'FORM_SUBMIT', 'Submitted form directly');
        return true;
      }
    } catch (error) {
    }

    this.log(sessionId, 'SUBMIT_NOT_FOUND', 'No submit button found after exhaustive search');
    return false;
  }

  async executeAutoDetectMethod(page, sessionId, config, webProxy) {
    this.log(sessionId, 'AUTO_DETECT_METHOD', `Auto-detecting method for ${webProxy.name}`);
    
    if (webProxy.pattern) {
      try {
        this.log(sessionId, 'TRY_DIRECT_URL', 'Trying direct URL method first');
        await this.executeDirectUrlMethod(page, sessionId, config, webProxy);
        
        if (await this.isTargetSiteLoaded(page, config.targetUrl)) {
          this.log(sessionId, 'DIRECT_URL_SUCCESS', 'Direct URL method succeeded');
          return;
        }
      } catch (error) {
        this.log(sessionId, 'DIRECT_URL_FAILED', `Direct URL failed: ${error.message}`);
      }
    }
    
    this.log(sessionId, 'TRY_ENHANCED_FORM', 'Falling back to enhanced form fill method');
    await this.executeEnhancedFormFillMethod(page, sessionId, config, webProxy);
  }

  async tryFallbackMethods(page, sessionId, config, webProxy, originalError) {
    this.log(sessionId, 'FALLBACK_ATTEMPT', `Trying fallback methods for ${webProxy.name}`);
    
    const fallbackMethods = [
      { name: 'direct_navigation', method: this.tryDirectNavigation.bind(this) },
      { name: 'iframe_detection', method: this.tryIframeDetection.bind(this) },
      { name: 'url_reconstruction', method: this.tryUrlReconstruction.bind(this) }
    ];

    for (const fallback of fallbackMethods) {
      try {
        this.log(sessionId, 'FALLBACK_METHOD', `Trying ${fallback.name}`);
        await fallback.method(page, sessionId, config, webProxy);
        this.log(sessionId, 'FALLBACK_SUCCESS', `Fallback ${fallback.name} succeeded`);
        return;
      } catch (fallbackError) {
        this.log(sessionId, 'FALLBACK_FAILED', `Fallback ${fallback.name} failed: ${fallbackError.message}`);
      }
    }

    throw new Error(`All methods failed for ${webProxy.name}. Last error: ${originalError.message}`);
  }

  async tryDirectNavigation(page, sessionId, config, webProxy) {
    this.log(sessionId, 'DIRECT_NAV_FALLBACK', 'Trying direct navigation fallback');
    await page.goto(config.targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });
  }

  async tryIframeDetection(page, sessionId, config, webProxy) {
    this.log(sessionId, 'IFRAME_FALLBACK', 'Trying iframe detection');
    
    const iframeUrl = await page.evaluate(() => {
      const iframes = document.querySelectorAll('iframe');
      for (let iframe of iframes) {
        if (iframe.src && iframe.src.includes('http')) {
          return iframe.src;
        }
      }
      return null;
    });

    if (iframeUrl) {
      await page.goto(iframeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } else {
      throw new Error('No iframe found');
    }
  }

  async tryUrlReconstruction(page, sessionId, config, webProxy) {
    this.log(sessionId, 'URL_RECONSTRUCTION', 'Trying URL reconstruction');
    
    const patterns = [
      `${webProxy.url}?url=${encodeURIComponent(config.targetUrl)}`,
      `${webProxy.url}?q=${encodeURIComponent(config.targetUrl)}`,
      `${webProxy.url}?u=${encodeURIComponent(config.targetUrl)}`,
      `${webProxy.url}#${encodeURIComponent(config.targetUrl)}`
    ];

    for (const pattern of patterns) {
      try {
        await page.goto(pattern, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        if (await this.isTargetSiteLoaded(page, config.targetUrl)) {
          return;
        }
      } catch (error) {
      }
    }
    
    throw new Error('URL reconstruction failed');
  }

  async verifyTargetLoaded(page, sessionId, targetUrl) {
    const maxAttempts = 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const currentUrl = page.url();
        const pageTitle = await page.title();
        
        const isLoaded = 
          currentUrl.includes(targetUrl) ||
          pageTitle.toLowerCase().includes('github') ||
          await page.$('body') !== null ||
          await page.$('[data-testid="repository-container"]') !== null ||
          await page.$('.repository-content') !== null;
        
        if (isLoaded) {
          this.log(sessionId, 'TARGET_VERIFIED', `Target verified - URL: ${currentUrl}, Title: ${pageTitle}`);
          return true;
        }
        
        if (attempt < maxAttempts) {
          await page.waitForTimeout(12000);
        }
        
      } catch (error) {
        this.log(sessionId, 'VERIFY_ERROR', `Verification attempt ${attempt} failed: ${error.message}`);
      }
    }
    
    throw new Error(`Target site not loaded after ${maxAttempts} attempts`);
  }

  async isTargetSiteLoaded(page, targetUrl) {
    try {
      const currentUrl = page.url();
      const title = await page.title().catch(() => '');
      const bodyExists = await page.$('body') !== null;
      
      return currentUrl.includes(targetUrl) || 
             title.toLowerCase().includes('github') ||
             bodyExists ||
             await page.$('[data-testid="repository-container"]') !== null ||
             await page.$('.repository-content') !== null ||
             await page.$('.js-repo-root') !== null;
    } catch (error) {
      return false;
    }
  }

  async verifyProxyConnection(page, sessionId) {
    try {
      this.log(sessionId, 'PROXY_VERIFY', 'Verifying proxy connection...');
      
      await page.goto('https://api.ipify.org?format=json', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      
      const ipData = await page.evaluate(() => document.body.textContent);
      const ipInfo = JSON.parse(ipData);
      
      this.log(sessionId, 'PROXY_VERIFIED', `Current IP through proxy: ${ipInfo.ip}`);
      return true;
      
    } catch (error) {
      this.log(sessionId, 'PROXY_VERIFY_SKIP', `IP verification skipped: ${error.message}`);
      return false;
    }
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
        timeout: 60000
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
        timeout: 35000
      },
      {
        name: 'STEP_5',
        action: async () => {
          this.log(sessionId, 'STEP_5', 'Checking for Google ads...');
          await this.skipGoogleAds(page);
        },
        successMessage: 'Ads handled',
        timeout: 90000
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
        timeout: 90000
      },
      {
        name: 'STEP_READING_AFTER_ADS',
        action: async () => {
          this.log(sessionId, 'STEP_READING_AFTER_ADS', 'Simulasi membaca setelah iklan...');
          await this.simulateRealisticReading(page, sessionId, config.deviceType);
        },
        successMessage: 'Reading simulation after ads completed',
        timeout: 150000
      },
      {
        name: 'STEP_POST_LINKS',
        action: async () => {
          this.log(sessionId, 'STEP_POST_LINKS', 'Membuka link postingan lain...');
          await this.clickMultiplePostLinks(page, sessionId);
        },
        successMessage: 'Berhasil membuka beberapa postingan',
        timeout: 60000
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
        
        await page.waitForTimeout(Math.random() * 3000 + 2000);
        
      } catch (stepError) {
        this.log(sessionId, `${step.name}_ERROR`, 
          `Step failed but continuing: ${stepError.message}`);
      }
    }
  }

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

          await page.waitForTimeout(9000);
          
          await this.humanScroll(page);
          
          await page.waitForTimeout(6000);

          if (i < linksToOpen.length - 1) {
            await page.goBack();
            await page.waitForTimeout(6000);
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

  async humanScroll(page) {
    try {
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = await page.evaluate(() => window.innerHeight);
      const maxScroll = pageHeight - viewportHeight;

      for (let i = 0; i < 5; i++) {
        const randomScroll = Math.floor(Math.random() * maxScroll);
        await page.evaluate((scrollTo) => {
          window.scrollTo({
            top: scrollTo,
            behavior: 'smooth'
          });
        }, randomScroll);
        
        await page.waitForTimeout(1000 + Math.random() * 2000);
      }
    } catch (error) {
      this.log('SCROLL_ERROR', `Scroll simulation error: ${error.message}`);
    }
  }

  async skipGoogleAds(page) {
    try {
      await page.evaluate(() => {
        const adSelectors = [
          '[class*="ad"]',
          '[id*="ad"]',
          '[class*="ads"]',
          '[id*="ads"]',
          '.ad-container',
          '.ads-container',
          '.google-ad',
          '.advertisement'
        ];
        
        adSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            if (el.style) el.style.display = 'none';
          });
        });
      });
    } catch (error) {
    }
  }

  async clickGoogleAdsAndReturn(page, sessionId, targetUrl) {
    try {
      const adClicked = await page.evaluate(() => {
        const adLinks = [
          'a[href*="googleadservices"]',
          'a[href*="doubleclick"]',
          'a[onclick*="google"]',
          '.ads a',
          '.ad a'
        ];
        
        for (const selector of adLinks) {
          const ad = document.querySelector(selector);
          if (ad) {
            ad.click();
            return true;
          }
        }
        return false;
      });

      if (adClicked) {
        this.log(sessionId, 'AD_CLICKED', 'Clicked on Google ad');
        await page.waitForTimeout(9000);
        await page.goBack();
        await page.waitForTimeout(6000);
        return true;
      }
      return false;
    } catch (error) {
      this.log(sessionId, 'AD_CLICK_ERROR', `Error clicking ad: ${error.message}`);
      return false;
    }
  }

  async simulateRealisticReading(page, sessionId, deviceType) {
    try {
      this.log(sessionId, 'READING_SIMULATION_START', 
        `Memulai simulasi membaca realistis (${deviceType})...`);

      const totalDuration = 45000 + Math.random() * 25000;
      const startTime = Date.now();
      
      const viewport = await page.viewport();
      const screenWidth = viewport.width;
      const screenHeight = viewport.height;
      
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = viewport.height;
      const maxScroll = pageHeight - viewportHeight;

      let lastScrollY = 0;
      let readingDirection = 1;
      let consecutiveSameDirection = 0;

      while (Date.now() - startTime < totalDuration) {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / totalDuration;

        let baseSpeed;
        if (progress < 0.3) {
          baseSpeed = 150 + Math.random() * 200;
        } else if (progress < 0.7) {
          baseSpeed = 200 + Math.random() * 300;
        } else {
          baseSpeed = 100 + Math.random() * 150;
        }

        let newDirection = readingDirection;
        if (consecutiveSameDirection > 3 || Math.random() < 0.15) {
          newDirection = -readingDirection;
          consecutiveSameDirection = 0;
        } else {
          consecutiveSameDirection++;
        }

        let newPosition = lastScrollY + (baseSpeed * newDirection);
        
        if (newPosition < 0) {
          newPosition = 0;
          newDirection = 1;
          consecutiveSameDirection = 0;
        } else if (newPosition > maxScroll) {
          newPosition = maxScroll;
          newDirection = -1;
          consecutiveSameDirection = 0;
        }

        newPosition += (Math.random() * 100 - 50);
        newPosition = Math.max(0, Math.min(maxScroll, Math.round(newPosition)));

        lastScrollY = newPosition;
        readingDirection = newDirection;

        await page.evaluate((targetY) => {
          window.scrollTo({
            top: targetY,
            behavior: 'smooth'
          });
        }, newPosition);

        if (Math.random() < 0.3) {
          const pauseTime = 1000 + Math.random() * 3000;
          await page.waitForTimeout(pauseTime);
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

  async clearCache(page) {
    try {
      const client = await page.target().createCDPSession();
      await client.send('Network.clearBrowserCache');
      await client.send('Network.clearBrowserCookies');
    } catch (error) {
    }
  }

  async clickRandomLink(page) {
    try {
      const clicked = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const validLinks = links.filter(link => {
          const href = link.href;
          const text = link.textContent.trim();
          return href && 
                 !href.includes('#') && 
                 !href.startsWith('javascript:') &&
                 !href.includes('mailto:') &&
                 !href.includes('tel:') &&
                 text.length > 5 &&
                 link.offsetWidth > 0 &&
                 link.offsetHeight > 0;
        });

        if (validLinks.length > 0) {
          const randomLink = validLinks[Math.floor(Math.random() * validLinks.length)];
          randomLink.click();
          return true;
        }
        return false;
      });

      return clicked;
    } catch (error) {
      return false;
    }
  }

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
    
    const isError = step.includes('ERROR') || step.includes('FAILED');
    const isImportant = step.includes('SESSION_') || step.includes('RETRY_') || step.includes('PROXY_');
    
    if (isError || isImportant) {
      const logMessage = `[${sessionId}] ${step}: ${message}`;
      
      if (isError) {
        console.error('❌', logMessage);
      } else {
        console.log('🔧', logMessage);
      }
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