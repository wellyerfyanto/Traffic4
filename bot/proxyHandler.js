// bot/proxyHandler.js - MODIFIED
class ProxyHandler {
    constructor() {
        this.webProxies = [];
        this.freshProxies = [];
        this.vpnExtensions = [];
        this.lastUpdate = null;
        this.isUpdating = false;
        
        // Tracking penggunaan proxy per session
        this.usedProxies = new Map();
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
            
            // Update Web Proxies (maksimal 20)
            await this.updateWebProxies();
            
            // Update Fresh Proxies (maksimal 50)  
            await this.updateFreshProxies();
            
            // Update VPN Extensions (minimal 10)
            await this.updateVPNExtensions();
            
            this.lastUpdate = new Date();
            console.log('✅ Proxy updated successfully');
            console.log(`📊 Stats: Web: ${this.webProxies.length}, Fresh: ${this.freshProxies.length}, VPN: ${this.vpnExtensions.length}`);
            
        } catch (error) {
            console.error('❌ Error updating proxies:', error);
        } finally {
            this.isUpdating = false;
        }
    }

    async updateWebProxies() {
        // Daftar web proxy yang sudah di-test
        const webProxyList = [
            'https://croxyproxy.com/',
            'https://hide.me/en/proxy',
            'https://www.proxysite.com/',
            'https://kproxy.com/',
            'https://4everproxy.com/',
            'https://hidester.com/proxy/',
            'https://proxybay.github.io/',
            'https://www.proxy4free.com/',
            'https://freeproxy.world/',
            'https://www.sslproxies.org/',
            'https://www.us-proxy.org/',
            'https://free-proxy-list.net/',
            'https://proxy-list.download/',
            'https://spys.one/',
            'https://proxyscrape.com/',
            'https://advanced.name/freeproxy',
            'https://proxylist.to/',
            'https://proxybros.com/',
            'https://proxydb.net/',
            'https://geonode.com/free-proxy-list',
            'https://proxyservers.pro/',
            'https://premproxy.com/',
            'https://proxy-list.org/',
            'https://proxylist.me/',
            'https://proxy-daily.com/'
        ];
        
        // Test setiap web proxy dan simpan yang aktif
        this.webProxies = [];
        const testPromises = webProxyList.slice(0, 25).map(async (proxyUrl) => {
            if (await this.testWebProxy(proxyUrl)) {
                this.webProxies.push({
                    url: proxyUrl,
                    type: 'web',
                    active: true,
                    lastTested: new Date()
                });
                console.log(`✅ Web proxy aktif: ${proxyUrl}`);
            }
        });
        
        await Promise.allSettled(testPromises);
        
        // Batasi maksimal 20 web proxy
        this.webProxies = this.webProxies.slice(0, 20);
        console.log(`🌐 Web Proxies: ${this.webProxies.length} aktif`);
    }

    async updateFreshProxies() {
        // Sumber proxy terbaru
        const proxySources = [
            'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
            'https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc',
            'https://www.proxy-list.download/api/v1/get?type=http',
            'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
            'https://raw.githubusercontent.com/mertguvencli/http-proxy-list/main/proxy-list/data.txt',
            'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
            'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
            'https://api.openproxylist.xyz/http.txt'
        ];

        this.freshProxies = [];
        
        for (const source of proxySources) {
            try {
                console.log(`🔍 Mengambil proxy dari: ${source}`);
                const response = await this.fetchWithTimeout(source, 15000);
                const text = await response.text();
                const proxies = text.split('\n')
                    .map(p => p.trim())
                    .filter(p => p && p.includes(':') && !p.includes('#') && p.split(':').length === 2)
                    .slice(0, 20); // Ambil 20 dari setiap sumber
                
                console.log(`📥 Dapat ${proxies.length} proxy dari ${source}`);
                
                // Test dan tambahkan proxy yang aktif
                const testPromises = proxies.map(async (proxy) => {
                    if (this.freshProxies.length >= 50) return;
                    
                    if (await this.testProxy(proxy)) {
                        this.freshProxies.push({
                            ip: proxy.split(':')[0],
                            port: proxy.split(':')[1],
                            type: 'http',
                            active: true,
                            lastTested: new Date(),
                            source: source
                        });
                        console.log(`✅ Fresh proxy aktif: ${proxy}`);
                    }
                });
                
                await Promise.allSettled(testPromises);
                
            } catch (error) {
                console.log(`⚠️ Gagal mengambil dari ${source}: ${error.message}`);
            }
        }
        console.log(`🆕 Fresh Proxies: ${this.freshProxies.length} aktif`);
    }

    async updateVPNExtensions() {
        // Daftar VPN extensions yang kompatibel
        this.vpnExtensions = [
            {
                name: "Hoxx VPN",
                id: "gjonfchgjmgnkhfajapkcgenabmfmolf",
                active: true,
                type: "vpn"
            },
            {
                name: "Touch VPN",
                id: "bihmplhobchoageeokmgbdihknkjbknd",
                active: true,
                type: "vpn"
            },
            {
                name: "Hotspot Shield",
                id: "gjoijpfmdhbjkkgnhgbomjakjemaipfi",
                active: true,
                type: "vpn"
            },
            {
                name: "ZenMate VPN",
                id: "fdcgdnkidjaadafnichfpabhfomcebme",
                active: true,
                type: "vpn"
            },
            {
                name: "Betternet VPN",
                id: "fumhjocefapfjdadapghcgbofencplpg",
                active: true,
                type: "vpn"
            },
            {
                name: "SetupVPN",
                id: "fgbkdbjniinlcfkjmjgldkjbcofjeidg",
                active: true,
                type: "vpn"
            },
            {
                name: "TunnelBear VPN",
                id: "omdakjcmkglenbhjadbccaookpfjihpa",
                active: true,
                type: "vpn"
            },
            {
                name: "Windscribe VPN",
                id: "hnmpcagpplmpfojmgmnngilcnanddlhb",
                active: true,
                type: "vpn"
            },
            {
                name: "Urban VPN",
                id: "pfnhbggmgoenooifcpfgoijogpbgjpjm",
                active: true,
                type: "vpn"
            },
            {
                name: "Free VPN",
                id: "pnpkjjpbgohkklckieh9ifgopcjondeg",
                active: true,
                type: "vpn"
            },
            {
                name: "VPN Proxy Master",
                id: "hfhfmpjfjcgpknkbjodkhdwkkncmdhl",
                active: true,
                type: "vpn"
            },
            {
                name: "Express VPN",
                id: "bjjgbdlbgjeoankjijbmmenpdhjbbpcd",
                active: true,
                type: "vpn"
            },
            {
                name: "CyberGhost VPN",
                id: "ffbkglfijbcbgblgflchnbphidalaamj",
                active: true,
                type: "vpn"
            },
            {
                name: "Surfshark VPN",
                id: "kogkecmfcgafmhkjlgplopngoilnmbef",
                active: true,
                type: "vpn"
            },
            {
                name: "Private Internet Access",
                id: "jplnlifepflhkbkgonjphmababbpleeg",
                active: true,
                type: "vpn"
            }
        ].slice(0, 15); // Maksimal 15
        
        console.log(`🛡️ VPN Extensions: ${this.vpnExtensions.length} tersedia`);
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

    async testProxy(proxy) {
        try {
            const [ip, port] = proxy.split(':');
            const portNumber = parseInt(port);
            
            if (!ip || !portNumber || portNumber < 1 || portNumber > 65535) {
                return false;
            }

            // Test dengan socket connection
            return new Promise((resolve) => {
                const socket = require('net').Socket();
                socket.setTimeout(5000);
                
                socket.on('connect', () => {
                    socket.destroy();
                    resolve(true);
                });
                
                socket.on('timeout', () => {
                    socket.destroy();
                    resolve(false);
                });
                
                socket.on('error', () => {
                    socket.destroy();
                    resolve(false);
                });
                
                socket.connect(portNumber, ip);
            });
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
                availableProxies = this.freshProxies;
                break;
            case 'vpn':
                availableProxies = this.vpnExtensions;
                break;
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
            
            console.log(`🔄 [${sessionId}] Using fresh ${proxyType} proxy: ${this.getProxyKey(selectedProxy)}`);
            return selectedProxy;
        }
        
        // Jika semua proxy sudah digunakan, reset dan mulai dari awal
        console.log(`🔄 [${sessionId}] All ${proxyType} proxies used, resetting rotation`);
        this.usedProxies.delete(sessionId);
        return this.getFreshProxyForSession(sessionId, proxyType);
    }

    getProxyKey(proxy) {
        if (proxy.url) return proxy.url;
        if (proxy.ip && proxy.port) return `${proxy.ip}:${proxy.port}`;
        if (proxy.name) return proxy.name;
        return JSON.stringify(proxy);
    }

    // Method untuk test proxy sebelum digunakan
    async testProxyBeforeUse(proxy, sessionId) {
        try {
            if (proxy.type === 'web') {
                // Test web proxy
                const testResult = await this.testWebProxy(proxy.url);
                if (testResult) {
                    console.log(`✅ [${sessionId}] Web proxy tested successfully: ${proxy.url}`);
                    return true;
                }
            } else if (proxy.ip && proxy.port) {
                // Test fresh proxy
                const testResult = await this.testProxy(`${proxy.ip}:${proxy.port}`);
                if (testResult) {
                    console.log(`✅ [${sessionId}] Fresh proxy tested successfully: ${proxy.ip}:${proxy.port}`);
                    return true;
                }
            } else {
                // VPN extension - assume working
                return true;
            }
        } catch (error) {
            console.log(`❌ [${sessionId}] Proxy test failed: ${error.message}`);
        }
        return false;
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
        
        return proxy;
    }

    // Method untuk mendapatkan semua proxy aktif
    getAllActiveProxies() {
        return {
            webProxies: this.webProxies.filter(p => p.active),
            freshProxies: this.freshProxies.filter(p => p.active),
            vpnExtensions: this.vpnExtensions.filter(p => p.active),
            lastUpdate: this.lastUpdate,
            stats: {
                totalWeb: this.webProxies.length,
                totalFresh: this.freshProxies.length,
                totalVPN: this.vpnExtensions.length,
                totalAll: this.webProxies.length + this.freshProxies.length + this.vpnExtensions.length
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
        
        // Basic IP validation
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(ip)) return false;
        
        // Validate IP segments
        const ipSegments = ip.split('.');
        for (const segment of ipSegments) {
            const num = parseInt(segment);
            if (num < 0 || num > 255) return false;
        }
        
        // Port validation
        if (isNaN(port) || port < 1 || port > 65535) return false;
        
        return true;
    }

    // Auto-update setiap 5 menit
    startAutoUpdate() {
        console.log('🔄 Starting auto-update proxies every 5 minutes...');
        
        // Update pertama kali
        this.updateProxies();
        
        // Set interval untuk auto-update
        setInterval(() => {
            this.updateProxies();
        }, 5 * 60 * 1000); // 5 menit
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