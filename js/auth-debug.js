// ===== Enhanced Authentication Debugging =====
// Wraps authentication calls with detailed logging for iOS debugging

(function() {
  'use strict';

  // Store original authentication function
  let originalAuthFunc = null;

  // Wait for GGTrainingAPI to be available
  const enhanceAuth = () => {
    if (!window.GGTrainingAPI || !window.GGTrainingAPI.authenticateWithTempToken) {
      setTimeout(enhanceAuth, 100);
      return;
    }

    if (originalAuthFunc) return; // Already enhanced

    originalAuthFunc = window.GGTrainingAPI.authenticateWithTempToken;
    
    // Replace with enhanced version
    window.GGTrainingAPI.authenticateWithTempToken = async function(tempToken) {
      window.iosDebug.log('🔐 ========== AUTH PROCESS START ==========');
      window.iosDebug.log('📝 Temp Token Received:', tempToken ? `${tempToken.substring(0, 10)}...` : 'EMPTY');
      
      // Check for iOS-specific issues
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isPrivateMode = await checkPrivateMode();
      
      window.iosDebug.log('📱 iOS Device:', isIOS);
      window.iosDebug.log('🔒 Private Mode:', isPrivateMode);
      
      if (isIOS && isPrivateMode) {
        window.iosDebug.warn('⚠️ iOS Private Mode detected - storage may be limited');
      }

      // Log current storage state
      try {
        const currentAuth = localStorage.getItem('gg_auth');
        window.iosDebug.log('💾 Current Auth in Storage:', currentAuth ? 'EXISTS' : 'EMPTY');
      } catch (e) {
        window.iosDebug.error('❌ Cannot access localStorage:', e.message);
      }

      try {
        // Call original function with enhanced error catching
        window.iosDebug.log('🔄 Calling original authenticateWithTempToken...');
        
        const result = await originalAuthFunc.call(this, tempToken);
        
        window.iosDebug.log('✅ Auth function returned:', result);
        
        // Verify storage was updated
        try {
          const newAuth = localStorage.getItem('gg_auth');
          window.iosDebug.log('💾 Auth after call:', newAuth ? 'UPDATED' : 'STILL EMPTY');
          if (newAuth) {
            const parsed = JSON.parse(newAuth);
            window.iosDebug.log('📊 Auth data:', {
              hasAccessToken: !!parsed.access_token,
              hasRefreshToken: !!parsed.refresh_token,
              expiresAt: parsed.expires_at
            });
          }
        } catch (e) {
          window.iosDebug.error('❌ Cannot verify storage:', e.message);
        }
        
        window.iosDebug.log('🔐 ========== AUTH PROCESS END (SUCCESS) ==========');
        return result;
        
      } catch (error) {
        window.iosDebug.error('❌ ========== AUTH PROCESS FAILED ==========');
        window.iosDebug.error('Error Type:', error.name);
        window.iosDebug.error('Error Message:', error.message);
        window.iosDebug.error('Error Stack:', error.stack);
        
        // Check for specific iOS issues
        if (error.message.includes('storage') || error.message.includes('quota')) {
          window.iosDebug.error('💡 Possible iOS storage quota issue');
        }
        if (error.message.includes('network') || error.message.includes('fetch')) {
          window.iosDebug.error('💡 Possible network/CORS issue');
        }
        if (error.message.includes('JSON')) {
          window.iosDebug.error('💡 Possible response parsing issue');
        }
        
        throw error;
      }
    };

    window.iosDebug.log('✅ Authentication debugging enhanced');
  };

  // Helper to detect private browsing mode
  async function checkPrivateMode() {
    try {
      // Try to use localStorage
      localStorage.setItem('test', '1');
      localStorage.removeItem('test');
      return false;
    } catch (e) {
      return true;
    }
  }

  // Start enhancement when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceAuth);
  } else {
    enhanceAuth();
  }

})();

// ===== Additional Network Debugging =====

// Test CORS and endpoint availability
// NOTE: This is an on-demand helper only. It is intentionally NOT auto-run,
// because probing the auth endpoint with a dummy token produces a misleading
// 500 error in the console on every page load. Call testEndpoint(url) manually
// from the console if you need to check an endpoint.
async function testEndpoint(url) {
  window.iosDebug.log('🧪 Testing endpoint:', url);
  
  try {
    // Try a simple HEAD request first
    const headResponse = await fetch(url, { 
      method: 'HEAD',
      mode: 'cors'
    }).catch(e => {
      window.iosDebug.warn('HEAD request failed (might be normal):', e.message);
      return null;
    });
    
    if (headResponse) {
      window.iosDebug.log('✅ HEAD request succeeded:', {
        status: headResponse.status,
        headers: Object.fromEntries(headResponse.headers.entries())
      });
    }
    
    // Try OPTIONS for CORS preflight
    const optionsResponse = await fetch(url, {
      method: 'OPTIONS',
      mode: 'cors'
    }).catch(e => {
      window.iosDebug.warn('OPTIONS request failed:', e.message);
      return null;
    });
    
    if (optionsResponse) {
      window.iosDebug.log('✅ CORS preflight (OPTIONS):', {
        status: optionsResponse.status,
        corsHeaders: {
          'access-control-allow-origin': optionsResponse.headers.get('access-control-allow-origin'),
          'access-control-allow-methods': optionsResponse.headers.get('access-control-allow-methods'),
          'access-control-allow-headers': optionsResponse.headers.get('access-control-allow-headers')
        }
      });
    }
  } catch (error) {
    window.iosDebug.error('❌ Endpoint test failed:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
  }
}

// (Auto-test of the auth endpoint on page load has been removed. It fired a
// dummy temp_token=test request that always returned 500, which looked like a
// real error in the console and repeatedly sent people chasing a non-issue.)

// ===== URL Parameter Debugging =====
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const tempToken = urlParams.get('temp_token');
  
  window.iosDebug.log('🔗 URL Parameters:', {
    fullURL: window.location.href,
    hasParams: urlParams.toString().length > 0,
    temp_token: tempToken ? `${tempToken.substring(0, 10)}...` : 'NOT FOUND',
    allParams: Object.fromEntries(urlParams.entries())
  });
  
  // Auto-fill temp token if found in URL
  if (tempToken) {
    const input = document.getElementById('tempTokenInput');
    if (input) {
      input.value = tempToken;
      window.iosDebug.log('✅ Auto-filled temp_token from URL');
    }
  }
});
