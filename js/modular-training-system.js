class ModularTrainingSystem {

  // === [Captions Helpers] ===
  findCaptionsForTime(time){
    // Filter captions to only those within the current segment
    if (!this.seg || !this.seg.active) return [];
    
    const segmentCaptions = this.captions.filter(cap => 
      cap.start >= this.seg.start && cap.end <= this.seg.end
    );
    
    // Find all captions that have started (their start time has passed)
    const activeCaptions = segmentCaptions.filter(cap => time >= cap.start);
    
    // Return the last 2 captions that have started (sliding window)
    // This gives us the "current" and "previous" caption
    return activeCaptions.slice(-2);
  }

  updateCaption(time){
    if (!this.currentCaptionElement) return;
    
    const captions = this.findCaptionsForTime(time);
    
    if (captions.length > 0){
      // Style previous captions darker, current caption at full brightness
      this.currentCaptionElement.innerHTML = captions
        .map((cap, index) => {
          const isCurrent = index === captions.length - 1;
          const style = isCurrent 
            ? 'opacity: 1;' 
            : 'opacity: 0.5; font-size: 0.9em;';
          return `<span style="${style}">${cap.text}</span>`;
        })
        .join('<br>'); // Single line break instead of double
      this.currentCaptionElement.style.display = 'inline-block';
    } else {
      this.currentCaptionElement.style.display = 'none';
    }
  }


  getHotspotWindow(hotspot){
    const start = this.tcToSeconds(hotspot.tcStart || '0:0:0:0', this.FPS);
    let end = this.tcToSeconds(hotspot.tcEnd || '999:59:59:0', this.FPS);
    try {
      const chapterId = hotspot.__chapterId;
      const list = (this.chapterHotspots && this.chapterHotspots.get(chapterId)) || [];
      const idx = list.indexOf(hotspot.id);
      if (idx >= 0 && idx+1 < list.length){
        const nextHotspotId = list[idx+1];
        const nextBtn = this.buttons && this.buttons[nextHotspotId];
        if (nextBtn && nextBtn.dataset && nextBtn.dataset.tcStart){
          end = this.tcToSeconds(nextBtn.dataset.tcStart, this.FPS);
        }
      }
    } catch(e){ /* keep end */ }
    return {start, end};
  }


  getFilenameFromChapterId(chapterId){
    const m = String(chapterId||'').match(/^chapter-(\d+)-(\d+)$/);
    if (!m) return null;
    return `${m[1]}-${m[2]}.json`;
  }

  getMostRecentUnlockedChapterNum(modNum){
    // Use API progress data to find most recent chapter with progress
    if (window.GGTrainingAPI && window.GGTrainingAPI.allChapters) {
      const moduleObj = TRAINING_STRUCTURE.find(m => String(m.id) === `module-${modNum}`);
      if (!moduleObj) return 1;
      
      // Find the last chapter in this module with any progress
      let lastChapterNum = 1;
      let lastUpdated = null;
      
      for (let i = 0; i < moduleObj.chapters.length; i++){
        const ch = moduleObj.chapters[i];
        const m = ch.id.match(/^chapter-(\d+)-(\d+)$/);
        if (!m) continue;
        
        const chapNum = parseInt(m[2], 10);
        const chapterKey = `${modNum}-${chapNum}`;
        const chapter = window.GGTrainingAPI.allChapters[chapterKey];
        
        if (chapter && chapter.progress) {
          // If chapter has any progress or was completed
          if (chapter.progress.currentSegment > 0 || chapter.progress.completed) {
            const updated = chapter.progress.lastUpdated ? new Date(chapter.progress.lastUpdated).getTime() : 0;
            
            if (!lastUpdated || updated > lastUpdated) {
              lastUpdated = updated;
              lastChapterNum = chapNum;
            }
          }
        }
      }
      
      // If we found progress, return that chapter
      // Otherwise, start at chapter 1
      console.log(`📊 Most recent chapter in module ${modNum}: ${lastChapterNum} (lastUpdated: ${lastUpdated ? new Date(lastUpdated).toLocaleString() : 'none'})`);
      return lastChapterNum;
    }
    
    // Fallback to old logic if API not available
    const moduleObj = TRAINING_STRUCTURE.find(m => String(m.id) === `module-${modNum}`);
    if (!moduleObj) return 1;
    for (let i = moduleObj.chapters.length - 1; i >= 0; i--){
      const ch = moduleObj.chapters[i];
      const hsList = this.chapterHotspots?.get(ch.id) || [];
      if (hsList.some(hid => this.done?.has(hid))) {
        const m = ch.id.match(/^chapter-(\d+)-(\d+)$/);
        if (m) return parseInt(m[2], 10);
      }
    }
    return 1;
  }

    constructor(config, currentModuleIndex=0, modulePath=null, transcriptText=null, startingSegment=0){
      this.config = config;
      this.currentModuleIndex = currentModuleIndex;
      this.startingSegment = startingSegment || 0;
      this.FPS = 30;
      this.VER_KEY = 'training_schema';
      this.SCHEMA_VERSION = 4;
      this.seg = {start:0,end:0,active:false,rafId:null,currentId:null,currentVideo:null,currentVideo2:null,crossfadeState:null};
      this.realLifeIndex = 0;
      this.captions = [];
      this.currentCaptionElement = null;
      this.transcriptText = transcriptText;
      
      // Track multiple video state for alternating playback
      this.videoState = {
        videos: null,           // Array of video sources (resolved URLs)
        currentIndex: 0,        // Which video is playing (0 or 1)
        playCount: [0, 0]       // How many times each video has played
      };

      // NEW: track whether we’ve already auto-expanded the “current” module/chapter once
      this.sidebarInitialized = false;

      if (modulePath && modulePath.includes('/')) {
        this.moduleUrl = new URL(modulePath, window.location.href);
        this.moduleFilename = this.moduleUrl.pathname.split('/').pop();
        this.moduleBase = new URL('.', this.moduleUrl).href;
      } else if (modulePath) {
        this.moduleFilename = modulePath;
        this.moduleUrl = new URL(window.location.href);
        this.moduleBase = new URL('.', this.moduleUrl).href;
      } else {
        this.moduleUrl = new URL(window.location.href);
        this.moduleFilename = this.moduleUrl.pathname.split('/').pop();
        this.moduleBase = new URL('.', this.moduleUrl).href;
      }

      console.log('📄 Module filename:', this.moduleFilename);

      this.init();
      this.setupVisibilityHandler();
    }

    setupVisibilityHandler(){
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.seg.active && !this.audio.paused) {
            this.pauseViewer();
          }
        }
      });
    }

resolveAsset(p){
      if (!p) return '';
      
      // If it's already a full URL (http://, https://), return as-is
      if (isAbsoluteUrl(p)) return p;
      
      // CRITICAL FIX: Convert root-relative paths (starting with /) to relative paths
      // This makes them work on localhost, GitHub Pages, Cloudflare, and any server
      // Example: /Assets/file.jpg → Assets/file.jpg (relative to current page)
      let adjustedPath = p;
      if (p.startsWith('/')) {
        adjustedPath = p.substring(1); // Remove leading slash
        console.log(`🔧 Converted root-relative to relative: ${p} → ${adjustedPath}`);
      }
      
      // URL encode the path components to handle spaces and special characters
      // This fixes: "4.1 Personal Safety.wav" → "4.1%20Personal%20Safety.wav"
      const pathParts = adjustedPath.split('/');
      const encodedParts = pathParts.map(part => encodeURIComponent(part));
      const encodedPath = encodedParts.join('/');
      
      // Use browser's native URL resolution - works EVERYWHERE!
      // This resolves relative to the current page location automatically
      try {
        const resolved = new URL(encodedPath, window.location.href).href;
        console.log(`🔗 Resolved: ${adjustedPath} → ${resolved}`);
        return resolved;
      } catch (e) {
        console.error(`❌ Failed to resolve: ${p}`, e);
        return p;
      }
    }

    async init(){
      this.initStorage();
      this.cacheDOM();
      await this.loadTranscript();
      this.applyConfigBasics();
      this.createHotspots();
      this.buildChapterList();
      this.wireHotspotClicks();
      this.applyStatesLinear();
    }

    buildChapterList(){
      const moduleList = document.getElementById('moduleList');
      moduleList.replaceChildren();

      // Track per-chapter hotspot ids for unlock logic
      this.chapterHotspots = new Map();

      console.log('=== BUILDING CHAPTER LIST ===');
      console.log('Module Filename:', this.moduleFilename);

      // Figure out which module/chapter this JSON file represents
      const match = this.moduleFilename.match(/(\d+)-(\d+)(\.json)?/);
      let targetModuleNum = null;
      let targetChapterNum = null;

      if (match) {
        targetModuleNum = parseInt(match[1], 10);
        targetChapterNum = parseInt(match[2], 10);
        console.log('🎯 DETECTED FROM FILENAME: Module', targetModuleNum, 'Chapter', targetChapterNum);
      } else {
        console.warn('⚠️ Could not parse module/chapter from filename:', this.moduleFilename);
      }

      const targetModuleId  = targetModuleNum  ? `module-${targetModuleNum}`         : null;
      const targetChapterId = (targetModuleNum && targetChapterNum)
        ? `chapter-${targetModuleNum}-${targetChapterNum}`
        : null;

      console.log('Target Module ID:', targetModuleId);
      console.log('Target Chapter ID:', targetChapterId);

      TRAINING_STRUCTURE.forEach((module, modIdx) => {
        const moduleGroup = el('li', { class: 'module-group' });

        const moduleHeader = el('div', {
          class: 'module-header',
          'data-module-id': module.id
        }, [
          el('div', { class: 'module-expand-icon' }, '▶'),
          el('div', { class: 'module-name' }, module.name),
          el('div', { class: 'module-complete-badge', style: 'display: none; margin-left: auto; color: #7CFCB5; font-weight: bold; font-size: 16px;' }, '✓ Complete')
        ]);

        const chapterList = el('ul', { class: 'chapter-list' });

        module.chapters.forEach((chapter, chapIdx) => {
          const chapterGroup = el('li', { class: 'chapter-group' });

          const chapterHeader = el('div', {
            class: 'chapter-header',
            'data-chapter-id': chapter.id
          }, [
            el('div', { class: 'chapter-expand-icon' }, '▶'),
            el('div', { class: 'chapter-title' }, chapter.name),
            el('div', { class: 'chapter-complete-badge', style: 'display: none; margin-left: auto; color: #7CFCB5; font-weight: bold; font-size: 14px;' }, '✓')
          ]);

          const segmentList = el('ul', { class: 'segment-list' });

          chapter.segments.forEach((segmentName, segIdx) => {
            const isTargetChapter =
              (module.id === targetModuleId && chapter.id === targetChapterId);

            let hotspot = null;
            if (isTargetChapter) {
              hotspot = (this.config.hotspots || []).find(h => {
                const { title } = this.getTitleAndBody(h.content || h.text || '');
                const name = title || h.label || '';
                const normalize = (s) =>
                  s.toLowerCase().trim().replace(/[^\w\s]/g, '');
                const match =
                  normalize(name).includes(normalize(segmentName)) ||
                  normalize(segmentName).includes(normalize(name)) ||
                  name === segmentName;

                if (match) {
                  console.log(
                    `✓ MATCHED: "${segmentName}" (${module.name} > ${chapter.name}) → "${name}" (hotspot ${h.id})`
                  );
                }
                return match;
              });
            }

            const segmentId = hotspot ? hotspot.id : `${chapter.id}-seg-${segIdx}`;

            // Track hotspot IDs for chapter unlock logic
            if (hotspot) {
              hotspot.__chapterId = chapter.id;
              const arr = this.chapterHotspots.get(chapter.id) || [];
              arr.push(hotspot.id);
              this.chapterHotspots.set(chapter.id, arr);
            }

            const segmentItem = el('li', {
              class: 'segment-item' + (hotspot ? '' : ' not-loaded'),
              'data-id': segmentId,
              'data-has-hotspot': hotspot ? 'true' : 'false'
            }, [
              el('div', { class: 'segment-badge' }, String(segIdx + 1)),
              el('div', { class: 'segment-name' }, segmentName)
            ]);

            if (hotspot) {
              segmentItem.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!segmentItem.classList.contains('locked')) {
                  const button = this.buttons[hotspot.id];
                  if (button) this.openFor(button);
                }
              });
            } else {
              // No mapped hotspot → keep it visibly locked
              segmentItem.classList.add('locked');
              segmentItem.style.opacity = '0.3';
            }

            segmentList.appendChild(segmentItem);
          });

          // === CHAPTER HEADER CLICK BEHAVIOR (REWRITTEN) ===
          chapterHeader.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Any click on chapter header → load that chapter and keep expanded
            const fname = this.getFilenameFromChapterId(chapter.id);
            if (fname) {
              const chapterKey = fname.replace('.json', '');
              console.log('📂 Loading specific chapter from sidebar:', chapterKey);
              
              // Expand this chapter's segment list
              chapterHeader.classList.add('expanded');
              segmentList.classList.add('expanded');
              
              if (window.GGTrainingAPI && window.GGTrainingAPI.allChapters[chapterKey]) {
                window.GGTrainingAPI.currentChapterKey = chapterKey;
                window.GGTrainingAPI.loadCurrentChapter();
              } else {
                console.warn('⚠️ Chapter not loaded yet:', chapterKey);
              }
            }
          });

          chapterGroup.appendChild(chapterHeader);
          chapterGroup.appendChild(segmentList);
          chapterList.appendChild(chapterGroup);
        });

        // === MODULE HEADER CLICK BEHAVIOR (REWRITTEN) ===
        moduleHeader.addEventListener('click', (e) => {
          e.stopPropagation();
          
          // Any click on module header → navigate to most recent chapter
          const mm = String(module.id).match(/^module-(\d+)$/);
          const modNum  = mm ? parseInt(mm[1], 10) : (modIdx + 1);
          const chapNum = this.getMostRecentUnlockedChapterNum(modNum);
          const fname   = `${modNum}-${chapNum}.json`;
          const chapterKey = fname.replace('.json', '');

          console.log('📦 Loading most recent chapter for module:', chapterKey);
          
          // Expand this module and collapse others
          document.querySelectorAll('.module-header').forEach(header => {
            if (header !== moduleHeader) {
              header.classList.remove('expanded');
              const otherChapterList = header.nextElementSibling;
              if (otherChapterList) otherChapterList.classList.remove('expanded');
            }
          });
          
          // Expand this module
          moduleHeader.classList.add('expanded');
          chapterList.classList.add('expanded');
          
          if (window.GGTrainingAPI && window.GGTrainingAPI.allChapters[chapterKey]) {
            window.GGTrainingAPI.currentChapterKey = chapterKey;
            window.GGTrainingAPI.loadCurrentChapter();
          } else {
            console.warn('⚠️ Chapter not loaded yet:', chapterKey);
          }
        });

        moduleGroup.appendChild(moduleHeader);
        moduleGroup.appendChild(chapterList);
        moduleList.appendChild(moduleGroup);
      });

      // Auto-expand the current module and chapter
      if (targetModuleId) {
        const currentModuleHeader = moduleList.querySelector(`.module-header[data-module-id="${targetModuleId}"]`);
        if (currentModuleHeader) {
          currentModuleHeader.classList.add('expanded');
          const currentChapterList = currentModuleHeader.nextElementSibling;
          if (currentChapterList) {
            currentChapterList.classList.add('expanded');
            
            // Also expand the current chapter within this module
            if (targetChapterId) {
              const currentChapterHeader = currentChapterList.querySelector(`.chapter-header[data-chapter-id="${targetChapterId}"]`);
              if (currentChapterHeader) {
                currentChapterHeader.classList.add('expanded');
                const segmentList = currentChapterHeader.nextElementSibling;
                if (segmentList) {
                  segmentList.classList.add('expanded');
                }
                console.log('✅ Auto-expanded current chapter:', targetChapterId);
              }
            }
          }
          console.log('✅ Auto-expanded current module:', targetModuleId);
        }
      }

      this.updateChapterList();
    }

    updateChapterList(){
      const moduleList     = document.getElementById('moduleList');
      const segmentItems   = moduleList.querySelectorAll('.segment-item');
      const chapterHeaders = moduleList.querySelectorAll('.chapter-header');
      const moduleHeaders  = moduleList.querySelectorAll('.module-header');

      console.log('=== UPDATE CHAPTER LIST ===');
      console.log('Total segments in sidebar:', segmentItems.length);
      console.log('Completed segments:', Array.from(this.done));

      let foundCurrent = false;
      let currentSegmentElement = null;

      // --- SEGMENT STATES (locked / current / completed) ---
      segmentItems.forEach((item) => {
        const hasHotspot = item.getAttribute('data-has-hotspot') === 'true';
        if (!hasHotspot) return;

        const id = item.getAttribute('data-id');

        item.classList.remove('locked', 'current', 'completed');
        item.style.opacity = '';

        if (this.done.has(id)) {
          item.classList.add('completed');
        } else if (!foundCurrent) {
          // First not-completed segment becomes "current"
          item.classList.add('current');
          foundCurrent = true;
          currentSegmentElement = item;

          const segmentName = item.querySelector('.segment-name')?.textContent || '';
          const chapterHeader = item.closest('.chapter-group')?.querySelector('.chapter-header');
          const chapterName = chapterHeader?.querySelector('.chapter-title')?.textContent || '';
          const moduleHeader = item.closest('.module-group')?.querySelector('.module-header');
          const moduleName = moduleHeader?.querySelector('.module-name')?.textContent || '';

          console.log('🎯 CURRENT SEGMENT:', segmentName);
          console.log('   └─ Chapter:', chapterName);
          console.log('   └─ Module:', moduleName);
        } else {
          item.classList.add('locked');
        }
      });

      // --- CHAPTER STATES (has-current / all-completed) ---
      chapterHeaders.forEach((header) => {
        const segmentList = header.nextElementSibling;
        const segments = Array.from(segmentList.querySelectorAll('.segment-item'))
          .filter(seg => seg.getAttribute('data-has-hotspot') === 'true');

        const allCompleted = segments.length > 0 &&
          segments.every(seg => seg.classList.contains('completed'));
        const hasCurrent   = segments.some(seg => seg.classList.contains('current'));

        // IMPORTANT: we no longer touch .expanded here
        header.classList.toggle('has-current',   hasCurrent);
        header.classList.toggle('all-completed', allCompleted && !hasCurrent);
        
        // Show/hide completion badge
        const completeBadge = header.querySelector('.chapter-complete-badge');
        if (completeBadge) {
          completeBadge.style.display = allCompleted ? 'block' : 'none';
        }
      });

      // --- MODULE STATES (current-module) ---
      moduleHeaders.forEach((header) => {
        const chapterList = header.nextElementSibling;
        const chapters = chapterList.querySelectorAll('.chapter-header');
        const hasCurrentChapter = Array.from(chapters)
          .some(ch => ch.classList.contains('has-current'));
        
        // Check if all chapters in this module are completed
        const allChaptersComplete = Array.from(chapters).length > 0 &&
          Array.from(chapters).every(ch => ch.classList.contains('all-completed'));

        // IMPORTANT: we do not add/remove .expanded here anymore
        header.classList.toggle('current-module', hasCurrentChapter);
        header.classList.toggle('all-modules-completed', allChaptersComplete);
        
        // Show/hide module completion badge
        const completeBadge = header.querySelector('.module-complete-badge');
        if (completeBadge) {
          completeBadge.style.display = allChaptersComplete ? 'block' : 'none';
        }
      });

      // --- One-time auto-expand for the current item (initial load only) ---
      if (!this.sidebarInitialized && currentSegmentElement) {
        const chapterGroup = currentSegmentElement.closest('.chapter-group');
        const moduleGroup  = currentSegmentElement.closest('.module-group');

        const chapterHeader = chapterGroup?.querySelector('.chapter-header');
        const segmentList   = chapterHeader?.nextElementSibling;
        const moduleHeader  = moduleGroup?.querySelector('.module-header');
        const chapterList   = moduleHeader?.nextElementSibling;

        if (moduleHeader && chapterList) {
          moduleHeader.classList.add('expanded', 'current-module');
          chapterList.classList.add('expanded');
        }
        if (chapterHeader && segmentList) {
          chapterHeader.classList.add('expanded', 'has-current');
          segmentList.classList.add('expanded');
        }

        this.sidebarInitialized = true;
      }

      // --- Keep current item in view without changing layout size ---
      if (currentSegmentElement) {
        setTimeout(() => {
          const sidebar = document.getElementById('sidebar');
          if (!sidebar) return;

          const itemRect = currentSegmentElement.getBoundingClientRect();
          const sidebarRect = sidebar.getBoundingClientRect();

          const offsetTop  = itemRect.top  - sidebarRect.top;
          const offsetBottom = itemRect.bottom - sidebarRect.top;

          if (offsetTop < 0 || offsetBottom > sidebar.clientHeight) {
            const scrollDelta = offsetTop - sidebar.clientHeight * 0.25;
            sidebar.scrollTop += scrollDelta;
          }
        }, 50);
      }
    }

    async loadTranscript(){
      if (this.transcriptText) {
        this.captions = this.parseTranscript(this.transcriptText);
        console.log('Loaded captions from provided text:', this.captions.length);
        return;
      }
      
      if (!this.config.transcriptFile) return;
      
      try {
        const transcriptUrl = this.resolveAsset(this.config.transcriptFile);
        const response = await fetch(transcriptUrl);
        const text = await response.text();
        this.captions = this.parseTranscript(text);
        console.log('Loaded captions from file:', this.captions.length);
      } catch(e) {
        console.warn('Failed to load transcript:', e.message);
      }
    }

    parseTranscript(text){
      const captions = [];
      const lines = text.split('\n');
      let i = 0;
      
      while(i < lines.length){
        const line = lines[i].trim();
        
        if (line.match(/^\d{2};\d{2};\d{2};\d{2}\s*-\s*\d{2};\d{2};\d{2};\d{2}$/)){
          const [start, end] = line.split('-').map(tc => tcToSeconds(tc.trim(), this.FPS));
          i++;
          
          let captionText = '';
          while(i < lines.length && !lines[i].match(/^\d{2};\d{2};\d{2};\d{2}\s*-/)){
            if (lines[i].trim()){
              captionText += (captionText ? ' ' : '') + lines[i].trim();
            }
            i++;
          }
          
          if (captionText){
            captions.push({ start, end, text: captionText });
          }
        } else {
          i++;
        }
      }
      
      return captions;
    }

initStorage(){
  const usingServerProgress = !!(window.GGTrainingAPI && window.GGTrainingAPI.accessToken);

  this.moduleKey = `${this.config.id || 'default'}_done`;

  if (usingServerProgress) {
    // 🚫 API mode: do NOT trust or load any local "_done" data.
    // The only source of truth is `startingSegment` from the server.
    console.log('🧠 API mode: ignoring localStorage done state for', this.moduleKey);
    this.done = new Set();
  } else {
    // 🧱 Local-only mode (no API): keep old behavior
    const currentVer = parseInt(localStorage.getItem(this.VER_KEY) || '0', 10);
    if (currentVer !== this.SCHEMA_VERSION){
      Object.keys(localStorage).forEach(k => {
        if (k.endsWith('_done')) localStorage.removeItem(k);
      });
      localStorage.setItem(this.VER_KEY, String(this.SCHEMA_VERSION));
    }

    this.done = new Set(
      JSON.parse(localStorage.getItem(this.moduleKey) || '[]')
    );
  }

  // Apply startingSegment from API (or other caller) by lighting up the first N hotspots
  if (this.startingSegment > 0 && this.config.hotspots) {
    console.log(`📍 Resuming from segment ${this.startingSegment}`);
    for (let i = 0; i < this.startingSegment && i < this.config.hotspots.length; i++) {
      const hotspot = this.config.hotspots[i];
      if (hotspot && hotspot.id) {
        this.done.add(hotspot.id);
      }
    }
    this.saveDone();  // will be a no-op in API mode
  }
}

    saveDone(){
  const usingServerProgress = !!(window.GGTrainingAPI && window.GGTrainingAPI.accessToken);

  // In API mode we *never* persist local "_done" – server is the source of truth.
  if (usingServerProgress) {
    return;
  }

  try {
    localStorage.setItem(this.moduleKey, JSON.stringify([...this.done]));
  } catch (e) {
    console.warn('⚠️ Failed to save local progress:', e.message);
  }
}


    cacheDOM(){
      this.title = document.getElementById('moduleTitle');
      this.stage = document.getElementById('stage');
      this.innerWindow = document.getElementById('innerWindow');
      this.viewer = document.getElementById('viewer');
      this.viewerTitle = document.getElementById('viewerTitle');
      this.audio = document.getElementById('vo');
      this.closeViewerBtn = document.getElementById('closeViewer');
      this.closeViewerBtn.addEventListener('click', ()=>this.closeViewer());
    }

    applyConfigBasics(){
      document.title = this.config.title || 'Training Module';
      this.title.textContent = this.config.title || 'Training Module';

      // Initially hide all hotspots while loading
      this.stage.classList.add('loading-background');

      const bg = this.resolveAsset(this.config.backgroundImage || '');
      if (bg){
        const img = new Image();
        const withBust = bg + (bg.includes('?') ? '&' : '?') + 'v=' + Date.now();
        img.onload = ()=>{ 
          this.stage.style.backgroundImage = `url('${withBust}')`;
          // Show hotspots after background loads with a delay to ensure rendering
          setTimeout(() => {
            this.stage.classList.remove('loading-background');
          }, 300); // Increased delay for better visual experience
        };
        img.onerror = ()=>{ 
          this.stage.style.backgroundImage = `url('${bg}')`;
          // Show hotspots even if background fails to load
          setTimeout(() => {
            this.stage.classList.remove('loading-background');
          }, 300);
        };
        img.src = withBust;
      } else {
        this.stage.style.backgroundImage = '';
        // No background to load, show hotspots immediately
        this.stage.classList.remove('loading-background');
      }

      const audioSrc = this.resolveAsset(this.config.audioFile || '');
      if (audioSrc) {
        this.audio.src = audioSrc;
        this.audio.addEventListener('error', (e) => console.error('Audio error:', e, this.audio.error));
      } else {
        this.audio.removeAttribute('src');
      }
    }

    createHotspots(){
      const W = this.config.canvasDimensions?.width || 6000;
      const H = this.config.canvasDimensions?.height || 4000;
      this.linearOrder = [];
      let visualIndex = 0;

      (this.config.hotspots||[]).forEach((h, idx)=>{
        const b = el('button',{id:h.id, class:'hotspot', 'data-id':h.id, 'data-tcStart':h.tcStart||'00:00:00:00', 'data-tcEnd':h.tcEnd||'00:00:00:01', 'data-order':h.order||''});
        visualIndex += 1;
        b.setAttribute('data-number', String(visualIndex));

        const isFirst = idx===0;
        const isDone = (h.order||'').toLowerCase()==='done';
        const isPill = isFirst || h.type==='pill' || isDone;

        if (isPill){
          b.classList.add('pill');
          const label = isFirst ? 'Start' : (h.label ?? (isDone ? 'Done' : (h.text || 'Action')));
          b.textContent = label;
          b.setAttribute('aria-label', label);
          if (isFirst) b.style.cssText = 'left:3%; bottom:5%; right:auto; top:auto; transform:none;';
          else if (isDone) b.style.cssText = 'right:3%; bottom:5%; left:auto; top:auto; transform:none;';
          else {
            const dock = (h.dock||'right').toLowerCase();
            b.style.cssText = (dock==='left') ? 'left:3%; bottom:5%; right:auto; top:auto; transform:none;' : 'right:3%; bottom:5%; left:auto; top:auto; transform:none;';
          }
        } else {
          b.classList.add(h.type||'circle');
          const leftPct   = (h.centerX/W)*100;
          const topPct    = (h.centerY/H)*100;
          const widthPct  = (h.width/W)*100;
          const heightPct = (h.height/H)*100;
          b.style.cssText = `left:${leftPct}%;top:${topPct}%;width:${widthPct}%;height:${heightPct}%;`;
        }

        this.stage.appendChild(b);
        this.linearOrder.push(h.id);
      });

      this.buttons = {};
      (this.config.hotspots||[]).forEach(h=>{ this.buttons[h.id] = document.getElementById(h.id); });
    }

    wireHotspotClicks(){
      (this.config.hotspots||[]).forEach(h=>{
        const b = this.buttons[h.id];
        if (!b) return;
        b.addEventListener('click', ()=>{
          if (b.classList.contains('locked')) return;
          this.openFor(b);
        });
      });
    }

    setState(el, state){
      el.classList.remove('clickable','locked','done');
      el.classList.add(state);
      el.setAttribute('aria-disabled', state==='locked' ? 'true' : 'false');
    }

    applyStatesLinear(){
      this.linearOrder.forEach(id=>this.setState(this.buttons[id], 'locked'));
      let unlockedOne = false;
      let firstUnlockedId = null;
      this.linearOrder.forEach(id=>{
        if (this.done.has(id)) this.setState(this.buttons[id],'done');
        else if (!unlockedOne){ 
          this.setState(this.buttons[id],'clickable'); 
          unlockedOne=true;
          firstUnlockedId = id;
        }
      });
      this.updateChapterList();
      
      // Auto-open the next segment when resuming from progress
      // Only auto-open if we have completed segments (startingSegment > 0) and there's a next segment to open
      if (this.startingSegment > 0 && firstUnlockedId && !this._hasAutoOpened) {
        this._hasAutoOpened = true; // Prevent multiple auto-opens
        console.log(`🎬 Auto-opening next segment: ${firstUnlockedId} (resuming from segment ${this.startingSegment})`);
        
        // Auto-open after a short delay to ensure UI is ready
        setTimeout(() => {
          const button = this.buttons[firstUnlockedId];
          if (button && button.classList.contains('clickable')) {
            this.openFor(button);
          }
        }, 500);
      }
    }

    buildAudioUI(total){
      const ui = el('div',{class:'audio-ui'},[
        el('div',{class:'row'},[
          el('div',{class:'biglabel'},'Narration'),
          el('div',{class:'time'},[
            el('span',{id:'tcur'},'0:00'),' / ', el('span',{id:'tlen'},fmt(total))
          ])
        ]),
        el('div',{class:'bar'}, el('div',{class:'fill', id:'fill'})),
        el('div',{class:'row'},[
          el('div',{class:'controls'},[
            el('button',{class:'btn',id:'playPause',title:'Play/Pause'},'▶'),
            el('button',{class:'btn',id:'replay',title:'Replay'},'⟳'),
          ]),
          el('div',{class:'viewer-actions'},[
            el('span',{class:'time',id:'status'},'Ready'),
            el('button',{class:'close-btn',id:'closeBtn'},'Close'),
            el('button',{class:'next-btn',id:'nextBtn',style:'display:none'},'Next'),
          ])
        ])
      ]);
      return ui;
    }

    pauseViewer(){
      if (this.seg.currentVideo) this.seg.currentVideo.pause();
      if (this.seg.currentVideo2) this.seg.currentVideo2.pause();
      if (!this.audio.paused) this.audio.pause();
      const playPause = document.getElementById('playPause');
      const status = document.getElementById('status');
      if (playPause) playPause.textContent='▶';
      if (status) status.textContent='Paused';
    }

    closeViewer(){
      this.innerWindow.style.opacity = '0';
      
      setTimeout(() => {
        this.innerWindow.classList.remove('active', 'animating');
        this.viewer.replaceChildren();
        
        // Clean up video(s)
        if (this.seg.currentVideo){ 
          this.seg.currentVideo.pause(); 
          this.seg.currentVideo = null; 
        }
        if (this.seg.currentVideo2){ 
          this.seg.currentVideo2.pause(); 
          this.seg.currentVideo2 = null; 
        }
        this.seg.crossfadeState = null;
        
        if (!this.audio.paused) this.audio.pause();
        this.seg.active=false; cancelAnimationFrame(this.seg.rafId);
        this.currentCaptionElement = null;
        
        // Reset video state for multiple videos
        this.videoState.videos = null;
        this.videoState.currentIndex = 0;
        this.videoState.playCount = [0, 0];
        
        this.innerWindow.style.top = '';
        this.innerWindow.style.left = '';
        this.innerWindow.style.width = '';
        this.innerWindow.style.height = '';
        this.innerWindow.style.opacity = '';
        
        const header = this.innerWindow.querySelector('header');
        const viewer = this.innerWindow.querySelector('#viewer');
        if (header) {
          header.style.transform = '';
          header.style.opacity = '';
        }
        if (viewer) {
          viewer.style.transform = '';
          viewer.style.opacity = '';
        }
      }, 300);
    }

    showChapterCompleteDialog(){
      console.log('📋 === SHOW CHAPTER COMPLETE DIALOG ===');
      
      // Check if ALL training is complete
      const allTrainingComplete = window.GGTrainingAPI && window.GGTrainingAPI.isAllTrainingComplete 
        ? window.GGTrainingAPI.isAllTrainingComplete() 
        : false;
      
      console.log(`  All training complete: ${allTrainingComplete}`);
      
      // Get current and next chapter info
      let currentChapterName = 'this chapter';
      let nextChapterName = 'the next chapter';
      let isLastChapter = false;
      
      if (window.GGTrainingAPI && window.GGTrainingAPI.currentChapterKey) {
        const currentKey = window.GGTrainingAPI.currentChapterKey;
        const allChapters = window.GGTrainingAPI.CHAPTER_FILES;
        const currentIndex = allChapters.indexOf(`${currentKey}.json`);
        
        console.log(`  Current chapter key: ${currentKey}`);
        console.log(`  Current index: ${currentIndex}`);
        
        // Get current chapter name
        const currentChapterData = window.GGTrainingAPI.allChapters[currentKey];
        if (currentChapterData && currentChapterData.data) {
          currentChapterName = currentChapterData.data.title || currentChapterName;
          console.log(`  Current chapter name: ${currentChapterName}`);
        }
        
        // Check if this is the last chapter
        isLastChapter = currentIndex >= 0 && currentIndex === allChapters.length - 1;
        console.log(`  Is last chapter: ${isLastChapter}`);
        
        // Get next chapter name
        if (currentIndex >= 0 && currentIndex < allChapters.length - 1) {
          const nextKey = allChapters[currentIndex + 1].replace('.json', '');
          console.log(`  Next chapter key: ${nextKey}`);
          
          const nextChapterData = window.GGTrainingAPI.allChapters[nextKey];
          if (nextChapterData && nextChapterData.data) {
            nextChapterName = nextChapterData.data.title || nextChapterName;
            console.log(`  Next chapter name: ${nextChapterName}`);
          }
        }
      }
      
      let overlay = document.querySelector('.chapter-complete-overlay');
      if (!overlay){
        console.log('  Creating NEW dialog overlay...');
        
        if (allTrainingComplete || isLastChapter) {
          // Show "ALL TRAINING COMPLETE" dialog
          overlay = el('div',{class:'chapter-complete-overlay'}, el('div',{class:'chapter-complete-dialog'},[
            el('h2',{style:'margin: 0 0 16px 0; color: #7CFCB5; font-size: 32px;'},'🎓 Training Complete!'),
            el('p',{style:'margin: 0 0 8px 0; font-size: 16px; color: #9fb0c5;'},[
              'Congratulations! You\'ve completed ',
              el('strong', {style:'color: #00e0ff;'}, currentChapterName)
            ]),
            el('p',{style:'margin: 0 0 24px 0; font-size: 18px; font-weight: 700; color: #7CFCB5;'},'✨ You have finished all training modules! ✨'),
            el('p',{style:'margin: 0 0 24px 0; font-size: 14px; color: #9fb0c5;'},'You can now review any chapter or close this window.'),
            el('div',{class:'actions', style:'display: flex; gap: 12px; justify-content: center;'},[
              el('button',{class:'btn',id:'closeCompleteBtn', style:'padding: 12px 24px; font-size: 14px; background: linear-gradient(135deg, #7CFCB5, #00e0ff); font-weight: 700;'},'✓ Close')
            ])
          ]));
        } else {
          // Show regular "Chapter Complete" dialog
          overlay = el('div',{class:'chapter-complete-overlay'}, el('div',{class:'chapter-complete-dialog'},[
            el('h2',{style:'margin: 0 0 16px 0; color: #7CFCB5; font-size: 28px;'},'🎉 Chapter Complete!'),
            el('p',{style:'margin: 0 0 8px 0; font-size: 14px; color: #9fb0c5;'},[
              'You\'ve finished ',
              el('strong', {style:'color: #00e0ff;'}, currentChapterName)
            ]),
            el('p',{style:'margin: 0 0 24px 0; font-size: 15px;'},[
              'Ready to continue to ',
              el('strong', {style:'color: #7cf6c9;'}, nextChapterName),
              '?'
            ]),
            el('div',{class:'actions', style:'display: flex; gap: 12px; justify-content: center;'},[
              el('button',{class:'btn alt',id:'stayBtn', style:'padding: 12px 24px; font-size: 14px;'},'Stay Here'),
              el('button',{class:'btn',id:'continueBtn', style:'padding: 12px 24px; font-size: 14px; background: linear-gradient(135deg, #00e0ff, #0099cc); font-weight: 700;'},'Continue to Next Chapter →')
            ])
          ]));
        }
        
        document.body.appendChild(overlay);
        console.log('  ✅ Dialog overlay created and added to body');
      } else {
        console.log('  Updating EXISTING dialog overlay...');
        // Update existing dialog based on completion status
        const dialog = overlay.querySelector('.chapter-complete-dialog');
        if (dialog) {
          if (allTrainingComplete || isLastChapter) {
            // Update to "ALL COMPLETE" dialog
            dialog.innerHTML = `
              <h2 style="margin: 0 0 16px 0; color: #7CFCB5; font-size: 32px;">🎓 Training Complete!</h2>
              <p style="margin: 0 0 8px 0; font-size: 16px; color: #9fb0c5;">
                Congratulations! You've completed <strong style="color: #00e0ff;">${currentChapterName}</strong>
              </p>
              <p style="margin: 0 0 24px 0; font-size: 18px; font-weight: 700; color: #7CFCB5;">✨ You have finished all training modules! ✨</p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #9fb0c5;">You can now review any chapter or close this window.</p>
              <div class="actions" style="display: flex; gap: 12px; justify-content: center;">
                <button class="btn" id="closeCompleteBtn" style="padding: 12px 24px; font-size: 14px; background: linear-gradient(135deg, #7CFCB5, #00e0ff); font-weight: 700;">✓ Close</button>
              </div>
            `;
          } else {
            // Update to regular "Chapter Complete" dialog
            dialog.innerHTML = `
              <h2 style="margin: 0 0 16px 0; color: #7CFCB5; font-size: 28px;">🎉 Chapter Complete!</h2>
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #9fb0c5;">
                You've finished <strong style="color: #00e0ff;">${currentChapterName}</strong>
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px;">
                Ready to continue to <strong style="color: #7cf6c9;">${nextChapterName}</strong>?
              </p>
              <div class="actions" style="display: flex; gap: 12px; justify-content: center;">
                <button class="btn alt" id="stayBtn" style="padding: 12px 24px; font-size: 14px;">Stay Here</button>
                <button class="btn" id="continueBtn" style="padding: 12px 24px; font-size: 14px; background: linear-gradient(135deg, #00e0ff, #0099cc); font-weight: 700;">Continue to Next Chapter →</button>
              </div>
            `;
          }
          console.log('  ✅ Dialog text updated');
        }
      }
      
      console.log('  Setting dialog display to "grid"...');
      overlay.style.display='grid';
      console.log('  ✅ Dialog should now be visible on screen!');
      
      // Button handlers with logging
      const stayBtn = overlay.querySelector('#stayBtn');
      const continueBtn = overlay.querySelector('#continueBtn');
      const closeCompleteBtn = overlay.querySelector('#closeCompleteBtn');
      
      if (stayBtn) {
        stayBtn.onclick = ()=>{ 
          console.log('  👤 User clicked "Stay Here" - closing dialog');
          overlay.style.display='none'; 
          this.closeViewer(); 
        };
      }
      
      if (continueBtn) {
        continueBtn.onclick = ()=>{ 
          console.log('  👤 User clicked "Continue to Next Chapter" - loading next chapter');
          overlay.style.display='none'; 
          this.loadNextModule(); 
        };
      }
      
      if (closeCompleteBtn) {
        closeCompleteBtn.onclick = ()=>{ 
          console.log('  👤 User clicked "Close" on training complete dialog');
          overlay.style.display='none'; 
          this.closeViewer(); 
        };
      }
      
      console.log('📋 === END SHOW CHAPTER COMPLETE DIALOG ===');
    }

    loadNextModule(){
      console.log('📋 loadNextModule() called from dialog "Continue" button');
      
      // In the new API system, this is handled by GGTrainingAPI.moveToNextChapter()
      // But we'll implement it here for compatibility
      if (window.GGTrainingAPI) {
        console.log('  ✅ Calling GGTrainingAPI.moveToNextChapter()...');
        window.GGTrainingAPI.moveToNextChapter();
      } else {
        console.warn('⚠️ GGTrainingAPI not available');
        alert('Unable to load next module. Please refresh the page.');
      }
    }

    async onSegmentComplete(id){
      if (!this.done.has(id)){ 
        this.done.add(id); 
        this.saveDone(); 
        this.applyStatesLinear(); 
        
        // === API Progress Update ===
        if (window.GGTrainingAPI) {
          // Find the completed hotspot index
          const hotspotIndex = (this.config.hotspots || []).findIndex(h => h.id === id);
          if (hotspotIndex >= 0) {
            const totalSegments = (this.config.hotspots || []).length;
            const nextSegment = hotspotIndex + 1; // Next segment to complete
            const allCompleted = nextSegment >= totalSegments;
            
            console.log(`🎯 Segment ${hotspotIndex + 1}/${totalSegments} complete`);
            
            // Post progress to API and wait for confirmation
            const success = await window.GGTrainingAPI.postSegmentProgress(nextSegment, allCompleted);
            
            if (!success) {
              console.error('❌ Progress POST failed - user will be prompted to reload');
              // The postSegmentProgress function already shows an error popup
              // Don't continue with the next segment logic if POST failed
              return;
            } else {
              console.log('✅ Progress POST successful, continuing...');
            }
          }
        }
      }
      
      // Check if ALL segments in this chapter are complete
      const totalSegments = (this.config.hotspots || []).length;
      const completedCount = Array.from(this.done).filter(doneId => 
        (this.config.hotspots || []).some(h => h.id === doneId)
      ).length;
      const isChapterComplete = completedCount >= totalSegments;
      
      console.log(`📊 Chapter progress: ${completedCount}/${totalSegments} segments complete`);
      
      const hotspot = (this.config.hotspots||[]).find(h=>h.id===id);
      const isLastSegment = (hotspot?.order||'').toLowerCase()==='done';
      
      // Find the next segment in sequence
      console.log('🔍 Looking for next segment...');
      console.log('  linearOrder:', this.linearOrder);
      console.log('  Current id:', id);
      
      const currentIndex = this.linearOrder.indexOf(id);
      console.log('  Current index:', currentIndex);
      
      const nextIndex = currentIndex + 1;
      console.log('  Next index:', nextIndex);
      
      const hasNextSegment = nextIndex < this.linearOrder.length;
      console.log('  Has next segment?', hasNextSegment);
      
      const nextSegmentId = hasNextSegment ? this.linearOrder[nextIndex] : null;
      console.log('  Next segment ID:', nextSegmentId);
      
      const nextButton = nextSegmentId ? this.buttons[nextSegmentId] : null;
      console.log('  Next button element:', nextButton);
      
      if (nextButton) {
        console.log('  Next button classes:', nextButton.className);
        console.log('  Next button clickable?', nextButton.classList.contains('clickable'));
      }
      
      const nextBtn = document.getElementById('nextBtn');
      if (nextBtn){
        nextBtn.style.display='block';
        nextBtn.onclick = ()=>{
          console.log('🔘 Next button clicked!');
          console.log('  isChapterComplete:', isChapterComplete);
          console.log('  isLastSegment:', isLastSegment);
          console.log('  hasNextSegment:', hasNextSegment);
          console.log('  nextButton exists:', !!nextButton);
          
          // Show chapter complete dialog if ALL segments are done
          if (isChapterComplete || isLastSegment){
            console.log('🎉 Chapter Complete! Showing dialog...');
            console.log('  isChapterComplete:', isChapterComplete);
            console.log('  isLastSegment:', isLastSegment);
            
            // Check if this is truly the LAST chapter in the entire system
            // Use GGTrainingAPI.CHAPTER_FILES to get the complete list
            let isFinalChapter = false;
            let currentChapterKey = null;
            let totalChapters = 0;
            let currentChapterIndex = -1;
            
            if (window.GGTrainingAPI && window.GGTrainingAPI.CHAPTER_FILES) {
              const allChapters = window.GGTrainingAPI.CHAPTER_FILES;
              currentChapterKey = window.GGTrainingAPI.currentChapterKey;
              totalChapters = allChapters.length;
              currentChapterIndex = allChapters.indexOf(`${currentChapterKey}.json`);
              isFinalChapter = (currentChapterIndex === allChapters.length - 1);
              
              console.log('  ✓ Chapter detection:');
              console.log('    - Current chapter:', currentChapterKey);
              console.log('    - Chapter position:', `${currentChapterIndex + 1}/${totalChapters}`);
              console.log('    - Is final chapter:', isFinalChapter);
              console.log('    - All chapters:', allChapters);
            } else {
              console.warn('  ⚠️ GGTrainingAPI not available, cannot determine chapter position');
            }
            
            if (isFinalChapter){ 
              // This is the last chapter in the entire training system
              console.log('  🎓 FINAL CHAPTER - Showing completion alert');
              this.closeViewer();
              setTimeout(() => {
                alert('🎓 Congratulations! You have completed ALL training modules!\n\nYou have finished the entire training program.'); 
              }, 400);
            } else { 
              // Show the chapter complete dialog for any other chapter
              console.log('  📋 REGULAR CHAPTER - Showing chapter complete dialog');
              console.log('  📋 First closing viewer, then showing dialog...');
              
              // Close the viewer first
              this.closeViewer();
              
              // Wait for viewer to close, then show dialog
              setTimeout(() => {
                console.log('  📋 Viewer closed, now calling showChapterCompleteDialog()...');
                this.showChapterCompleteDialog(); 
                console.log('  ✅ Dialog should now be visible');
              }, 400); // Wait for viewer close animation (300ms) + small buffer
            }
          } else if (hasNextSegment && nextButton) {
            // Close viewer, wait, then open next segment with animation
            console.log(`➡️ AUTO-ADVANCE: Moving to next segment: ${nextSegmentId}`);
            this.closeViewer();
            
            // Wait the configured delay, then open next segment
            const delay = typeof SEGMENT_TRANSITION_DELAY !== 'undefined' ? SEGMENT_TRANSITION_DELAY : 300;
            console.log(`⏱️ Waiting ${delay}ms before opening next segment...`);
            
            setTimeout(() => {
              console.log(`🎬 Opening next segment "${nextSegmentId}" now!`);
              console.log('  Button element:', nextButton);
              console.log('  Button ID:', nextButton.id);
              console.log('  Button classes:', nextButton.className);
              
              // Make absolutely sure the button is clickable before clicking
              if (nextButton.classList.contains('locked')) {
                console.error('❌ Next button is locked! This should not happen.');
                console.log('  Forcing button to clickable state...');
                this.setState(nextButton, 'clickable');
              }
              
              console.log('  Clicking button...');
              nextButton.click();
              console.log('  Button clicked!');
            }, delay);
          } else {
            // Fallback: just close if no next segment found
            console.warn('⚠️ No next segment found, just closing viewer');
            console.log('  hasNextSegment:', hasNextSegment);
            console.log('  nextButton:', nextButton);
            this.closeViewer();
          }
        };
      }
    }

    wireAudioSegment(startSec,endSec,id){
      const total = Math.max(0.01, endSec-startSec);
      this.seg = {
        start: startSec,
        end: endSec,
        active: true,
        currentId: id,
        currentVideo: this.seg.currentVideo,
        currentVideo2: this.seg.currentVideo2,
        crossfadeState: this.seg.crossfadeState,
        rafId: null
      };
      
      const fill = document.getElementById('fill');
      const playPause = document.getElementById('playPause');
      const replay = document.getElementById('replay');
      const status = document.getElementById('status');
      const tcur = document.getElementById('tcur');
      const closeBtn = document.getElementById('closeBtn');

      const syncUI = ()=>{
        if (!this.seg.active) return;
        const now = Math.min(Math.max(this.audio.currentTime, this.seg.start), this.seg.end);
        const elapsed = now - this.seg.start;
        if (fill) fill.style.width = `${(elapsed/total)*100}%`;
        if (tcur) tcur.textContent = fmt(elapsed);
        
        this.updateCaption(now);
        
        if (now >= this.seg.end - 0.02){
          this.audio.pause();
          if (this.seg.currentVideo) this.seg.currentVideo.pause();
          if (this.seg.currentVideo2) this.seg.currentVideo2.pause();
          if (playPause) playPause.textContent='▶';
          if (status) status.textContent='Finished';
          cancelAnimationFrame(this.seg.rafId);
          this.onSegmentComplete(id);
          return;
        }
        this.seg.rafId = requestAnimationFrame(syncUI);
      };

      const startSeg = ()=>{
        this.audio.currentTime = startSec;
        
        // Apply playback speed if configured
        if (typeof AUDIO_SPEEDUP_ENABLED !== 'undefined' && AUDIO_SPEEDUP_ENABLED === true) {
          const speedRate = typeof AUDIO_SPEEDUP_RATE !== 'undefined' ? AUDIO_SPEEDUP_RATE : 1.0;
          this.audio.playbackRate = speedRate;
          console.log(`⏩ Audio speed-up enabled: ${speedRate}x playback rate`);
        } else {
          this.audio.playbackRate = 1.0;
        }
        
        this.audio.play().then(()=>{
          // Handle video playback - check for crossfade system first
          if (this.seg.crossfadeState && this.seg.crossfadeState.activeVideo) {
            // Crossfade system active - play the currently active video
            const activeVid = this.seg.crossfadeState.activeVideo;
            
            // Apply same speed to video if speed-up is enabled
            if (typeof AUDIO_SPEEDUP_ENABLED !== 'undefined' && AUDIO_SPEEDUP_ENABLED === true) {
              const speedRate = typeof AUDIO_SPEEDUP_RATE !== 'undefined' ? AUDIO_SPEEDUP_RATE : 1.0;
              activeVid.playbackRate = speedRate;
            }
            activeVid.play().catch(()=>{}); 
          } else if (this.seg.currentVideo) {
            // Regular single video or multi-video system
            // Apply same speed to video if speed-up is enabled
            if (typeof AUDIO_SPEEDUP_ENABLED !== 'undefined' && AUDIO_SPEEDUP_ENABLED === true) {
              const speedRate = typeof AUDIO_SPEEDUP_RATE !== 'undefined' ? AUDIO_SPEEDUP_RATE : 1.0;
              this.seg.currentVideo.playbackRate = speedRate;
            }
            this.seg.currentVideo.play().catch(()=>{}); 
          }
          if (playPause) playPause.textContent='⏸';
          if (status) status.textContent='Playing';
          cancelAnimationFrame(this.seg.rafId);
          this.seg.rafId = requestAnimationFrame(syncUI);
        }).catch(()=>{
          if (status) status.textContent='Tap Play to start audio';
        });
      };

      this.audio.ontimeupdate = ()=>{
        if (!this.seg.active) return;
        if (this.audio.currentTime < this.seg.start) this.audio.currentTime = this.seg.start;
        if (this.audio.currentTime > this.seg.end) this.audio.currentTime = this.seg.end;
      };

      if (playPause){
        playPause.onclick = ()=>{
          if (this.audio.paused){
            if (this.audio.currentTime <= this.seg.start || this.audio.currentTime >= this.seg.end){ 
              startSeg(); 
            } else {
              this.audio.play().then(()=>{
                // Handle video playback - check for crossfade system first
                if (this.seg.crossfadeState && this.seg.crossfadeState.activeVideo) {
                  // Crossfade system - play the active video
                  this.seg.crossfadeState.activeVideo.play().catch(()=>{});
                } else if (this.seg.currentVideo) {
                  // Regular video
                  this.seg.currentVideo.play().catch(()=>{});
                }
                playPause.textContent='⏸';
                if (status) status.textContent='Playing';
                cancelAnimationFrame(this.seg.rafId);
                this.seg.rafId = requestAnimationFrame(syncUI);
              });
            }
          } else {
            this.audio.pause();
            if (this.seg.crossfadeState && this.seg.crossfadeState.activeVideo) {
              // Pause the active video in crossfade system
              this.seg.crossfadeState.activeVideo.pause();
            } else if (this.seg.currentVideo) {
              // Pause regular video
              this.seg.currentVideo.pause();
            }
            if (this.seg.currentVideo2) this.seg.currentVideo2.pause();
            playPause.textContent='▶';
            if (status) status.textContent='Paused';
          }
        };
      }
      if (replay) replay.onclick = ()=> startSeg();
      if (closeBtn) closeBtn.onclick = ()=>this.closeViewer();
      startSeg();
    }

    getTitleAndBody(text){
      const m = (text||'').match(/^\s*\[([^\]]+)\]\s*\n?([\s\S]*)$/);
      return m ? { title:m[1], body:(m[2]||'').trimStart() } : { title:'Narration', body:text||'' };
    }

    openFor(button){
      
      
      try {
        const hid = button?.dataset?.id || button?.dataset?.hotspotId || button?.id;
        const hotspot = (this.config.hotspots || []).find(h => String(h.id) === String(hid));
        if (hotspot){
          this.currentChapterId = hotspot.__chapterId || null;
          const {start, end} = this.getHotspotWindow(hotspot);
          // Store the active window so timeupdate can clamp behavior
          this._capWindowStart = start;
          this._capWindowEnd   = end;

          // Filter active captions to this window
          this.activeCaptions = (this.captionsAll || []).filter(c => c.t >= start && c.t < end);
          this.captionIdx = -1;
          // Clear immediately; first cue will appear when time >= first cue
          this.renderCaption('');
        }
      } catch(e){}
    
try {
        // Resolve hotspot by the button's id mapping
        const hid = button?.dataset?.id || button?.dataset?.hotspotId || button?.id;
        const hotspot = (this.config.hotspots || []).find(h => String(h.id) === String(hid));
        if (hotspot){
          this.currentChapterId = hotspot.__chapterId || null;
          const {start, end} = this.getHotspotWindow(hotspot);
          this.activeCaptions = (this.captionsAll || []).filter(c => c.t >= start && c.t < end);
          this.captionIdx = -1;
          this.renderCaption('');
        }
      } catch(e){}
    
const id = button.id;
      const h = (this.config.hotspots||[]).find(x=>x.id===id) || {};
      const s = tcToSeconds(h.tcStart, this.FPS);
      const e = tcToSeconds(h.tcEnd, this.FPS);
      const {title, body} = this.getTitleAndBody(h.content || h.text || '');

      console.log('=== ANIMATION DEBUG START ===');
      console.log('Button clicked:', button.id);

      this.viewer.replaceChildren();
      this.viewerTitle.textContent = title || 'Narration';
      this.innerWindow.classList.remove('small','large','animating');

      const hasVideo = h.video || (h.contentMedia && h.contentMedia.type === 'video');
      const hasImage = h.contentMedia && h.contentMedia.type === 'image';
      const hasCaptions = this.captions.length > 0;
      
      const sizeClass = (hasVideo || hasImage) ? 'large' : 'small';
      console.log('Window size class:', sizeClass);
      
      if (hasVideo || hasImage){
        const media = el('div',{class:'mediaArea'});
        
        if (hasVideo) {
          // Reset video state for new hotspot
          this.videoState.videos = null;
          this.videoState.currentIndex = 0;
          this.videoState.playCount = [0, 0];
          
          // Get video source(s) - could be string or array
          const rawVideoSrc = h.video || h.contentMedia.src;
          
          // Check if we have multiple videos
          if (Array.isArray(rawVideoSrc)) {
            // Multiple videos - resolve all URLs and store them
            this.videoState.videos = rawVideoSrc.map(src => this.resolveAsset(src));
            console.log('📹 Multiple videos detected:', this.videoState.videos);
            
            // Start with the first video
            const vid = el('video', {src: this.videoState.videos[0]});
            vid.autoplay = true; 
            vid.muted = true; 
            vid.playsInline = true; 
            vid.loop = false; // Don't loop - we'll handle switching manually
            vid.controls = false;
            
            // Set up alternating playback when video ends
            vid.addEventListener('ended', () => {
              console.log(`📹 Video ${this.videoState.currentIndex + 1} ended (play count: ${this.videoState.playCount[this.videoState.currentIndex] + 1})`);
              
              // Increment play count for current video
              this.videoState.playCount[this.videoState.currentIndex]++;
              
              // Switch to the other video
              this.videoState.currentIndex = 1 - this.videoState.currentIndex; // Toggle between 0 and 1
              
              // Load and play the next video
              const nextVideoSrc = this.videoState.videos[this.videoState.currentIndex];
              console.log(`📹 Switching to video ${this.videoState.currentIndex + 1}:`, nextVideoSrc);
              
              vid.src = nextVideoSrc;
              vid.load();
              
              // Only play if the audio segment is still active
              if (this.seg.active && !this.audio.paused) {
                vid.play().catch(err => console.error('Error playing next video:', err));
              }
            });
            
            vid.addEventListener('loadedmetadata', () => {
              vid.play().catch(() => {});
            });
            
            media.appendChild(vid);
            this.seg.currentVideo = vid;
            
          } else {
            // Single video - use crossfade system for seamless looping
            const videoSrc = this.resolveAsset(rawVideoSrc);
            
            // Create container for stacked videos
            const videoContainer = el('div', {
              style: 'position: relative; width: 100%; height: 100%; overflow: hidden;'
            });
            
            // Create two video elements for crossfading
            const vid1 = el('video', {
              src: videoSrc,
              style: 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; transition: opacity 0.5s ease-in-out; opacity: 1;'
            });
            const vid2 = el('video', {
              src: videoSrc,
              style: 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; transition: opacity 0.5s ease-in-out; opacity: 0;'
            });
            
            vid1.autoplay = true;
            vid1.muted = true;
            vid1.playsInline = true;
            vid1.loop = false; // We handle looping manually
            vid1.controls = false;
            
            vid2.autoplay = false;
            vid2.muted = true;
            vid2.playsInline = true;
            vid2.loop = false;
            vid2.controls = false;
            vid2.preload = 'auto'; // Preload second video
            
            // State for tracking which video is active
            const crossfadeState = {
              activeVideo: vid1,
              inactiveVideo: vid2,
              isTransitioning: false
            };
            
            // Crossfade duration (time before end to start crossfade)
            const CROSSFADE_DURATION = 0.5; // 500ms crossfade
            
            // Monitor video 1
            vid1.addEventListener('timeupdate', () => {
              if (crossfadeState.activeVideo !== vid1 || crossfadeState.isTransitioning) return;
              
              const timeRemaining = vid1.duration - vid1.currentTime;
              
              if (timeRemaining <= CROSSFADE_DURATION && timeRemaining > 0) {
                console.log('📹 Starting crossfade from video 1 to video 2');
                crossfadeState.isTransitioning = true;
                
                // Start video 2 from beginning
                vid2.currentTime = 0;
                vid2.play().catch(() => {});
                
                // Fade out vid1, fade in vid2
                vid1.style.opacity = '0';
                vid2.style.opacity = '1';
                
                // After crossfade completes, swap roles
                setTimeout(() => {
                  crossfadeState.activeVideo = vid2;
                  crossfadeState.inactiveVideo = vid1;
                  crossfadeState.isTransitioning = false;
                  
                  // Reset vid1 for next cycle
                  vid1.pause();
                  vid1.currentTime = 0;
                }, CROSSFADE_DURATION * 1000);
              }
            });
            
            // Monitor video 2
            vid2.addEventListener('timeupdate', () => {
              if (crossfadeState.activeVideo !== vid2 || crossfadeState.isTransitioning) return;
              
              const timeRemaining = vid2.duration - vid2.currentTime;
              
              if (timeRemaining <= CROSSFADE_DURATION && timeRemaining > 0) {
                console.log('📹 Starting crossfade from video 2 to video 1');
                crossfadeState.isTransitioning = true;
                
                // Start video 1 from beginning
                vid1.currentTime = 0;
                vid1.play().catch(() => {});
                
                // Fade out vid2, fade in vid1
                vid2.style.opacity = '0';
                vid1.style.opacity = '1';
                
                // After crossfade completes, swap roles
                setTimeout(() => {
                  crossfadeState.activeVideo = vid1;
                  crossfadeState.inactiveVideo = vid2;
                  crossfadeState.isTransitioning = false;
                  
                  // Reset vid2 for next cycle
                  vid2.pause();
                  vid2.currentTime = 0;
                }, CROSSFADE_DURATION * 1000);
              }
            });
            
            // Ensure both videos start playing when loaded
            vid1.addEventListener('loadedmetadata', () => {
              vid1.play().catch(() => {});
            });
            
            vid2.addEventListener('loadedmetadata', () => {
              // vid2 doesn't autoplay, it waits for crossfade
            });
            
            videoContainer.appendChild(vid2); // Back layer
            videoContainer.appendChild(vid1); // Front layer (starts visible)
            media.appendChild(videoContainer);
            
            // Store reference to both videos
            this.seg.currentVideo = vid1;
            this.seg.currentVideo2 = vid2;
            this.seg.crossfadeState = crossfadeState;
          }
          
        } else if (hasImage) {
          const imgSrc = this.resolveAsset(h.contentMedia.src);
          const img = el('img',{src:imgSrc, alt: h.contentMedia.alt || 'Content image'});
          media.appendChild(img);
        }
        
        if (hasCaptions) {
          const captionEl = el('div',{class:'caption'}, '');
          this.currentCaptionElement = captionEl;
          media.appendChild(captionEl);
        }
        this.viewer.appendChild(media);
      } else {
        const wrap = el('div',{class:'subs-only', style:'flex:1;display:flex;align-items:center;justify-content:center;padding:20px;position:relative'});
        
        if (hasCaptions) {
          const captionEl = el('div',{class:'caption', style:'position:static;max-width:100%;font-size:18px;line-height:1.6'}, '');
          this.currentCaptionElement = captionEl;
          wrap.appendChild(captionEl);
        } else {
          wrap.appendChild(el('div',{class:'subs-text', style:'text-align:center;font-size:18px;line-height:1.6;color:#e9eef5'}, body));
        }
        this.viewer.appendChild(wrap);
      }

      const right = this.innerWindow.querySelector('header .right');
      right.querySelectorAll('.header-real-life-btn').forEach(btn => btn.remove());
      if (Array.isArray(h.realLifeExamples) && h.realLifeExamples.length){
        const btn = el('button',{class:'header-real-life-btn'},'Real Life Example');
        const imgs = h.realLifeExamples.map(p=>this.resolveAsset(p));
        btn.onclick = ()=>this.showRealLifePopup(imgs);
        right.insertBefore(btn, right.firstChild);
      }

      this.viewer.appendChild(this.buildAudioUI(Math.max(0.01, e - s)));
      
      // === Position & animation setup ===
      const rawButtonRect = button.getBoundingClientRect();
      const rawStageRect = this.stage.getBoundingClientRect();

      console.log('Button rect:', {
        left: rawButtonRect.left,
        top: rawButtonRect.top,
        width: rawButtonRect.width,
        height: rawButtonRect.height
      });
      console.log('Stage rect:', {
        left: rawStageRect.left,
        top: rawStageRect.top,
        width: rawStageRect.width,
        height: rawStageRect.height
      });

      // Fallbacks in case layout isn't fully ready yet (can happen right after chapter swap)
      const stageWidth = rawStageRect.width || this.stage.offsetWidth || 1;
      const stageHeight = rawStageRect.height || this.stage.offsetHeight || 1;

      const unsafeButton =
        !rawButtonRect ||
        !rawButtonRect.width ||
        !rawButtonRect.height ||
        !Number.isFinite(rawButtonRect.left) ||
        !Number.isFinite(rawButtonRect.top);

      let buttonCenterX;
      let buttonCenterY;

      if (unsafeButton) {
        console.log('[openFor] Using stage center as animation start (button rect not reliable).');
        buttonCenterX = stageWidth / 2;
        buttonCenterY = stageHeight / 2;
      } else {
        buttonCenterX = rawButtonRect.left + rawButtonRect.width / 2 - rawStageRect.left;
        buttonCenterY = rawButtonRect.top + rawButtonRect.height / 2 - rawStageRect.top;
      }

      console.log('Button center relative to stage:', { x: buttonCenterX, y: buttonCenterY });

      let finalWidth, finalHeight, finalTop, finalLeft;

      if (sizeClass === 'large') {
        finalWidth = stageWidth * 0.84;
        finalHeight = stageHeight * 0.84;
        finalTop = stageHeight * 0.08;
        finalLeft = stageWidth * 0.08;
      } else {
        // Small window (narration only) - use original positioning logic but bigger size
        finalWidth = Math.min(600, stageWidth * 0.52);  // Increased from 520px/0.46
        finalHeight = stageHeight * 0.65;                // Increased from 0.60
        finalTop = stageHeight * 0.20;                   // Adjusted slightly from 0.34 to center better
        finalLeft = stageWidth * 0.24;                   // Centered: 0.52 width at 0.24 left
      }

      console.log('Calculated final dimensions:', {
        width: finalWidth + 'px',
        height: finalHeight + 'px',
        top: finalTop + 'px',
        left: finalLeft + 'px'
      });

      // If for some reason the stage hasn't laid out yet, just snap to the final state
      if (stageWidth < 50 || stageHeight < 50) {
        console.log('[openFor] Stage too small, skipping zoom animation and snapping to final size.');
        this.innerWindow.classList.add('active', sizeClass);
        this.innerWindow.style.top = finalTop + 'px';
        this.innerWindow.style.left = finalLeft + 'px';
        this.innerWindow.style.width = finalWidth + 'px';
        this.innerWindow.style.height = finalHeight + 'px';
        this.innerWindow.style.opacity = '1';
        this.innerWindow.classList.remove('animating');

        const header = this.innerWindow.querySelector('header');
        const viewerEl = this.innerWindow.querySelector('#viewer');
        if (header) {
          header.style.transform = 'scale(1)';
          header.style.opacity = '1';
        }
        if (viewerEl) {
          viewerEl.style.transform = 'scale(1)';
          viewerEl.style.opacity = '1';
        }

        this.wireAudioSegment(s, e, id);
        console.log('=== ANIMATION DEBUG END (no animation path) ===');
      } else {
        this.innerWindow.classList.add('active', sizeClass);

        const initialTop = `${buttonCenterY - 5}px`;
        const initialLeft = `${buttonCenterX - 5}px`;

        console.log('Initial position (10px at button):', {
          top: initialTop,
          left: initialLeft,
          width: '10px',
          height: '10px'
        });

        this.innerWindow.style.top = initialTop;
        this.innerWindow.style.left = initialLeft;
        this.innerWindow.style.width = '10px';
        this.innerWindow.style.height = '10px';
        this.innerWindow.style.opacity = '0';

        const header = this.innerWindow.querySelector('header');
        const viewerEl = this.innerWindow.querySelector('#viewer');
        if (header) {
          header.style.transform = 'scale(0.01)';
          header.style.opacity = '0';
        }
        if (viewerEl) {
          viewerEl.style.transform = 'scale(0.01)';
          viewerEl.style.opacity = '0';
        }

        // Force layout before running the transition
        this.innerWindow.offsetHeight;

        console.log('Starting LINEAR animation in 100ms...');
        console.log('Window AND content should grow from 10px to full size');

        setTimeout(() => {
          console.log('Animating to final position:', {
            top: finalTop + 'px',
            left: finalLeft + 'px',
            width: finalWidth + 'px',
            height: finalHeight + 'px'
          });

          this.innerWindow.style.top = finalTop + 'px';
          this.innerWindow.style.left = finalLeft + 'px';
          this.innerWindow.style.width = finalWidth + 'px';
          this.innerWindow.style.height = finalHeight + 'px';
          this.innerWindow.style.opacity = '1';
          this.innerWindow.classList.add('animating');

          const header2 = this.innerWindow.querySelector('header');
          const viewer2 = this.innerWindow.querySelector('#viewer');
          if (header2) {
            header2.style.transform = 'scale(1)';
            header2.style.opacity = '1';
          }
          if (viewer2) {
            viewer2.style.transform = 'scale(1)';
            viewer2.style.opacity = '1';
          }

          console.log('LINEAR Animation triggered!');

          const dur = parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--animation-duration')
          );
          const delay = Number.isFinite(dur) ? dur * 1000 : 400;
          setTimeout(() => {
            console.log('Animation complete! Starting audio/video now...');
            this.wireAudioSegment(s, e, id);
          }, delay);
        }, 100);

        console.log('=== ANIMATION DEBUG END ===');
      }

      this.stage.onclick = (ev)=>{
        if (ev.target === this.stage) this.pauseViewer();
      };
    }

    showRealLifePopup(examples){
      const imgs = Array.isArray(examples) ? examples.slice() : [];
      if (!imgs.length) return;

      const existing = document.getElementById('realLifePopup');
      if (existing) existing.remove();

      let idx = 0;

      const overlay = el('div', {
        id:'realLifePopup',
        style:[
          'position:fixed','inset:0','display:grid','place-items:center',
          'background:rgba(0,0,0,.7)','z-index:9999'
        ].join(';')
      });

      const shell = el('div', {
        style:[
          'position:relative',
          'background:#0f1216','border:1px solid rgba(255,255,255,.2)','border-radius:12px',
          'max-width:min(90vw,800px)','max-height:min(90vh,600px)',
          'width:clamp(320px,80vw,800px)','height:clamp(240px,70vh,600px)',
          'display:flex','flex-direction:column','overflow:hidden'
        ].join(';')
      });

      const floatClose = el('button', {
        'aria-label':'Close',
        style:[
          'position:absolute','top:8px','right:8px','z-index:3',
          'background:#ff4444','color:#fff','border:none',
          'padding:6px 10px','border-radius:10px','cursor:pointer',
          'font-weight:800','font-size:16px','line-height:1'
        ].join(';')
      }, '✕');

      const header = el('header', {
        style:'background:#1a1a1a;color:#fff;padding:10px 12px;display:flex;justify-content:center;align-items:center;font-weight:700'
      }, 'Real Life Example');

      const stage = el('div', {
        style:'flex:1;display:flex;align-items:center;justify-content:center;padding:12px;background:#000;min-height:0'
      });

      const img = el('img', {
        id:'realLifeImg',
        alt:'Real life example',
        style:'max-width:100%;max-height:100%;object-fit:contain'
      });

      const footer = el('div', {
        style:'display:flex;gap:12px;justify-content:space-between;align-items:center;padding:10px 12px;background:#0f1216;border-top:1px solid rgba(255,255,255,.12)'
      });

      const prevBtn = el('button', { class:'btn', type:'button', style:'min-width:96px' }, '‹ Previous');
      const counter = el('span', { id:'counter', style:'color:#e9eef5' });
      const nextBtn = el('button', { class:'btn', type:'button', style:'min-width:96px' }, 'Next ›');

      stage.appendChild(img);
      footer.appendChild(prevBtn);
      footer.appendChild(counter);
      footer.appendChild(nextBtn);
      shell.appendChild(floatClose);
      shell.appendChild(header);
      shell.appendChild(stage);
      if (imgs.length > 1) shell.appendChild(footer);
      overlay.appendChild(shell);
      document.body.appendChild(overlay);

      const setDisabled = (el, on)=>{ el.disabled = !!on; el.style.opacity = on ? '.5' : '1'; };

      const render = ()=>{
        img.src = imgs[idx];
        counter.textContent = `${idx+1} of ${imgs.length}`;
        if (imgs.length > 1){
          setDisabled(prevBtn, idx === 0);
          setDisabled(nextBtn, idx === imgs.length - 1);
        }
      };

      const goPrev = ()=>{ if (idx > 0){ idx--; render(); } };
      const goNext = ()=>{ if (idx < imgs.length - 1){ idx++; render(); } };

      floatClose.onclick = ()=> overlay.remove();
      overlay.onclick = (e)=>{ if (e.target === overlay) overlay.remove();  };
      if (imgs.length > 1){
        prevBtn.onclick = goPrev;
        nextBtn.onclick = goNext;
      }

      const onKey = (e)=>{
        if (e.key === 'Escape'){ overlay.remove(); }
        else if (e.key === 'ArrowLeft' && imgs.length > 1){ goPrev(); }
        else if (e.key === 'ArrowRight' && imgs.length > 1){ goNext(); }
      };
      document.addEventListener('keydown', onKey);

      const mo = new MutationObserver(()=>{
        if (!document.getElementById('realLifePopup')) document.removeEventListener('keydown', onKey);
      });
      mo.observe(document.body, { childList:true });

      render();
    }
  }