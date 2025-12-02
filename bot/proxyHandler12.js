[file name]: proxyHandler.js
[file content begin]
// bot/proxyHandler.js - Sistem Proxy 3 Jenis Lengkap dengan Web Proxy Database
class ProxyHandler {
    constructor() {
        this.webProxies = [];
        this.freshProxies = [];
        this.vpnExtensions = [];
        this.lastUpdate = null;
        this.isUpdating = false;
        
        // Tracking penggunaan proxy per session
        this.usedProxies = new Map();
        this.activeFreshProxies = []; // Tracking proxy fresh yang aktif
    }

    // Method untuk mengupdate proxy setiap 5 menit
    async updateProxies() {
        if (this.isUpdating) {
            console.log('⚠️ Proxy update already in progress...');
            return;
        }

        this.isUpdating = true;
        try {
            console.log('🔄 Memperbarui daftar proxy dari SEMUA sumber...');
            
            // Update SEMUA sumber proxy secara paralel
            await Promise.allSettled([
                this.updateWebProxies(),
                this.updateFreshProxies(),
                this.updateVPNExtensions()
            ]);
            
            this.lastUpdate = new Date();
            
            // Summary semua proxy
            console.log('✅ SEMUA PROXY UPDATED SUCCESSFULLY');
            console.log(`📊 STATS SUMMARY:`);
            console.log(`   🌐 Web Proxies: ${this.webProxies.length} aktif`);
            console.log(`   🆕 Fresh Proxies: ${this.activeFreshProxies.length} aktif`);
            console.log(`   🛡️ VPN Extensions: ${this.vpnExtensions.length} aktif`);
            console.log(`   📈 TOTAL: ${this.webProxies.length + this.activeFreshProxies.length + this.vpnExtensions.length} proxy aktif`);
            
            // Log detail per tipe
            this.logActiveProxies();
            
        } catch (error) {
            console.error('❌ Error updating proxies:', error);
        } finally {
            this.isUpdating = false;
        }
    }

    async updateWebProxies() {
        try {
            console.log('🔧 Updating Web Proxies...');
            
            // Database lengkap web proxy dengan berbagai metode
            const webProxyDatabase = [
                {
                    name: "CroxyProxy",
                    url: "https://croxyproxy.com/",
                    method: "direct_url",
                    pattern: "https://croxyproxy.com/?q={url}",
                    inputSelectors: ['input[name="url"]', 'input[type="url"]', '#url'],
                    submitSelectors: ['button[type="submit"]', 'input[type="submit"]', '.btn-proxy'],
                    working: true
                },
                {
                    name: "ProxySite",
                    url: "https://www.proxysite.com/",
                    method: "form_fill", 
                    pattern: null,
                    inputSelectors: ['input[name="q"]', 'input[name="url"]', '#url'],
                    submitSelectors: ['button#proxysite_submit', 'button[type="submit"]', '.btn-go'],
                    working: true
                },
                {
                    name: "HideMe",
                    url: "https://hide.me/en/proxy",
                    method: "form_fill",
                    pattern: null,
                    inputSelectors: ['input[name="url"]', '#url', '.url-input'],
                    submitSelectors: ['button[type="submit"]', '.btn-proxy', '.btn-success'],
                    working: true
                },
                {
                    name: "KProxy",
                    url: "https://kproxy.com/",
                    method: "form_fill",
                    pattern: null,
                    inputSelectors: ['input[name="url"]', '#url'],
                    submitSelectors: ['button[type="submit"]', '.btn-proxy'],
                    working: true
                },
                {
                    name: "4EverProxy",
                    url: "https://4everproxy.com/",
                    method: "form_fill",
                    pattern: null,
                    inputSelectors: ['input[name="url"]', '#url'],
                    submitSelectors: ['button[type="submit"]', '.btn-go'],
                    working: true
                },
                {
                    name: "Hidester",
                    url: "https://hidester.com/proxy/",
                    method: "form_fill",
                    pattern: null,
                    inputSelectors: ['input[name="url"]', '#url'],
                    submitSelectors: ['button[type="submit"]', '.btn-proxy'],
                    working: true
                },
                {
                    name: "ProxyBay",
                    url: "https://proxybay.github.io/",
                    method: "form_fill",
                    pattern: null,
                    inputSelectors: ['input[name="url"]', '#url'],
                    submitSelectors: ['button[type="submit"]', '.btn-go'],
                    working: true
                },
                {
                    name: "Proxy4Free",
                    url: "https://www.proxy4free.com/",
                    method: "form_fill",
                    pattern: null,
                    inputSelectors: ['input[name="url"]', '#url'],
                    submitSelectors: ['button[type="submit"]', '.btn-proxy'],
                    working: true
                },
                {
                    name: "FreeProxyWorld",
                    url: "https://freeproxy.world/",
                    method: "form_fill",
                    pattern: null,
                    inputSelectors: ['input[name="url"]', '#url'],
                    submitSelectors: ['button[type="submit"]', '.btn-go'],
                    working: true
                }
            ];

            // Test setiap web proxy dan simpan yang aktif
            this.webProxies = [];
            const testPromises = webProxyDatabase.map(async (proxyInfo, index) => {
                try {
                    console.log(`   Testing web proxy ${index + 1}/${webProxyDatabase.length}: ${proxyInfo.name}`);
                    
                    if (await this.testWebProxy(proxyInfo.url)) {
                        const webProxy = {
                            name: proxyInfo.name,
                            url: proxyInfo.url,
                            method: proxyInfo.method,
                            pattern: proxyInfo.pattern,
                            inputSelectors: proxyInfo.inputSelectors || [],
                            submitSelectors: proxyInfo.submitSelectors || [],
                            type: 'web',
                            working: true,
                            lastTested: new Date(),
                            successRate: 0.8
                        };
                        
                        this.webProxies.push(webProxy);
                        console.log(`      ✅ ${proxyInfo.name} - ACTIVE`);
                        return { success: true, proxy: proxyInfo.name };
                    } else {
                        console.log(`      ❌ ${proxyInfo.name} - FAILED`);
                        return { success: false, proxy: proxyInfo.name };
                    }
                } catch (error) {
                    console.log(`      ⚠️ ${proxyInfo.name} - ERROR: ${error.message}`);
                    return { success: false, proxy: proxyInfo.name };
                }
            });
            
            const results = await Promise.allSettled(testPromises);
            const successCount = results.filter(r => r.value?.success).length;
            
            console.log(`🌐 Web Proxies: ${successCount}/${webProxyDatabase.length} aktif`);
            
        } catch (error) {
            console.error('❌ Error updating web proxies:', error.message);
        }
    }

    async updateFreshProxies() {
        console.log('🔧 Updating Fresh Proxies...');
        
        const proxySources = [
            'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
            'https://proxylist.geonode.com/api/proxy-list?limit=100&page=1&sort_by=lastChecked&sort_type=desc',
            'https://www.proxy-list.download/api/v1/get?type=https',
            'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
            'https://raw.githubusercontent.com/mertguvencli/http-proxy-list/main/proxy-list/data.txt',
            'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
            'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
            'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt'
        ];

        this.freshProxies = [];
        this.activeFreshProxies = [];
        
        // Ambil proxy dari semua source secara paralel
        const sourcePromises = proxySources.map(async (source, index) => {
            try {
                console.log(`   Source ${index + 1}/${proxySources.length}: ${source}`);
                const response = await this.fetchWithTimeout(source, 15000);
                const text = await response.text();
                
                // Parse semua format proxy
                const rawProxies = this.parseProxyText(text);
                
                console.log(`      Found ${rawProxies.length} raw proxies`);
                
                // Test maksimal 10 proxy per source untuk efisiensi
                const testBatch = rawProxies.slice(0, 10);
                
                for (const proxy of testBatch) {
                    if (this.activeFreshProxies.length >= 50) {
                        console.log(`      Reached max limit (50), stopping...`);
                        break;
                    }
                    
                    const proxyString = `${proxy.ip}:${proxy.port}`;
                    const proxyType = proxy.type;
                    
                    // Test proxy dengan timeout yang wajar
                    const isWorking = await this.testProxyConnection(proxyString, proxyType);
                    
                    if (isWorking) {
                        const activeProxy = {
                            ip: proxy.ip,
                            port: proxy.port,
                            type: proxyType,
                            protocol: proxyType === 'socks' ? 'socks5' : 'http',
                            active: true,
                            lastTested: new Date(),
                            source: source,
                            country: proxy.country || 'unknown',
                            responseTime: proxy.responseTime || 0
                        };
                        
                        this.freshProxies.push(activeProxy);
                        this.activeFreshProxies.push(activeProxy);
                        
                        console.log(`      ✅ ${proxyType.toUpperCase()} ${proxyString} - ACTIVE`);
                    } else {
                        console.log(`      ❌ ${proxyType.toUpperCase()} ${proxyString} - FAILED`);
                    }
                }
                
                return { source, success: true, count: rawProxies.length };
                
            } catch (error) {
                console.log(`      ⚠️ Error from ${source}: ${error.message}`);
                return { source, success: false, error: error.message };
            }
        });
        
        const results = await Promise.allSettled(sourcePromises);
        const successfulSources = results.filter(r => r.value?.success).length;
        
        console.log(`🆕 Fresh Proxies: ${this.activeFreshProxies.length} aktif dari ${successfulSources}/${proxySources.length} sumber`);
        
        // Log detail jika ada proxy aktif
        if (this.activeFreshProxies.length > 0) {
            const httpCount = this.activeFreshProxies.filter(p => p.protocol === 'http').length;
            const socksCount = this.activeFreshProxies.filter(p => p.protocol === 'socks5').length;
            console.log(`   📊 Breakdown: HTTP: ${httpCount}, SOCKS5: ${socksCount}`);
        }
    }

    async updateVPNExtensions() {
        console.log('🔧 Updating VPN Extensions...');
        
        try {
            // Database VPN extensions yang bisa digunakan
            const vpnDatabase = [
                { 
                    name: "Hoxx VPN", 
                    id: "gjonfchgjmgnkhfajapkcgenabmfmolf", 
                    description: "Free VPN with multiple locations",
                    active: true,
                    type: "vpn" 
                },
                { 
                    name: "Touch VPN", 
                    id: "bihmplhobchoageeokmgbdihknkjbknd", 
                    description: "One-click VPN service",
                    active: true,
                    type: "vpn" 
                },
                { 
                    name: "Hotspot Shield", 
                    id: "gjoijpfmdhbjkkgnhgbomjakjemaipfi", 
                    description: "Popular free VPN",
                    active: true,
                    type: "vpn" 
                },
                { 
                    name: "ZenMate VPN", 
                    id: "fdcgdnkidjaadafnichfpabhfomcebme", 
                    description: "Security and privacy VPN",
                    active: true,
                    type: "vpn" 
                },
                { 
                    name: "Betternet VPN", 
                    id: "fumhjocefapfjdadapghcgbofencplpg", 
                    description: "Unlimited free VPN",
                    active: true,
                    type: "vpn" 
                },
                { 
                    name: "SetupVPN", 
                    id: "fgbkdbjniinlcfkjmjgldkjbcofjeidg", 
                    description: "Lifetime free VPN",
                    active: true,
                    type: "vpn" 
                },
                { 
                    name: "TunnelBear VPN", 
                    id: "omdakjcmkglenbhjadbccaookpfjihpa", 
                    description: "Simple and secure VPN",
                    active: true,
                    type: "vpn" 
                },
                { 
                    name: "Windscribe VPN", 
                    id: "hnmpcagpplmpfojmgmnngilcnanddlhb", 
                    description: "Free VPN with generous data",
                    active: true,
                    type: "vpn" 
                },
                { 
                    name: "Urban VPN", 
                    id: "pfnhbggmgoenooifcpfgoijogpbgjpjm", 
                    description: "Unlimited bandwidth VPN",
                    active: true,
                    type: "vpn" 
                },
                { 
                    name: "Free VPN", 
                    id: "pnpkjjpbgohkklckieh9ifgopcjondeg", 
                    description: "Simple free VPN",
                    active: true,
                    type: "vpn" 
                }
            ];
            
            this.vpnExtensions = vpnDatabase;
            console.log(`🛡️ VPN Extensions: ${vpnDatabase.length} tersedia`);
            
            // Log daftar VPN
            vpnDatabase.forEach((vpn, index) => {
                console.log(`   ${index + 1}. ${vpn.name} - ${vpn.description}`);
            });
            
        } catch (error) {
            console.error('❌ Error updating VPN extensions:', error.message);
            this.vpnExtensions = [];
        }
    }

    // Method untuk parse berbagai format proxy text
    parseProxyText(text) {
        const proxies = [];
        const lines = text.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            
            // Format 1: ip:port
            if (trimmed.match(/^\d+\.\d+\.\d+\.\d+:\d+$/)) {
                const [ip, port] = trimmed.split(':');
                proxies.push({
                    ip,
                    port: parseInt(port),
                    type: 'http',
                    country: 'unknown'
                });
            }
            // Format 2: ip:port:country
            else if (trimmed.match(/^\d+\.\d+\.\d+\.\d+:\d+:[A-Z]{2}$/)) {
                const [ip, port, country] = trimmed.split(':');
                proxies.push({
                    ip,
                    port: parseInt(port),
                    type: 'http',
                    country
                });
            }
            // Format 3: socks5://ip:port
            else if (trimmed.includes('socks5://')) {
                const match = trimmed.match(/socks5:\/\/(\d+\.\d+\.\d+\.\d+):(\d+)/);
                if (match) {
                    proxies.push({
                        ip: match[1],
                        port: parseInt(match[2]),
                        type: 'socks',
                        country: 'unknown'
                    });
                }
            }
            // Format 4: http://ip:port
            else if (trimmed.includes('http://')) {
                const match = trimmed.match(/http:\/\/(\d+\.\d+\.\d+\.\d+):(\d+)/);
                if (match) {
                    proxies.push({
                        ip: match[1],
                        port: parseInt(match[2]),
                        type: 'http',
                        country: 'unknown'
                    });
                }
            }
            // Format 5: https://ip:port
            else if (trimmed.includes('https://')) {
                const match = trimmed.match(/https:\/\/(\d+\.\d+\.\d+\.\d+):(\d+)/);
                if (match) {
                    proxies.push({
                        ip: match[1],
                        port: parseInt(match[2]),
                        type: 'http',
                        country: 'unknown'
                    });
                }
            }
            // Format 6: ip port
            else if (trimmed.match(/^\d+\.\d+\.\d+\.\d+\s+\d+$/)) {
                const [ip, port] = trimmed.split(/\s+/);
                proxies.push({
                    ip,
                    port: parseInt(port),
                    type: 'http',
                    country: 'unknown'
                });
            }
            // Format 7: ip:port@user:pass (authenticated)
            else if (trimmed.includes('@')) {
                const parts = trimmed.split('@');
                if (parts.length === 2) {
                    const [credentials, host] = parts;
                    const [user, pass] = credentials.split(':');
                    const [ip, port] = host.split(':');
                    
                    if (ip && port) {
                        proxies.push({
                            ip,
                            port: parseInt(port),
                            type: 'http',
                            country: 'unknown',
                            auth: { user, pass }
                        });
                    }
                }
            }
        }
        
        return proxies;
    }

    // Test koneksi proxy yang lebih baik
    async testProxyConnection(proxyString, proxyType) {
        const [ip, port] = proxyString.split(':');
        const portNum = parseInt(port);
        
        if (!ip || !portNum || portNum < 1 || portNum > 65535) {
            return false;
        }

        try {
            // Test dengan socket connection
            const net = require('net');
            
            return new Promise((resolve) => {
                const socket = new net.Socket();
                let connected = false;
                
                // Timeout setelah 10 detik
                const timeout = setTimeout(() => {
                    if (!connected) {
                        socket.destroy();
                        resolve(false);
                    }
                }, 10000);
                
                socket.connect(portNum, ip, () => {
                    connected = true;
                    clearTimeout(timeout);
                    socket.destroy();
                    resolve(true);
                });
                
                socket.on('error', () => {
                    if (!connected) {
                        clearTimeout(timeout);
                        socket.destroy();
                        resolve(false);
                    }
                });
                
                socket.on('timeout', () => {
                    if (!connected) {
                        clearTimeout(timeout);
                        socket.destroy();
                        resolve(false);
                    }
                });
            });
            
        } catch (error) {
            console.log(`   ⚠️ Test error for ${proxyString}: ${error.message}`);
            return false;
        }
    }

    // Test web proxy dengan HTTP request
    async testWebProxy(url) {
        try {
            const response = await this.fetchWithTimeout(url, 10000);
            // Cek jika response sukses (status 200-399) atau redirect (300-399)
            return response.status >= 200 && response.status < 400;
        } catch (error) {
            return false;
        }
    }

    // Fetch dengan timeout
    async fetchWithTimeout(url, timeout = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, { 
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    // Method untuk mendapatkan proxy yang BELUM PERNAH digunakan di session ini
    getFreshProxyForSession(sessionId, proxyType) {
        const usedProxies = this.usedProxies.get(sessionId) || new Set();
        
        let availableProxies = [];
        switch(proxyType) {
            case 'web':
                availableProxies = this.webProxies;
                break;
            case 'fresh':
                availableProxies = this.activeFreshProxies; // Hanya gunakan yang aktif
                break;
            case 'vpn':
                availableProxies = this.vpnExtensions;
                break;
            default:
                console.log(`❌ Unknown proxy type: ${proxyType}`);
                return null;
        }
        
        if (availableProxies.length === 0) {
            console.log(`❌ Tidak ada proxy ${proxyType} yang tersedia (0 available)`);
            
            // Jika tidak ada proxy fresh, coba ambil dari web proxies sebagai fallback
            if (proxyType === 'fresh' && this.webProxies.length > 0) {
                console.log(`🔄 Fallback ke web proxy karena fresh tidak tersedia`);
                return this.getFreshProxyForSession(sessionId, 'web');
            }
            
            return null;
        }
        
        // Filter proxy yang belum digunakan di session ini
        const unusedProxies = availableProxies.filter(proxy => 
            !usedProxies.has(this.getProxyKey(proxy))
        );
        
        // Jika semua sudah digunakan, reset dan gunakan semua
        const proxiesToUse = unusedProxies.length > 0 ? unusedProxies : availableProxies;
        
        if (proxiesToUse.length === 0) {
            console.log(`❌ Tidak ada proxy ${proxyType} yang bisa digunakan`);
            return null;
        }
        
        // Pilih proxy secara acak
        const selectedProxy = proxiesToUse[Math.floor(Math.random() * proxiesToUse.length)];
        
        // Tandai proxy sebagai digunakan
        usedProxies.add(this.getProxyKey(selectedProxy));
        this.usedProxies.set(sessionId, usedProxies);
        
        console.log(`🎯 [${sessionId}] Selected ${proxyType} proxy: ${this.getProxyDisplay(selectedProxy)}`);
        
        return selectedProxy;
    }

    // Method untuk mendapatkan proxy berdasarkan type yang diminta
    getProxyByType(type, sessionId) {
        if (!sessionId) {
            throw new Error('Session ID required for proxy selection');
        }
        
        console.log(`🔍 Getting ${type} proxy for session: ${sessionId}`);
        
        const proxy = this.getFreshProxyForSession(sessionId, type);
        
        if (!proxy) {
            throw new Error(`No available ${type} proxies for session ${sessionId}`);
        }
        
        // Log detail proxy yang dipilih
        console.log(`✅ [${sessionId}] Selected ${type} proxy details:`, {
            type: proxy.type || proxy.protocol || 'unknown',
            address: proxy.ip ? `${proxy.ip}:${proxy.port}` : proxy.url || proxy.name,
            country: proxy.country || 'unknown',
            source: proxy.source || 'database'
        });
        
        return proxy;
    }

    getProxyKey(proxy) {
        if (proxy.url) return proxy.url;
        if (proxy.ip && proxy.port) return `${proxy.ip}:${proxy.port}`;
        if (proxy.name) return proxy.name;
        return JSON.stringify(proxy);
    }

    getProxyDisplay(proxy) {
        if (proxy.url) return proxy.url;
        if (proxy.ip && proxy.port) return `${proxy.ip}:${proxy.port}`;
        if (proxy.name) return proxy.name;
        return 'Unknown proxy';
    }

    // Log detail proxy aktif
    logActiveProxies() {
        console.log('\n📋 DETAILED PROXY REPORT:');
        console.log('='.repeat(50));
        
        if (this.webProxies.length > 0) {
            console.log('\n🌐 WEB PROXIES:');
            this.webProxies.forEach((proxy, index) => {
                console.log(`   ${index + 1}. ${proxy.name} - ${proxy.url} (${proxy.method})`);
            });
        }
        
        if (this.activeFreshProxies.length > 0) {
            console.log('\n🆕 FRESH PROXIES:');
            this.activeFreshProxies.slice(0, 10).forEach((proxy, index) => {
                console.log(`   ${index + 1}. ${proxy.protocol.toUpperCase()} ${proxy.ip}:${proxy.port} (${proxy.country})`);
            });
            
            if (this.activeFreshProxies.length > 10) {
                console.log(`   ... and ${this.activeFreshProxies.length - 10} more`);
            }
        }
        
        if (this.vpnExtensions.length > 0) {
            console.log('\n🛡️ VPN EXTENSIONS:');
            this.vpnExtensions.forEach((vpn, index) => {
                console.log(`   ${index + 1}. ${vpn.name} - ${vpn.description}`);
            });
        }
        
        console.log('='.repeat(50));
    }

    // Method untuk mendapatkan semua proxy aktif
    getAllActiveProxies() {
        const activeWebProxies = this.webProxies.filter(p => p.working);
        
        return {
            webProxies: activeWebProxies,
            freshProxies: this.activeFreshProxies, // Hanya yang aktif
            vpnExtensions: this.vpnExtensions.filter(p => p.active),
            lastUpdate: this.lastUpdate,
            stats: {
                totalWeb: activeWebProxies.length,
                totalFresh: this.activeFreshProxies.length,
                totalVPN: this.vpnExtensions.length,
                totalAll: activeWebProxies.length + this.activeFreshProxies.length + this.vpnExtensions.length
            }
        };
    }

    // Method untuk encode URL untuk pattern
    encodeUrlForProxy(targetUrl, pattern) {
        if (!pattern) return targetUrl;
        
        const encodedUrl = encodeURIComponent(targetUrl);
        
        if (pattern.includes('{url}')) {
            return pattern.replace('{url}', encodedUrl);
        }
        if (pattern.includes('{server}')) {
            const servers = ['us', 'eu', 'asia', 'de', 'fr', 'uk'];
            const randomServer = servers[Math.floor(Math.random() * servers.length)];
            return pattern.replace('{server}', randomServer).replace('{url}', encodedUrl);
        }
        
        return pattern + encodedUrl;
    }

    // Method untuk proxy manual (format: ip:port)
    addManualProxy(proxyString) {
        if (proxyString && proxyString.includes(':')) {
            const trimmedProxy = proxyString.trim();
            if (this.validateProxyFormat(trimmedProxy)) {
                const [ip, port] = trimmedProxy.split(':');
                const manualProxy = {
                    ip: ip,
                    port: parseInt(port),
                    type: 'http',
                    protocol: 'http',
                    active: true,
                    lastTested: new Date(),
                    source: 'manual',
                    country: 'manual'
                };
                
                this.freshProxies.push(manualProxy);
                this.activeFreshProxies.push(manualProxy);
                
                console.log(`✅ Manual proxy added: ${trimmedProxy}`);
                return true;
            }
        }
        console.error('❌ Invalid proxy format. Use: ip:port');
        return false;
    }

    // Method untuk menambah multiple proxies
    addMultipleProxies(proxyArray) {
        if (Array.isArray(proxyArray)) {
            let addedCount = 0;
            proxyArray.forEach(proxy => {
                if (proxy && proxy.includes(':') && this.validateProxyFormat(proxy)) {
                    const [ip, port] = proxy.split(':');
                    const manualProxy = {
                        ip: ip,
                        port: parseInt(port),
                        type: 'http',
                        protocol: 'http',
                        active: true,
                        lastTested: new Date(),
                        source: 'manual',
                        country: 'manual'
                    };
                    
                    this.freshProxies.push(manualProxy);
                    this.activeFreshProxies.push(manualProxy);
                    addedCount++;
                }
            });
            console.log(`✅ ${addedCount} manual proxies added`);
            return addedCount;
        }
        return 0;
    }

    // Method untuk clear semua proxy
    clearProxies() {
        this.webProxies = [];
        this.freshProxies = [];
        this.activeFreshProxies = [];
        this.vpnExtensions = [];
        this.usedProxies.clear();
        
        console.log('🧹 All proxies cleared');
    }

    // Method untuk test proxy (basic check)
    validateProxyFormat(proxyString) {
        if (!proxyString || !proxyString.includes(':')) {
            return false;
        }
        const parts = proxyString.split(':');
        if (parts.length !== 2) return false;
        
        const ip = parts[0];
        const port = parseInt(parts[1]);
        
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(ip)) return false;
        
        const ipSegments = ip.split('.');
        for (const segment of ipSegments) {
            const num = parseInt(segment);
            if (num < 0 || num > 255) return false;
        }
        
        if (isNaN(port) || port < 1 || port > 65535) return false;
        
        return true;
    }

    // Auto-update setiap 5 menit
    startAutoUpdate() {
        console.log('🔄 Starting auto-update proxies every 5 minutes...');
        
        // Jalankan update pertama kali
        this.updateProxies();
        
        // Set interval untuk update otomatis
        setInterval(() => {
            this.updateProxies();
        }, 5 * 60 * 1000);
    }

    // Get proxy stats
    getStats() {
        const allProxies = this.getAllActiveProxies();
        return {
            total: allProxies.stats.totalAll,
            web: allProxies.stats.totalWeb,
            fresh: allProxies.stats.totalFresh,
            vpn: allProxies.stats.totalVPN,
            lastUpdate: this.lastUpdate
        };
    }
}

module.exports = ProxyHandler;
[file content end]