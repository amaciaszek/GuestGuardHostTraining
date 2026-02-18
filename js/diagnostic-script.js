// ===== MOBILE SIDEBAR DIAGNOSTIC SCRIPT =====
// Copy and paste this entire script into your browser console (F12)
// when viewing the page on iPad or mobile

console.log('='.repeat(60));
console.log('MOBILE SIDEBAR DIAGNOSTIC');
console.log('='.repeat(60));

// Check screen width
console.log('\n📏 SCREEN WIDTH:');
console.log('  window.innerWidth:', window.innerWidth);
console.log('  Should be < 900 for mobile layout:', window.innerWidth < 900 ? '✅ YES' : '❌ NO');

// Check viewport
const viewport = document.querySelector('meta[name="viewport"]');
console.log('\n📱 VIEWPORT TAG:');
console.log('  Content:', viewport ? viewport.content : '❌ MISSING');

// Check if CSS file is loaded
const styleSheets = Array.from(document.styleSheets);
const cssFile = styleSheets.find(s => s.href && s.href.includes('style'));
console.log('\n📄 CSS FILE:');
console.log('  Loaded:', cssFile ? '✅ YES' : '❌ NO');
console.log('  URL:', cssFile ? cssFile.href : 'N/A');
console.log('  Rules:', cssFile ? cssFile.cssRules.length : 'N/A');

// Check frame element
const frame = document.querySelector('.frame');
console.log('\n🖼️  FRAME ELEMENT:');
if (frame) {
  const computed = window.getComputedStyle(frame);
  console.log('  Display:', computed.display);
  console.log('  Grid Columns:', computed.gridTemplateColumns);
  console.log('  Grid Rows:', computed.gridTemplateRows);
  console.log('  Expected for mobile: "auto 1fr 1fr"');
  console.log('  Match:', computed.gridTemplateRows === 'auto 1fr 1fr' ? '✅ CORRECT' : '❌ WRONG');
} else {
  console.log('  ❌ FRAME NOT FOUND');
}

// Check sidebar element
const sidebar = document.querySelector('.sidebar');
console.log('\n📚 SIDEBAR ELEMENT:');
if (sidebar) {
  const computed = window.getComputedStyle(sidebar);
  console.log('  Display:', computed.display);
  console.log('  Expected: "block"');
  console.log('  Match:', computed.display === 'block' ? '✅ VISIBLE' : '❌ HIDDEN');
  console.log('  Grid Row:', computed.gridRow);
  console.log('  Expected for mobile: "3"');
  console.log('  Match:', computed.gridRow === '3' ? '✅ BOTTOM' : '❌ WRONG POSITION');
  console.log('  Border Top:', computed.borderTop);
  console.log('  Position:', computed.position);
  console.log('  Height:', computed.height);
  console.log('  Visibility:', computed.visibility);
  
  // Check if sidebar has ::before pseudo-element (drag handle)
  const pseudoBefore = window.getComputedStyle(sidebar, '::before');
  console.log('  Drag Handle (::before):', pseudoBefore.content !== 'none' ? '✅ PRESENT' : '❌ MISSING');
} else {
  console.log('  ❌ SIDEBAR NOT FOUND');
}

// Check stage element
const stage = document.querySelector('.stage');
console.log('\n🎭 STAGE ELEMENT:');
if (stage) {
  const computed = window.getComputedStyle(stage);
  console.log('  Display:', computed.display);
  console.log('  Grid Row:', computed.gridRow);
  console.log('  Expected for mobile: "2"');
  console.log('  Match:', computed.gridRow === '2' ? '✅ TOP' : '❌ WRONG POSITION');
  console.log('  Aspect Ratio:', computed.aspectRatio);
} else {
  console.log('  ❌ STAGE NOT FOUND');
}

// Check for media query match
const mediaQuery = window.matchMedia('(max-width: 900px)');
console.log('\n🎯 MEDIA QUERY:');
console.log('  Query: "(max-width: 900px)"');
console.log('  Matches:', mediaQuery.matches ? '✅ YES (Mobile mode active)' : '❌ NO (Desktop mode active)');

// Check for inline styles that might override
console.log('\n💉 INLINE STYLE OVERRIDES:');
if (frame) {
  console.log('  Frame inline style:', frame.getAttribute('style') || 'none');
}
if (sidebar) {
  console.log('  Sidebar inline style:', sidebar.getAttribute('style') || 'none');
}
if (stage) {
  console.log('  Stage inline style:', stage.getAttribute('style') || 'none');
}

// Visual test
console.log('\n👁️  VISUAL POSITION CHECK:');
if (frame && sidebar && stage) {
  const frameRect = frame.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  
  console.log('  Frame:', {
    top: Math.round(frameRect.top),
    bottom: Math.round(frameRect.bottom),
    height: Math.round(frameRect.height)
  });
  console.log('  Stage:', {
    top: Math.round(stageRect.top),
    bottom: Math.round(stageRect.bottom),
    height: Math.round(stageRect.height)
  });
  console.log('  Sidebar:', {
    top: Math.round(sidebarRect.top),
    bottom: Math.round(sidebarRect.bottom),
    height: Math.round(sidebarRect.height)
  });
  
  const sidebarIsBelow = sidebarRect.top > stageRect.top;
  console.log('  Sidebar below stage?', sidebarIsBelow ? '✅ YES' : '❌ NO');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('SUMMARY:');
console.log('='.repeat(60));

if (window.innerWidth >= 900) {
  console.log('⚠️  You are in DESKTOP mode (width >= 900px)');
  console.log('   Sidebar should be on the LEFT side');
  console.log('   Rotate to portrait or narrow window to test mobile');
} else if (mediaQuery.matches && frame && computed.gridTemplateRows === 'auto 1fr 1fr') {
  console.log('✅ Mobile layout is ACTIVE');
  console.log('   Sidebar should be at BOTTOM');
  if (sidebar && window.getComputedStyle(sidebar).display !== 'none') {
    console.log('✅ Sidebar is VISIBLE');
  } else {
    console.log('❌ Sidebar is HIDDEN (check CSS)');
  }
} else {
  console.log('❌ Mobile layout NOT working');
  console.log('   Possible causes:');
  console.log('   1. CSS file not loaded');
  console.log('   2. Wrong CSS file version');
  console.log('   3. Browser cache (try incognito mode)');
  console.log('   4. CSS specificity conflict');
}

console.log('='.repeat(60));
