// ==UserScript==
// @name         X Bulk Deleter 
// @match        https://x.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // --- state ---
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

  // batchSize counts "links opened" (navigations to posts)
  window.batchSize = 150;
  window.pauseMinutes = 15;

  // deletionCounter = links opened in current batch (resets when timer hits 00:00 or manual batch reset)
  window.deletionCounter = 0;

  // totalDeleted = actual confirmed deletions (persistent)
  window.totalDeleted = 0;

  // track last index that was counted as "link opened" to avoid double-counting
  window._lastCountedIndex = null;

  // flag set when a navigation caused the batch limit to be reached
  window._batchLimitReached = false;

  // timer/timeout handles and remaining seconds
  let _pauseIntervalHandle = null;
  let _autoResumeTimeoutHandle = null;
  window._pauseTimeRemainingSeconds = null;
  window._timerRunning = false;           // ← RUNTIME ONLY (never saved to storage)
  window._timerSetWaitingForLink = false;

  // --- persistence keys ---
  const PERSIST_KEYS = {
    state: 'bulkDeleter_state',
    persistent: 'bulkDeleter_persistent',
    totalDeleted: 'bulkDeleter_totalDeleted',
    delay: 'bulkDeleter_delay',
    reverse: 'bulkDeleter_reverse',
    remember: 'bulkDeleter_remember',
    batchSize: 'bulkDeleter_batchSize',
    pauseMinutes: 'bulkDeleter_pauseMinutes',
    pauseRemaining: 'bulkDeleter_pauseRemaining',
    timerSetWaiting: 'bulkDeleter_timerSetWaiting',
    deletionCounter: 'bulkDeleter_deletionCounter'
  };

  // --- persistence helpers ---
  function persistTimerRemaining() {
    try {
      if (typeof window._pauseTimeRemainingSeconds === 'number') {
        localStorage.setItem(PERSIST_KEYS.pauseRemaining, String(window._pauseTimeRemainingSeconds));
      } else {
        localStorage.removeItem(PERSIST_KEYS.pauseRemaining);
      }
      localStorage.setItem(PERSIST_KEYS.timerSetWaiting, window._timerSetWaitingForLink ? '1' : '0');
      localStorage.setItem(PERSIST_KEYS.deletionCounter, String(window.deletionCounter));
    } catch (e) {}
  }

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
        _pauseTimeRemainingSeconds: window._pauseTimeRemainingSeconds,
        _timerSetWaitingForLink: window._timerSetWaitingForLink
        // _timerRunning is deliberately omitted — it is runtime-only
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
          _lastCountedIndex: window._lastCountedIndex
        }));
      }
      localStorage.setItem(PERSIST_KEYS.totalDeleted, String(window.totalDeleted));
      persistTimerRemaining();
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
        if (typeof s._lastCountedIndex !== 'undefined') window._lastCountedIndex = s._lastCountedIndex;
        if (typeof s._batchLimitReached !== 'undefined') window._batchLimitReached = s._batchLimitReached;
        if (typeof s._pauseTimeRemainingSeconds !== 'undefined') window._pauseTimeRemainingSeconds = s._pauseTimeRemainingSeconds;
        if (typeof s._timerSetWaitingForLink !== 'undefined') window._timerSetWaitingForLink = s._timerSetWaitingForLink;
      }

      const savedDelay = localStorage.getItem(PERSIST_KEYS.delay);
      if (savedDelay) window.delaySeconds = parseFloat(savedDelay);

      const savedReverse = localStorage.getItem(PERSIST_KEYS.reverse);
      if (savedReverse !== null) window.goBackwards = savedReverse === 'true';

      const savedRemember = localStorage.getItem(PERSIST_KEYS.remember);
      if (savedRemember !== null) window.rememberProgress = savedRemember === 'true';

      const savedBatch = localStorage.getItem(PERSIST_KEYS.batchSize);
      if (savedBatch) window.batchSize = parseInt(savedBatch);

      const savedPause = localStorage.getItem(PERSIST_KEYS.pauseMinutes);
      if (savedPause) window.pauseMinutes = parseInt(savedPause);

      const savedTotal = localStorage.getItem(PERSIST_KEYS.totalDeleted);
      if (savedTotal !== null) window.totalDeleted = parseInt(savedTotal) || 0;

      const savedRemaining = localStorage.getItem(PERSIST_KEYS.pauseRemaining);
      if (savedRemaining !== null) {
        window._pauseTimeRemainingSeconds = parseInt(savedRemaining);
      }

      const savedTimerSet = localStorage.getItem(PERSIST_KEYS.timerSetWaiting);
      if (savedTimerSet !== null) window._timerSetWaitingForLink = savedTimerSet === '1';

      const savedDeletionCounter = localStorage.getItem(PERSIST_KEYS.deletionCounter);
      if (savedDeletionCounter !== null) {
        window.deletionCounter = parseInt(savedDeletionCounter) || 0;
      }

      if (window.deletionCounter >= window.batchSize && (window._pauseTimeRemainingSeconds == null) && !window._timerSetWaitingForLink) {
        window._pauseTimeRemainingSeconds = Math.max(1, Math.floor(window.pauseMinutes * 60));
        window._timerSetWaitingForLink = true;
        window.paused = true;
        window.manuallyPaused = false;
        try {
          localStorage.setItem(PERSIST_KEYS.pauseRemaining, String(window._pauseTimeRemainingSeconds));
          localStorage.setItem(PERSIST_KEYS.timerSetWaiting, '1');
        } catch (e) {}
      }
    } catch (e) {}
  }

  // --- helpers ---
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

  // --- UI updates ---
  function updateBatchCounter() {
    const el = document.getElementById('batchCounter');
    if (el) el.textContent = `${window.deletionCounter}/${window.batchSize}`;
    const totalRight = document.getElementById('totalCounterRight');
    if (totalRight) totalRight.textContent = `Total: ${window.totalDeleted}`;
  }

  function updatePauseTimerDisplayText(minutes, seconds) {
    const timerEl = document.getElementById('pauseTimer');
    if (!timerEl) return;
    if (typeof minutes === 'undefined') {
      timerEl.textContent = `${window.pauseMinutes}:00`;
    } else {
      timerEl.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
  }

  // --- timer and auto-resume helpers ---
  function _clearTimerHandles() {
    if (_pauseIntervalHandle) { clearInterval(_pauseIntervalHandle); _pauseIntervalHandle = null; }
    if (_autoResumeTimeoutHandle) { clearTimeout(_autoResumeTimeoutHandle); _autoResumeTimeoutHandle = null; }
    window._timerRunning = false;
  }

  function startVisiblePauseTimerIfNeeded() {
    if (window._timerRunning) return;
    if (typeof window._pauseTimeRemainingSeconds !== 'number' || window._pauseTimeRemainingSeconds <= 0) {
      window._pauseTimeRemainingSeconds = Math.max(1, Math.floor(window.pauseMinutes * 60));
    }

    persistTimerRemaining();

    window._timerRunning = true;
    updatePauseTimerDisplayText(Math.floor(window._pauseTimeRemainingSeconds / 60), window._pauseTimeRemainingSeconds % 60);

    _pauseIntervalHandle = setInterval(() => {
      window._pauseTimeRemainingSeconds--;
      if (window._pauseTimeRemainingSeconds <= 0) {
        clearInterval(_pauseIntervalHandle);
        _pauseIntervalHandle = null;
        window._timerRunning = false;
        persistTimerRemaining();
        onPauseTimerExpired();
        return;
      }
      updatePauseTimerDisplayText(Math.floor(window._pauseTimeRemainingSeconds / 60), window._pauseTimeRemainingSeconds % 60);
      try { localStorage.setItem(PERSIST_KEYS.pauseRemaining, String(window._pauseTimeRemainingSeconds)); } catch (e) {}
    }, 1000);
  }

  function scheduleAutoResumeUsingRemaining() {
    if (_autoResumeTimeoutHandle) { clearTimeout(_autoResumeTimeoutHandle); _autoResumeTimeoutHandle = null; }

    const seconds = (window._timerRunning && typeof window._pauseTimeRemainingSeconds === 'number')
      ? window._pauseTimeRemainingSeconds
      : Math.max(1, Math.floor(window.pauseMinutes * 60));

    if (!window._timerRunning) {
      window._pauseTimeRemainingSeconds = seconds;
      window._timerRunning = true;
      updatePauseTimerDisplayText(Math.floor(seconds / 60), seconds % 60);
      _pauseIntervalHandle = setInterval(() => {
        window._pauseTimeRemainingSeconds--;
        if (window._pauseTimeRemainingSeconds <= 0) {
          clearInterval(_pauseIntervalHandle);
          _pauseIntervalHandle = null;
          window._timerRunning = false;
          onPauseTimerExpired();
          return;
        }
        updatePauseTimerDisplayText(Math.floor(window._pauseTimeRemainingSeconds / 60), window._pauseTimeRemainingSeconds % 60);
        try { localStorage.setItem(PERSIST_KEYS.pauseRemaining, String(window._pauseTimeRemainingSeconds)); } catch (e) {}
      }, 1000);
    }

    _autoResumeTimeoutHandle = setTimeout(() => {
      _autoResumeTimeoutHandle = null;
      onPauseTimerExpired();
    }, seconds * 1000);

    persistTimerRemaining();
  }

  async function onPauseTimerExpired() {
    if (_pauseIntervalHandle) { clearInterval(_pauseIntervalHandle); _pauseIntervalHandle = null; }
    if (_autoResumeTimeoutHandle) { clearTimeout(_autoResumeTimeoutHandle); _autoResumeTimeoutHandle = null; }
    window._timerRunning = false;
    window._pauseTimeRemainingSeconds = 0;
    window._timerSetWaitingForLink = false;
    try { localStorage.removeItem(PERSIST_KEYS.pauseRemaining); } catch (e) {}
    try { localStorage.setItem(PERSIST_KEYS.timerSetWaiting, '0'); } catch (e) {}

    window.deletionCounter = 0;
    window._lastCountedIndex = null;
    window._batchLimitReached = false;
    updateBatchCounter();
    updatePauseTimerDisplayText(0, 0);
    saveState();

    if (window.paused && !window.manuallyPaused) {
      window.paused = false;
      window.manuallyPaused = false;
      saveState();

      const toggleBtn = document.getElementById('toggleBtn');
      const statusEl = document.getElementById('status');
      if (toggleBtn) { toggleBtn.textContent = '⏸ Pause'; toggleBtn.style.background = '#22c55e'; }
      if (statusEl) statusEl.textContent = `Auto-pause finished — resuming...`;

      if (location.href.includes('/status/')) {
        setTimeout(processPage, 400);
      } else {
        safeNavigateAndCount(window.postList[window.currentIndex]).then(ok => {
          if (ok) setTimeout(processPage, 600);
        });
      }
    } else {
      const statusEl = document.getElementById('status');
      if (statusEl) statusEl.textContent = `Paused (manual) — timer expired`;
    }
  }

  // --- navigation and counting ---
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
      a.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
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
      saveState();

      if (window._timerSetWaitingForLink) {
        startVisiblePauseTimerIfNeeded();
        scheduleAutoResumeUsingRemaining();
        window._timerSetWaitingForLink = false;
        try { localStorage.setItem(PERSIST_KEYS.timerSetWaiting, '0'); } catch (e) {}
      }

      if (window.deletionCounter === 1 && !window._timerRunning && !window._timerSetWaitingForLink) {
        startVisiblePauseTimerIfNeeded();
      }

      return true;
    } catch (e) {
      return false;
    }
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

      if (window._timerSetWaitingForLink) {
        startVisiblePauseTimerIfNeeded();
        scheduleAutoResumeUsingRemaining();
        window._timerSetWaitingForLink = false;
        try { localStorage.setItem(PERSIST_KEYS.timerSetWaiting, '0'); } catch (e) {}
      }

      if (window.deletionCounter === 1 && !window._timerRunning && !window._timerSetWaitingForLink) {
        startVisiblePauseTimerIfNeeded();
      }

      if (window.deletionCounter >= window.batchSize) {
        window._batchLimitReached = true;
      }
    }
    saveState();
    return true;
  }

  function getMyReplies() {
    if (!location.href.includes('/status/') || !window.currentUsername || isErrorPage()) return [];
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    if (!tweets.length) return [];
    const myHandle = '@' + window.currentUsername;
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

  // --- deletion flow ---
  async function deleteRepliesOnPage() {
    let deletedOnThisPage = 0;
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
      deletedOnThisPage++;
      try { localStorage.setItem(PERSIST_KEYS.totalDeleted, String(window.totalDeleted)); } catch (e) {}
      updateBatchCounter();
    }

    if (window._batchLimitReached) {
      await triggerAutoPause();
    }

    saveState();
    return deletedOnThisPage;
  }

  async function triggerAutoPause() {
    if (window.paused) return;

    window.paused = true;
    window.manuallyPaused = false;
    saveState();

    const toggleBtn = document.getElementById('toggleBtn');
    const statusEl = document.getElementById('status');
    if (toggleBtn) { toggleBtn.textContent = `⏸ Auto-paused (${window.pauseMinutes} min)`; toggleBtn.style.background = '#f59e0b'; }
    if (statusEl) statusEl.textContent = `Rate limit protection: Auto-paused`;

    scheduleAutoResumeUsingRemaining();
  }

  // --- main processing flow ---
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
      const toggleBtn = document.getElementById('toggleBtn');
      const progressEl = document.getElementById('progress');
      if (toggleBtn) { toggleBtn.textContent = '▶ Start'; toggleBtn.style.background = '#ef4444'; }
      if (progressEl && window.postList.length) progressEl.textContent = `${window.currentIndex + 1}/${window.postList.length}`;
      const atEnd = !window.goBackwards;
      const msg = atEnd
        ? `Reached the END of the list (${window.postList.length} posts).\n\nClick OK to wrap around...`
        : `Reached the BEGINNING of the list.\n\nClick OK to wrap around...`;
      if (confirm(msg)) {
        window.currentIndex = window.goBackwards ? window.postList.length - 1 : 0;
        window.paused = false;
        window.manuallyPaused = false;
        saveState();
        if (toggleBtn) { toggleBtn.textContent = '⏸ Pause'; toggleBtn.style.background = '#22c55e'; }
        if (progressEl) progressEl.textContent = `${window.currentIndex + 1}/${window.postList.length}`;
        const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
        if (ok) setTimeout(processPage, 600);
      }
      return;
    }

    window.currentIndex = nextIndex;
    const progressEl = document.getElementById('progress');
    if (progressEl) progressEl.textContent = `${window.currentIndex + 1}/${window.postList.length}`;
    saveState();

    await new Promise(r => setTimeout(r, (window.delaySeconds || 6) * 1000));

    if (!window.paused) {
      const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
      if (ok) setTimeout(processPage, 600);
    }
  }

  // --- manual reset helpers ---
  function resetBatchCounter() {
    window.deletionCounter = 0;
    window._lastCountedIndex = null;
    window._batchLimitReached = false;
    updateBatchCounter();
    saveState();
    persistTimerRemaining();
  }

  function resetPauseTimerAndSetWaiting() {
    if (_pauseIntervalHandle) { clearInterval(_pauseIntervalHandle); _pauseIntervalHandle = null; }
    if (_autoResumeTimeoutHandle) { clearTimeout(_autoResumeTimeoutHandle); _autoResumeTimeoutHandle = null; }

    window.deletionCounter = 0;
    window._lastCountedIndex = null;
    window._batchLimitReached = false;

    window._pauseTimeRemainingSeconds = Math.max(1, Math.floor(window.pauseMinutes * 60));
    window._timerRunning = false;
    window._timerSetWaitingForLink = true;

    persistTimerRemaining();

    window.paused = true;
    window.manuallyPaused = false;

    updateBatchCounter();
    updatePauseTimerDisplayText(Math.floor(window._pauseTimeRemainingSeconds / 60), window._pauseTimeRemainingSeconds % 60);
    saveState();
  }

  function resetTotalCounter() {
    window.totalDeleted = 0;
    try { localStorage.setItem(PERSIST_KEYS.totalDeleted, '0'); } catch (e) {}
    updateBatchCounter();
    saveState();
  }

  function resetPauseTimerOnly() {
    if (_autoResumeTimeoutHandle) { clearTimeout(_autoResumeTimeoutHandle); _autoResumeTimeoutHandle = null; }
    if (_pauseIntervalHandle) { clearInterval(_pauseIntervalHandle); _pauseIntervalHandle = null; }
    window._timerRunning = false;
    window._pauseTimeRemainingSeconds = null;
    window._timerSetWaitingForLink = false;
    try { localStorage.removeItem(PERSIST_KEYS.pauseRemaining); } catch (e) {}
    try { localStorage.setItem(PERSIST_KEYS.timerSetWaiting, '0'); } catch (e) {}
    updatePauseTimerDisplayText();
    saveState();
  }

  // --- UI creation ---
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
        <button id="totalResetRight" title="Reset total" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
      </div>

      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Batch size:</span>
        <input id="batchInput" type="number" min="1" value="150" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span id="batchLabel" style="font-size:12px;color:#9ca3af;">links opened</span>
        <span id="batchCounter" style="margin-left:auto;font-size:15px;color:#60a5fa;font-weight:bold;">0/150</span>
        <button id="batchReset" title="Reset batch counter" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
      </div>

      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Auto-pause for:</span>
        <input id="pauseMinInput" type="number" min="1" value="15" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span style="font-size:12px;color:#9ca3af;">minutes</span>
        <span id="pauseTimer" style="margin-left:auto;font-size:15px;color:#f59e0b;font-weight:bold;">15:00</span>
        <button id="pauseReset" title="Reset pause timer" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
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

    const fileInput = p.querySelector('#fileInput');
    const loadBtn = p.querySelector('#loadBtn');
    const startAtBtn = p.querySelector('#startAtBtn');
    const startAtInput = p.querySelector('#startAtInput');
    const toggleBtn = p.querySelector('#toggleBtn');
    const delayInputEl = p.querySelector('#delayInput');
    const reverseCheckEl = p.querySelector('#reverseCheck');
    const rememberCheckEl = p.querySelector('#rememberCheck');
    const resetBtn = p.querySelector('#resetBtn');
    const statusEl = p.querySelector('#status');
    const fileDisplayEl = p.querySelector('#fileDisplay');
    const progressEl = p.querySelector('#progress');
    const batchInput = p.querySelector('#batchInput');
    const pauseMinInput = p.querySelector('#pauseMinInput');
    const openStatusBtn = p.querySelector('#openStatusBtn');

    const totalResetRight = p.querySelector('#totalResetRight');
    const batchReset = p.querySelector('#batchReset');
    const pauseReset = p.querySelector('#pauseReset');

    reverseCheckEl.checked = window.goBackwards;
    rememberCheckEl.checked = window.rememberProgress;
    delayInputEl.value = window.delaySeconds;
    batchInput.value = window.batchSize;
    pauseMinInput.value = window.pauseMinutes;

    function localUpdateUI() {
      fileDisplayEl.textContent = window.currentFileName || '—';
      progressEl.textContent = window.postList.length ? `${window.currentIndex + 1}/${window.postList.length}` : '';
      toggleBtn.textContent = window.paused ? '▶ Start' : '⏸ Pause';
      toggleBtn.style.background = (!window.jsonLoaded || window.paused) ? '#ef4444' : '#22c55e';
      updateBatchCounter();
      updatePauseTimerDisplayText();
    }
    p._localUpdateUI = localUpdateUI;

    // file load
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

      window.postList = normalized;
      window.currentFileName = file.name;
      window.currentIndex = window.goBackwards ? window.postList.length - 1 : 0;
      window.jsonLoaded = true;
      window.paused = false;
      window.manuallyPaused = false;
      window._lastCountedIndex = null;
      window._batchLimitReached = false;
      saveState();
      localUpdateUI();
      statusEl.textContent = `Loaded ${window.postList.length} posts`;

      const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
      if (ok) {
        await countCurrentAsOpenedIfNeeded();
        setTimeout(processPage, 700);
      }
    });
    loadBtn.addEventListener('click', () => fileInput.click());

    // start at
    startAtBtn.addEventListener('click', () => {
      if (!window.postList.length) return alert('Load a file first');
      const val = Math.max(1, parseInt(startAtInput.value) || 1);
      const targetIndex = Math.min(val - 1, window.postList.length - 1);
      window.currentIndex = targetIndex;
      window.paused = true;
      window.manuallyPaused = false;
      saveState();
      localUpdateUI();
      statusEl.textContent = `Jumped to #${val}`;
      navigateTo(window.postList[window.currentIndex]);
    });
    startAtInput.addEventListener('keydown', e => { if (e.key === 'Enter') startAtBtn.click(); });

    delayInputEl.addEventListener('change', () => {
      window.delaySeconds = parseFloat(delayInputEl.value) || 6;
      localStorage.setItem(PERSIST_KEYS.delay, window.delaySeconds);
      saveState();
    });
    batchInput.addEventListener('change', () => {
      window.batchSize = parseInt(batchInput.value) || 150;
      localStorage.setItem(PERSIST_KEYS.batchSize, window.batchSize);
      updateBatchCounter();
      saveState();
    });

    pauseMinInput.addEventListener('change', () => {
      window.pauseMinutes = parseInt(pauseMinInput.value) || 15;
      localStorage.setItem(PERSIST_KEYS.pauseMinutes, window.pauseMinutes);
      updatePauseTimerDisplayText();
      saveState();
      if (window.paused && !window.manuallyPaused) {
        if (_pauseIntervalHandle) { clearInterval(_pauseIntervalHandle); _pauseIntervalHandle = null; }
        if (_autoResumeTimeoutHandle) { clearTimeout(_autoResumeTimeoutHandle); _autoResumeTimeoutHandle = null; }
        scheduleAutoResumeUsingRemaining();
      }
    });

    reverseCheckEl.addEventListener('change', e => {
      window.goBackwards = e.target.checked;
      localStorage.setItem(PERSIST_KEYS.reverse, window.goBackwards);
      saveState();
    });

    rememberCheckEl.addEventListener('change', e => {
      window.rememberProgress = e.target.checked;
      localStorage.setItem(PERSIST_KEYS.remember, window.rememberProgress ? 'true' : 'false');
      if (!window.rememberProgress) localStorage.removeItem(PERSIST_KEYS.persistent);
      else saveState();
    });

    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset everything?')) return;
      try {
        sessionStorage.removeItem(PERSIST_KEYS.state);
        localStorage.removeItem(PERSIST_KEYS.persistent);
        localStorage.removeItem(PERSIST_KEYS.totalDeleted);
        localStorage.removeItem(PERSIST_KEYS.delay);
        localStorage.removeItem(PERSIST_KEYS.reverse);
        localStorage.removeItem(PERSIST_KEYS.remember);
        localStorage.removeItem(PERSIST_KEYS.batchSize);
        localStorage.removeItem(PERSIST_KEYS.pauseMinutes);
        localStorage.removeItem(PERSIST_KEYS.pauseRemaining);
        localStorage.removeItem(PERSIST_KEYS.timerSetWaiting);
        localStorage.removeItem(PERSIST_KEYS.deletionCounter);
      } catch (e) {}
      location.reload();
    });

    totalResetRight.addEventListener('click', () => {
      if (!confirm('Reset total deleted counter to 0?')) return;
      resetTotalCounter();
    });
    batchReset.addEventListener('click', () => {
      if (!confirm('Reset batch (links opened) counter to 0?')) return;
      resetBatchCounter();
      const statusElLocal = document.getElementById('status');
      if (statusElLocal) statusElLocal.textContent = 'Batch count reset (timer unchanged)';
    });
    pauseReset.addEventListener('click', () => {
      if (!confirm('Reset timer to configured time and start waiting for next link?')) return;
      resetPauseTimerAndSetWaiting();
      const statusElLocal = document.getElementById('status');
      if (statusElLocal) statusElLocal.textContent = 'Timer set — will start when next link opens';
      const toggleBtnLocal = document.getElementById('toggleBtn');
      if (toggleBtnLocal) { toggleBtnLocal.textContent = `⏸ Auto-paused (${window.pauseMinutes} min)`; toggleBtnLocal.style.background = '#f59e0b'; }
    });

    toggleBtn.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();

      if (!window.postList.length) return alert('Load a file first');

      if (_autoResumeTimeoutHandle && window.paused && !window.manuallyPaused) {
        window.manuallyPaused = true;
        const statusElLocal = document.getElementById('status');
        toggleBtn.textContent = '▶ Start';
        toggleBtn.style.background = '#ef4444';
        if (statusElLocal) statusElLocal.textContent = 'Paused by user (manual) — timer preserved';
        updatePauseTimerDisplayText(Math.floor(window._pauseTimeRemainingSeconds / 60), window._pauseTimeRemainingSeconds % 60);
        saveState();
        return;
      }

      if (window.paused) {
        if (window.deletionCounter >= window.batchSize) {
          const timerExists = (window._timerRunning === true) || (window._timerSetWaitingForLink === true) || (typeof window._pauseTimeRemainingSeconds === 'number' && window._pauseTimeRemainingSeconds > 0);
          if (timerExists) {
            resetBatchCounter();
          } else {
            resetPauseTimerAndSetWaiting();
            const statusElLocal = document.getElementById('status');
            if (statusElLocal) statusElLocal.textContent = 'Batch was maxed — timer set and waiting for next link';
            const toggleBtnLocal = document.getElementById('toggleBtn');
            if (toggleBtnLocal) { toggleBtnLocal.textContent = `⏸ Auto-paused (${window.pauseMinutes} min)`; toggleBtnLocal.style.background = '#f59e0b'; }
            return;
          }
        }

        if (_autoResumeTimeoutHandle) { clearTimeout(_autoResumeTimeoutHandle); _autoResumeTimeoutHandle = null; }
        if (_pauseIntervalHandle) { clearInterval(_pauseIntervalHandle); _pauseIntervalHandle = null; }
        window.paused = false;
        window.manuallyPaused = false;
        toggleBtn.textContent = '⏸ Pause';
        toggleBtn.style.background = '#22c55e';
        saveState();
        if (location.href.includes('/status/')) {
          processPage();
        } else {
          safeNavigateAndCount(window.postList[window.currentIndex]).then(ok => {
            if (ok) setTimeout(processPage, 600);
          });
        }
        return;
      }

      if (_autoResumeTimeoutHandle || _pauseIntervalHandle) {
        window.paused = true;
        window.manuallyPaused = true;
        toggleBtn.textContent = '▶ Start';
        toggleBtn.style.background = '#ef4444';
        const statusElLocal2 = document.getElementById('status');
        if (statusElLocal2) statusElLocal2.textContent = 'Paused by user (manual) — timer preserved';
        saveState();
        return;
      }

      if (_autoResumeTimeoutHandle) { clearTimeout(_autoResumeTimeoutHandle); _autoResumeTimeoutHandle = null; }
      if (_pauseIntervalHandle) { clearInterval(_pauseIntervalHandle); _pauseIntervalHandle = null; }
      window.paused = true;
      window.manuallyPaused = true;
      toggleBtn.textContent = '▶ Start';
      toggleBtn.style.background = '#ef4444';
      const statusElLocal3 = document.getElementById('status');
      if (statusElLocal3) statusElLocal3.textContent = 'Paused by user (manual)';
      updatePauseTimerDisplayText();
      saveState();
    });

    openStatusBtn.addEventListener('click', async () => {
      if (!window.postList.length) return alert('Load a file first');
      const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
      if (ok) setTimeout(processPage, 600);
    });

    setTimeout(() => {
      updateBatchCounter();
      localUpdateUI();
    }, 300);
  }

  window.addEventListener('beforeunload', () => {
    try {
      if (typeof window._pauseTimeRemainingSeconds === 'number') {
        localStorage.setItem(PERSIST_KEYS.pauseRemaining, String(window._pauseTimeRemainingSeconds));
      }
      localStorage.setItem(PERSIST_KEYS.timerSetWaiting, window._timerSetWaitingForLink ? '1' : '0');
      localStorage.setItem(PERSIST_KEYS.deletionCounter, String(window.deletionCounter));
    } catch (e) {}
    saveState();
  });

  // --- init ---
  async function init() {
    loadState();

    // IMPORTANT: _timerRunning is runtime-only
    window._timerRunning = false;

    window.currentUsername = await getCurrentUsername();
    createPanel();

    // FIXED TIMER RESUME LOGIC — this is what fixes the "stuck timer" issue
    if (typeof window._pauseTimeRemainingSeconds === 'number' && window._pauseTimeRemainingSeconds > 0) {
      if (window._timerSetWaitingForLink) {
        // waiting for next link — just show the remaining time
        updatePauseTimerDisplayText(Math.floor(window._pauseTimeRemainingSeconds / 60), window._pauseTimeRemainingSeconds % 60);
      } else {
        // timer was actively running before reload → restart countdown + auto-resume
        startVisiblePauseTimerIfNeeded();
        scheduleAutoResumeUsingRemaining();
      }
    }

    if (location.href.includes('/status/')) {
      setTimeout(() => { countCurrentAsOpenedIfNeeded().catch(()=>{}); }, 300);
    }
  }

  init();
})();
