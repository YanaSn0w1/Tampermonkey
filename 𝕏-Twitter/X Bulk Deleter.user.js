// ==UserScript==
// @name         X Bulk Deleter (Draggable + Persistent Delay + Progress)
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
  window.delaySeconds = 6;
  window.goBackwards = false;
  window.currentFileName = '';
  window.currentUsername = '';
  window.rememberProgress = false;

  function saveState() {
    try {
      // Always save session state
      sessionStorage.setItem('bulkDeleter_state', JSON.stringify({
        postList: window.postList,
        currentIndex: window.currentIndex,
        currentFileName: window.currentFileName,
        delaySeconds: window.delaySeconds,
        goBackwards: window.goBackwards,
        rememberProgress: window.rememberProgress
      }));

      // Persistent save to localStorage when enabled
      if (window.rememberProgress) {
        localStorage.setItem('bulkDeleter_persistent', JSON.stringify({
          postList: window.postList,
          currentIndex: window.currentIndex,
          currentFileName: window.currentFileName,
          delaySeconds: window.delaySeconds,
          goBackwards: window.goBackwards
        }));
      }
    } catch (e) {}
  }

  function loadState() {
    try {
      // Load from localStorage first if remember is enabled
      const persistent = localStorage.getItem('bulkDeleter_persistent');
      if (persistent) {
        const d = JSON.parse(persistent);
        if (Array.isArray(d.postList) && d.postList.length > 0) {
          window.postList = d.postList;
          window.currentIndex = d.currentIndex || 0;
          window.currentFileName = d.currentFileName || '';
          window.jsonLoaded = true;
        }
        if (typeof d.delaySeconds === 'number') window.delaySeconds = d.delaySeconds;
        if (typeof d.goBackwards === 'boolean') window.goBackwards = d.goBackwards;
      }

      // Also load from sessionStorage (takes priority for current tab)
      const raw = sessionStorage.getItem('bulkDeleter_state');
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.postList) && s.postList.length > 0) {
          window.postList = s.postList;
          window.currentIndex = s.currentIndex || 0;
          window.currentFileName = s.currentFileName || '';
          window.jsonLoaded = true;
        }
        if (typeof s.delaySeconds === 'number') window.delaySeconds = s.delaySeconds;
        if (typeof s.goBackwards === 'boolean') window.goBackwards = s.goBackwards;
        if (typeof s.rememberProgress === 'boolean') window.rememberProgress = s.rememberProgress;
      }

      // Load individual settings from localStorage
      const savedDelay = localStorage.getItem('bulkDeleter_delay');
      if (savedDelay) window.delaySeconds = parseFloat(savedDelay);

      const savedReverse = localStorage.getItem('bulkDeleter_reverse');
      if (savedReverse !== null) window.goBackwards = savedReverse === 'true';

      const savedRemember = localStorage.getItem('bulkDeleter_remember');
      if (savedRemember !== null) window.rememberProgress = savedRemember === 'true';

    } catch (e) {}
  }

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

  function getMyReplies() {
    if (!location.href.includes('/status/') || !window.currentUsername || isErrorPage()) return [];

    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    if (!tweets.length) return [];

    const myHandle = '@' + window.currentUsername;
    const myProfile = '/' + window.currentUsername;
    let mine = [];

    for (let t of tweets) {
      if (t.innerText.includes(myHandle) || t.querySelector(`a[href*="${myProfile}"]`)) {
        mine.push(t);
      }
    }
    if (mine.length) return [mine[mine.length - 1]];

    for (let i = tweets.length - 1; i >= 0; i--) {
      const t = tweets[i];
      if (t.querySelector('[data-testid="caret"]') && t.innerText.includes(window.currentUsername)) {
        return [t];
      }
    }
    return [];
  }

  async function deleteRepliesOnPage() {
    while (true) {
      if (window.paused || isErrorPage()) break;

      const replies = getMyReplies();
      if (!replies.length) break;

      const tweet = replies[0];
      const caret = tweet.querySelector('[data-testid="caret"]') ||
                    tweet.querySelector('button[aria-label*="More"]');
      if (!caret) break;

      caret.click();
      await new Promise(r => setTimeout(r, 520));

      let delBtn = null;
      for (let el of document.querySelectorAll('[role="menuitem"], [role="button"]')) {
        if ((el.innerText || '').toLowerCase().includes('delete')) {
          delBtn = el;
          break;
        }
      }
      if (!delBtn) break;

      delBtn.click();
      await new Promise(r => setTimeout(r, 620));

      const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
      if (confirmBtn) confirmBtn.click();

      await new Promise(r => setTimeout(r, 1100));
    }
  }

  async function processPage() {
    if (!location.href.includes('/status/') || window.paused) return;
    if (isErrorPage()) { await advance(); return; }
    await deleteRepliesOnPage();
    await advance();
  }

  async function advance() {
    if (window.paused) return;

    let nextIndex = window.goBackwards
      ? window.currentIndex - 1
      : window.currentIndex + 1;

    if (nextIndex < 0 || nextIndex >= window.postList.length) {
      window.paused = true;
      saveState();

      const toggleBtn = document.getElementById('toggleBtn');
      const progressEl = document.getElementById('progress');
      if (toggleBtn) {
        toggleBtn.textContent = '▶ Start';
        toggleBtn.style.background = '#ef4444';
      }
      if (progressEl && window.postList.length) {
        progressEl.textContent = `${window.currentIndex + 1}/${window.postList.length}`;
      }

      const atEnd = !window.goBackwards;
      const msg = atEnd
        ? `Reached the END of the list (${window.postList.length} posts).\n\nClick OK to wrap around and continue from the beginning,\nor Cancel to keep it paused here.`
        : `Reached the BEGINNING of the list.\n\nClick OK to wrap around and continue from the end,\nor Cancel to keep it paused here.`;

      if (confirm(msg)) {
        if (window.goBackwards) {
          window.currentIndex = window.postList.length - 1;
        } else {
          window.currentIndex = 0;
        }
        window.paused = false;
        saveState();

        if (toggleBtn) {
          toggleBtn.textContent = '⏸ Pause';
          toggleBtn.style.background = '#22c55e';
        }
        if (progressEl) progressEl.textContent = `${window.currentIndex + 1}/${window.postList.length}`;

        await new Promise(r => setTimeout(r, 300));
        const ok = await navigateTo(window.postList[window.currentIndex]);
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
      const ok = await navigateTo(window.postList[window.currentIndex]);
      if (ok) setTimeout(processPage, 600);
    }
  }

  function createPanel() {
    if (document.getElementById('x-bulk-panel')) return;

    const p = document.createElement('div');
    p.id = 'x-bulk-panel';
    p.style.cssText = 'position:fixed;top:20px;right:20px;width:360px;background:#111827;color:white;padding:14px;border-radius:12px;z-index:2147483647;font-family:sans-serif;opacity:0.95;box-shadow:0 10px 30px rgba(0,0,0,0.6);';

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

      <button id="toggleBtn" style="width:100%;padding:13px;background:#ef4444;color:black;border:none;border-radius:8px;font-weight:bold;margin-bottom:10px;">▶ Start</button>

      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;">Delay:</span>
        <input id="delayInput" type="number" step="0.5" min="1" value="6" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
        <span style="font-size:12px;color:#9ca3af;">sec</span>
      </div>

      <button id="resetBtn" style="width:100%;padding:7px;background:#374151;color:#ccc;border:none;border-radius:6px;font-size:12px;margin-bottom:8px;">Reset Everything</button>

      <label style="font-size:12px;display:flex;align-items:center;gap:6px;color:#9ca3af;margin-bottom:3px;">
        <input type="checkbox" id="reverseCheck"> Go backwards
      </label>
      <label style="font-size:12px;display:flex;align-items:center;gap:6px;color:#9ca3af;">
        <input type="checkbox" id="rememberCheck"> Remember progress (persistent)
      </label>
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

    reverseCheckEl.checked = window.goBackwards;
    rememberCheckEl.checked = window.rememberProgress;
    delayInputEl.value = window.delaySeconds;

    function localUpdateUI() {
      fileDisplayEl.textContent = window.currentFileName || '—';
      progressEl.textContent = window.postList.length ? `${window.currentIndex + 1}/${window.postList.length}` : '';
      toggleBtn.textContent = window.paused ? '▶ Start' : '⏸ Pause';
      toggleBtn.style.background = (!window.jsonLoaded || window.paused) ? '#ef4444' : '#22c55e';
    }

    p._localUpdateUI = localUpdateUI;

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
      saveState();

      localUpdateUI();
      statusEl.textContent = `Loaded ${window.postList.length} posts`;

      setTimeout(async () => {
        const ok = await navigateTo(window.postList[window.currentIndex]);
        if (ok) setTimeout(processPage, 700);
      }, 600);
    });

    loadBtn.addEventListener('click', () => fileInput.click());

    startAtBtn.addEventListener('click', () => {
      if (!window.postList.length) return alert('Load a file first');
      const val = Math.max(1, parseInt(startAtInput.value) || 1);
      window.currentIndex = Math.min(val - 1, window.postList.length - 1);
      saveState();
      localUpdateUI();
      navigateTo(window.postList[window.currentIndex]).then(ok => { if (ok) setTimeout(processPage, 600); });
    });

    startAtInput.addEventListener('keydown', e => { if (e.key === 'Enter') startAtBtn.click(); });

    delayInputEl.addEventListener('change', () => {
      window.delaySeconds = parseFloat(delayInputEl.value) || 6;
      localStorage.setItem('bulkDeleter_delay', window.delaySeconds);
      saveState();
    });

    reverseCheckEl.addEventListener('change', e => {
      window.goBackwards = e.target.checked;
      localStorage.setItem('bulkDeleter_reverse', window.goBackwards);
      saveState();
    });

    rememberCheckEl.addEventListener('change', e => {
      window.rememberProgress = e.target.checked;
      localStorage.setItem('bulkDeleter_remember', window.rememberProgress ? 'true' : 'false');

      if (!window.rememberProgress) {
        localStorage.removeItem('bulkDeleter_persistent');
      } else {
        saveState(); // immediately save current progress
      }
    });

    resetBtn.addEventListener('click', () => {
      if (confirm('Reset everything?')) {
        localStorage.removeItem('bulkDeleter_persistent');
        localStorage.removeItem('bulkDeleter_delay');
        localStorage.removeItem('bulkDeleter_reverse');
        localStorage.removeItem('bulkDeleter_remember');
        location.reload();
      }
    });

    toggleBtn.addEventListener('click', () => {
      if (!window.postList.length) return alert('Load a file first');
      window.paused = !window.paused;
      saveState();
      toggleBtn.textContent = window.paused ? '▶ Start' : '⏸ Pause';
      toggleBtn.style.background = window.paused ? '#ef4444' : '#22c55e';

      if (!window.paused) {
        if (location.href.includes('/status/')) processPage();
        else navigateTo(window.postList[window.currentIndex]).then(ok => { if (ok) setTimeout(processPage, 600); });
      }
    });
  }

  function setupNavButton() {
    if (document.getElementById('tm-nav-tester-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'tm-nav-tester-btn';
    btn.style.cssText = 'position:fixed;top:120px;right:24px;z-index:2147483647;padding:10px 16px;background:#3b82f6;color:#042f3a;border-radius:8px;border:none;font-weight:700;';
    btn.textContent = 'Open Status (tm)';
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
      if (!window.postList.length) return;
      await navigateTo(window.postList[window.currentIndex]);
      setTimeout(processPage, 600);
    });
  }

  function makeDraggable(el, storageKey) {
    if (!el) return;

    el.style.touchAction = 'none';
    el.style.userSelect = 'none';

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const pos = JSON.parse(saved);
        if (pos.top) el.style.top = pos.top;
        if (pos.left) {
          el.style.left = pos.left;
          el.style.right = 'auto';
        }
      }
    } catch (e) {}

    let dragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;
    const DRAG_THRESHOLD = 6;

    function getClientPos(e) {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    function onDown(e) {
      const target = e.target;
      const interactive = target.closest('input, button, textarea, select, label, [role="button"]');
      if (interactive && interactive !== el) return;

      dragging = true;
      const rect = el.getBoundingClientRect();
      const pos = getClientPos(e);
      startX = pos.x;
      startY = pos.y;
      startLeft = rect.left;
      startTop = rect.top;

      el.style.position = 'fixed';
      el.style.right = 'auto';
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;

      const pos = getClientPos(e);
      const deltaX = pos.x - startX;
      const deltaY = pos.y - startY;

      if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
        el.style.left = Math.max(6, startLeft + deltaX) + 'px';
        el.style.top = Math.max(6, startTop + deltaY) + 'px';
      }
    }

    function onUp(e) {
      if (!dragging) return;
      dragging = false;

      try {
        localStorage.setItem(storageKey, JSON.stringify({
          top: el.style.top,
          left: el.style.left
        }));
      } catch (e) {}

      const pos = getClientPos(e);
      const wasDragged = Math.abs(pos.x - startX) > DRAG_THRESHOLD ||
                         Math.abs(pos.y - startY) > DRAG_THRESHOLD;

      if (wasDragged) {
        const suppress = (ev) => {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          document.removeEventListener('click', suppress, true);
        };
        document.addEventListener('click', suppress, true);
        setTimeout(() => document.removeEventListener('click', suppress, true), 500);
      }
    }

    el.addEventListener('pointerdown', onDown, { passive: false });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
  }

  async function init() {
    loadState();
    window.currentUsername = await getCurrentUsername();

    createPanel();
    setupNavButton();

    const panel = document.getElementById('x-bulk-panel');
    const navBtn = document.getElementById('tm-nav-tester-btn');

    if (panel) makeDraggable(panel, 'bulk_panel_pos');
    if (navBtn) makeDraggable(navBtn, 'bulk_nav_pos');

    setTimeout(() => {
      const p = document.getElementById('x-bulk-panel');
      if (p && p._localUpdateUI) p._localUpdateUI();
    }, 300);
  }

  init();
})();
