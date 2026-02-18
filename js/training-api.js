// ===== GuestGuard Training API Integration =====
// Rewritten to use chapter-test.html authentication pattern
(function() {
  'use strict';

  window.GGTrainingAPI = {
    // State
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    allChapters: {},  // key: "1-1", value: { data: {...}, progress: {...} }
    currentChapterKey: null,
    serverProgress: {},
    
    // Extract expiration time from JWT token
    extractJWTExpiration(token) {
      try {
        // JWT format: header.payload.signature
        const parts = token.split('.');
        if (parts.length !== 3) {
          console.warn('🔍 [JWT] Invalid JWT format');
          return null;
        }
        
        // Decode base64url payload
        const payload = parts[1];
        // Replace base64url chars with base64
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if needed
        const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
        // Decode
        const decoded = JSON.parse(atob(padded));
        
        console.log('🔍 [JWT] Decoded token payload:', decoded);
        
        // JWT exp is in seconds, convert to milliseconds
        if (decoded.exp) {
          const expiresAt = decoded.exp * 1000;
          console.log('✅ [JWT] Extracted expiration:', new Date(expiresAt).toISOString());
          return expiresAt;
        }
        
        console.warn('⚠️ [JWT] No exp field in token');
        return null;
      } catch (e) {
        console.error('❌ [JWT] Failed to decode token:', e);
        return null;
      }
    },
    
    // All chapter files in the system
    CHAPTER_FILES: [
      "1-1.json", "1-2.json", "1-3.json", "1-4.json", "1-5.json",
      "2-1.json", "2-2.json", "2-3.json",
      "3-1.json", "3-2.json",
      "4-1.json", "4-2.json",
      "5-1.json", "5-2.json", "5-3.json",
      "6-1.json"
    ],
    
    // Initialize the API system
    async init() {
      console.log('🚀 [INIT DEBUG] ===== Initializing Training API =====');
      
      this.setupProgressUI();
      console.log('🚀 [INIT DEBUG] Progress UI setup complete');
      
      console.log('🚀 [INIT DEBUG] Loading stored auth...');
      this.loadStoredAuth();
      console.log('🚀 [INIT DEBUG] After loadStoredAuth:');
      console.log('  - accessToken:', this.accessToken ? `${this.accessToken.substring(0, 20)}...` : 'NULL');
      console.log('  - refreshToken:', this.refreshToken ? `${this.refreshToken.substring(0, 20)}...` : 'NULL');
      console.log('  - expiresAt:', this.expiresAt || 'NULL');
      
      // If we have an accessToken but no expiresAt, try to extract it from the JWT
      if (this.accessToken && !this.expiresAt) {
        console.log('⚠️ [INIT DEBUG] Have accessToken but no expiresAt, attempting JWT extraction...');
        const extractedExpiry = this.extractJWTExpiration(this.accessToken);
        if (extractedExpiry) {
          this.expiresAt = extractedExpiry;
          localStorage.setItem('gg_expires_at', extractedExpiry);
          console.log('✅ [INIT DEBUG] Extracted and saved expiration from JWT');
        }
      }
      
      // Check for temp_token in URL
      const params = new URLSearchParams(window.location.search);
      const tempToken = params.get('temp_token');
      console.log('🚀 [INIT DEBUG] URL temp_token:', tempToken ? `${tempToken.substring(0, 20)}... (${tempToken.length} chars)` : 'NOT FOUND');
      
      // First priority: Check if we already have a valid stored token
      if (this.accessToken && this.expiresAt && this.expiresAt > Date.now()) {
        console.log('✅ [INIT DEBUG] Already authenticated with valid token');
        this.updateAuthStatus();
        await this.loadAllChaptersAndProgress();
        
        // Clean up URL if temp_token is present (it's already been used)
        if (tempToken) {
          console.log('🧹 [INIT DEBUG] Removing used temp_token from URL');
          const url = new URL(window.location.href);
          url.searchParams.delete('temp_token');
          window.history.replaceState({}, '', url.toString());
        }
      }
      // Special case: Have accessToken but no/expired expiresAt - assume token is still good
      else if (this.accessToken && !tempToken) {
        console.log('⚠️ [INIT DEBUG] Have accessToken but cannot verify expiration');
        console.log('⚠️ [INIT DEBUG] Assuming token is valid and proceeding...');
        this.updateAuthStatus();
        await this.loadAllChaptersAndProgress();
      }
      // Second priority: Try to exchange temp_token if present and we're not authenticated
      else if (tempToken) {
        const tempTokenInput = document.getElementById('tempTokenInput');
        if (tempTokenInput) {
          tempTokenInput.value = tempToken;
        }
        console.log('🎫 [INIT DEBUG] Temp token detected in URL, authenticating...');
        const success = await this.authenticateWithTempToken(tempToken);
        console.log('🎫 [INIT DEBUG] Authentication result:', success ? 'SUCCESS' : 'FAILED');
        
        // Clean up URL after successful authentication
        if (success) {
          console.log('🧹 [INIT DEBUG] Removing used temp_token from URL');
          const url = new URL(window.location.href);
          url.searchParams.delete('temp_token');
          window.history.replaceState({}, '', url.toString());
          console.log('🧹 [INIT DEBUG] URL cleaned:', window.location.href);
        }
      } 
      // No authentication available
      else {
        console.log('⚠️ [INIT DEBUG] No authentication found');
        console.log('⚠️ [INIT DEBUG] - No valid stored token');
        console.log('⚠️ [INIT DEBUG] - No temp_token in URL');
        this.updateAuthStatus();
      }
      
      console.log('🚀 [INIT DEBUG] ===== Initialization Complete =====');
    },
    
    // Retry wrapper for fetch operations with exponential backoff
    async fetchWithRetry(fetchFn, maxRetries = null, operation = 'Operation') {
      const retries = maxRetries !== null ? maxRetries : (typeof SERVER_RETRY_ATTEMPTS !== 'undefined' ? SERVER_RETRY_ATTEMPTS : 3);
      const baseDelay = typeof SERVER_RETRY_BASE_DELAY !== 'undefined' ? SERVER_RETRY_BASE_DELAY : 1000;
      
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(`🔄 ${operation} - Attempt ${attempt}/${retries}`);
          const result = await fetchFn();
          
          if (attempt > 1) {
            console.log(`✅ ${operation} succeeded on attempt ${attempt}`);
          }
          
          return { success: true, data: result };
        } catch (error) {
          console.error(`❌ ${operation} failed on attempt ${attempt}:`, error.message);
          
          if (attempt < retries) {
            // Calculate exponential backoff delay: baseDelay * 2^(attempt-1)
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            console.error(`💥 ${operation} failed after ${retries} attempts`);
            return { success: false, error: error.message };
          }
        }
      }
      
      return { success: false, error: 'Max retries exceeded' };
    },
    
    // Load stored authentication from localStorage
    loadStoredAuth() {
      console.log('🔍 [AUTH DEBUG] Attempting to load stored authentication...');
      
      const access = localStorage.getItem('gg_access_token');
      const refresh = localStorage.getItem('gg_refresh_token');
      const expires = localStorage.getItem('gg_expires_at');
      
      console.log('🔍 [AUTH DEBUG] localStorage contents:');
      console.log('  - access_token:', access ? `${access.substring(0, 20)}... (${access.length} chars)` : 'NOT FOUND');
      console.log('  - refresh_token:', refresh ? `${refresh.substring(0, 20)}... (${refresh.length} chars)` : 'NOT FOUND');
      console.log('  - expires_at:', expires || 'NOT FOUND');
      
      if (access) {
        this.accessToken = access;
        this.refreshToken = refresh;
        this.expiresAt = expires ? parseInt(expires) : null;
        
        // If expiresAt is missing, try to extract from JWT
        if (!this.expiresAt) {
          console.log('⚠️ [AUTH DEBUG] No expires_at in localStorage, attempting JWT extraction...');
          const extractedExpiry = this.extractJWTExpiration(access);
          if (extractedExpiry) {
            this.expiresAt = extractedExpiry;
            // Save it for future use
            localStorage.setItem('gg_expires_at', extractedExpiry);
            console.log('✅ [AUTH DEBUG] Extracted and saved expiration from JWT');
          }
        }
        
        const now = Date.now();
        const expiresIn = this.expiresAt ? Math.floor((this.expiresAt - now) / 1000) : 'N/A';
        
        console.log('📦 [AUTH DEBUG] Loaded stored auth successfully:');
        console.log('  - Token expires at:', this.expiresAt ? new Date(this.expiresAt).toISOString() : 'N/A');
        console.log('  - Current time:', new Date(now).toISOString());
        console.log('  - Expires in:', expiresIn, 'seconds');
        
        // Check if token is expired
        if (this.expiresAt && this.expiresAt < now) {
          console.log('⏰ [AUTH DEBUG] Token is EXPIRED - clearing...');
          this.clearAuth();
        } else if (this.expiresAt) {
          console.log('✅ [AUTH DEBUG] Token is still valid');
        } else {
          console.log('⚠️ [AUTH DEBUG] Cannot verify token expiration (no exp field in JWT)');
        }
      } else {
        console.log('❌ [AUTH DEBUG] No access token found in localStorage');
      }
    },
    
    // Save authentication to localStorage
    saveAuth(access, refresh, expiresAt) {
      console.log('💾 [AUTH DEBUG] Attempting to save authentication...');
      console.log('💾 [AUTH DEBUG] Received parameters:');
      console.log('  - access:', access ? `${access.substring(0, 20)}... (${access.length} chars)` : 'NULL/UNDEFINED');
      console.log('  - refresh:', refresh ? `${refresh.substring(0, 20)}... (${refresh.length} chars)` : 'NULL/UNDEFINED');
      console.log('  - expiresAt:', expiresAt ? `${expiresAt} (${new Date(expiresAt).toISOString()})` : 'NULL/UNDEFINED');
      
      // If expiresAt is missing, try to extract from JWT
      if (!expiresAt && access) {
        console.log('⚠️ [AUTH DEBUG] No expires_at provided by API, attempting to extract from JWT...');
        expiresAt = this.extractJWTExpiration(access);
        
        if (expiresAt) {
          console.log('✅ [AUTH DEBUG] Successfully extracted expiration from JWT');
        } else {
          // Fall back to 1 hour from now if extraction fails
          expiresAt = Date.now() + (60 * 60 * 1000);
          console.log('⚠️ [AUTH DEBUG] Could not extract expiration, using 1-hour default:', new Date(expiresAt).toISOString());
        }
      }
      
      // Save to localStorage
      localStorage.setItem('gg_access_token', access);
      localStorage.setItem('gg_refresh_token', refresh);
      localStorage.setItem('gg_expires_at', expiresAt);
      
      // Verify what was actually saved
      const savedAccess = localStorage.getItem('gg_access_token');
      const savedRefresh = localStorage.getItem('gg_refresh_token');
      const savedExpires = localStorage.getItem('gg_expires_at');
      
      console.log('💾 [AUTH DEBUG] Verified localStorage after save:');
      console.log('  - access_token:', savedAccess ? `${savedAccess.substring(0, 20)}... (${savedAccess.length} chars)` : 'FAILED TO SAVE');
      console.log('  - refresh_token:', savedRefresh ? `${savedRefresh.substring(0, 20)}... (${savedRefresh.length} chars)` : 'FAILED TO SAVE');
      console.log('  - expires_at:', savedExpires ? `${savedExpires} (${new Date(parseInt(savedExpires)).toISOString()})` : 'FAILED TO SAVE');
      
      // Update instance variables
      this.accessToken = access;
      this.refreshToken = refresh;
      this.expiresAt = expiresAt;
      
      const expiresIn = expiresAt ? Math.floor((expiresAt - Date.now()) / 1000) : 'N/A';
      console.log('✅ [AUTH DEBUG] Auth saved to localStorage successfully');
      console.log('✅ [AUTH DEBUG] Instance variables updated');
      console.log('✅ [AUTH DEBUG] Token expires in:', expiresIn, 'seconds');
    },
    
    // Clear authentication
    clearAuth() {
      console.log('🗑️ [AUTH DEBUG] Clearing authentication...');
      console.log('🗑️ [AUTH DEBUG] Current state before clear:');
      console.log('  - accessToken:', this.accessToken ? 'EXISTS' : 'NULL');
      console.log('  - refreshToken:', this.refreshToken ? 'EXISTS' : 'NULL');
      console.log('  - expiresAt:', this.expiresAt || 'NULL');
      
      // Get stack trace to see who called clearAuth
      try {
        throw new Error('Stack trace');
      } catch (e) {
        console.log('🗑️ [AUTH DEBUG] clearAuth called from:');
        console.log(e.stack);
      }
      
      localStorage.removeItem('gg_access_token');
      localStorage.removeItem('gg_refresh_token');
      localStorage.removeItem('gg_expires_at');
      this.accessToken = null;
      this.refreshToken = null;
      this.expiresAt = null;
      this.allChapters = {};
      this.currentChapterKey = null;
      this.serverProgress = {};
      
      console.log('🗑️ [AUTH DEBUG] Auth cleared successfully');
      console.log('🗑️ [AUTH DEBUG] Verifying localStorage:');
      console.log('  - gg_access_token:', localStorage.getItem('gg_access_token') || 'REMOVED');
      console.log('  - gg_refresh_token:', localStorage.getItem('gg_refresh_token') || 'REMOVED');
      console.log('  - gg_expires_at:', localStorage.getItem('gg_expires_at') || 'REMOVED');
    },
    
    // Update authentication status display
    updateAuthStatus() {
      const statusEl = document.getElementById('authStatus');
      
      if (this.accessToken && this.expiresAt) {
        const expiresIn = Math.floor((this.expiresAt - Date.now()) / 1000);
        
        if (expiresIn > 0) {
          statusEl.className = 'auth-status ok';
          statusEl.textContent = `✓ Authenticated (expires in ${expiresIn}s)`;
          
          // Update every second
          if (!this._statusInterval) {
            this._statusInterval = setInterval(() => {
              this.updateAuthStatus();
            }, 1000);
          }
        } else {
          statusEl.className = 'auth-status bad';
          statusEl.textContent = '✗ Token Expired';
          if (this._statusInterval) {
            clearInterval(this._statusInterval);
            this._statusInterval = null;
          }
        }
      } else {
        statusEl.className = 'auth-status bad';
        statusEl.textContent = '✗ Not Authenticated';
        if (this._statusInterval) {
          clearInterval(this._statusInterval);
          this._statusInterval = null;
        }
      }
    },
    
    // Authenticate with temporary token
    async authenticateWithTempToken(tempToken) {
      try {
        console.log('🔑 [AUTH DEBUG] Starting temp token exchange...');
        console.log('🔑 [AUTH DEBUG] Temp token:', tempToken ? `${tempToken.substring(0, 20)}... (${tempToken.length} chars)` : 'NULL/UNDEFINED');
        
        const apiUrl = `${API_BASE}/api/training-auth?temp_token=${encodeURIComponent(tempToken)}`;
        console.log('🔑 [AUTH DEBUG] API URL:', apiUrl);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          cache: 'default',
          redirect: 'follow',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        console.log('🔑 [AUTH DEBUG] Response status:', response.status, response.statusText);
        console.log('🔑 [AUTH DEBUG] Response ok:', response.ok);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('🔑 [AUTH DEBUG] Error response data:', errorData);
          throw new Error(`Token exchange failed: ${errorData.error || response.statusText}`);
        }
        
        const authData = await response.json();
        console.log('✅ [AUTH DEBUG] Token exchange successful!');
        console.log('✅ [AUTH DEBUG] Received auth data structure:', Object.keys(authData));
        console.log('✅ [AUTH DEBUG] Auth data details:');
        console.log('  - access_token:', authData.access_token ? `${authData.access_token.substring(0, 20)}... (${authData.access_token.length} chars)` : 'MISSING');
        console.log('  - refresh_token:', authData.refresh_token ? `${authData.refresh_token.substring(0, 20)}... (${authData.refresh_token.length} chars)` : 'MISSING');
        console.log('  - expires_at:', authData.expires_at || 'MISSING');
        
        // Save auth data
        console.log('🔑 [AUTH DEBUG] Calling saveAuth...');
        this.saveAuth(
          authData.access_token,
          authData.refresh_token,
          authData.expires_at
        );
        console.log('🔑 [AUTH DEBUG] saveAuth completed');
        
        this.updateAuthStatus();
        console.log('🔑 [AUTH DEBUG] Auth status updated');
        
        // Load all chapters and progress
        console.log('🔑 [AUTH DEBUG] Loading chapters and progress...');
        await this.loadAllChaptersAndProgress();
        console.log('🔑 [AUTH DEBUG] Chapters and progress loaded');
        
        return true;
      } catch (e) {
        console.error('❌ [AUTH DEBUG] Authentication failed with error:', e);
        console.error('❌ [AUTH DEBUG] Error message:', e.message);
        console.error('❌ [AUTH DEBUG] Error stack:', e.stack);
        
        // Update status to show error
        const statusEl = document.getElementById('authStatus');
        if (statusEl) {
          statusEl.className = 'auth-status bad';
          statusEl.textContent = '✗ Authentication Failed - Please try again or contact support';
        }
        
        return false;
      }
    },
    
    // Fetch with authentication header
    async fetchWithAuth(url, options = {}) {
      if (!this.accessToken) {
        throw new Error('Not authenticated');
      }
      
      const headers = {
        'Accept': 'application/json',
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`
      };
      
      const fetchOptions = {
        mode: 'cors',
        credentials: 'omit',
        cache: 'default',
        redirect: 'follow',
        ...options,
        headers
      };
      
      return fetch(url, fetchOptions);
    },
    
    // Parse chapter key (e.g., "2-1" -> { module: 2, chapter: 0 })
    parseChapterKey(key) {
      const match = key.match(/(\d+)-(\d+)/);
      if (!match) return null;
      return {
        module: parseInt(match[1]),
        chapter: parseInt(match[2]) - 1  // 0-based
      };
    },
    
    // Load all chapter JSONs and fetch progress from server
    async loadAllChaptersAndProgress() {
      if (!this.accessToken) {
        console.warn('⚠️ Cannot load chapters without authentication');
        return;
      }
      
      try {
        console.log('📚 Loading all chapters...');
        document.getElementById('moduleTitle').textContent = 'Loading chapters and progress...';
        
        // Load all chapter JSON files
        const loadPromises = this.CHAPTER_FILES.map(async (filename) => {
          try {
            const response = await fetch(`json/${filename}`);
            if (!response.ok) throw new Error(`Failed to load ${filename}`);
            const data = await response.json();
            
            const key = filename.replace('.json', '');
            
            // Get accurate segment count from SEGMENT_TIMINGS
            let segmentCount = 0;
            if (window.SEGMENT_TIMINGS && window.SEGMENT_TIMINGS[key]) {
              segmentCount = window.SEGMENT_TIMINGS[key].segments.length;
              console.log(`✓ Loaded ${filename} - ${segmentCount} segments (from SEGMENT_TIMINGS)`);
            } else {
              // Fallback to analyzing JSON structure
              if (data.content) segmentCount = data.content.length;
              else if (data.segments) segmentCount = data.segments.length;
              else if (data.hotspots) segmentCount = data.hotspots.length;
              console.log(`✓ Loaded ${filename} - ${segmentCount} segments (from JSON structure)`);
            }
            
            this.allChapters[key] = {
              data: data,
              progress: {
                currentSegment: 0,
                totalSegments: segmentCount,
                completed: false,
                lastUpdated: null
              }
            };
            
          } catch (e) {
            console.error(`✗ Failed to load ${filename}:`, e.message);
          }
        });
        
        await Promise.all(loadPromises);
        console.log('✅ All chapters loaded');
        
        // Show initial progress display with local data (even if all 0%)
        console.log('📊 Displaying initial progress with local chapter structure...');
        this.updateProgressDisplay({ modules: {} });
        
        // Fetch progress from server
        await this.fetchProgressFromServer();
        
        // Find the last completed segment and resume
        this.resumeFromLastProgress();
        
      } catch (e) {
        console.error('❌ Failed to load chapters:', e.message);
        document.getElementById('moduleTitle').textContent = 'Failed to load chapters';
      }
    },
    
    // Count total segments in a chapter
    countSegments(chapterData) {
      // First try to use the accurate SEGMENT_TIMINGS data from config
      const key = this.currentChapterKey;
      if (key && window.SEGMENT_TIMINGS && window.SEGMENT_TIMINGS[key]) {
        const count = window.SEGMENT_TIMINGS[key].segments.length;
        console.log(`✅ Using SEGMENT_TIMINGS for ${key}: ${count} segments`);
        return count;
      }
      
      // Fallback to checking chapterData structure
      if (chapterData) {
        if (chapterData.content && Array.isArray(chapterData.content)) {
          return chapterData.content.length;
        }
        if (chapterData.segments && Array.isArray(chapterData.segments)) {
          return chapterData.segments.length;
        }
        if (chapterData.hotspots && Array.isArray(chapterData.hotspots)) {
          return chapterData.hotspots.length;
        }
      }
      
      console.warn(`⚠️ Could not count segments for chapter, returning 0`);
      return 0;
    },
    
    // Get total duration for a chapter in seconds
    getChapterDuration(chapterKey) {
      if (window.TIMING_TOTALS && window.TIMING_TOTALS[chapterKey]) {
        return window.TIMING_TOTALS[chapterKey];
      }
      return 0;
    },
    
    // Get segment names for a chapter
    getSegmentNames(chapterKey) {
      if (window.SEGMENT_TIMINGS && window.SEGMENT_TIMINGS[chapterKey]) {
        return window.SEGMENT_TIMINGS[chapterKey].segments;
      }
      return [];
    },
    
    // Fetch progress from server
    async fetchProgressFromServer() {
      if (!this.accessToken) return;
      
      try {
        console.log('📥 Fetching progress from server...');
        
        const response = await this.fetchWithAuth(`${API_BASE}/api/training-progress`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Progress fetched:', data);
        
        this.serverProgress = data.training_progress || {};
        
        // Apply server progress to local chapters
        this.applyServerProgress();
        
        // Update progress display
        this.updateProgressDisplay(this.serverProgress);
        
      } catch (e) {
        console.error('❌ Failed to fetch progress:', e.message);
      }
    },
    
    // Apply server progress to local chapter data
    applyServerProgress() {
      const modules = this.serverProgress.modules || {};
      
      for (const key in this.allChapters) {
        const { module, chapter } = this.parseChapterKey(key);
        
        if (modules[module] && modules[module].chapters && modules[module].chapters[chapter]) {
          const serverChapterProgress = modules[module].chapters[chapter];
          
          this.allChapters[key].progress = {
            currentSegment: serverChapterProgress.currentSegment || 0,
            totalSegments: this.allChapters[key].progress.totalSegments,
            completed: serverChapterProgress.completed || false,
            lastUpdated: serverChapterProgress.lastUpdated
          };
          
          console.log(`📍 Applied progress for ${key}: segment ${serverChapterProgress.currentSegment}`);
        }
      }
    },
    
    // Resume from last progress
    resumeFromLastProgress() {
      console.log('\n🔍 ===== AUTO-RESUME: DETERMINING WHICH CHAPTER TO LOAD =====');
      console.log('This system automatically takes you to your last active chapter');
      
      // Separate chapters into categories
      const incompleteWithProgress = [];
      const completed = [];
      const notStarted = [];
      
      for (const key in this.allChapters) {
        const chapter = this.allChapters[key];
        const progress = chapter.progress;
        
        const isCompleted = progress.completed || 
                           (progress.currentSegment >= progress.totalSegments && progress.totalSegments > 0);
        
        const hasProgress = progress.currentSegment > 0;
        
        console.log(`📊 ${key}: ${progress.currentSegment}/${progress.totalSegments} segments | ` +
                   `completed: ${isCompleted} | lastUpdated: ${progress.lastUpdated || 'never'}`);
        
        if (isCompleted) {
          completed.push({ key, ...progress });
        } else if (hasProgress) {
          incompleteWithProgress.push({ key, ...progress });
        } else {
          notStarted.push({ key, ...progress });
        }
      }
      
      console.log(`\n📈 Summary:`);
      console.log(`  - Completed chapters: ${completed.length}`);
      console.log(`  - Incomplete with progress: ${incompleteWithProgress.length}`);
      console.log(`  - Not started: ${notStarted.length}`);
      
      let targetKey = null;
      let reason = '';
      
      // Priority 1: Resume incomplete chapter with most recent progress
      if (incompleteWithProgress.length > 0) {
        // Sort by lastUpdated timestamp (most recent first)
        incompleteWithProgress.sort((a, b) => {
          const timeA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
          const timeB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
          return timeB - timeA; // Most recent first
        });
        
        targetKey = incompleteWithProgress[0].key;
        const lastUpdate = incompleteWithProgress[0].lastUpdated 
          ? new Date(incompleteWithProgress[0].lastUpdated).toLocaleString()
          : 'unknown';
        reason = `📍 RESUMING: Most recent incomplete chapter (${incompleteWithProgress[0].currentSegment}/${incompleteWithProgress[0].totalSegments} segments, last updated: ${lastUpdate})`;
      }
      // Priority 2: Start first not-started chapter
      else if (notStarted.length > 0) {
        // Find first chapter in sequence order
        const ordered = this.CHAPTER_FILES.filter(f => 
          notStarted.some(ns => ns.key === f.replace('.json', ''))
        );
        
        if (ordered.length > 0) {
          targetKey = ordered[0].replace('.json', '');
          reason = '🆕 Starting first chapter with no progress';
        }
      }
      // Priority 3: All chapters completed - go to first chapter
      else if (completed.length > 0) {
        targetKey = '1-1';
        reason = '🎉 All chapters completed - returning to start';
        console.log('🎉 Congratulations! All chapters completed!');
      }
      // Fallback: Start from beginning
      else {
        targetKey = '1-1';
        reason = '🆕 No progress data - starting from beginning';
      }
      
      console.log(`\n✅ AUTO-RESUME DECISION: Load ${targetKey}`);
      console.log(`   ${reason}`);
      console.log('===== END AUTO-RESUME =====\n');
      
      this.currentChapterKey = targetKey;
      this.loadCurrentChapter();
    },
    
    // Load current chapter into the training system
    loadCurrentChapter() {
      if (!this.currentChapterKey || !this.allChapters[this.currentChapterKey]) {
        console.error('❌ Cannot load chapter:', this.currentChapterKey);
        return;
      }
      
      const chapter = this.allChapters[this.currentChapterKey];
      console.log(`📖 Loading chapter ${this.currentChapterKey}...`);
      
      // Reset stage and load the chapter
      window.resetStageShell();
      
      // Create ModularTrainingSystem with the chapter data and current progress
      new ModularTrainingSystem(
        chapter.data,
        0,  // idx not used in new system
        this.currentChapterKey,
        null,  // transcript
        chapter.progress.currentSegment  // start from saved progress
      );
    },
    
    // Show blocking sync failure dialog with retry option
    showSyncFailureDialog(segmentNum, completed, error) {
      // Remove any existing dialog
      const existing = document.getElementById('syncFailureDialog');
      if (existing) existing.remove();
      
      const overlay = document.createElement('div');
      overlay.id = 'syncFailureDialog';
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        z-index: 999999;
        display: grid;
        place-items: center;
        backdrop-filter: blur(4px);
      `;
      
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: linear-gradient(135deg, #1a1f2e, #0f1419);
        border: 2px solid #ff6b6b;
        border-radius: 16px;
        padding: 32px;
        max-width: 500px;
        box-shadow: 0 8px 32px rgba(255, 107, 107, 0.4);
        font-family: ui-monospace, monospace;
      `;
      
      dialog.innerHTML = `
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 64px; margin-bottom: 16px;">⚠️</div>
          <h2 style="margin: 0 0 12px 0; color: #ff6b6b; font-size: 24px; font-weight: 700;">
            Server Connection Failed
          </h2>
          <p style="margin: 0 0 8px 0; color: #9fb0c5; font-size: 14px; line-height: 1.6;">
            Your progress could not be saved to the server after multiple attempts.
          </p>
          <p style="margin: 0; color: #7cf6c9; font-size: 13px; font-weight: 600;">
            ✓ Your segment completion is preserved in memory
          </p>
        </div>
        
        <div style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3); 
                    border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 11px; color: #ff9999; font-weight: 700; margin-bottom: 8px;">
            ERROR DETAILS
          </div>
          <div style="font-size: 12px; color: #d7e2f1; font-family: monospace; word-break: break-word;">
            ${error}
          </div>
        </div>
        
        <div style="background: rgba(124, 246, 201, 0.1); border: 1px solid rgba(124, 246, 201, 0.3);
                    border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 11px; color: #7cf6c9; font-weight: 700; margin-bottom: 8px;">
            WHAT THIS MEANS
          </div>
          <ul style="margin: 0; padding-left: 20px; color: #9fb0c5; font-size: 13px; line-height: 1.8;">
            <li>You won't need to re-watch this segment</li>
            <li>But you cannot proceed until the server confirms your progress</li>
            <li>This ensures your training completion is properly recorded</li>
          </ul>
        </div>
        
        <div style="display: flex; gap: 12px;">
          <button id="retrySync" style="
            flex: 1;
            background: linear-gradient(135deg, #00e0ff, #0099cc);
            color: #001014;
            border: none;
            padding: 14px 24px;
            border-radius: 10px;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            font-family: ui-monospace, monospace;
          ">
            🔄 Retry Connection
          </button>
          <button id="cancelSync" style="
            background: rgba(159, 176, 197, 0.1);
            color: #9fb0c5;
            border: 1px solid rgba(159, 176, 197, 0.3);
            padding: 14px 24px;
            border-radius: 10px;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            font-family: ui-monospace, monospace;
          ">
            Cancel
          </button>
        </div>
        
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(159, 176, 197, 0.2);">
          <p style="margin: 0; font-size: 11px; color: #6b7a8f; text-align: center; line-height: 1.5;">
            💡 TIP: Check your internet connection, then click "Retry Connection"<br>
            If the issue persists, contact your system administrator
          </p>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      // Add event handlers
      const retryBtn = document.getElementById('retrySync');
      const cancelBtn = document.getElementById('cancelSync');
      
      retryBtn.onclick = async () => {
        retryBtn.disabled = true;
        retryBtn.textContent = '⏳ Retrying...';
        
        // Try to post again
        const success = await this.postSegmentProgress(segmentNum, completed);
        
        if (success) {
          // Success! Close dialog and allow progression
          overlay.remove();
        } else {
          // Still failed - update button
          retryBtn.disabled = false;
          retryBtn.textContent = '🔄 Retry Connection';
          
          // Update error message in dialog
          const errorDetail = dialog.querySelector('[style*="word-break"]');
          if (errorDetail) {
            errorDetail.textContent = 'Connection still failing. Please check your network and try again.';
          }
        }
      };
      
      cancelBtn.onclick = () => {
        overlay.remove();
        // User cancelled - they'll need to retry manually or complete the segment again
        console.warn('⚠️ User cancelled sync - segment progress not saved to server');
      };
      
      // Prevent closing by clicking overlay
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          // Do nothing - require explicit action
        }
      };
    },
    
    // Check if all training is complete
    isAllTrainingComplete() {
      // Check if all chapters are completed
      for (const key in this.allChapters) {
        const chapter = this.allChapters[key];
        const progress = chapter.progress;
        
        // A chapter is complete if marked as completed OR all segments are done
        const isCompleted = progress.completed || 
                           (progress.currentSegment >= progress.totalSegments && progress.totalSegments > 0);
        
        if (!isCompleted) {
          return false; // Found an incomplete chapter
        }
      }
      
      // All chapters are complete
      console.log('🎓 ALL TRAINING COMPLETE!');
      return true;
    },
    
    // Post progress for current segment
    async postSegmentProgress(segmentNum, completed = false) {
      if (!this.accessToken || !this.currentChapterKey) {
        console.warn('⚠️ Cannot post progress: not authenticated or no current chapter');
        return false;
      }
      
      const chapter = this.allChapters[this.currentChapterKey];
      if (!chapter) return false;
      
      // Update local progress
      chapter.progress.currentSegment = segmentNum;
      chapter.progress.completed = completed;
      chapter.progress.lastUpdated = new Date().toISOString();
      
      // Build modules data for API
      const modulesData = {};
      
      for (const key in this.allChapters) {
        const { module, chapter: chapNum } = this.parseChapterKey(key);
        const prog = this.allChapters[key].progress;
        
        if (!modulesData[module]) {
          modulesData[module] = { chapters: {} };
        }
        
        modulesData[module].chapters[chapNum] = {
          currentSegment: prog.currentSegment,
          totalSegments: prog.totalSegments,
          completed: prog.completed,
          lastUpdated: prog.lastUpdated
        };
      }
      
      const payload = {
        training_progress: {
          modules: modulesData,
          complete_training: this.isAllTrainingComplete(),
          last_updated: new Date().toISOString()
        }
      };
      
      console.log(`📤 Posting progress: ${this.currentChapterKey} segment ${segmentNum}`);
      
      // Use retry wrapper for posting progress
      const result = await this.fetchWithRetry(async () => {
        const response = await this.fetchWithAuth(`${API_BASE}/api/training-progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          throw new Error(`${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
      }, null, 'Progress POST');
      
      if (result.success) {
        console.log('✅ Progress saved:', result.data);
        
        // Update progress display
        this.updateProgressDisplay(result.data.training_progress);
        
        // Log chapter completion but DON'T auto-advance
        // Let the modular-training-system show the dialog first
        if (completed) {
          console.log(`🎉 Chapter ${this.currentChapterKey} completed!`);
          console.log(`   ⏸️ Waiting for user to click "Continue" in dialog...`);
          // The dialog's "Continue" button will call moveToNextChapter()
        }
        
        return true;
      } else {
        console.error('❌ Failed to post progress after all retries:', result.error);
        
        // CRITICAL: We CANNOT allow progression without server confirmation
        // This is a certification system - no local cheating allowed!
        
        // Show blocking error dialog with manual retry option
        this.showSyncFailureDialog(segmentNum, completed, result.error);
        
        // Return false to block progression
        return false;
      }
    },
    
    // Move to next chapter
    moveToNextChapter() {
      const currentIndex = this.CHAPTER_FILES.indexOf(`${this.currentChapterKey}.json`);
      
      if (currentIndex >= 0 && currentIndex < this.CHAPTER_FILES.length - 1) {
        const nextFilename = this.CHAPTER_FILES[currentIndex + 1];
        const nextKey = nextFilename.replace('.json', '');
        
        console.log(`➡️ Moving to next chapter: ${nextKey}`);
        this.currentChapterKey = nextKey;
        this.loadCurrentChapter();
      } else {
        console.log('🎓 All chapters completed!');
        document.getElementById('moduleTitle').textContent = 'All chapters completed! 🎉';
      }
    },
    
    // Update progress display panel
    updateProgressDisplay(trainingProgress) {
      console.log('\n📊 ===== UPDATE PROGRESS DISPLAY =====');
      console.log('trainingProgress parameter:', trainingProgress);
      console.log('this.allChapters:', this.allChapters);
      console.log('Number of chapters loaded:', Object.keys(this.allChapters).length);
      
      const modules = (trainingProgress && trainingProgress.modules) || {};
      const lastUpdated = trainingProgress && trainingProgress.last_updated;
      
      // Calculate BOTH segment-based AND time-based progress
      let totalSegments = 0;
      let completedSegments = 0;
      let totalSeconds = 0;
      let completedSeconds = 0;
      
      console.log('\n📈 Calculating overall progress:');
      
      // Build debug information
      let debugLines = [];
      debugLines.push(`Loaded Chapters: ${Object.keys(this.allChapters).length}`);
      debugLines.push(`Server Progress Available: ${!!trainingProgress}`);
      debugLines.push(`Using SEGMENT_TIMINGS: ${!!window.SEGMENT_TIMINGS}`);
      debugLines.push('');
      
      for (const key in this.allChapters) {
        const chapter = this.allChapters[key];
        const progress = chapter.progress || {};
        const current = progress.currentSegment || 0;
        const total = progress.totalSegments || 0;
        
        // Get timing data
        const chapterDuration = this.getChapterDuration(key);
        const segmentDurations = window.SEGMENT_TIMINGS && window.SEGMENT_TIMINGS[key] 
          ? window.SEGMENT_TIMINGS[key].durations 
          : [];
        
        // Calculate completed time for this chapter
        let chapterCompletedTime = 0;
        if (segmentDurations.length > 0) {
          for (let i = 0; i < current && i < segmentDurations.length; i++) {
            chapterCompletedTime += segmentDurations[i];
          }
        }
        
        totalSeconds += chapterDuration;
        completedSeconds += chapterCompletedTime;
        
        console.log(`  ${key}: ${current}/${total} segments (${chapterCompletedTime}/${chapterDuration}s) ${progress.completed ? '✓' : ''}`);
        debugLines.push(`${key}: ${current}/${total} segments, ${chapterCompletedTime}/${chapterDuration}s`);
        
        totalSegments += total;
        completedSegments += current;
      }
      
      debugLines.push('');
      debugLines.push(`Segment Total: ${completedSegments}/${totalSegments}`);
      debugLines.push(`Time Total: ${completedSeconds}/${totalSeconds}s`);
      
      console.log(`\n✅ TOTALS: ${completedSegments}/${totalSegments} segments`);
      console.log(`⏱️ TIME TOTALS: ${completedSeconds}/${totalSeconds} seconds`);
      
      // Use time-based progress as primary if available, fallback to segment-based
      const overallPercent = totalSeconds > 0
        ? Math.round((completedSeconds / totalSeconds) * 100)
        : totalSegments > 0
          ? Math.round((completedSegments / totalSegments) * 100)
          : 0;
      
      console.log(`📊 Overall Percentage: ${overallPercent}% (${totalSeconds > 0 ? 'time-based' : 'segment-based'})`);
      
      // Update overall progress elements
      const overallPercentEl = document.getElementById('overallPercent');
      const segmentCountEl = document.getElementById('segmentCount');
      const overallBarEl = document.getElementById('overallBar');
      const lastUpdatedEl = document.getElementById('lastUpdated');
      const debugInfoEl = document.getElementById('debugInfo');
      const debugTextEl = document.getElementById('debugText');
      
      if (overallPercentEl) {
        overallPercentEl.textContent = overallPercent;
        console.log(`✅ Set overallPercent to: ${overallPercent}%`);
      } else {
        console.error('❌ overallPercent element NOT FOUND');
      }
      
      if (segmentCountEl) {
        // Show time if available, otherwise segments
        if (totalSeconds > 0) {
          const completedMin = Math.floor(completedSeconds / 60);
          const completedSec = completedSeconds % 60;
          const totalMin = Math.floor(totalSeconds / 60);
          const totalSec = totalSeconds % 60;
          segmentCountEl.textContent = `${completedMin}:${completedSec.toString().padStart(2,'0')} / ${totalMin}:${totalSec.toString().padStart(2,'0')} completed`;
        } else {
          segmentCountEl.textContent = `${completedSegments}/${totalSegments} segments completed`;
        }
        console.log(`✅ Set segmentCount to: ${segmentCountEl.textContent}`);
      }
      
      if (overallBarEl) {
        overallBarEl.style.width = `${overallPercent}%`;
        console.log(`✅ Set progress bar width to: ${overallPercent}%`);
      }
      
      if (lastUpdated && lastUpdatedEl) {
        const date = new Date(lastUpdated);
        lastUpdatedEl.textContent = 
          `Synced ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
        console.log(`✅ Set lastUpdated timestamp`);
      } else if (lastUpdatedEl) {
        lastUpdatedEl.textContent = 'Not synced with server';
      }
      
      // Show debug info if progress is 0 or seems wrong
      if (debugInfoEl && debugTextEl && (totalSegments === 0 || (overallPercent === 0 && Object.keys(this.allChapters).length > 0))) {
        debugInfoEl.style.display = 'block';
        debugTextEl.textContent = debugLines.join('\n');
        console.log('⚠️ Showing debug info because progress looks wrong');
      } else if (debugInfoEl) {
        debugInfoEl.style.display = 'none';
      }
      
      console.log('\n📊 Module-by-module breakdown:');
      
      // Update module progress list
      const moduleList = document.getElementById('moduleProgressList');
      if (!moduleList) {
        console.error('❌ moduleProgressList element NOT FOUND');
        return;
      }
      
      moduleList.innerHTML = '';
      
      // Group chapters by module
      const moduleGroups = {};
      for (const key in this.allChapters) {
        const parsed = this.parseChapterKey(key);
        if (!parsed) continue;
        
        const { module } = parsed;
        if (!moduleGroups[module]) {
          moduleGroups[module] = [];
        }
        moduleGroups[module].push(key);
      }
      
      // Display each module with expandable chapter details
      for (let modNum = 1; modNum <= 6; modNum++) {
        const chapters = moduleGroups[modNum] || [];
        
        if (chapters.length === 0) {
          console.log(`  Module ${modNum}: No chapters loaded`);
          continue;
        }
        
        console.log(`\n  Module ${modNum}: ${chapters.length} chapters`);
        
        let modTotalSegments = 0;
        let modCompletedSegments = 0;
        let modTotalSeconds = 0;
        let modCompletedSeconds = 0;
        let chapterDetailsHTML = '';
        
        chapters.sort((a, b) => {
          const aNum = parseInt(a.split('-')[1]);
          const bNum = parseInt(b.split('-')[1]);
          return aNum - bNum;
        });
        
        chapters.forEach(key => {
          const chapter = this.allChapters[key];
          if (chapter) {
            const progress = chapter.progress || {};
            const current = progress.currentSegment || 0;
            const total = progress.totalSegments || 0;
            
            // Get timing data for this chapter
            const chapterDuration = this.getChapterDuration(key);
            const segmentDurations = window.SEGMENT_TIMINGS && window.SEGMENT_TIMINGS[key] 
              ? window.SEGMENT_TIMINGS[key].durations 
              : [];
            
            let chapterCompletedTime = 0;
            if (segmentDurations.length > 0) {
              for (let i = 0; i < current && i < segmentDurations.length; i++) {
                chapterCompletedTime += segmentDurations[i];
              }
            }
            
            // Use time-based percentage if available
            const percent = chapterDuration > 0
              ? Math.round((chapterCompletedTime / chapterDuration) * 100)
              : total > 0
                ? Math.round((current / total) * 100)
                : 0;
            
            console.log(`    ${key}: ${current}/${total} (${percent}%) - ${chapterCompletedTime}/${chapterDuration}s`);
            
            modTotalSegments += total;
            modCompletedSegments += current;
            modTotalSeconds += chapterDuration;
            modCompletedSeconds += chapterCompletedTime;
            
            // Find chapter name from TRAINING_STRUCTURE
            let chapterName = `Chapter ${key.split('-')[1]}`;
            const moduleObj = TRAINING_STRUCTURE.find(m => m.id === `module-${modNum}`);
            if (moduleObj) {
              const chapterObj = moduleObj.chapters.find(c => c.id === `chapter-${key}`);
              if (chapterObj) {
                chapterName = chapterObj.name;
              }
            }
            
            // Format time display
            let timeDisplay = '';
            if (chapterDuration > 0) {
              const compMin = Math.floor(chapterCompletedTime / 60);
              const compSec = chapterCompletedTime % 60;
              const totMin = Math.floor(chapterDuration / 60);
              const totSec = chapterDuration % 60;
              timeDisplay = `${compMin}:${compSec.toString().padStart(2,'0')} / ${totMin}:${totSec.toString().padStart(2,'0')}`;
            } else {
              timeDisplay = `${current}/${total} segments`;
            }
            
            chapterDetailsHTML += `
              <div style="padding: 6px 0; border-top: 1px solid rgba(29, 39, 51, 0.5);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                  <div style="font-size: 10px; color: #9fb0c5;">${chapterName}</div>
                  <div style="font-size: 10px; color: ${percent === 100 ? '#7CFCB5' : '#9fb0c5'}; font-weight: 600;">
                    ${percent}%
                  </div>
                </div>
                <div style="background: #05080c; height: 3px; border-radius: 1.5px; overflow: hidden;">
                  <div style="background: ${percent === 100 ? '#7CFCB5' : '#00e0ff'}; height: 100%; width: ${percent}%; transition: width 0.3s;"></div>
                </div>
                <div style="font-size: 9px; color: #6b7a8f; margin-top: 2px;">${timeDisplay}</div>
              </div>
            `;
          } else {
            console.warn(`    ${key}: chapter data not found!`);
          }
        });
        
        // Use time-based module percentage if available
        const modPercent = modTotalSeconds > 0
          ? Math.round((modCompletedSeconds / modTotalSeconds) * 100)
          : modTotalSegments > 0
            ? Math.round((modCompletedSegments / modTotalSegments) * 100)
            : 0;
        
        console.log(`  Module ${modNum} total: ${modCompletedSegments}/${modTotalSegments} = ${modPercent}% (${modCompletedSeconds}/${modTotalSeconds}s)`);
        
        // Find module name from TRAINING_STRUCTURE
        let moduleName = `Module ${modNum}`;
        const moduleObj = TRAINING_STRUCTURE.find(m => m.id === `module-${modNum}`);
        if (moduleObj) {
          moduleName = moduleObj.name;
        }
        
        // Format module time display
        let moduleTimeDisplay = '';
        if (modTotalSeconds > 0) {
          const compMin = Math.floor(modCompletedSeconds / 60);
          const compSec = modCompletedSeconds % 60;
          const totMin = Math.floor(modTotalSeconds / 60);
          const totSec = modTotalSeconds % 60;
          moduleTimeDisplay = `${compMin}:${compSec.toString().padStart(2,'0')} / ${totMin}:${totSec.toString().padStart(2,'0')}`;
        } else {
          moduleTimeDisplay = `${modCompletedSegments}/${modTotalSegments} segments`;
        }
        
        const moduleDiv = document.createElement('div');
        moduleDiv.style.cssText = `
          background: rgba(5, 8, 12, 0.6);
          border: 1px solid #1d2733;
          border-radius: 10px;
          padding: 12px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: all 0.2s;
        `;
        
        moduleDiv.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-size: 12px; font-weight: 700; color: #00e0ff;">${moduleName}</div>
            <div style="font-size: 16px; font-weight: 700; color: ${modPercent === 100 ? '#7CFCB5' : modPercent > 0 ? '#7cf6c9' : '#9fb0c5'};">
              ${modPercent}%
            </div>
          </div>
          <div style="background: #05080c; height: 5px; border-radius: 2.5px; overflow: hidden; margin-bottom: 6px;">
            <div style="background: linear-gradient(90deg, #00e0ff, ${modPercent === 100 ? '#7CFCB5' : '#7cf6c9'}); height: 100%; width: ${modPercent}%; transition: width 0.3s;"></div>
          </div>
          <div style="font-size: 10px; color: #9fb0c5; font-family: monospace;">
            ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''} • ${moduleTimeDisplay}
            ${modPercent === 100 ? '<span style="color: #7CFCB5; margin-left: 6px;">✓ Complete</span>' : ''}
          </div>
          <div class="chapter-details" style="display: none; margin-top: 8px;">
            ${chapterDetailsHTML}
          </div>
        `;
        
        // Add click handler to expand/collapse chapter details
        moduleDiv.addEventListener('click', (e) => {
          const detailsEl = moduleDiv.querySelector('.chapter-details');
          if (detailsEl) {
            const isExpanded = detailsEl.style.display !== 'none';
            detailsEl.style.display = isExpanded ? 'none' : 'block';
            moduleDiv.style.background = isExpanded 
              ? 'rgba(5, 8, 12, 0.6)' 
              : 'rgba(0, 224, 255, 0.05)';
          }
        });
        
        moduleList.appendChild(moduleDiv);
      }
      
      console.log('\n===== END PROGRESS DISPLAY UPDATE =====\n');
    },
    
    // Setup progress panel UI
    setupProgressUI() {
      const toggleBtn = document.getElementById('toggleProgressBtn');
      const panel = document.getElementById('progressPanel');
      const closeBtn = document.getElementById('closePanelBtn');
      const refreshBtn = document.getElementById('refreshProgressBtn');
      
      if (toggleBtn && panel && closeBtn) {
        toggleBtn.addEventListener('click', () => {
          const isVisible = panel.style.display !== 'none';
          panel.style.display = isVisible ? 'none' : 'block';
          if (!isVisible && this.accessToken) {
            console.log('🔄 Progress panel opened - refreshing from server...');
            this.fetchProgressFromServer();
          } else if (!isVisible) {
            console.log('🔄 Progress panel opened - updating display with local data...');
            this.updateProgressDisplay(this.serverProgress || { modules: {} });
          }
        });
        
        closeBtn.addEventListener('click', () => {
          panel.style.display = 'none';
        });
        
        if (refreshBtn) {
          refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('🔄 Manual refresh button clicked');
            
            if (this.accessToken) {
              refreshBtn.textContent = '⏳';
              refreshBtn.disabled = true;
              this.fetchProgressFromServer().then(() => {
                refreshBtn.textContent = '✓';
                setTimeout(() => {
                  refreshBtn.textContent = '🔄';
                  refreshBtn.disabled = false;
                }, 1000);
              }).catch(() => {
                refreshBtn.textContent = '✗';
                setTimeout(() => {
                  refreshBtn.textContent = '🔄';
                  refreshBtn.disabled = false;
                }, 2000);
              });
            } else {
              alert('Not authenticated. Please authenticate to sync progress.');
            }
          });
        }
      }
      
      // Add console helper for debugging
      window.refreshProgress = () => {
        console.log('🔄 Manual progress refresh triggered...');
        if (this.accessToken) {
          this.fetchProgressFromServer();
        } else {
          console.warn('⚠️ Not authenticated - cannot fetch from server');
          this.updateProgressDisplay(this.serverProgress || { modules: {} });
        }
      };
      
      console.log('💡 Debug helper: Type "refreshProgress()" in console to manually refresh progress panel');
      
      // Add additional debugging helpers
      window.debugAuth = () => {
        console.log('🔍 [DEBUG HELPER] ===== Authentication Debug Info =====');
        console.log('Instance State:');
        console.log('  - accessToken:', this.accessToken ? `${this.accessToken.substring(0, 20)}... (${this.accessToken.length} chars)` : 'NULL');
        console.log('  - refreshToken:', this.refreshToken ? `${this.refreshToken.substring(0, 20)}... (${this.refreshToken.length} chars)` : 'NULL');
        console.log('  - expiresAt:', this.expiresAt || 'NULL');
        if (this.expiresAt) {
          const now = Date.now();
          const expiresIn = Math.floor((this.expiresAt - now) / 1000);
          console.log('  - expires in:', expiresIn > 0 ? `${expiresIn} seconds` : 'EXPIRED');
          console.log('  - expires at:', new Date(this.expiresAt).toISOString());
        }
        
        console.log('\nlocalStorage Contents:');
        const access = localStorage.getItem('gg_access_token');
        const refresh = localStorage.getItem('gg_refresh_token');
        const expires = localStorage.getItem('gg_expires_at');
        console.log('  - gg_access_token:', access ? `${access.substring(0, 20)}... (${access.length} chars)` : 'NOT FOUND');
        console.log('  - gg_refresh_token:', refresh ? `${refresh.substring(0, 20)}... (${refresh.length} chars)` : 'NOT FOUND');
        console.log('  - gg_expires_at:', expires || 'NOT FOUND');
        
        // Try to decode JWT if present
        if (access) {
          console.log('\nJWT Token Analysis:');
          const extractedExpiry = this.extractJWTExpiration(access);
          if (extractedExpiry) {
            const now = Date.now();
            const expiresIn = Math.floor((extractedExpiry - now) / 1000);
            console.log('  - JWT exp field:', new Date(extractedExpiry).toISOString());
            console.log('  - JWT expires in:', expiresIn > 0 ? `${expiresIn} seconds` : 'EXPIRED');
            
            if (expires && parseInt(expires) !== extractedExpiry) {
              console.log('  ⚠️ WARNING: localStorage expires_at does not match JWT exp field!');
            }
          } else {
            console.log('  ⚠️ Could not extract expiration from JWT');
          }
        }
        
        console.log('\nURL Parameters:');
        const params = new URLSearchParams(window.location.search);
        const tempToken = params.get('temp_token');
        console.log('  - temp_token:', tempToken ? `${tempToken.substring(0, 20)}... (${tempToken.length} chars)` : 'NOT FOUND');
        
        console.log('=========================================');
      };
      
      window.clearAuthDebug = () => {
        console.log('🗑️ [DEBUG HELPER] Clearing authentication...');
        window.GGTrainingAPI.clearAuth();
        console.log('✅ [DEBUG HELPER] Authentication cleared');
      };
      
      console.log('💡 Debug helper: Type "debugAuth()" in console to inspect authentication state');
      console.log('💡 Debug helper: Type "clearAuthDebug()" in console to clear authentication');
    }
  };
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.GGTrainingAPI.init());
  } else {
    window.GGTrainingAPI.init();
  }
})();