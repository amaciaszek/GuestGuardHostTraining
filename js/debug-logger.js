// ===== iOS Debug Logger =====
// On-screen debugging for iOS where console is not accessible

class DebugLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 50;
    this.panel = null;
    this.isVisible = false;
    this.createPanel();
    this.setupGlobalErrorHandling();
  }

  createPanel() {
    this.panel = document.createElement('div');
    this.panel.id = 'iosDebugPanel';
    this.panel.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      max-height: 40vh;
      background: rgba(0, 0, 0, 0.95);
      color: #0f0;
      font-family: 'Courier New', monospace;
      font-size: 10px;
      padding: 10px;
      overflow-y: auto;
      z-index: 99999;
      border-top: 2px solid #0f0;
      display: none;
      line-height: 1.3;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #0f0;
      position: sticky;
      top: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 1;
    `;
    
    const title = document.createElement('div');
    title.textContent = 'iOS Debug Logger';
    title.style.fontWeight = 'bold';
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '5px';
    
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = 'background: #333; color: #0f0; border: 1px solid #0f0; padding: 3px 8px; cursor: pointer; font-size: 10px;';
    clearBtn.onclick = () => this.clear();
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'background: #333; color: #0f0; border: 1px solid #0f0; padding: 3px 8px; cursor: pointer; font-size: 10px;';
    closeBtn.onclick = () => this.hide();
    
    buttonContainer.appendChild(clearBtn);
    buttonContainer.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(buttonContainer);
    
    this.logContainer = document.createElement('div');
    this.panel.appendChild(header);
    this.panel.appendChild(this.logContainer);
    
    // Add toggle button
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.textContent = '🐛 Debug';
    this.toggleBtn.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      background: rgba(0, 255, 0, 0.2);
      color: #0f0;
      border: 1px solid #0f0;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      font-size: 11px;
      z-index: 99998;
      font-family: monospace;
    `;
    this.toggleBtn.onclick = () => this.toggle();
    
    document.body.appendChild(this.panel);
    document.body.appendChild(this.toggleBtn);
  }

  setupGlobalErrorHandling() {
    // Capture all uncaught errors
    window.addEventListener('error', (event) => {
      this.error(`Uncaught Error: ${event.message}`, {
        file: event.filename,
        line: event.lineno,
        col: event.colno,
        error: event.error?.stack
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection:', event.reason);
    });

    // Override console methods to also log to our panel
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };

    console.log = (...args) => {
      originalConsole.log(...args);
      this.log('LOG', ...args);
    };

    console.warn = (...args) => {
      originalConsole.warn(...args);
      this.warn(...args);
    };

    console.error = (...args) => {
      originalConsole.error(...args);
      this.error(...args);
    };

    console.info = (...args) => {
      originalConsole.info(...args);
      this.info(...args);
    };
  }

  formatValue(val) {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val, null, 2);
      } catch (e) {
        return String(val);
      }
    }
    return String(val);
  }

  addLog(type, ...args) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const message = args.map(arg => this.formatValue(arg)).join(' ');
    
    const log = {
      timestamp,
      type,
      message
    };
    
    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    this.render();
  }

  log(...args) {
    this.addLog('log', ...args);
  }

  info(...args) {
    this.addLog('info', ...args);
  }

  warn(...args) {
    this.addLog('warn', ...args);
  }

  error(...args) {
    this.addLog('error', ...args);
  }

  render() {
    this.logContainer.innerHTML = this.logs.map(log => {
      let color = '#0f0';
      if (log.type === 'error') color = '#f00';
      if (log.type === 'warn') color = '#ff0';
      if (log.type === 'info') color = '#0ff';
      
      return `<div style="margin-bottom: 4px; color: ${color};">
        <span style="opacity: 0.6;">[${log.timestamp}]</span>
        <span style="font-weight: bold;">[${log.type.toUpperCase()}]</span>
        <span style="white-space: pre-wrap;">${this.escapeHtml(log.message)}</span>
      </div>`;
    }).join('');
    
    // Auto-scroll to bottom
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.panel.style.display = 'block';
    this.isVisible = true;
    this.render();
  }

  hide() {
    this.panel.style.display = 'none';
    this.isVisible = false;
  }

  clear() {
    this.logs = [];
    this.render();
  }

  // Helper to capture fetch requests
  monitorFetch() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;
      const options = args[1] || {};
      
      this.log(`🌐 FETCH REQUEST: ${options.method || 'GET'} ${url}`);
      if (options.body) {
        this.log('📤 Request Body:', options.body);
      }
      if (options.headers) {
        this.log('📋 Request Headers:', options.headers);
      }
      
      // Log request mode and credentials for CORS debugging
      this.log('🔧 Request Config:', {
        mode: options.mode || 'cors',
        credentials: options.credentials || 'same-origin',
        cache: options.cache || 'default',
        redirect: options.redirect || 'follow'
      });
      
      const startTime = performance.now(); // Declare outside try/catch
      
      try {
        const response = await originalFetch(...args);
        const duration = (performance.now() - startTime).toFixed(2);
        const clonedResponse = response.clone();
        
        this.log(`✅ FETCH RESPONSE: ${response.status} ${url} (${duration}ms)`);
        this.log('📊 Response Headers:', Object.fromEntries(response.headers.entries()));
        
        // Try to read response body
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const json = await clonedResponse.json();
            this.log('📥 Response JSON:', json);
          } else {
            const text = await clonedResponse.text();
            this.log('📥 Response Text:', text.substring(0, 200));
          }
        } catch (e) {
          this.warn('Could not read response body:', e.message);
        }
        
        return response;
      } catch (error) {
        const duration = (performance.now() - startTime).toFixed(2);
        
        this.error(`❌ FETCH ERROR: ${url} ${error.message} (${duration}ms)`);
        
        // Enhanced error details for Safari debugging
        this.error('🔍 Error Details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
          constructor: error.constructor.name
        });
        
        // Check for specific error types
        if (error.name === 'TypeError' && error.message.includes('Load failed')) {
          this.error('💡 Safari "Load failed" error detected. Possible causes:');
          this.error('   1. CORS policy blocking the request');
          this.error('   2. Network error (check internet connection)');
          this.error('   3. SSL/TLS certificate issue');
          this.error('   4. Server not responding');
          this.error('   5. Safari security policy (tracking prevention)');
          this.error('🔧 Try: Check browser console Network tab for more details');
        }
        
        if (error.message.includes('CORS')) {
          this.error('💡 CORS error - server must include proper Access-Control headers');
        }
        
        throw error;
      }
    };
  }

  // Helper to log device info
  logDeviceInfo() {
    this.log('📱 Device Info:', {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`
    });
  }

  // Helper to test localStorage
  testStorage() {
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      this.log('✅ LocalStorage: Working');
    } catch (e) {
      this.error('❌ LocalStorage: Failed', e.message);
    }

    try {
      sessionStorage.setItem('test', 'test');
      sessionStorage.removeItem('test');
      this.log('✅ SessionStorage: Working');
    } catch (e) {
      this.error('❌ SessionStorage: Failed', e.message);
    }
  }
}

// Create global instance
window.iosDebug = new DebugLogger();

// Auto-start monitoring
document.addEventListener('DOMContentLoaded', () => {
  window.iosDebug.log('🚀 Debug Logger Initialized');
  window.iosDebug.logDeviceInfo();
  window.iosDebug.testStorage();
  window.iosDebug.monitorFetch();
});
