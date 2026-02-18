// ===== Utility Functions =====

// Debug utility
let __lastLogT = -1;
function d(...args){
  if (!CAPTION_DEBUG) return;
  if (args[0] === '[timeupdate]') {
    const t = args[1];
    if (__lastLogT >= 0 && (performance.now() - __lastLogT) < 200) return;
    __lastLogT = performance.now();
  }
  console.log('[CAP]', ...args);
}

// Time formatting
const fmt = (t) => `${Math.floor(t/60)}:${Math.floor(t%60).toString().padStart(2,'0')}`;

// Timecode to seconds converter
const tcToSeconds = (tc, FPS=30) => {
  const parts = String(tc||'0:0:0:0').split(/[;:]/).map(n=>parseInt(n,10)||0);
  const [hh,mm,ss,ff] = [parts[0]||0, parts[1]||0, parts[2]||0, parts[3]||0];
  return hh*3600 + mm*60 + ss + (ff/FPS);
};

// Element creator
function el(tag, attrs={}, children=[]){
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.substring(2), v);
    else n.setAttribute(k, v);
  }
  (Array.isArray(children)?children:[children]).forEach(c=>{
    if (c==null) return;
    if (typeof c === 'string') n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  });
  return n;
}

// URL checker - purely relative paths work everywhere
const isAbsoluteUrl = (p) => /^([a-z]+:)?\/\//i.test(p);

// Reset stage shell function
window.resetStageShell = function(){
  const stage = document.getElementById('stage');
  stage.replaceChildren(
    el('div',{id:'innerWindow',class:'inner-window','aria-modal':'true',role:'dialog','aria-label':'Content viewer'},[
      el('header',{},[
        el('span',{id:'viewerTitle'},'Narration'),
        el('div',{class:'right'}, el('button',{id:'closeViewer',class:'btn',title:'Close'},'×'))
      ]),
      el('div',{id:'viewer',class:'viewer'})
    ]),
    el('audio',{id:'vo',preload:'metadata'})
  );
};

// ===== Authentication UI =====
(function() {
  'use strict';
  
  document.addEventListener('DOMContentLoaded', () => {
    // Hide auth box if configured
    if (typeof HIDE_AUTH_BOX !== 'undefined' && HIDE_AUTH_BOX === true) {
      const authWrap = document.querySelector('.auth-wrap');
      if (authWrap) {
        authWrap.style.display = 'none';
        console.log('🔒 Authentication box hidden (HIDE_AUTH_BOX = true)');
      }
      return; // Skip all auth UI setup if hidden
    }
    
    const toggleBtn = document.getElementById('toggleAuth');
    const authContent = document.getElementById('authContent');
    const authWrap = document.querySelector('.auth-wrap');
    
    // START COLLAPSED BY DEFAULT
    if (authContent && authWrap && toggleBtn) {
      authContent.classList.add('collapsed');
      authWrap.classList.add('collapsed');
      toggleBtn.textContent = 'Expand';
    }
    
    // Toggle authentication section
    if (toggleBtn && authContent) {
      toggleBtn.addEventListener('click', () => {
        const isCollapsed = authContent.classList.contains('collapsed');
        
        if (isCollapsed) {
          authContent.classList.remove('collapsed');
          authWrap.classList.remove('collapsed');
          toggleBtn.textContent = 'Collapse';
        } else {
          authContent.classList.add('collapsed');
          authWrap.classList.add('collapsed');
          toggleBtn.textContent = 'Expand';
        }
      });
    }
    
    // KEYBOARD SHORTCUT: Press 'D' to toggle debug/auth box quickly
    document.addEventListener('keydown', (e) => {
      // Only trigger if not typing in an input field
      if (e.key === 'd' || e.key === 'D') {
        if (document.activeElement.tagName !== 'INPUT' && 
            document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (toggleBtn) {
            toggleBtn.click();
            console.log('🔧 Debug box toggled via keyboard shortcut (D)');
          }
        }
      }
    });
    
    // FLOATING DEBUG BUTTON: Wire up the mobile-friendly button
    const floatingDebugBtn = document.getElementById('floatingDebugBtn');
    if (floatingDebugBtn && toggleBtn) {
      floatingDebugBtn.addEventListener('click', () => {
        toggleBtn.click();
        console.log('🔧 Debug box toggled via floating button');
      });
    }
    
    // Authenticate button
    const btnAuthenticate = document.getElementById('btnAuthenticate');
    const tempTokenInput = document.getElementById('tempTokenInput');
    
    if (btnAuthenticate && tempTokenInput) {
      btnAuthenticate.addEventListener('click', async () => {
        const token = tempTokenInput.value.trim();
        
        if (!token) {
          alert('Please enter a temporary token');
          return;
        }
        
        btnAuthenticate.disabled = true;
        btnAuthenticate.textContent = 'Authenticating...';
        
        const success = await window.GGTrainingAPI.authenticateWithTempToken(token);
        
        btnAuthenticate.disabled = false;
        btnAuthenticate.textContent = 'Authenticate';
        
        if (success) {
          // Collapse auth section after successful authentication
          authContent.classList.add('collapsed');
          authWrap.classList.add('collapsed');
          toggleBtn.textContent = 'Expand';
        }
      });
      
      // Allow Enter key to authenticate
      tempTokenInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          btnAuthenticate.click();
        }
      });
    }
    
    // Clear authentication button
    const btnClearAuth = document.getElementById('btnClearAuth');
    
    if (btnClearAuth) {
      btnClearAuth.addEventListener('click', () => {
        if (confirm('Clear authentication? You will need to re-authenticate to continue.')) {
          window.GGTrainingAPI.clearAuth();
          window.GGTrainingAPI.updateAuthStatus();
          
          // Reset UI
          document.getElementById('moduleTitle').textContent = 'Please authenticate to continue';
          const stage = document.getElementById('stage');
          stage.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9fb0c5;font-size:18px;">🔒 Authentication Required</div>';
        }
      });
    }
  });
})();