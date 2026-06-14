// ==UserScript==
// @name         X Bulk Deleter 
// @match        https://x.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  window.postList = window.postList || [];
  window.currentIndex = 0;
  window.jsonLoaded = false;
  window.paused = true;
  window.manuallyPaused = false;
  window.delaySeconds = 6;
  window.goBackwards = false;
  window.currentFileName = '';
  window.currentUsername = '';
  window.rememberProgress = false;
  window.batchSize = 150;
  window.pauseMinutes = 15;
  window.deletionCounter = 0;
  window.totalDeleted = 0;
  window._lastCountedIndex = null;
  window._batchLimitReached = false;

  // Timer state — simple:
  // _countdownSeconds = null means "not started yet this batch"
  // _countdownSeconds > 0 means "counting down"
  // _countdownSeconds = 0 means "just finished"
  window._countdownSeconds = null;
  let _intervalHandle = null; // THE only interval. Never touched by Stop/Start.

  const PERSIST_KEYS = {
    state:          'bulkDeleter_state',
    persistent:     'bulkDeleter_persistent',
    totalDeleted:   'bulkDeleter_totalDeleted',
    delay:          'bulkDeleter_delay',
    reverse:        'bulkDeleter_reverse',
    remember:       'bulkDeleter_remember',
    batchSize:      'bulkDeleter_batchSize',
    pauseMinutes:   'bulkDeleter_pauseMinutes',
    countdown:      'bulkDeleter_countdown',
    deletionCounter:'bulkDeleter_deletionCounter',
  };

  // ── persistence ──────────────────────────────────────────────────────────

  function saveState() {
    try {
      sessionStorage.setItem(PERSIST_KEYS.state, JSON.stringify({
        postList: window.postList,
        currentIndex: window.currentIndex,
        currentFileName: window.currentFileName,
        delaySeconds: window.delaySeconds,
        goBackwards: window.goBackwards,
        rememberProgress: window.rememberProgress,
        batchSize: window.batchSize,
        pauseMinutes: window.pauseMinutes,
        deletionCounter: window.deletionCounter,
        totalDeleted: window.totalDeleted,
        paused: window.paused,
        manuallyPaused: window.manuallyPaused,
        jsonLoaded: window.jsonLoaded,
        _lastCountedIndex: window._lastCountedIndex,
        _batchLimitReached: window._batchLimitReached,
        _countdownSeconds: window._countdownSeconds,
      }));
      if (window.rememberProgress) {
        localStorage.setItem(PERSIST_KEYS.persistent, JSON.stringify({
          postList: window.postList,
          currentIndex: window.currentIndex,
          currentFileName: window.currentFileName,
          delaySeconds: window.delaySeconds,
          goBackwards: window.goBackwards,
          batchSize: window.batchSize,
          pauseMinutes: window.pauseMinutes,
          deletionCounter: window.deletionCounter,
          totalDeleted: window.totalDeleted,
          _lastCountedIndex: window._lastCountedIndex,
        }));
      }
      localStorage.setItem(PERSIST_KEYS.totalDeleted, String(window.totalDeleted));
      // Persist countdown so it survives page navigations
      if (window._countdownSeconds !== null) {
        localStorage.setItem(PERSIST_KEYS.countdown, String(window._countdownSeconds));
      } else {
        localStorage.removeItem(PERSIST_KEYS.countdown);
      }
      localStorage.setItem(PERSIST_KEYS.deletionCounter, String(window.deletionCounter));
    } catch (e) {}
  }

  function loadState() {
    try {
      const persistent = localStorage.getItem(PERSIST_KEYS.persistent);
      if (persistent) {
        const d = JSON.parse(persistent);
        if (Array.isArray(d.postList) && d.postList.length) window.postList = d.postList;
        if (typeof d.currentIndex === 'number') window.currentIndex = d.currentIndex;
        if (d.currentFileName) window.currentFileName = d.currentFileName;
        if (typeof d.delaySeconds === 'number') window.delaySeconds = d.delaySeconds;
        if (typeof d.goBackwards === 'boolean') window.goBackwards = d.goBackwards;
        if (typeof d.batchSize === 'number') window.batchSize = d.batchSize;
        if (typeof d.pauseMinutes === 'number') window.pauseMinutes = d.pauseMinutes;
        if (typeof d.deletionCounter === 'number') window.deletionCounter = d.deletionCounter;
        if (typeof d.totalDeleted === 'number') window.totalDeleted = d.totalDeleted;
      }

      const raw = sessionStorage.getItem(PERSIST_KEYS.state);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.postList) && s.postList.length) window.postList = s.postList;
        if (typeof s.currentIndex === 'number') window.currentIndex = s.currentIndex;
        if (s.currentFileName) window.currentFileName = s.currentFileName;
        if (typeof s.delaySeconds === 'number') window.delaySeconds = s.delaySeconds;
        if (typeof s.goBackwards === 'boolean') window.goBackwards = s.goBackwards;
        if (typeof s.batchSize === 'number') window.batchSize = s.batchSize;
        if (typeof s.pauseMinutes === 'number') window.pauseMinutes = s.pauseMinutes;
        if (typeof s.deletionCounter === 'number') window.deletionCounter = s.deletionCounter;
        if (typeof s.totalDeleted === 'number') window.totalDeleted = s.totalDeleted;
        if (typeof s.paused === 'boolean') window.paused = s.paused;
        if (typeof s.manuallyPaused === 'boolean') window.manuallyPaused = s.manuallyPaused;
        if (typeof s.jsonLoaded === 'boolean') window.jsonLoaded = s.jsonLoaded;
        if (s._lastCountedIndex !== undefined) window._lastCountedIndex = s._lastCountedIndex;
        if (s._batchLimitReached !== undefined) window._batchLimitReached = s._batchLimitReached;
        if (s._countdownSeconds !== undefined) window._countdownSeconds = s._countdownSeconds;
      }

      // localStorage overrides (survive hard reloads)
      const sv = localStorage.getItem(PERSIST_KEYS.delay);        if (sv) window.delaySeconds = parseFloat(sv);
      const sr = localStorage.getItem(PERSIST_KEYS.reverse);      if (sr !== null) window.goBackwards = sr === 'true';
      const sm = localStorage.getItem(PERSIST_KEYS.remember);     if (sm !== null) window.rememberProgress = sm === 'true';
      const sb = localStorage.getItem(PERSIST_KEYS.batchSize);    if (sb) window.batchSize = parseInt(sb);
      const sp = localStorage.getItem(PERSIST_KEYS.pauseMinutes); if (sp) window.pauseMinutes = parseInt(sp);
      const st = localStorage.getItem(PERSIST_KEYS.totalDeleted); if (st !== null) window.totalDeleted = parseInt(st) || 0;
      const sc = localStorage.getItem(PERSIST_KEYS.countdown);
      if (sc !== null) {
        const parsed = parseInt(sc);
        // Only restore if it's a valid positive number (a running countdown)
        window._countdownSeconds = (!isNaN(parsed) && parsed > 0) ? parsed : null;
      }
      const sdc = localStorage.getItem(PERSIST_KEYS.deletionCounter);
      if (sdc !== null) window.deletionCounter = parseInt(sdc) || 0;
    } catch (e) {}
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  function isErrorPage() {
    return document.body.innerText.includes("this page doesn't exist") ||
           document.body.innerText.includes("Hmm...this page doesn't exist");
  }

  async function getCurrentUsername(retries = 8) {
    for (let i = 0; i < retries; i++) {
      const el = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]') ||
                 document.querySelector('a[aria-label*="Profile"][href^="/"]');
      if (el) {
        const href = el.getAttribute('href') || '';
        if (href.startsWith('/')) return href.substring(1).split(/[/?#]/)[0];
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  function updateBatchCounter() {
    const el = document.getElementById('batchCounter');
    if (el) el.textContent = `${window.deletionCounter}/${window.batchSize}`;
    const tot = document.getElementById('totalCounterRight');
    if (tot) tot.textContent = `Total: ${window.totalDeleted}`;
  }

  function renderTimer() {
    const el = document.getElementById('pauseTimer');
    if (!el) return;
    if (window._countdownSeconds !== null && window._countdownSeconds > 0) {
      const m = Math.floor(window._countdownSeconds / 60);
      const s = window._countdownSeconds % 60;
      el.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    } else {
      // Not started — show configured time as a preview
      el.textContent = `${window.pauseMinutes}:00`;
    }
  }

  // ── Countdown — the ONLY interval ────────────────────────────────────────
  // Rules:
  //   • Started exactly once: when the first link of a batch is opened.
  //   • Counts down every second regardless of pause/resume state.
  //   • Cleared only by: reaching 0, or an explicit hard reset.
  //   • Stop/Start button NEVER touches this.

  function startCountdown() {
    if (_intervalHandle !== null) return; // already running — never double-start
    if (window._countdownSeconds === null || window._countdownSeconds <= 0) {
      window._countdownSeconds = Math.floor(window.pauseMinutes * 60);
    }
    renderTimer();
    _intervalHandle = setInterval(() => {
      window._countdownSeconds--;
      renderTimer();
      try { localStorage.setItem(PERSIST_KEYS.countdown, String(window._countdownSeconds)); } catch(e) {}
      if (window._countdownSeconds <= 0) {
        clearInterval(_intervalHandle);
        _intervalHandle = null;
        onCountdownDone();
      }
    }, 1000);
  }

  function stopCountdownHard() {
    // Only for resets — not for pause/resume
    if (_intervalHandle !== null) { clearInterval(_intervalHandle); _intervalHandle = null; }
    window._countdownSeconds = null;
    try { localStorage.removeItem(PERSIST_KEYS.countdown); } catch(e) {}
    renderTimer();
  }

  async function onCountdownDone() {
    window._countdownSeconds = null;
    window.deletionCounter = 0;
    window._lastCountedIndex = null;
    window._batchLimitReached = false;
    try { localStorage.removeItem(PERSIST_KEYS.countdown); } catch(e) {}
    localStorage.setItem(PERSIST_KEYS.deletionCounter, '0');
    updateBatchCounter();
    renderTimer();
    saveState();

    if (window.paused && !window.manuallyPaused) {
      // Was auto-paused — resume automatically
      window.paused = false;
      window.manuallyPaused = false;
      saveState();
      const btn = document.getElementById('toggleBtn');
      const st  = document.getElementById('status');
      if (btn) { btn.textContent = '⏸ Pause'; btn.style.background = '#22c55e'; }
      if (st)  st.textContent = 'Auto-pause finished — resuming...';
      if (location.href.includes('/status/')) {
        setTimeout(processPage, 400);
      } else {
        const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
        if (ok) setTimeout(processPage, 600);
      }
    } else {
      const st = document.getElementById('status');
      if (st) st.textContent = 'Timer done — batch reset. Press Start to continue.';
      const btn = document.getElementById('toggleBtn');
      if (btn) { btn.textContent = '▶ Start'; btn.style.background = '#ef4444'; }
    }
  }

  // Called on every link open — starts the countdown on the very first one
  function onLinkOpened() {
    if (_intervalHandle === null && window._countdownSeconds === null) {
      // First link of this batch — start the clock
      startCountdown();
    }
    // If interval already running, do nothing — it keeps going
  }

  // ── navigation ───────────────────────────────────────────────────────────

  async function navigateTo(url) {
    if (!url) return false;
    try {
      history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
      await new Promise(r => setTimeout(r, 800));
      if (location.pathname.includes('/status/')) return true;
    } catch (e) {}
    const a = document.createElement('a');
    a.href = url;
    a.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(a);
    try {
      a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      a.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, composed: true }));
      a.dispatchEvent(new MouseEvent('click',          { bubbles: true, composed: true }));
    } catch (e) { a.click(); }
    setTimeout(() => a.remove(), 200);
    await new Promise(r => setTimeout(r, 1300));
    return location.pathname.includes('/status/');
  }

  async function countCurrentAsOpenedIfNeeded() {
    try {
      if (!location.href.includes('/status/')) return false;
      if (window._lastCountedIndex === window.currentIndex) return false;

      if (window.deletionCounter >= window.batchSize) {
        await triggerAutoPause();
        return false;
      }

      window.deletionCounter++;
      window._lastCountedIndex = window.currentIndex;
      updateBatchCounter();
      onLinkOpened();
      saveState();
      return true;
    } catch (e) { return false; }
  }

  async function safeNavigateAndCount(url) {
    if (!url) return false;
    if (window.deletionCounter >= window.batchSize) {
      await triggerAutoPause();
      return false;
    }
    const ok = await navigateTo(url);
    if (!ok) return false;
    if (window._lastCountedIndex !== window.currentIndex) {
      window.deletionCounter++;
      window._lastCountedIndex = window.currentIndex;
      updateBatchCounter();
      onLinkOpened();
      if (window.deletionCounter >= window.batchSize) window._batchLimitReached = true;
    }
    saveState();
    return true;
  }

  // ── deletion flow ────────────────────────────────────────────────────────

  function getMyReplies() {
    if (!location.href.includes('/status/') || !window.currentUsername || isErrorPage()) return [];
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    if (!tweets.length) return [];
    const myHandle  = '@' + window.currentUsername;
    const myProfile = '/' + window.currentUsername;
    let mine = [];
    for (let t of tweets) {
      if (t.innerText.includes(myHandle) || t.querySelector(`a[href*="${myProfile}"]`)) mine.push(t);
    }
    if (mine.length) return [mine[mine.length - 1]];
    for (let i = tweets.length - 1; i >= 0; i--) {
      const t = tweets[i];
      if (t.querySelector('[data-testid="caret"]') && t.innerText.includes(window.currentUsername)) return [t];
    }
    return [];
  }

  async function deleteRepliesOnPage() {
    let deleted = 0;
    while (true) {
      if (window.paused || isErrorPage()) break;
      const replies = getMyReplies();
      if (!replies.length) break;
      const tweet = replies[0];
      const caret = tweet.querySelector('[data-testid="caret"]') || tweet.querySelector('button[aria-label*="More"]');
      if (!caret) break;
      caret.click();
      await new Promise(r => setTimeout(r, 520));
      let delBtn = null;
      for (let el of document.querySelectorAll('[role="menuitem"], [role="button"]')) {
        if ((el.innerText || '').toLowerCase().includes('delete')) { delBtn = el; break; }
      }
      if (!delBtn) break;
      delBtn.click();
      await new Promise(r => setTimeout(r, 620));
      const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
      if (confirmBtn) confirmBtn.click();
      await new Promise(r => setTimeout(r, 1100));
      window.totalDeleted++;
      deleted++;
      try { localStorage.setItem(PERSIST_KEYS.totalDeleted, String(window.totalDeleted)); } catch(e) {}
      updateBatchCounter();
    }
    if (window._batchLimitReached) await triggerAutoPause();
    saveState();
    return deleted;
  }

  async function triggerAutoPause() {
    if (window.paused) return;
    window.paused = true;
    window.manuallyPaused = false;
    saveState();
    const btn = document.getElementById('toggleBtn');
    const st  = document.getElementById('status');
    if (btn) { btn.textContent = `⏸ Auto-paused`; btn.style.background = '#f59e0b'; }
    if (st)  st.textContent = 'Rate limit protection: auto-paused. Timer counting down.';
    // Countdown is already running from when the first link opened — nothing to do here
  }

  async function processPage() {
    await countCurrentAsOpenedIfNeeded();
    if (!location.href.includes('/status/') || window.paused) return;
    if (isErrorPage()) { await advance(); return; }
    await deleteRepliesOnPage();
    await advance();
  }

  async function advance() {
    if (window.paused) return;
    let nextIndex = window.goBackwards ? window.currentIndex - 1 : window.currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= window.postList.length) {
      window.paused = true;
      saveState();
      const btn  = document.getElementById('toggleBtn');
      const prog = document.getElementById('progress');
      if (btn)  { btn.textContent = '▶ Start'; btn.style.background = '#ef4444'; }
      if (prog && window.postList.length) prog.textContent = `${window.currentIndex + 1}/${window.postList.length}`;
      const msg = !window.goBackwards
        ? `Reached the END of the list (${window.postList.length} posts).\n\nClick OK to wrap around...`
        : `Reached the BEGINNING of the list.\n\nClick OK to wrap around...`;
      if (confirm(msg)) {
        window.currentIndex = window.goBackwards ? window.postList.length - 1 : 0;
        window.paused = false;
        window.manuallyPaused = false;
        saveState();
        if (btn)  { btn.textContent = '⏸ Pause'; btn.style.background = '#22c55e'; }
        if (prog)   prog.textContent = `${window.currentIndex + 1}/${window.postList.length}`;
        const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
        if (ok) setTimeout(processPage, 600);
      }
      return;
    }
    window.currentIndex = nextIndex;
    const prog = document.getElementById('progress');
    if (prog) prog.textContent = `${window.currentIndex + 1}/${window.postList.length}`;
    saveState();
    await new Promise(r => setTimeout(r, (window.delaySeconds || 6) * 1000));
    if (!window.paused) {
      const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
      if (ok) setTimeout(processPage, 600);
    }
  }

  // ── reset helpers ────────────────────────────────────────────────────────

  function resetBatchCounterOnly() {
    window.deletionCounter = 0;
    window._lastCountedIndex = null;
    window._batchLimitReached = false;
    localStorage.setItem(PERSIST_KEYS.deletionCounter, '0');
    updateBatchCounter();
    saveState();
  }

  function resetTimerAndBatch() {
    // Hard reset: kills countdown, clears batch, ready for next link to start fresh
    stopCountdownHard();
    window.deletionCounter = 0;
    window._lastCountedIndex = null;
    window._batchLimitReached = false;
    localStorage.setItem(PERSIST_KEYS.deletionCounter, '0');
    updateBatchCounter();
    saveState();
  }

  function resetTotalCounter() {
    window.totalDeleted = 0;
    try { localStorage.setItem(PERSIST_KEYS.totalDeleted, '0'); } catch(e) {}
    updateBatchCounter();
    saveState();
  }

  // ── UI creation ──────────────────────────────────────────────────────────

  function createPanel() {
    if (document.getElementById('x-bulk-panel')) return;

    const p = document.createElement('div');
    p.id = 'x-bulk-panel';
    p.style.cssText = 'position:fixed;top:20px;right:20px;width:460px;background:#111827;color:white;padding:14px;border-radius:12px;z-index:2147483647;font-family:sans-serif;opacity:0.95;box-shadow:0 10px 30px rgba(0,0,0,0.6);box-sizing:border-box;';
    p.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <b>X Bulk Deleter</b> <span id="progress" style="color:#9ca3af;font-size:12px;"></span>
      </div>
      <div style="background:#1f2937;padding:10px;border-radius:8px;margin-bottom:8px;text-align:center;">
        <div id="status">Load first file to begin</div>
        <div style="margin:6px 0;font-size:12px;color:#9ca3af;">Current file: <span id="fileDisplay" style="color:#60a5fa;font-weight:bold;">—</span></div>
      </div>
      <button id="loadBtn" style="width:100%;padding:11px;margin-bottom:8px;background:#3b82f6;color:white;border:none;border-radius:8px;font-weight:600;">Load JSON File</button>
      <input type="file" id="fileInput" accept=".json" style="display:none;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <button id="startAtBtn" style="padding:6px 12px;background:#374151;color:white;border:none;border-radius:6px;font-size:12px;">Start at</button>
        <input id="startAtInput" type="number" value="1" style="width:80px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
      </div>
      <button id="toggleBtn" style="width:100%;padding:13px;background:#ef4444;color:black;border:none;border-radius:8px;font-weight:bold;margin-bottom:10px;cursor:pointer;box-sizing:border-box;">▶ Start</button>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Delay:</span>
        <input id="delayInput" type="number" step="0.5" min="1" value="6" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span style="font-size:12px;color:#9ca3af;">sec</span>
        <span id="totalCounterRight" style="margin-left:auto;font-size:13px;color:#60a5fa;font-weight:bold;">Total: 0</span>
        <button id="totalResetRight" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Batch size:</span>
        <input id="batchInput" type="number" min="1" value="150" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span style="font-size:12px;color:#9ca3af;">links opened</span>
        <span id="batchCounter" style="margin-left:auto;font-size:15px;color:#60a5fa;font-weight:bold;">0/150</span>
        <button id="batchReset" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Auto-pause for:</span>
        <input id="pauseMinInput" type="number" min="1" value="15" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span style="font-size:12px;color:#9ca3af;">minutes</span>
        <span id="pauseTimer" style="margin-left:auto;font-size:15px;color:#f59e0b;font-weight:bold;">15:00</span>
        <button id="timerReset" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
      </div>
      <button id="resetBtn" style="width:100%;padding:7px;background:#374151;color:#ccc;border:none;border-radius:6px;font-size:12px;margin-bottom:8px;">Reset Everything</button>
      <label style="font-size:12px;display:flex;align-items:center;gap:6px;color:#9ca3af;margin-bottom:3px;">
        <input type="checkbox" id="reverseCheck"> Go backwards
      </label>
      <label style="font-size:12px;display:flex;align-items:center;gap:6px;color:#9ca3af;">
        <input type="checkbox" id="rememberCheck"> Remember progress (persistent)
      </label>
      <button id="openStatusBtn" style="width:100%;padding:12px;margin-top:8px;background:#3b82f6;color:white;border:none;border-radius:8px;font-weight:600;">Open Status (tm)</button>
    `;
    document.body.appendChild(p);

    const $ = id => p.querySelector('#' + id);
    const fileInput    = $('fileInput');
    const toggleBtn    = $('toggleBtn');
    const delayInputEl = $('delayInput');
    const batchInput   = $('batchInput');
    const pauseMinInput= $('pauseMinInput');
    const reverseCheck = $('reverseCheck');
    const rememberCheck= $('rememberCheck');
    const statusEl     = $('status');
    const fileDisplayEl= $('fileDisplay');
    const progressEl   = $('progress');

    reverseCheck.checked  = window.goBackwards;
    rememberCheck.checked = window.rememberProgress;
    delayInputEl.value    = window.delaySeconds;
    batchInput.value      = window.batchSize;
    pauseMinInput.value   = window.pauseMinutes;

    function syncUI() {
      fileDisplayEl.textContent = window.currentFileName || '—';
      progressEl.textContent    = window.postList.length ? `${window.currentIndex + 1}/${window.postList.length}` : '';
      toggleBtn.textContent     = window.paused ? '▶ Start' : '⏸ Pause';
      toggleBtn.style.background= (!window.jsonLoaded || window.paused) ? '#ef4444' : '#22c55e';
      updateBatchCounter();
      renderTimer();
    }

    // ── file load ──
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text().catch(() => null);
      if (!text) return alert('Failed to read file');
      let raw;
      try { raw = JSON.parse(text); } catch { return alert('Invalid JSON'); }
      let rawList = Array.isArray(raw) ? raw : (raw.urls || raw.statuses || raw.data || Object.values(raw));
      const normalized = rawList.map(item => {
        if (typeof item === 'string') return item.trim();
        if (item?.url) return item.url.trim();
        if (item?.status_url) return item.status_url.trim();
        if (item?.id) return `https://x.com/i/status/${item.id}`;
        return null;
      }).filter(Boolean);
      if (!normalized.length) return alert('No valid URLs found');

      stopCountdownHard(); // wipe any previous batch timer
      window.postList        = normalized;
      window.currentFileName = file.name;
      window.currentIndex    = window.goBackwards ? window.postList.length - 1 : 0;
      window.jsonLoaded      = true;
      window.paused          = false;
      window.manuallyPaused  = false;
      window._lastCountedIndex  = null;
      window._batchLimitReached = false;
      window.deletionCounter    = 0;
      saveState();
      syncUI();
      statusEl.textContent = `Loaded ${window.postList.length} posts`;
      const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
      if (ok) setTimeout(processPage, 700);
    });
    $('loadBtn').addEventListener('click', () => fileInput.click());

    // ── start at ──
    $('startAtBtn').addEventListener('click', () => {
      if (!window.postList.length) return alert('Load a file first');
      const val = Math.max(1, parseInt($('startAtInput').value) || 1);
      window.currentIndex   = Math.min(val - 1, window.postList.length - 1);
      window.paused         = true;
      window.manuallyPaused = false;
      saveState(); syncUI();
      statusEl.textContent = `Jumped to #${val}`;
      navigateTo(window.postList[window.currentIndex]);
    });
    $('startAtInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('startAtBtn').click(); });

    delayInputEl.addEventListener('change', () => {
      window.delaySeconds = parseFloat(delayInputEl.value) || 6;
      localStorage.setItem(PERSIST_KEYS.delay, window.delaySeconds);
      saveState();
    });
    batchInput.addEventListener('change', () => {
      window.batchSize = parseInt(batchInput.value) || 150;
      localStorage.setItem(PERSIST_KEYS.batchSize, window.batchSize);
      updateBatchCounter(); saveState();
    });
    pauseMinInput.addEventListener('change', () => {
      window.pauseMinutes = parseInt(pauseMinInput.value) || 15;
      localStorage.setItem(PERSIST_KEYS.pauseMinutes, window.pauseMinutes);
      // Only update the preview display — never restart a running countdown
      if (_intervalHandle === null) renderTimer();
      saveState();
    });
    reverseCheck.addEventListener('change', e => {
      window.goBackwards = e.target.checked;
      localStorage.setItem(PERSIST_KEYS.reverse, window.goBackwards); saveState();
    });
    rememberCheck.addEventListener('change', e => {
      window.rememberProgress = e.target.checked;
      localStorage.setItem(PERSIST_KEYS.remember, window.rememberProgress ? 'true' : 'false');
      if (!window.rememberProgress) localStorage.removeItem(PERSIST_KEYS.persistent);
      else saveState();
    });

    $('resetBtn').addEventListener('click', () => {
      if (!confirm('Reset everything?')) return;
      stopCountdownHard();
      Object.values(PERSIST_KEYS).forEach(k => { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch(e){} });
      location.reload();
    });
    $('totalResetRight').addEventListener('click', () => {
      if (!confirm('Reset total deleted counter to 0?')) return;
      resetTotalCounter();
    });
    $('batchReset').addEventListener('click', () => {
      if (!confirm('Reset batch counter to 0?')) return;
      resetBatchCounterOnly();
      statusEl.textContent = 'Batch count reset (timer unchanged)';
    });
    $('timerReset').addEventListener('click', () => {
      if (!confirm('Reset timer and batch? Countdown will restart on next link opened.')) return;
      resetTimerAndBatch();
      statusEl.textContent = 'Timer reset — will start on next link opened';
      // Unpause so the user can resume — the timer is just cleared, not stuck
      window.paused = false;
      window.manuallyPaused = false;
      toggleBtn.textContent = '⏸ Pause';
      toggleBtn.style.background = '#22c55e';
      saveState();
    });

    // ── Toggle — NEVER touches _intervalHandle ────────────────────────────
    toggleBtn.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (!window.postList.length) return alert('Load a file first');

      if (window.paused) {
        // RESUME
        window.paused         = false;
        window.manuallyPaused = false;
        toggleBtn.textContent      = '⏸ Pause';
        toggleBtn.style.background = '#22c55e';
        saveState();
        if (location.href.includes('/status/')) {
          processPage();
        } else {
          safeNavigateAndCount(window.postList[window.currentIndex]).then(ok => {
            if (ok) setTimeout(processPage, 600);
          });
        }
      } else {
        // PAUSE — just flip the flag, countdown keeps running
        window.paused         = true;
        window.manuallyPaused = true;
        toggleBtn.textContent      = '▶ Start';
        toggleBtn.style.background = '#ef4444';
        statusEl.textContent = _intervalHandle !== null
          ? 'Paused — timer still counting down'
          : 'Paused';
        saveState();
      }
    });

    $('openStatusBtn').addEventListener('click', async () => {
      if (!window.postList.length) return alert('Load a file first');
      const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
      if (ok) setTimeout(processPage, 600);
    });

    setTimeout(syncUI, 300);
  }

  window.addEventListener('beforeunload', () => {
    try {
      if (window._countdownSeconds !== null && window._countdownSeconds > 0) {
        localStorage.setItem(PERSIST_KEYS.countdown, String(window._countdownSeconds));
      } else {
        localStorage.removeItem(PERSIST_KEYS.countdown);
      }
      localStorage.setItem(PERSIST_KEYS.deletionCounter, String(window.deletionCounter));
    } catch(e) {}
    saveState();
  });

  // ── init ─────────────────────────────────────────────────────────────────

  async function init() {
    loadState();
    window.currentUsername = await getCurrentUsername();
    createPanel();

    // If a countdown was actively running before the page navigated, resume it
    if (window._countdownSeconds !== null && window._countdownSeconds > 0) {
      startCountdown();
    } else {
      renderTimer(); // just show the preview
    }

    if (location.href.includes('/status/')) {
      setTimeout(() => countCurrentAsOpenedIfNeeded().catch(() => {}), 300);
    }
  }

  init();
})();
