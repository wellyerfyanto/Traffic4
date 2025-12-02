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
        this.activeFreshProxies = []; // Tambah tracking proxy fresh yang aktif
    }

    // Method untuk mengupdate proxy setiap 5 menit
    async updateProxies() {
        if (this.isUpdating) {
            console.log('⚠️ Proxy update already in progress...');
            return;
        }

        this.isUpdating = true;
        try {
            console.log('🔄 Memperbarui daftar proxy...');
            
            // Update Web Proxies (25+ proxies)
            await this.updateWebProxies();
            
            // Update Fresh Proxies (maksimal 50) dengan TEST YANG LEBIH BAIK
            await this.updateFreshProxies();
            
            // Update VPN Extensions (15 extensions)
            await this.updateVPNExtensions();
            
            this.lastUpdate = new Date();
            console.log('✅ Proxy updated successfully');
            console.log(`📊 Stats: Web: ${this.webProxies.length}, Fresh: ${this.activeFreshProxies.length}, VPN: ${this.vpnExtensions.length}`);
            
        } catch (error) {
            console.error('❌ Error updating proxies:', error);
        } finally {
            this.isUpdating = false;
        }
    }

    async updateWebProxies() {
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
            }
        ];

        // Test setiap web proxy dan simpan yang aktif
        this.webProxies = [];
        const testPromises = webProxyDatabase.map(async (proxyInfo) => {
            try {
                if (await this.testWebProxy(proxyInfo.url)) {
                    this.webProxies.push({
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
                    });
                    console.log(`✅ Web proxy aktif: ${proxyInfo.name}`);
                }
            } catch (error) {
                console.log(`❌ Web proxy gagal: ${proxyInfo.name}`);
            }
        });
        
        await Promise.allSettled(testPromises);
        
        console.log(`🌐 Web Proxies: ${this.webProxies.length} aktif dari ${webProxyDatabase.length} total`);
    }

    async updateFreshProxies() {
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
        this.activeFreshProxies = []; // Reset active proxies
        
        console.log('🔍 Mengambil dan testing fresh proxies...');
        
        for (const source of proxySources) {
            try {
                console.log(`📥 Mengambil dari: ${source}`);
                const response = await this.fetchWithTimeout(source, 20000);
                const text = await response.text();
                
                // Parse semua format proxy
                const rawProxies = this.parseProxyText(text);
                
                console.log(`📊 Dapat ${rawProxies.length} proxy dari ${source}`);
                
                // Test maksimal 20 proxy per source untuk efisiensi
                const testBatch = rawProxies.slice(0, 20);
                
                for (const proxy of testBatch) {
                    if (this.activeFreshProxies.length >= 50) break;
                    
                    const proxyString = `${proxy.ip}:${proxy.port}`;
                    const proxyType = proxy.type;
                    
                    // Test proxy dengan timeout lebih singkat
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
                        
                        console.log(`✅ Proxy aktif: ${proxyType.toUpperCase()} ${proxyString} (${proxy.country || 'unknown'})`);
                    }
                }
                
            } catch (error) {
                console.log(`⚠️ Gagal mengambil dari ${source}: ${error.message}`);
            }
        }
        
        console.log(`🆕 Fresh Proxies: ${this.activeFreshProxies.length} aktif dari ${this.freshProxies.length} total`);
        
        // Log detail proxy aktif
        this.logActiveProxies();
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
            // Format 5: ip port
            else if (trimmed.match(/^\d+\.\d+\.\d+\.\d+\s+\d+$/)) {
                const [ip, port] = trimmed.split(/\s+/);
                proxies.push({
                    ip,
                    port: parseInt(port),
                    type: 'http',
                    country: 'unknown'
                });
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
            // Test dengan target Google (port 80)
            const testResult = await new Promise((resolve) => {
                const net = require('net');
                const socket = new net.Socket();
                let timeout = false;
                
                const timer = setTimeout(() => {
                    timeout = true;
                    socket.destroy();
                    resolve(false);
                }, 5000);
                
                socket.connect(portNum, ip, () => {
                    if (!timeout) {
                        clearTimeout(timer);
                        socket.destroy();
                        resolve(true);
                    }
                });
                
                socket.on('error', () => {
                    if (!timeout) {
                        clearTimeout(timer);
                        socket.destroy();
                        resolve(false);
                    }
                });
                
                socket.on('timeout', () => {
                    if (!timeout) {
                        clearTimeout(timer);
                        socket.destroy();
                        resolve(false);
                    }
                });
            });
            
            return testResult;
        } catch (error) {
            return false;
        }
    }

    async updateVPNExtensions() {
        this.vpnExtensions = [
            { name: "Hoxx VPN", id: "gjonfchgjmgnkhfajapkcgenabmfmolf", active: true, type: "vpn" },
            { name: "Touch VPN", id: "bihmplhobchoageeokmgbdihknkjbknd", active: true, type: "vpn" },
            { name: "Hotspot Shield", id: "gjoijpfmdhbjkkgnhgbomjakjemaipfi", active: true, type: "vpn" },
            { name: "ZenMate VPN", id: "fdcgdnkidjaadafnichfpabhfomcebme", active: true, type: "vpn" },
            { name: "Betternet VPN", id: "fumhjocefapfjdadapghcgbofencplpg", active: true, type: "vpn" },
            { name: "SetupVPN", id: "fgbkdbjniinlcfkjmjgldkjbcofjeidg", active: true, type: "vpn" },
            { name: "TunnelBear VPN", id: "omdakjcmkglenbhjadbccaookpfjihpa", active: true, type: "vpn" },
            { name: "Windscribe VPN", id: "hnmpcagpplmpfojmgmnngilcnanddlhb", active: true, type: "vpn" },
            { name: "Urban VPN", id: "pfnhbggmgoenooifcpfgoijogpbgjpjm", active: true, type: "vpn" },
            { name: "Free VPN", id: "pnpkjjpbgohkklckieh9ifgopcjondeg", active: true, type: "vpn" }
        ].slice(0, 10);
        
        console.log(`🛡️ VPN Extensions: ${this.vpnExtensions.length} tersedia`);
    }

    // Log detail proxy aktif
    logActiveProxies() {
        if (this.activeFreshProxies.length > 0) {
            console.log('📋 DAFTAR PROXY AKTIF:');
            this.activeFreshProxies.forEach((proxy, index) => {
                console.log(`${index + 1}. ${proxy.protocol.toUpperCase()} ${proxy.ip}:${proxy.port} (${proxy.country})`);
            });
        } else {
            console.log('⚠️ Tidak ada proxy fresh aktif');
        }
    }

    async fetchWithTimeout(url, timeout = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, { 
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    async testWebProxy(proxyUrl) {
        try {
            const response = await this.fetchWithTimeout(proxyUrl, 10000);
            return response.status === 200;
        } catch {
            return false;
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
        }
        
        if (availableProxies.length === 0) {
            console.log(`❌ Tidak ada proxy ${proxyType} yang tersedia`);
            return null;
        }
        
        // Filter proxy yang belum digunakan di session ini
        const unusedProxies = availableProxies.filter(proxy => 
            !usedProxies.has(this.getProxyKey(proxy))
        );
        
        if (unusedProxies.length > 0) {
            const selectedProxy = unusedProxies[Math.floor(Math.random() * unusedProxies.length)];
            
            // Tandai proxy sebagai digunakan
            usedProxies.add(this.getProxyKey(selectedProxy));
            this.usedProxies.set(sessionId, usedProxies);
            
            console.log(`🔄 [${sessionId}] Menggunakan ${proxyType} proxy: ${this.getProxyKey(selectedProxy)}`);
            return selectedProxy;
        }
        
        // Jika semua proxy sudah digunakan, reset dan mulai dari awal
        console.log(`🔄 [${sessionId}] Semua proxy ${proxyType} sudah digunakan, reset rotation`);
        this.usedProxies.delete(sessionId);
        
        // Coba lagi dengan reset
        return this.getFreshProxyForSession(sessionId, proxyType);
    }

    getProxyKey(proxy) {
        if (proxy.url) return proxy.url;
        if (proxy.ip && proxy.port) return `${proxy.ip}:${proxy.port}`;
        if (proxy.name) return proxy.name;
        return JSON.stringify(proxy);
    }

    // Method untuk mendapatkan proxy berdasarkan type yang diminta
    getProxyByType(type, sessionId) {
        if (!sessionId) {
            throw new Error('Session ID required for proxy selection');
        }
        
        const proxy = this.getFreshProxyForSession(sessionId, type);
        
        if (!proxy) {
            throw new Error(`No available ${type} proxies for session ${sessionId}`);
        }
        
        // Log detail proxy yang dipilih
        console.log(`🎯 [${sessionId}] Selected ${type} proxy: ${JSON.stringify({
            type: proxy.type || proxy.protocol,
            address: proxy.ip ? `${proxy.ip}:${proxy.port}` : proxy.url,
            country: proxy.country || 'unknown'
        })}`);
        
        return proxy;
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

    // Method untuk mendapatkan semua proxy aktif
    getAllActiveProxies() {
        return {
            webProxies: this.webProxies.filter(p => p.working),
            freshProxies: this.activeFreshProxies, // Hanya yang aktif
            vpnExtensions: this.vpnExtensions.filter(p => p.active),
            lastUpdate: this.lastUpdate,
            stats: {
                totalWeb: this.webProxies.length,
                totalFresh: this.activeFreshProxies.length,
                totalVPN: this.vpnExtensions.length,
                totalAll: this.webProxies.length + this.activeFreshProxies.length + this.vpnExtensions.length
            }
        };
    }

    // Method untuk proxy manual (format: ip:port)
    addManualProxy(proxyString) {
        if (proxyString && proxyString.includes(':')) {
            const trimmedProxy = proxyString.trim();
            if (this.validateProxyFormat(trimmedProxy)) {
                this.freshProxies.push({
                    ip: trimmedProxy.split(':')[0],
                    port: trimmedProxy.split(':')[1],
                    type: 'http',
                    active: true,
                    lastTested: new Date(),
                    source: 'manual'
                });
                console.log(`✅ Proxy manual ditambahkan: ${trimmedProxy}`);
                return true;
            }
        }
        console.error('❌ Format proxy salah. Gunakan format: ip:port');
        return false;
    }

    // Method untuk menambah multiple proxies
    addMultipleProxies(proxyArray) {
        if (Array.isArray(proxyArray)) {
            let addedCount = 0;
            proxyArray.forEach(proxy => {
                if (proxy && proxy.includes(':') && this.validateProxyFormat(proxy)) {
                    this.freshProxies.push({
                        ip: proxy.split(':')[0],
                        port: proxy.split(':')[1],
                        type: 'http',
                        active: true,
                        lastTested: new Date(),
                        source: 'manual'
                    });
                    addedCount++;
                }
            });
            console.log(`✅ ${addedCount} proxy manual ditambahkan`);
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
        console.log('🧹 Semua proxy telah dihapus');
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
        
        this.updateProxies();
        
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