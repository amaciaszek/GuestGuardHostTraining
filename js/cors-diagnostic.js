// ===== CORS Diagnostic Widget =====
// Add this to your page to test CORS in real-time

(function() {
  'use strict';
  
  // Create diagnostic panel
  const panel = document.createElement('div');
  panel.id = 'corsDiagnostic';
  panel.innerHTML = `
    <div style="
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      color: #fff;
      padding: 24px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      z-index: 99999;
      max-width: 500px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: none;
    " id="corsPanel">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 18px;">🔍 CORS Diagnostic</h3>
        <button onclick="document.getElementById('corsPanel').style.display='none'" 
          style="background: rgba(255,255,255,0.2); border: none; color: #fff; 
                 padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 14px;">
          Close
        </button>
      </div>
      
      <div id="corsResults" style="
        background: rgba(0,0,0,0.3);
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 16px;
        font-size: 13px;
        line-height: 1.6;
      ">
        Click "Test CORS" to check if your API has CORS configured correctly.
      </div>
      
      <button onclick="testCORS()" style="
        width: 100%;
        background: linear-gradient(135deg, #00d4ff 0%, #0099ff 100%);
        color: #000;
        border: none;
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 700;
        font-size: 14px;
      ">
        Test CORS
      </button>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // Create toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.innerHTML = '🔍 CORS';
  toggleBtn.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
    color: #fff;
    border: none;
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 700;
    font-size: 12px;
    z-index: 99998;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  toggleBtn.onclick = () => {
    const corsPanel = document.getElementById('corsPanel');
    corsPanel.style.display = corsPanel.style.display === 'none' ? 'block' : 'none';
  };
  
  document.body.appendChild(toggleBtn);
  
  // Test function
  window.testCORS = async function() {
    const resultsDiv = document.getElementById('corsResults');
    resultsDiv.innerHTML = '<div style="text-align: center;">Testing... ⏳</div>';
    
    const API_URL = 'https://guestguard-platform.vercel.app/api/training-auth';
    const tests = [];
    
    // Test 1: Simple GET request
    try {
      resultsDiv.innerHTML += '<div style="margin-top: 8px;">Test 1: GET request...</div>';
      
      const response = await fetch(`${API_URL}?temp_token=test-cors`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const corsHeaders = {
        'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
        'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
        'access-control-allow-headers': response.headers.get('access-control-allow-headers'),
        'access-control-allow-credentials': response.headers.get('access-control-allow-credentials')
      };
      
      tests.push({
        name: 'GET Request',
        status: response.status,
        success: response.ok,
        corsHeaders
      });
      
    } catch (error) {
      tests.push({
        name: 'GET Request',
        success: false,
        error: error.message
      });
    }
    
    // Test 2: OPTIONS preflight
    try {
      resultsDiv.innerHTML += '<div>Test 2: OPTIONS preflight...</div>';
      
      const response = await fetch(API_URL, {
        method: 'OPTIONS',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'accept, user-agent'
        }
      });
      
      tests.push({
        name: 'OPTIONS Preflight',
        status: response.status,
        success: response.ok
      });
      
    } catch (error) {
      tests.push({
        name: 'OPTIONS Preflight',
        success: false,
        error: error.message
      });
    }
    
    // Display results
    let html = '<div style="font-weight: 700; margin-bottom: 12px;">Test Results:</div>';
    
    tests.forEach(test => {
      const statusIcon = test.success ? '✅' : '❌';
      const statusColor = test.success ? '#4caf50' : '#f44336';
      
      html += `
        <div style="margin-bottom: 12px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; border-left: 3px solid ${statusColor};">
          <div style="font-weight: 600; margin-bottom: 4px;">${statusIcon} ${test.name}</div>
      `;
      
      if (test.success) {
        html += `<div style="font-size: 12px; color: #ddd;">Status: ${test.status}</div>`;
        
        if (test.corsHeaders) {
          const allowOrigin = test.corsHeaders['access-control-allow-origin'];
          if (allowOrigin) {
            html += `<div style="font-size: 12px; color: #4caf50; margin-top: 4px;">
              ✅ CORS Allow-Origin: ${allowOrigin}
            </div>`;
          } else {
            html += `<div style="font-size: 12px; color: #f44336; margin-top: 4px;">
              ❌ No Access-Control-Allow-Origin header!
            </div>`;
          }
          
          if (test.corsHeaders['access-control-allow-methods']) {
            html += `<div style="font-size: 11px; color: #ddd; margin-top: 2px;">
              Methods: ${test.corsHeaders['access-control-allow-methods']}
            </div>`;
          }
        }
      } else {
        html += `<div style="font-size: 12px; color: #f44336;">Error: ${test.error}</div>`;
        
        if (test.error.includes('Load failed')) {
          html += `
            <div style="font-size: 11px; color: #ffa726; margin-top: 6px; line-height: 1.4;">
              💡 "Load failed" in Safari usually means CORS is blocking the request.
              The server needs to add CORS headers.
            </div>
          `;
        }
      }
      
      html += '</div>';
    });
    
    // Add recommendation
    const allSuccess = tests.every(t => t.success);
    const hasAllowOrigin = tests.some(t => t.corsHeaders?.['access-control-allow-origin']);
    
    if (!allSuccess) {
      html += `
        <div style="margin-top: 16px; padding: 12px; background: rgba(255,152,0,0.2); border-radius: 8px; border-left: 3px solid #ff9800;">
          <div style="font-weight: 600; margin-bottom: 6px;">🔧 Fix Required:</div>
          <div style="font-size: 12px; line-height: 1.5;">
            Your API server needs to return CORS headers. Add this to your Vercel API:
            <pre style="background: rgba(0,0,0,0.4); padding: 8px; border-radius: 4px; margin-top: 6px; overflow-x: auto; font-size: 10px;">
res.setHeader('Access-Control-Allow-Origin', 'https://amaciaszek.github.io');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Accept, User-Agent');</pre>
          </div>
        </div>
      `;
    } else if (!hasAllowOrigin) {
      html += `
        <div style="margin-top: 16px; padding: 12px; background: rgba(255,152,0,0.2); border-radius: 8px;">
          <div style="font-size: 12px;">
            ⚠️ Requests succeed but no CORS headers detected. 
            This may cause issues in Safari. Add CORS headers to be safe.
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="margin-top: 16px; padding: 12px; background: rgba(76,175,80,0.2); border-radius: 8px; border-left: 3px solid #4caf50;">
          <div style="font-weight: 600;">✅ CORS is configured correctly!</div>
          <div style="font-size: 12px; margin-top: 4px;">
            Your API has proper CORS headers. The auth issue must be something else.
          </div>
        </div>
      `;
    }
    
    resultsDiv.innerHTML = html;
  };
  
  console.log('🔍 CORS Diagnostic widget loaded. Click the "🔍 CORS" button to test.');
})();
