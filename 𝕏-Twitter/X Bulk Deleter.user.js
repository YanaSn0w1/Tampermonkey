// ==UserScript==
// @name         X Bulk Deleter
// @match        https://x.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const DEFAULTS = {
    delaySeconds: 6,
    batchSize: 150,
    searchBatchSize: 40,
    deletedLimit: 150,
    pauseMinutes: 15,
    retrySeconds: 60,
  };

  window.postList = window.postList || [];
  window.currentIndex = 0;
  window.jsonLoaded = false;
  window.paused = true;
  window.manuallyPaused = false;
  window.autoResume = false;
  window.delaySeconds = DEFAULTS.delaySeconds;
  window.goBackwards = false;
  window.searchMode = false;
  window.currentFileName = '';
  window.currentUsername = '';
  window.batchSize = DEFAULTS.batchSize;
  window.searchBatchSize = DEFAULTS.searchBatchSize;
  window.deletedLimit = DEFAULTS.deletedLimit;
  window.pauseMinutes = DEFAULTS.pauseMinutes;
  window.retrySeconds = DEFAULTS.retrySeconds;
  window.deletionCounter = 0;
  window.searchOpenCounter = 0;
  window.deletedThisBatch = 0;
  window.totalDeleted = 0;
  window._lastCountedIndex = null;
  window._countedSearchIndex = null;
  window._batchLimitReached = false;
  window._countdownSeconds = null;
  window._countdownEnd = null;
  window._retryEnd = null;
  window.searchQueue = [];
  window.searchQueueIndex = 0;
  window.runningQueue = false;
  window.currentTerm = '';
  window.deletedThisTerm = 0;
  window.runId = 0;

  let _intervalHandle = null;
  let _retryHandle = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const DEFAULT_TRIGGERS = [
    'link', 'bio', 'DM', 'chat', 'notif', 'RT', 'QT', 'quote', 'tag', 'IFB', 'LFG', 'post', 'support', 'help',
    'group', 'community', 'together', 'friend', 'meet', 'hook', 'invite', 'onlyfans', 'fanvue', 'fansly', 'free',
    'follow', 'active', 'connect', 'like', 'say', 'type', 'comment', 'drop', 'account', 'join',
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
    searchBatchSize: 'bulkDeleter_searchBatchSize',
    deletedLimit: 'bulkDeleter_deletedLimit',
    pauseMinutes: 'bulkDeleter_pauseMinutes',
    retry: 'bulkDeleter_retry',
    triggers: 'bulkDeleter_triggers_v3',
  };

  function alive(runId) {
    return !window.paused && runId === window.runId;
  }

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
        searchBatchSize: window.searchBatchSize,
        deletedLimit: window.deletedLimit,
        pauseMinutes: window.pauseMinutes,
        retrySeconds: window.retrySeconds,
        deletionCounter: window.deletionCounter,
        searchOpenCounter: window.searchOpenCounter,
        deletedThisBatch: window.deletedThisBatch,
        totalDeleted: window.totalDeleted,
        paused: window.paused,
        manuallyPaused: window.manuallyPaused,
        autoResume: window.autoResume,
        jsonLoaded: window.jsonLoaded,
        _lastCountedIndex: window._lastCountedIndex,
        _countedSearchIndex: window._countedSearchIndex,
        _batchLimitReached: window._batchLimitReached,
        _countdownSeconds: window._countdownSeconds,
        _countdownEnd: window._countdownEnd,
        _retryEnd: window._retryEnd,
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
      if (typeof window.deletedLimit !== 'number') window.deletedLimit = DEFAULTS.deletedLimit;
      if (typeof window.searchBatchSize !== 'number') window.searchBatchSize = DEFAULTS.searchBatchSize;
      if (typeof window.retrySeconds !== 'number') window.retrySeconds = DEFAULTS.retrySeconds;
      if (typeof window.searchOpenCounter !== 'number') window.searchOpenCounter = 0;
      if (typeof window.autoResume !== 'boolean') window.autoResume = false;
      if (!Array.isArray(window.searchQueue)) window.searchQueue = [];
      if (typeof window.searchQueueIndex !== 'number') window.searchQueueIndex = 0;
      window._countedSearchIndex = null;
      window.runId = window.runId || 0;
      const sv = localStorage.getItem(KEYS.delay); if (sv) window.delaySeconds = parseFloat(sv);
      const sr = localStorage.getItem(KEYS.reverse); if (sr !== null) window.goBackwards = sr === 'true';
      const sb = localStorage.getItem(KEYS.batchSize); if (sb) window.batchSize = parseInt(sb);
      const ss = localStorage.getItem(KEYS.searchBatchSize); if (ss) window.searchBatchSize = parseInt(ss);
      const sd = localStorage.getItem(KEYS.deletedLimit); if (sd) window.deletedLimit = parseInt(sd);
      const sp = localStorage.getItem(KEYS.pauseMinutes); if (sp) window.pauseMinutes = parseInt(sp);
      const se = localStorage.getItem(KEYS.retry); if (se) window.retrySeconds = parseInt(se);
      const st = localStorage.getItem(KEYS.totalDeleted); if (st !== null) window.totalDeleted = parseInt(st) || 0;
    } catch (e) {}
  }

  function loadTriggers() {
    let saved = [];
    try {
      const raw = localStorage.getItem(KEYS.triggers);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) saved = parsed.filter(t => t && String(t.term || '').trim());
      }
    } catch (e) {}
    const byTerm = new Map();
    saved.forEach(t => {
      const term = String(t.term).trim();
      if (!term) return;
      const key = term.toLowerCase();
      if (!byTerm.has(key)) byTerm.set(key, { term, selected: !!t.selected });
    });
    DEFAULT_TRIGGERS.forEach(term => {
      const key = term.toLowerCase();
      if (!byTerm.has(key)) byTerm.set(key, { term, selected: true });
    });
    const list = [...byTerm.values()];
    saveTriggers(list);
    return list;
  }
  function saveTriggers(list) { localStorage.setItem(KEYS.triggers, JSON.stringify(list)); }
  function getTriggerState() {
    return [...document.querySelectorAll('#searchMenu .trigger-row')].map(row => ({
      term: row.querySelector('.trigger-input').value.trim(),
      selected: row.querySelector('.trigger-check').checked,
    })).filter(t => t.term);
  }
  function selectedTerms() { return getTriggerState().filter(t => t.selected).map(t => t.term); }

  function setToggleStart() {
    const btn = document.getElementById('toggleBtn');
    if (!btn) return;
    btn.textContent = '▶ Start';
    btn.style.background = '#ef4444';
  }
  function setTogglePause() {
    const btn = document.getElementById('toggleBtn');
    if (!btn) return;
    btn.textContent = '⏸ Pause';
    btn.style.background = '#22c55e';
  }
  function setToggleManuallyPaused() {
    const btn = document.getElementById('toggleBtn');
    if (!btn) return;
    btn.textContent = '▶ Start (Manually paused)';
    btn.style.background = '#ef4444';
  }

  function setStatus(msg) {
    const el = document.getElementById('status');
    if (el) el.textContent = msg;
    const cur = document.getElementById('fileDisplay');
    if (cur) cur.textContent = window.searchMode ? (window.currentTerm || 'search') : (window.currentFileName || '—');
    const prog = document.getElementById('progress');
    if (prog) {
      let queue = window.searchQueue;
      if (!queue || !queue.length) {
        try { queue = selectedTerms(); } catch (e) { queue = []; }
      }
      if (queue && queue.length) {
        const idx = Math.min(Math.max(window.searchQueueIndex || 0, 0), queue.length - 1);
        prog.textContent = `Word ${idx + 1}/${queue.length}`;
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
    const searchEl = document.getElementById('searchBatchCounter');
    if (searchEl) searchEl.textContent = `${window.searchOpenCounter}/${window.searchBatchSize}`;
    const del = document.getElementById('deletedCounter');
    if (del) del.textContent = `${window.deletedThisBatch || 0}/${window.deletedLimit || 150}`;
    const tot = document.getElementById('totalCounterRight');
    if (tot) tot.textContent = `Total: ${window.totalDeleted}`;
  }

  function remainingSeconds() {
    if (window._countdownEnd) return Math.max(0, Math.ceil((window._countdownEnd - Date.now()) / 1000));
    if (window._countdownSeconds !== null && window._countdownSeconds > 0) return window._countdownSeconds;
    return 0;
  }
  function retryRemaining() {
    if (window._retryEnd) return Math.max(0, Math.ceil((window._retryEnd - Date.now()) / 1000));
    return 0;
  }
  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
  function renderTimer() {
    const el = document.getElementById('pauseTimer');
    if (el) el.textContent = remainingSeconds() > 0 ? fmtTime(remainingSeconds()) : `${window.pauseMinutes}:00`;
    const re = document.getElementById('retryTimer');
    if (re) re.textContent = retryRemaining() > 0 ? fmtTime(retryRemaining()) : `${window.retrySeconds}:00`;
  }

  function isSearchPage() { return location.pathname.startsWith('/search'); }
  function isEmptySearch() {
    return !!document.querySelector('[data-testid="emptyState"], [data-testid="empty_state_header_text"]');
  }
  function isErrorPage() {
    const t = document.body.innerText || '';
    return t.includes("this page doesn't exist") || t.includes("Hmm...this page doesn't exist");
  }
  function getRetryButton() {
    return [...document.querySelectorAll('button')].find(b => {
      const label = (b.innerText || '').replace(/\s+/g, ' ').trim();
      if (label !== 'Retry') return false;
      const r = b.getBoundingClientRect();
      return r.width > 8 && r.height > 8;
    }) || null;
  }
  function needsRetry() { return !!getRetryButton(); }

  function startRetryCountdown() {
    window._retryEnd = Date.now() + Math.floor(window.retrySeconds) * 1000;
    if (_retryHandle !== null) return;
    const update = () => {
      renderTimer();
      saveState();
      if (!window._retryEnd) {
        clearInterval(_retryHandle);
        _retryHandle = null;
        return;
      }
      if (retryRemaining() <= 0) {
        clearInterval(_retryHandle);
        _retryHandle = null;
      }
    };
    update();
    _retryHandle = setInterval(update, 250);
  }
  function clearRetryTimer() {
    if (_retryHandle !== null) { clearInterval(_retryHandle); _retryHandle = null; }
    window._retryEnd = null;
    renderTimer();
  }

  async function recoverRetryLoop(runId) {
    if (!needsRetry()) return true;
    const term = window.currentTerm || 'this page';
    while (alive(runId) && needsRetry()) {
      startRetryCountdown();
      setStatus(`Rate limited on "${term}" — Retry in ${fmtTime(retryRemaining())}`);
      while (alive(runId) && needsRetry() && retryRemaining() > 0) {
        setStatus(`Rate limited on "${term}" — Retry in ${fmtTime(retryRemaining())}`);
        await sleep(250);
      }
      if (!alive(runId)) { clearRetryTimer(); return false; }
      if (!needsRetry()) { clearRetryTimer(); return true; }
      const btn = getRetryButton();
      setStatus(`Rate limited on "${term}" — clicking Retry`);
      if (btn) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        try { btn.click(); } catch (e) {}
      }
      await sleep(3000);
    }
    clearRetryTimer();
    return alive(runId);
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

  async function inPageSearch(query, runId) {
    if (!alive(runId)) return false;
    setStatus(`Opening Latest: ${query}`);
    await spaGo(searchUrl(query));
    if (!alive(runId)) return false;
    if (!location.href.includes('f=live')) await clickLatestTab();
    if (!alive(runId)) return false;
    if (!isSearchPage()) await typeSearchBox(query);
    if (!alive(runId)) return false;
    if (!location.href.includes('f=live')) await clickLatestTab();
    await sleep(400);
    if (!alive(runId)) return false;
    if (needsRetry()) {
      const ok = await recoverRetryLoop(runId);
      if (!ok) return false;
    }
    return alive(runId);
  }

  function startWindowIfNeeded() {
    if (window._countdownEnd && window._countdownEnd > Date.now()) {
      tickTimer();
      return;
    }
    window._countdownEnd = Date.now() + Math.floor(window.pauseMinutes * 60) * 1000;
    window._countdownSeconds = Math.floor(window.pauseMinutes * 60);
    tickTimer();
    saveState();
  }
  function tickTimer() {
    if (_intervalHandle !== null) return;
    const update = () => {
      const left = remainingSeconds();
      window._countdownSeconds = left;
      renderTimer();
      saveState();
      if (left <= 0) {
        if (_intervalHandle !== null) { clearInterval(_intervalHandle); _intervalHandle = null; }
        window._countdownEnd = null;
        window._countdownSeconds = null;
        onCountdownDone();
      }
    };
    update();
    if (window._countdownEnd) _intervalHandle = setInterval(update, 250);
  }
  function clearTimer() {
    if (_intervalHandle !== null) { clearInterval(_intervalHandle); _intervalHandle = null; }
    window._countdownEnd = null;
    window._countdownSeconds = null;
    renderTimer();
    saveState();
  }
  function resetBatchCounters() {
    window.deletionCounter = 0;
    window.searchOpenCounter = 0;
    window.deletedThisBatch = 0;
    window._lastCountedIndex = null;
    window._countedSearchIndex = null;
    window._batchLimitReached = false;
    updateBatchCounter();
  }

  function syncInputs() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('delayInput', window.delaySeconds);
    set('batchInput', window.batchSize);
    set('searchBatchInput', window.searchBatchSize);
    set('deletedLimitInput', window.deletedLimit);
    set('pauseMinInput', window.pauseMinutes);
    set('retryInput', window.retrySeconds);
    updateBatchCounter();
    renderTimer();
  }

  async function resumeWork() {
    window.paused = false;
    window.manuallyPaused = false;
    window.autoResume = false;
    window.runId++;
    const runId = window.runId;
    setTogglePause();
    setStatus('Cooldown finished — auto-starting');
    saveState();
    if (window.searchMode) await runQueuedSearch(window.searchQueueIndex, runId);
    else if (location.pathname.includes('/status/')) setTimeout(() => processPage(runId), 400);
    else if (window.postList[window.currentIndex]) {
      const ok = await safeNavigateAndCount(window.postList[window.currentIndex], runId);
      if (ok && alive(runId)) setTimeout(() => processPage(runId), 600);
    }
  }

  async function onCountdownDone() {
    resetBatchCounters();
    renderTimer();
    const shouldAuto = window.autoResume && !window.manuallyPaused;
    window._batchLimitReached = false;
    if (shouldAuto) {
      await resumeWork();
      return;
    }
    window.autoResume = false;
    if (window.paused) {
      setToggleStart();
      setStatus(window.manuallyPaused ? 'Manually paused — will not auto-start' : 'Cooldown finished — press Start');
    }
    saveState();
  }

  function onActionCounted() {
    startWindowIfNeeded();
  }

  function normalPause(msg) {
    window.runId++;
    window.paused = true;
    window.manuallyPaused = true;
    window.autoResume = false;
    window.runningQueue = false;
    clearRetryTimer();
    setToggleStart();
    setStatus(msg || 'Paused');
    saveState();
  }

  function cancelAutoStart() {
    window.autoResume = false;
    window.manuallyPaused = true;
    window.paused = true;
    window.runningQueue = false;
    setToggleManuallyPaused();
    setStatus('Manually paused — will not auto-start');
    saveState();
  }

  async function triggerBatchWait(reason) {
    window.runId++;
    window.paused = true;
    window.runningQueue = false;
    window._batchLimitReached = true;
    if (window.manuallyPaused) {
      window.autoResume = false;
      setToggleStart();
      setStatus('Paused');
      saveState();
      return;
    }
    window.autoResume = true;
    window.manuallyPaused = false;
    startWindowIfNeeded();
    if (remainingSeconds() <= 0) {
      window._countdownEnd = null;
      await onCountdownDone();
      return;
    }
    setToggleStart();
    setStatus(reason || 'Batch limit — auto-starts when timer hits 0');
    saveState();
  }

  async function openStatusLink(url, onceKey, runId) {
    if (!url || !alive(runId)) return false;
    if (window.deletionCounter >= window.batchSize) {
      await triggerBatchWait('JSON link limit reached — auto-starts when timer hits 0');
      return false;
    }
    const path = url.replace(/^https?:\/\/(x|twitter)\.com/i, '');
    await spaGo(path.startsWith('/') ? path : '/' + path);
    if (!alive(runId)) return false;
    if (needsRetry()) {
      const ok = await recoverRetryLoop(runId);
      if (!ok) return false;
    }
    if (!location.pathname.includes('/status/')) return false;
    const shouldCount = onceKey === undefined || window._lastCountedIndex !== onceKey;
    if (shouldCount) {
      window.deletionCounter++;
      if (onceKey !== undefined) window._lastCountedIndex = onceKey;
      updateBatchCounter();
      onActionCounted();
      if (window.deletionCounter >= window.batchSize) window._batchLimitReached = true;
    }
    saveState();
    return true;
  }

  async function safeNavigateAndCount(url, runId) {
    return openStatusLink(url, window.currentIndex, runId);
  }

  async function countSearchOpen(index, runId) {
    if (!alive(runId)) return false;
    if (window.searchOpenCounter >= window.searchBatchSize) {
      await triggerBatchWait('Search limit reached — auto-starts when timer hits 0');
      return false;
    }
    if (window._countedSearchIndex === index) return true;
    window._countedSearchIndex = index;
    window.searchOpenCounter++;
    updateBatchCounter();
    onActionCounted();
    saveState();
    if (window.searchOpenCounter >= window.searchBatchSize) window._batchLimitReached = true;
    return true;
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

  async function deleteOneTweet(tweet, runId) {
    if (!alive(runId)) return false;
    const caret = tweet.querySelector('[data-testid="caret"]') || tweet.querySelector('button[aria-label*="More"]');
    if (!caret) return false;
    caret.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(400);
    if (!alive(runId)) return false;
    let delBtn = null;
    for (const el of document.querySelectorAll('[role="menuitem"], [role="button"]')) {
      if ((el.innerText || '').toLowerCase().includes('delete')) { delBtn = el; break; }
    }
    if (!delBtn) return false;
    delBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(450);
    if (!alive(runId)) return false;
    const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
    if (confirmBtn) confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(800);
    if (!alive(runId)) return false;
    window.deletedThisBatch = (window.deletedThisBatch || 0) + 1;
    window.totalDeleted++;
    localStorage.setItem(KEYS.totalDeleted, String(window.totalDeleted));
    updateBatchCounter();
    return true;
  }

  async function processPage(runId) {
    if (!alive(runId) || window.searchMode) return;
    if (!location.pathname.includes('/status/')) return;
    if (needsRetry()) {
      const ok = await recoverRetryLoop(runId);
      if (!ok) return;
    }
    if (isErrorPage()) { await advanceJson(runId); return; }
    const tweet = getJsonTarget();
    if (tweet) await deleteOneTweet(tweet, runId);
    if (!alive(runId)) return;
    if (window._batchLimitReached || window.deletionCounter >= window.batchSize) {
      await triggerBatchWait('JSON link limit reached — auto-starts when timer hits 0');
      return;
    }
    if ((window.deletedThisBatch || 0) >= (window.deletedLimit || 150)) {
      await triggerBatchWait('Deleted limit reached — auto-starts when timer hits 0');
      return;
    }
    await advanceJson(runId);
  }

  async function advanceJson(runId) {
    if (!alive(runId) || window.searchMode) return;
    const nxt = window.goBackwards ? window.currentIndex - 1 : window.currentIndex + 1;
    if (nxt < 0 || nxt >= window.postList.length) {
      window.paused = true;
      window.manuallyPaused = true;
      window.autoResume = false;
      window.runningQueue = false;
      setToggleStart();
      setStatus('Finished JSON list');
      saveState();
      return;
    }
    window.currentIndex = nxt;
    saveState();
    setStatus(`JSON ${window.currentIndex + 1}/${window.postList.length}`);
    await sleep((window.delaySeconds || 6) * 1000);
    if (!alive(runId)) return;
    const ok = await safeNavigateAndCount(window.postList[window.currentIndex], runId);
    if (ok && alive(runId)) setTimeout(() => processPage(runId), 400);
  }

  function finishQueue(msg) {
    window.paused = true;
    window.manuallyPaused = true;
    window.autoResume = false;
    window.runningQueue = false;
    setToggleStart();
    setStatus(msg);
    saveState();
  }

  async function nextSearchTerm(runId) {
    if (!alive(runId)) return;
    if (window.searchQueueIndex < window.searchQueue.length - 1) {
      window.searchQueueIndex++;
      window.deletedThisTerm = 0;
      saveState();
      await runQueuedSearch(window.searchQueueIndex, runId);
    } else finishQueue('Finished all selected words');
  }

  async function continueSearchDeletes(runId) {
    if (!alive(runId) || !window.searchMode) return;
    const term = window.searchQueue[window.searchQueueIndex];
    if (!term) return finishQueue('Finished all selected words');
    if (!window.currentUsername) window.currentUsername = await getCurrentUsername();
    if (!alive(runId)) return;
    const query = buildQuery(window.currentUsername, term);
    window.currentTerm = term;

    if (!isSearchPage()) {
      const ok = await inPageSearch(query, runId);
      if (!ok) return;
    }
    if (!alive(runId)) return;
    if (needsRetry()) {
      const ok = await recoverRetryLoop(runId);
      if (!ok) return;
    }
    if (isEmptySearch() || !getTopSearchTweet()) {
      setStatus(`EMPTY: ${term} — next word`);
      await nextSearchTerm(runId);
      return;
    }

    while (alive(runId)) {
      if (!isSearchPage()) {
        const ok = await inPageSearch(query, runId);
        if (!ok) return;
      }
      if (!alive(runId)) return;
      if (needsRetry()) {
        const ok = await recoverRetryLoop(runId);
        if (!ok) return;
        continue;
      }
      if (isEmptySearch() || !getTopSearchTweet()) {
        setStatus(`EMPTY: ${term} — next word`);
        await nextSearchTerm(runId);
        return;
      }
      if ((window.deletedThisBatch || 0) >= (window.deletedLimit || 150)) {
        await triggerBatchWait('Deleted limit reached — auto-starts when timer hits 0');
        return;
      }
      const tweet = getTopSearchTweet();
      setStatus(`DELETING "${term}" · this word ${window.deletedThisTerm + 1} · total ${window.totalDeleted}`);
      const ok = await deleteOneTweet(tweet, runId);
      if (!alive(runId)) return;
      if (!ok) {
        setStatus(`Could not delete "${term}" — next word`);
        await nextSearchTerm(runId);
        return;
      }
      window.deletedThisTerm++;
      saveState();
      if ((window.deletedThisBatch || 0) >= (window.deletedLimit || 150)) {
        await triggerBatchWait('Deleted limit reached — auto-starts when timer hits 0');
        return;
      }
      await sleep((window.delaySeconds || 6) * 1000);
    }
  }

  async function runQueuedSearch(index, runId) {
    if (!alive(runId)) return;
    const term = window.searchQueue[index];
    if (!term) return finishQueue('Queue finished');
    window.currentTerm = term;
    window.deletedThisTerm = 0;
    window.searchMode = true;
    if (!window.currentUsername) window.currentUsername = await getCurrentUsername();
    if (!alive(runId)) return;
    const query = buildQuery(window.currentUsername, term);
    setStatus(`SEARCH ${index + 1}/${window.searchQueue.length}: ${query}`);
    const counted = await countSearchOpen(index, runId);
    if (!counted || !alive(runId)) return;
    if (window._batchLimitReached && window.searchOpenCounter >= window.searchBatchSize) {
      await triggerBatchWait('Search limit reached — auto-starts when timer hits 0');
      return;
    }
    const opened = await inPageSearch(query, runId);
    if (!opened) return;
    await sleep(500);
    if (!alive(runId)) return;
    if (needsRetry()) {
      const ok = await recoverRetryLoop(runId);
      if (!ok) return;
    }
    if (isEmptySearch() || !getTopSearchTweet()) {
      setStatus(`EMPTY: ${term} — next word`);
      await nextSearchTerm(runId);
      return;
    }
    setTogglePause();
    saveState();
    await continueSearchDeletes(runId);
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
      row.querySelector('.trigger-check').addEventListener('change', () => {
        saveTriggers(getTriggerState());
        setStatus(document.getElementById('status')?.textContent || '');
      });
      row.querySelector('.trigger-input').addEventListener('change', () => saveTriggers(getTriggerState()));
      row.querySelector('.trigger-del').addEventListener('click', () => {
        const list = getTriggerState().filter((_, i) => i !== idx);
        saveTriggers(list);
        renderTriggerRows(menu, list);
        setStatus(document.getElementById('status')?.textContent || '');
      });
      menu.appendChild(row);
    });
  }

  function resetSettingsToDefaults() {
    window.delaySeconds = DEFAULTS.delaySeconds;
    window.batchSize = DEFAULTS.batchSize;
    window.searchBatchSize = DEFAULTS.searchBatchSize;
    window.deletedLimit = DEFAULTS.deletedLimit;
    window.pauseMinutes = DEFAULTS.pauseMinutes;
    window.retrySeconds = DEFAULTS.retrySeconds;
    window.goBackwards = false;
    localStorage.setItem(KEYS.delay, String(window.delaySeconds));
    localStorage.setItem(KEYS.batchSize, String(window.batchSize));
    localStorage.setItem(KEYS.searchBatchSize, String(window.searchBatchSize));
    localStorage.setItem(KEYS.deletedLimit, String(window.deletedLimit));
    localStorage.setItem(KEYS.pauseMinutes, String(window.pauseMinutes));
    localStorage.setItem(KEYS.retry, String(window.retrySeconds));
    localStorage.setItem(KEYS.reverse, 'false');
    const rev = document.getElementById('reverseCheck');
    if (rev) rev.checked = false;
    syncInputs();
  }

  function resetAllProgress() {
    window.runId++;
    clearTimer();
    clearRetryTimer();
    window.postList = [];
    window.currentIndex = 0;
    window.jsonLoaded = false;
    window.paused = true;
    window.manuallyPaused = false;
    window.autoResume = false;
    window.searchMode = false;
    window.currentFileName = '';
    window.deletionCounter = 0;
    window.searchOpenCounter = 0;
    window.deletedThisBatch = 0;
    window.totalDeleted = 0;
    window._lastCountedIndex = null;
    window._countedSearchIndex = null;
    window._batchLimitReached = false;
    window.searchQueue = [];
    window.searchQueueIndex = 0;
    window.runningQueue = false;
    window.currentTerm = '';
    window.deletedThisTerm = 0;
    resetSettingsToDefaults();
    try { sessionStorage.removeItem(KEYS.state); } catch (e) {}
    try { localStorage.setItem(KEYS.totalDeleted, '0'); } catch (e) {}
    saveState();
    setToggleStart();
    const startAt = document.getElementById('startAtInput');
    if (startAt) startAt.value = '1';
    setStatus('Reset — ready to start at word 1');
  }

  async function beginWork() {
    const checked = selectedTerms();
    saveTriggers(getTriggerState());
    window.runId++;
    const runId = window.runId;
    window.paused = false;
    window.manuallyPaused = false;
    window.autoResume = false;
    setTogglePause();

    if (checked.length) {
      const prevTerm = window.currentTerm;
      const finished =
        !window.runningQueue &&
        window.searchQueue.length > 0 &&
        window.searchQueueIndex >= window.searchQueue.length - 1;

      window.searchQueue = checked;

      if (finished || window.searchQueueIndex >= checked.length) {
        window.searchQueueIndex = 0;
        window.currentTerm = '';
        window.deletedThisTerm = 0;
        window._countedSearchIndex = null;
      } else if (prevTerm) {
        const idx = checked.findIndex(t => t === prevTerm);
        window.searchQueueIndex = idx >= 0 ? idx : window.searchQueueIndex;
      }

      window.runningQueue = true;
      window.searchMode = true;
      saveState();
      await runQueuedSearch(window.searchQueueIndex, runId);
      return;
    }
    if (!window.postList.length) {
      normalPause('Check search words or load JSON.');
      return alert('Check search words or load JSON.');
    }
    window.searchMode = false;
    setStatus(`JSON ${window.currentIndex + 1}/${window.postList.length}`);
    if (location.pathname.includes('/status/')) processPage(runId);
    else {
      const ok = await safeNavigateAndCount(window.postList[window.currentIndex], runId);
      if (ok && alive(runId)) setTimeout(() => processPage(runId), 400);
    }
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
        <span style="font-size:12px;">JSON links:</span>
        <input id="batchInput" type="number" min="1" value="150" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span id="batchCounter" style="margin-left:auto;font-size:15px;color:#60a5fa;font-weight:bold;">0/150</span>
        <button id="batchReset" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Search:</span>
        <input id="searchBatchInput" type="number" min="1" value="50" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span id="searchBatchCounter" style="margin-left:auto;font-size:15px;color:#a78bfa;font-weight:bold;">0/50</span>
        <button id="searchBatchReset" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
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
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Retry:</span>
        <input id="retryInput" type="number" min="1" value="60" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span style="font-size:12px;color:#9ca3af;">sec</span>
        <span id="retryTimer" style="margin-left:auto;font-size:15px;color:#f472b6;font-weight:bold;">1:00</span>
        <button id="retryReset" style="margin-left:8px;background:#374151;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:12px;cursor:pointer;">Reset</button>
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
      setStatus(document.getElementById('status')?.textContent || '');
    });
    $('selectAllBtn').addEventListener('click', () => {
      const list = getTriggerState().map(t => ({ ...t, selected: true }));
      saveTriggers(list); renderTriggerRows(menu, list);
      setStatus(document.getElementById('status')?.textContent || '');
    });
    $('selectNoneBtn').addEventListener('click', () => {
      const list = getTriggerState().map(t => ({ ...t, selected: false }));
      saveTriggers(list); renderTriggerRows(menu, list);
      setStatus(document.getElementById('status')?.textContent || '');
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

    syncInputs();
    $('reverseCheck').checked = window.goBackwards;

    $('delayInput').addEventListener('change', () => {
      window.delaySeconds = parseFloat($('delayInput').value) || DEFAULTS.delaySeconds;
      localStorage.setItem(KEYS.delay, window.delaySeconds);
    });
    $('batchInput').addEventListener('change', () => {
      window.batchSize = parseInt($('batchInput').value) || DEFAULTS.batchSize;
      localStorage.setItem(KEYS.batchSize, window.batchSize);
      updateBatchCounter();
    });
    $('searchBatchInput').addEventListener('change', () => {
      window.searchBatchSize = parseInt($('searchBatchInput').value) || DEFAULTS.searchBatchSize;
      localStorage.setItem(KEYS.searchBatchSize, window.searchBatchSize);
      updateBatchCounter();
    });
    $('deletedLimitInput').addEventListener('change', () => {
      window.deletedLimit = parseInt($('deletedLimitInput').value) || DEFAULTS.deletedLimit;
      localStorage.setItem(KEYS.deletedLimit, window.deletedLimit);
      updateBatchCounter();
    });
    $('pauseMinInput').addEventListener('change', () => {
      window.pauseMinutes = parseInt($('pauseMinInput').value) || DEFAULTS.pauseMinutes;
      localStorage.setItem(KEYS.pauseMinutes, window.pauseMinutes);
      if (!window._countdownEnd) renderTimer();
    });
    $('retryInput').addEventListener('change', () => {
      window.retrySeconds = parseInt($('retryInput').value) || DEFAULTS.retrySeconds;
      localStorage.setItem(KEYS.retry, window.retrySeconds);
      if (!window._retryEnd) renderTimer();
    });
    $('reverseCheck').addEventListener('change', e => {
      window.goBackwards = e.target.checked;
      localStorage.setItem(KEYS.reverse, window.goBackwards);
    });
    $('totalResetRight').addEventListener('click', () => {
      window.totalDeleted = 0;
      localStorage.setItem(KEYS.totalDeleted, '0');
      updateBatchCounter();
      saveState();
    });
    $('batchReset').addEventListener('click', () => {
      window.deletionCounter = 0;
      window._lastCountedIndex = null;
      updateBatchCounter();
      saveState();
    });
    $('searchBatchReset').addEventListener('click', () => {
      window.searchOpenCounter = 0;
      window._countedSearchIndex = null;
      updateBatchCounter();
      saveState();
    });
    $('deletedReset').addEventListener('click', () => {
      window.deletedThisBatch = 0;
      updateBatchCounter();
      saveState();
    });
    $('timerReset').addEventListener('click', () => clearTimer());
    $('retryReset').addEventListener('click', () => clearRetryTimer());
    $('resetBtn').addEventListener('click', () => {
      if (!confirm('Reset everything to defaults? Progress, timer, counts, and input boxes will reset. Word list is kept.')) return;
      resetAllProgress();
      try { sessionStorage.removeItem(KEYS.state); } catch (e) {}
      try { localStorage.setItem(KEYS.totalDeleted, '0'); } catch (e) {}
      location.reload();
    });

    $('toggleBtn').addEventListener('click', async () => {
      if (!window.paused) {
        normalPause('Paused');
        return;
      }
      if (window.autoResume && !window.manuallyPaused) {
        cancelAutoStart();
        return;
      }
      await beginWork();
    });
  }

  async function init() {
    loadState();
    window.currentUsername = await getCurrentUsername();
    createPanel();
    if (window._countdownEnd && window._countdownEnd > Date.now()) tickTimer();
    else if (window._countdownEnd && window._countdownEnd <= Date.now()) {
      window._countdownEnd = null;
      window._countdownSeconds = null;
      renderTimer();
    } else {
      renderTimer();
    }
    if (window.paused && window.autoResume && !window.manuallyPaused) setToggleStart();
    else if (window.paused && window.manuallyPaused && window.searchMode) setToggleStart();
    setStatus(window.searchMode
      ? (window.paused
          ? (window.autoResume && !window.manuallyPaused
              ? 'Batch limit — auto-starts when timer hits 0'
              : 'Paused')
          : `SEARCH ${window.searchQueueIndex + 1}/${window.searchQueue.length}: ${window.currentTerm || ''}`)
      : (window.postList.length ? `JSON ${window.currentIndex + 1}/${window.postList.length}` : 'Search words or load JSON'));
  }
  init();
})();
