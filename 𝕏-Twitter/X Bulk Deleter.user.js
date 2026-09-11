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
  window.searchMode = false;
  window.currentFileName = '';
  window.currentUsername = '';
  window.batchSize = 150;
  window.deletedLimit = 150;
  window.pauseMinutes = 15;
  window.deletionCounter = 0;
  window.deletedThisBatch = 0;
  window.totalDeleted = 0;
  window._lastCountedIndex = null;
  window._countedSearchIndex = null;
  window._batchLimitReached = false;
  window._countdownSeconds = null;
  window.searchQueue = [];
  window.searchQueueIndex = 0;
  window.runningQueue = false;
  window.currentTerm = '';
  window.deletedThisTerm = 0;

  let _intervalHandle = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const DEFAULT_TRIGGERS = [
    'link', 'bio', 'DM', 'chat', 'notif', 'RT', 'QT', 'quote', 'tag', 'IFB', 'LFG', 
    'group', 'community', 'together', 'friend', 'meet', 'hook', 
    'follow', 'active', 'connect', 'like', 'say', 'type', 'comment', 'drop', 'account', 
    'gain', 'grow', 'viral', 'check', 'reply', 'report', 'engage', 'hack', 'organic', 
    'who wants', 'Can I get', 'first 10', 'chain', 'copy', 'giveaway', 'request', 'nerf', 
    'Only for genius', 'only 1%', "don't scroll", 'Prove me wrong', 'No word starts',
    'riddle', 'puzzle', 'GE?', 'GM?', 'GN?', 'hello?'
  ];

  const KEYS = {
    state: 'bulkDeleter_state',
    totalDeleted: 'bulkDeleter_totalDeleted',
    delay: 'bulkDeleter_delay',
    reverse: 'bulkDeleter_reverse',
    batchSize: 'bulkDeleter_batchSize',
    deletedLimit: 'bulkDeleter_deletedLimit',
    pauseMinutes: 'bulkDeleter_pauseMinutes',
    triggers: 'bulkDeleter_triggers_v3',
  };

  function saveState() {
    try {
      sessionStorage.setItem(KEYS.state, JSON.stringify({
        postList: window.postList,
        currentIndex: window.currentIndex,
        currentFileName: window.currentFileName,
        delaySeconds: window.delaySeconds,
        goBackwards: window.goBackwards,
        searchMode: window.searchMode,
        batchSize: window.batchSize,
        deletedLimit: window.deletedLimit,
        pauseMinutes: window.pauseMinutes,
        deletionCounter: window.deletionCounter,
        deletedThisBatch: window.deletedThisBatch,
        totalDeleted: window.totalDeleted,
        paused: window.paused,
        manuallyPaused: window.manuallyPaused,
        jsonLoaded: window.jsonLoaded,
        _lastCountedIndex: window._lastCountedIndex,
        _countedSearchIndex: window._countedSearchIndex,
        _batchLimitReached: window._batchLimitReached,
        _countdownSeconds: window._countdownSeconds,
        searchQueue: window.searchQueue,
        searchQueueIndex: window.searchQueueIndex,
        runningQueue: window.runningQueue,
        currentTerm: window.currentTerm,
        deletedThisTerm: window.deletedThisTerm,
      }));
      localStorage.setItem(KEYS.totalDeleted, String(window.totalDeleted));
    } catch (e) {}
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(KEYS.state);
      if (raw) Object.assign(window, JSON.parse(raw));
      if (typeof window.deletedThisBatch !== 'number') window.deletedThisBatch = 0;
      if (typeof window.deletedLimit !== 'number') window.deletedLimit = 150;
      window._countedSearchIndex = null;
      const sv = localStorage.getItem(KEYS.delay); if (sv) window.delaySeconds = parseFloat(sv);
      const sr = localStorage.getItem(KEYS.reverse); if (sr !== null) window.goBackwards = sr === 'true';
      const sb = localStorage.getItem(KEYS.batchSize); if (sb) window.batchSize = parseInt(sb);
      const sd = localStorage.getItem(KEYS.deletedLimit); if (sd) window.deletedLimit = parseInt(sd);
      const sp = localStorage.getItem(KEYS.pauseMinutes); if (sp) window.pauseMinutes = parseInt(sp);
      const st = localStorage.getItem(KEYS.totalDeleted); if (st !== null) window.totalDeleted = parseInt(st) || 0;
    } catch (e) {}
  }

  function loadTriggers() {
    try {
      const raw = localStorage.getItem(KEYS.triggers);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) {}
    return DEFAULT_TRIGGERS.map(term => ({ term, selected: true }));
  }
  function saveTriggers(list) { localStorage.setItem(KEYS.triggers, JSON.stringify(list)); }
  function getTriggerState() {
    return [...document.querySelectorAll('#searchMenu .trigger-row')].map(row => ({
      term: row.querySelector('.trigger-input').value.trim(),
      selected: row.querySelector('.trigger-check').checked,
    })).filter(t => t.term);
  }
  function selectedTerms() { return getTriggerState().filter(t => t.selected).map(t => t.term); }

  function setStatus(msg) {
    const el = document.getElementById('status');
    if (el) el.textContent = msg;
    const cur = document.getElementById('fileDisplay');
    if (cur) cur.textContent = window.searchMode ? (window.currentTerm || 'search') : (window.currentFileName || '—');
    const prog = document.getElementById('progress');
    if (prog) {
      if (window.searchMode && window.searchQueue.length) {
        prog.textContent = `Word ${window.searchQueueIndex + 1}/${window.searchQueue.length}`;
      } else if (window.postList.length) {
        prog.textContent = `Post ${window.currentIndex + 1}/${window.postList.length}`;
      } else {
        prog.textContent = '';
      }
    }
    console.log('[BulkDeleter]', msg);
  }

  function updateBatchCounter() {
    const el = document.getElementById('batchCounter');
    if (el) el.textContent = `${window.deletionCounter}/${window.batchSize}`;
    const del = document.getElementById('deletedCounter');
    if (del) del.textContent = `${window.deletedThisBatch || 0}/${window.deletedLimit || 150}`;
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
    } else el.textContent = `${window.pauseMinutes}:00`;
  }

  function isSearchPage() { return location.pathname.startsWith('/search'); }
  function isEmptySearch() {
    return !!document.querySelector('[data-testid="emptyState"], [data-testid="empty_state_header_text"]');
  }
  function isErrorPage() {
    const t = document.body.innerText || '';
    return t.includes("this page doesn't exist") || t.includes("Hmm...this page doesn't exist");
  }

  async function getCurrentUsername(retries = 8) {
    for (let i = 0; i < retries; i++) {
      const el = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
      if (el) {
        const href = el.getAttribute('href') || '';
        if (href.startsWith('/')) return href.substring(1).split(/[/?#]/)[0];
      }
      await sleep(300);
    }
    return window.currentUsername || null;
  }

  function extractStatusId(href) {
    const m = String(href || '').match(/\/status\/(\d+)/);
    return m ? m[1] : null;
  }
  function normalizeStatusUrl(href) {
    const id = extractStatusId(href);
    return id ? `https://x.com/i/status/${id}` : null;
  }
  function buildQuery(username, term) {
    const needsQuotes = /\s/.test(term) || /[?]/.test(term);
    return needsQuotes ? `from:${username} "${term}"` : `from:${username} ${term}`;
  }
  function searchUrl(query) {
    return `/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
  }

  function setReactInputValue(input, value) {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function spaGo(pathOrUrl) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : (location.origin + pathOrUrl);
    const path = url.replace(location.origin, '');
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await sleep(1100);
    return location.pathname + location.search === path || location.href.includes(path.split('?')[0]);
  }

  async function clickLatestTab() {
    for (const el of document.querySelectorAll('a[role="tab"], div[role="tab"], a, span')) {
      if ((el.textContent || '').trim() === 'Latest') {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(700);
        return true;
      }
    }
    return false;
  }

  async function typeSearchBox(query) {
    let input = document.querySelector('input[data-testid="SearchBox_Search_Input"]');
    if (!input) {
      const explore = document.querySelector('a[data-testid="AppTabBar_Explore_Link"]');
      if (explore) {
        explore.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(800);
        input = document.querySelector('input[data-testid="SearchBox_Search_Input"]');
      }
    }
    if (!input) return false;
    input.focus();
    setReactInputValue(input, query);
    await sleep(120);
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', opts));
    input.dispatchEvent(new KeyboardEvent('keyup', opts));
    const form = input.closest('form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await sleep(900);
    return true;
  }

  async function inPageSearch(query) {
    setStatus(`Opening Latest: ${query}`);
    await spaGo(searchUrl(query));
    if (!location.href.includes('f=live')) await clickLatestTab();
    if (!isSearchPage()) await typeSearchBox(query);
    if (!location.href.includes('f=live')) await clickLatestTab();
    await sleep(400);
  }

  function startCountdown() {
    if (_intervalHandle !== null) return;
    if (window._countdownSeconds === null || window._countdownSeconds <= 0) {
      window._countdownSeconds = Math.floor(window.pauseMinutes * 60);
    }
    renderTimer();
    _intervalHandle = setInterval(() => {
      window._countdownSeconds--;
      renderTimer();
      saveState();
      if (window._countdownSeconds <= 0) {
        clearInterval(_intervalHandle);
        _intervalHandle = null;
        onCountdownDone();
      }
    }, 1000);
  }
  function stopCountdownHard() {
    if (_intervalHandle !== null) { clearInterval(_intervalHandle); _intervalHandle = null; }
    window._countdownSeconds = null;
    renderTimer();
    saveState();
  }
  async function onCountdownDone() {
    window._countdownSeconds = null;
    window.deletionCounter = 0;
    window.deletedThisBatch = 0;
    window._lastCountedIndex = null;
    window._countedSearchIndex = null;
    window._batchLimitReached = false;
    updateBatchCounter();
    renderTimer();
    if (window.paused && !window.manuallyPaused) {
      window.paused = false;
      const btn = document.getElementById('toggleBtn');
      if (btn) { btn.textContent = '⏸ Pause'; btn.style.background = '#22c55e'; }
      setStatus('Auto-pause finished — resuming');
      if (window.searchMode) continueSearchDeletes();
      else if (location.pathname.includes('/status/')) setTimeout(processPage, 400);
      else {
        const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
        if (ok) setTimeout(processPage, 600);
      }
    }
  }
  function onLinkOpened() {
    if (_intervalHandle === null && window._countdownSeconds === null) startCountdown();
  }
  async function triggerAutoPause() {
    window.paused = true;
    window.manuallyPaused = false;
    const btn = document.getElementById('toggleBtn');
    if (btn) { btn.textContent = '⏸ Auto-paused'; btn.style.background = '#f59e0b'; }
    setStatus('Batch limit — waiting');
    startCountdown();
  }

  async function openStatusLink(url, onceKey) {
    if (!url) return false;
    if (window.deletionCounter >= window.batchSize) { await triggerAutoPause(); return false; }
    const path = url.replace(/^https?:\/\/(x|twitter)\.com/i, '');
    await spaGo(path.startsWith('/') ? path : '/' + path);
    if (!location.pathname.includes('/status/')) return false;
    const shouldCount = onceKey === undefined || window._lastCountedIndex !== onceKey;
    if (shouldCount) {
      window.deletionCounter++;
      if (onceKey !== undefined) window._lastCountedIndex = onceKey;
      updateBatchCounter();
      onLinkOpened();
      if (window.deletionCounter >= window.batchSize) window._batchLimitReached = true;
    }
    saveState();
    return true;
  }

  async function safeNavigateAndCount(url) {
    return openStatusLink(url, window.currentIndex);
  }

  function countSearchOpen(index) {
    if (window._countedSearchIndex === index) return;
    window._countedSearchIndex = index;
    window.deletionCounter++;
    updateBatchCounter();
    onLinkOpened();
    saveState();
  }

  function isMyTweet(tweet) {
    if (!tweet || !window.currentUsername) return false;
    const handle = '@' + window.currentUsername.toLowerCase();
    const profile = '/' + window.currentUsername;
    return (tweet.innerText || '').toLowerCase().includes(handle) ||
           !!tweet.querySelector(`a[href^="${profile}"]`);
  }
  function getTopSearchTweet() {
    return [...document.querySelectorAll('article[data-testid="tweet"]')].find(isMyTweet) || null;
  }
  function getJsonTarget() {
    if (!location.pathname.includes('/status/') || isErrorPage()) return null;
    const tweets = [...document.querySelectorAll('article[data-testid="tweet"]')];
    if (tweets[0] && isMyTweet(tweets[0])) return tweets[0];
    const mine = tweets.filter(isMyTweet);
    return mine.length ? mine[mine.length - 1] : null;
  }

  async function deleteOneTweet(tweet) {
    const caret = tweet.querySelector('[data-testid="caret"]') || tweet.querySelector('button[aria-label*="More"]');
    if (!caret) return false;
    caret.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(400);
    let delBtn = null;
    for (const el of document.querySelectorAll('[role="menuitem"], [role="button"]')) {
      if ((el.innerText || '').toLowerCase().includes('delete')) { delBtn = el; break; }
    }
    if (!delBtn) return false;
    delBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(450);
    const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
    if (confirmBtn) confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(800);
    window.deletedThisBatch = (window.deletedThisBatch || 0) + 1;
    window.totalDeleted++;
    localStorage.setItem(KEYS.totalDeleted, String(window.totalDeleted));
    updateBatchCounter();
    return true;
  }

  async function processPage() {
    if (window.searchMode || window.paused) return;
    if (!location.pathname.includes('/status/')) return;
    if (isErrorPage()) { await advanceJson(); return; }
    const tweet = getJsonTarget();
    if (tweet) await deleteOneTweet(tweet);
    if (window._batchLimitReached) await triggerAutoPause();
    await advanceJson();
  }

  async function advanceJson() {
    if (window.paused || window.searchMode) return;
    const nxt = window.goBackwards ? window.currentIndex - 1 : window.currentIndex + 1;
    if (nxt < 0 || nxt >= window.postList.length) {
      window.paused = true;
      const btn = document.getElementById('toggleBtn');
      if (btn) { btn.textContent = '▶ Start'; btn.style.background = '#ef4444'; }
      setStatus('Finished JSON list');
      saveState();
      return;
    }
    window.currentIndex = nxt;
    saveState();
    setStatus(`JSON ${window.currentIndex + 1}/${window.postList.length}`);
    await sleep((window.delaySeconds || 6) * 1000);
    if (!window.paused) {
      const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
      if (ok) setTimeout(processPage, 400);
    }
  }

  function finishQueue(msg) {
    window.paused = true;
    window.runningQueue = false;
    const btn = document.getElementById('toggleBtn');
    if (btn) { btn.textContent = '▶ Start'; btn.style.background = '#ef4444'; }
    setStatus(msg);
    saveState();
  }

  async function nextSearchTerm() {
    if (window.searchQueueIndex < window.searchQueue.length - 1) {
      window.searchQueueIndex++;
      window.deletedThisTerm = 0;
      saveState();
      await runQueuedSearch(window.searchQueueIndex);
    } else finishQueue('Finished all selected words');
  }

  async function continueSearchDeletes() {
    if (window.paused || !window.searchMode) return;
    const term = window.searchQueue[window.searchQueueIndex];
    if (!term) return finishQueue('Finished all selected words');
    if (!window.currentUsername) window.currentUsername = await getCurrentUsername();
    const query = buildQuery(window.currentUsername, term);
    window.currentTerm = term;

    if (!isSearchPage()) await inPageSearch(query);

    if (isEmptySearch() || !getTopSearchTweet()) {
      setStatus(`EMPTY: ${term} — next word`);
      await nextSearchTerm();
      return;
    }

    while (!window.paused) {
      if (!isSearchPage()) await inPageSearch(query);
      if (isEmptySearch() || !getTopSearchTweet()) {
        setStatus(`EMPTY: ${term} — next word`);
        await nextSearchTerm();
        return;
      }
      if ((window.deletedThisBatch || 0) >= (window.deletedLimit || 150)) {
        await triggerAutoPause();
        return;
      }
      const tweet = getTopSearchTweet();
      setStatus(`DELETING "${term}" · this word ${window.deletedThisTerm + 1} · total ${window.totalDeleted}`);
      const ok = await deleteOneTweet(tweet);
      if (!ok) {
        setStatus(`Could not delete "${term}" — next word`);
        await nextSearchTerm();
        return;
      }
      window.deletedThisTerm++;
      onLinkOpened();
      saveState();
      if ((window.deletedThisBatch || 0) >= (window.deletedLimit || 150)) {
        await triggerAutoPause();
        return;
      }
      await sleep((window.delaySeconds || 6) * 1000);
    }
  }

  async function runQueuedSearch(index) {
    const term = window.searchQueue[index];
    if (!term) return finishQueue('Queue finished');
    window.currentTerm = term;
    window.deletedThisTerm = 0;
    window.searchMode = true;
    if (!window.currentUsername) window.currentUsername = await getCurrentUsername();
    const query = buildQuery(window.currentUsername, term);
    setStatus(`SEARCH ${index + 1}/${window.searchQueue.length}: ${query}`);
    await inPageSearch(query);
    countSearchOpen(index);
    await sleep(500);
    if (isEmptySearch() || !getTopSearchTweet()) {
      setStatus(`EMPTY: ${term} — next word`);
      await nextSearchTerm();
      return;
    }
    window.paused = false;
    const btn = document.getElementById('toggleBtn');
    if (btn) { btn.textContent = '⏸ Pause'; btn.style.background = '#22c55e'; }
    saveState();
    await continueSearchDeletes();
  }

  function renderTriggerRows(menu, triggers) {
    menu.innerHTML = '';
    triggers.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'trigger-row';
      row.style.cssText = 'display:flex;gap:6px;align-items:center;margin:0 0 5px;';
      row.innerHTML = `
        <input class="trigger-check" type="checkbox" ${item.selected ? 'checked' : ''}>
        <input class="trigger-input" type="text" value="${String(item.term).replace(/"/g, '&quot;')}" style="flex:1;background:#1f2937;color:#fff;border:1px solid #4b5563;border-radius:6px;padding:6px 8px;font-size:13px;">
        <button class="trigger-del" style="background:#374151;color:#fff;border:none;border-radius:6px;padding:6px 8px;cursor:pointer;">x</button>
      `;
      row.querySelector('.trigger-check').addEventListener('change', () => saveTriggers(getTriggerState()));
      row.querySelector('.trigger-input').addEventListener('change', () => saveTriggers(getTriggerState()));
      row.querySelector('.trigger-del').addEventListener('click', () => {
        const list = getTriggerState().filter((_, i) => i !== idx);
        saveTriggers(list);
        renderTriggerRows(menu, list);
      });
      menu.appendChild(row);
    });
  }

  function createPanel() {
    const old = document.getElementById('x-bulk-panel');
    if (old) old.remove();
    const p = document.createElement('div');
    p.id = 'x-bulk-panel';
    p.style.cssText = 'position:fixed;top:20px;right:20px;width:460px;background:#111827;color:white;padding:14px;border-radius:12px;z-index:2147483647;font-family:sans-serif;opacity:0.96;box-shadow:0 10px 30px rgba(0,0,0,0.6);box-sizing:border-box;';
    p.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <b>X Bulk Deleter</b> <span id="progress" style="color:#9ca3af;font-size:12px;"></span>
      </div>
      <div style="background:#1f2937;padding:10px;border-radius:8px;margin-bottom:8px;text-align:center;">
        <div id="status">Search words or load JSON</div>
        <div style="margin:6px 0;font-size:12px;color:#9ca3af;">Current: <span id="fileDisplay" style="color:#60a5fa;font-weight:bold;">—</span></div>
      </div>
      <button id="searchWordsBtn" style="width:100%;padding:11px;margin-bottom:8px;background:#8b5cf6;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Search words</button>
      <div id="searchMenuWrap" style="display:none;margin-bottom:8px;">
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <input id="newTriggerInput" type="text" placeholder="Add trigger" style="flex:1;background:#1f2937;color:#fff;border:1px solid #4b5563;border-radius:6px;padding:6px 8px;">
          <button id="addTriggerBtn" style="background:#374151;color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;">Add</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <button id="selectAllBtn" style="flex:1;background:#374151;color:#fff;border:none;border-radius:6px;padding:6px;cursor:pointer;">Select all</button>
          <button id="selectNoneBtn" style="flex:1;background:#374151;color:#fff;border:none;border-radius:6px;padding:6px;cursor:pointer;">Select none</button>
        </div>
        <div id="searchMenu" style="max-height:240px;overflow-y:auto;background:#0b1220;border:1px solid #374151;border-radius:8px;padding:8px;"></div>
      </div>
      <button id="loadBtn" style="width:100%;padding:11px;margin-bottom:8px;background:#3b82f6;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Load JSON File</button>
      <input type="file" id="fileInput" accept=".json" style="display:none;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <button id="startAtBtn" style="padding:6px 12px;background:#374151;color:white;border:none;border-radius:6px;font-size:12px;">Start at</button>
        <input id="startAtInput" type="number" value="1" style="width:80px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
      </div>
      <button id="toggleBtn" style="width:100%;padding:13px;background:#ef4444;color:black;border:none;border-radius:8px;font-weight:bold;margin-bottom:10px;cursor:pointer;">▶ Start</button>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Delay:</span>
        <input id="delayInput" type="number" step="0.5" min="1" value="6" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span style="font-size:12px;color:#9ca3af;">sec</span>
        <span id="totalCounterRight" style="margin-left:auto;font-size:13px;color:#60a5fa;font-weight:bold;">Total: 0</span>
        <button id="totalResetRight" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Links:</span>
        <input id="batchInput" type="number" min="1" value="150" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span id="batchCounter" style="margin-left:auto;font-size:15px;color:#60a5fa;font-weight:bold;">0/150</span>
        <button id="batchReset" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Deleted:</span>
        <input id="deletedLimitInput" type="number" min="1" value="150" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span id="deletedCounter" style="margin-left:auto;font-size:15px;color:#34d399;font-weight:bold;">0/150</span>
        <button id="deletedReset" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Pause:</span>
        <input id="pauseMinInput" type="number" min="1" value="15" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span style="font-size:12px;color:#9ca3af;">min</span>
        <span id="pauseTimer" style="margin-left:auto;font-size:15px;color:#f59e0b;font-weight:bold;">15:00</span>
        <button id="timerReset" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
      </div>
      <button id="resetBtn" style="width:100%;padding:7px;background:#374151;color:#ccc;border:none;border-radius:6px;font-size:12px;margin-bottom:8px;">Reset Everything</button>
      <label style="font-size:12px;display:flex;align-items:center;gap:6px;color:#9ca3af;">
        <input type="checkbox" id="reverseCheck"> Go backwards (JSON mode only)
      </label>
    `;
    document.body.appendChild(p);
    const $ = id => p.querySelector('#' + id);
    const menu = $('searchMenu');
    renderTriggerRows(menu, loadTriggers());

    $('searchWordsBtn').addEventListener('click', () => {
      const wrap = $('searchMenuWrap');
      wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    });
    $('addTriggerBtn').addEventListener('click', () => {
      const val = $('newTriggerInput').value.trim();
      if (!val) return;
      const list = getTriggerState();
      list.push({ term: val, selected: true });
      saveTriggers(list); renderTriggerRows(menu, list);
      $('newTriggerInput').value = '';
    });
    $('selectAllBtn').addEventListener('click', () => {
      const list = getTriggerState().map(t => ({ ...t, selected: true }));
      saveTriggers(list); renderTriggerRows(menu, list);
    });
    $('selectNoneBtn').addEventListener('click', () => {
      const list = getTriggerState().map(t => ({ ...t, selected: false }));
      saveTriggers(list); renderTriggerRows(menu, list);
    });
    $('loadBtn').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      let raw; try { raw = JSON.parse(text); } catch { return alert('Invalid JSON'); }
      const rawList = Array.isArray(raw) ? raw : (raw.urls || raw.statuses || raw.data || Object.values(raw));
      const normalized = [...new Set(rawList.map(item => {
        if (typeof item === 'string') {
          if (/^\d+$/.test(item.trim())) return `https://x.com/i/status/${item.trim()}`;
          return normalizeStatusUrl(item);
        }
        if (item?.url) return normalizeStatusUrl(item.url);
        if (item?.id) return `https://x.com/i/status/${item.id}`;
        return null;
      }).filter(Boolean))];
      if (!normalized.length) return alert('No valid URLs');
      window.runningQueue = false;
      window.searchMode = false;
      window.postList = normalized;
      window.currentFileName = file.name;
      window.currentIndex = window.goBackwards ? normalized.length - 1 : 0;
      window.jsonLoaded = true;
      window.paused = true;
      saveState();
      setStatus(`Loaded ${normalized.length} posts. Press Start.`);
    });
    $('startAtBtn').addEventListener('click', () => {
      if (!window.postList.length) return alert('Load JSON first');
      const val = Math.max(1, parseInt($('startAtInput').value) || 1);
      window.currentIndex = Math.min(val - 1, window.postList.length - 1);
      window.searchMode = false;
      saveState();
      setStatus(`Jumped to JSON #${val}`);
    });

    $('delayInput').value = window.delaySeconds;
    $('batchInput').value = window.batchSize;
    $('deletedLimitInput').value = window.deletedLimit;
    $('pauseMinInput').value = window.pauseMinutes;
    $('reverseCheck').checked = window.goBackwards;
    updateBatchCounter();
    renderTimer();
    setStatus(document.getElementById('status') ? document.getElementById('status').textContent : 'Search words or load JSON');

    $('delayInput').addEventListener('change', () => {
      window.delaySeconds = parseFloat($('delayInput').value) || 6;
      localStorage.setItem(KEYS.delay, window.delaySeconds);
    });
    $('batchInput').addEventListener('change', () => {
      window.batchSize = parseInt($('batchInput').value) || 150;
      localStorage.setItem(KEYS.batchSize, window.batchSize);
      updateBatchCounter();
    });
    $('deletedLimitInput').addEventListener('change', () => {
      window.deletedLimit = parseInt($('deletedLimitInput').value) || 150;
      localStorage.setItem(KEYS.deletedLimit, window.deletedLimit);
      updateBatchCounter();
    });
    $('pauseMinInput').addEventListener('change', () => {
      window.pauseMinutes = parseInt($('pauseMinInput').value) || 15;
    });
    $('reverseCheck').addEventListener('change', e => {
      window.goBackwards = e.target.checked;
      localStorage.setItem(KEYS.reverse, window.goBackwards);
    });
    $('totalResetRight').addEventListener('click', () => {
      window.totalDeleted = 0;
      localStorage.setItem(KEYS.totalDeleted, '0');
      updateBatchCounter();
    });
    $('batchReset').addEventListener('click', () => {
      window.deletionCounter = 0;
      window._lastCountedIndex = null;
      window._countedSearchIndex = null;
      updateBatchCounter();
    });
    $('deletedReset').addEventListener('click', () => {
      window.deletedThisBatch = 0;
      updateBatchCounter();
    });
    $('timerReset').addEventListener('click', () => stopCountdownHard());
    $('resetBtn').addEventListener('click', () => {
      if (!confirm('Reset everything?')) return;
      Object.values(KEYS).forEach(k => { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch (e) {} });
      try { localStorage.removeItem('bulkDeleter_triggers'); } catch (e) {}
      try { localStorage.removeItem('bulkDeleter_triggers_v2'); } catch (e) {}
      location.reload();
    });

    $('toggleBtn').addEventListener('click', async () => {
      if (window.paused) {
        const checked = selectedTerms();
        saveTriggers(getTriggerState());
        window.paused = false;
        window.manuallyPaused = false;
        $('toggleBtn').textContent = '⏸ Pause';
        $('toggleBtn').style.background = '#22c55e';
        if (checked.length) {
          const same = window.searchMode && window.searchQueue.length &&
            window.searchQueue.join('\0') === checked.join('\0');
          if (!same) {
            window.searchQueue = checked;
            window.searchQueueIndex = 0;
            window._countedSearchIndex = null;
          }
          window.runningQueue = true;
          window.searchMode = true;
          saveState();
          await runQueuedSearch(window.searchQueueIndex);
          return;
        }
        if (!window.postList.length) {
          window.paused = true;
          $('toggleBtn').textContent = '▶ Start';
          $('toggleBtn').style.background = '#ef4444';
          return alert('Check search words or load JSON.');
        }
        window.searchMode = false;
        setStatus(`JSON ${window.currentIndex + 1}/${window.postList.length}`);
        if (location.pathname.includes('/status/')) processPage();
        else {
          const ok = await safeNavigateAndCount(window.postList[window.currentIndex]);
          if (ok) setTimeout(processPage, 400);
        }
      } else {
        window.paused = true;
        window.manuallyPaused = true;
        $('toggleBtn').textContent = '▶ Start';
        $('toggleBtn').style.background = '#ef4444';
        setStatus('Paused');
        saveState();
      }
    });
  }

  async function init() {
    loadState();
    window.currentUsername = await getCurrentUsername();
    createPanel();
    renderTimer();
    if (window._countdownSeconds !== null && window._countdownSeconds > 0) startCountdown();
    setStatus(window.searchMode
      ? (window.paused ? 'Paused' : `SEARCH ${window.searchQueueIndex + 1}/${window.searchQueue.length}: ${window.currentTerm || ''}`)
      : (window.postList.length ? `JSON ${window.currentIndex + 1}/${window.postList.length}` : 'Search words or load JSON'));
  }
  init();
})();
