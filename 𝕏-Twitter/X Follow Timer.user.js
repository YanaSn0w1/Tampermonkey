// ==UserScript==
// @name         𝕏 Follow Timer
// @namespace    http://tampermonkey.net/
// @version      1.0.4
// @author       YanaHeat
// @match        https://x.com/*
// @match        https://twitter.com/*
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window !== window.top) return;
  if (document.getElementById('ft-root')) return;
  if (/\/i\/report\//.test(location.pathname)) return;

  const COOLDOWN_MS = 15 * 60 * 1000;
  const STORAGE = {
    count: 'ft_count',
    start: 'ft_periodStart',
    total: 'ft_total',
    mini: 'ft_minimized',
    pos: 'ft_pos'
  };

  let followCount = 0;
  let periodStart = 0;
  let totalFollows = 0;
  let minimized = false;
  let remaining = 0;
  let timerInt = null;

  function readState() {
    followCount = parseInt(localStorage.getItem(STORAGE.count) || '0', 10);
    periodStart = parseInt(localStorage.getItem(STORAGE.start) || '0', 10);
    totalFollows = parseInt(localStorage.getItem(STORAGE.total) || '0', 10);
    minimized = localStorage.getItem(STORAGE.mini) === 'true';
  }

  function save() {
    localStorage.setItem(STORAGE.count, String(followCount));
    localStorage.setItem(STORAGE.total, String(totalFollows));
    localStorage.setItem(STORAGE.mini, String(minimized));
    if (periodStart) localStorage.setItem(STORAGE.start, String(periodStart));
    else localStorage.removeItem(STORAGE.start);
  }

  function savePos() {
    const rect = ui.getBoundingClientRect();
    localStorage.setItem(STORAGE.pos, JSON.stringify({ left: rect.left, top: rect.top }));
  }

  function clampPos(left, top) {
    const pad = 8;
    const w = ui.offsetWidth || 220;
    const h = ui.offsetHeight || 40;
    const maxL = Math.max(pad, window.innerWidth - w - pad);
    const maxT = Math.max(pad, window.innerHeight - h - pad);
    return {
      left: Math.min(Math.max(pad, left), maxL),
      top: Math.min(Math.max(pad, top), maxT)
    };
  }

  function applyPos(left, top) {
    const p = clampPos(left, top);
    ui.style.left = `${p.left}px`;
    ui.style.top = `${p.top}px`;
    ui.style.right = 'auto';
  }

  function defaultPos() {
    const w = ui.offsetWidth || 220;
    return {
      left: window.innerWidth - w - 56,
      top: 72
    };
  }

  function formatTime(sec) {
    sec = Math.max(0, sec);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function getRemaining() {
    if (!periodStart) return 0;
    return Math.max(0, Math.floor((periodStart + COOLDOWN_MS - Date.now()) / 1000));
  }

  function applyMinimized() {
    detailsEl.style.display = minimized ? 'none' : 'block';
    titleEl.style.display = minimized ? 'none' : 'block';
    resetEl.style.display = minimized ? 'none' : 'block';
    toggleEl.textContent = minimized ? '+' : '−';
    toggleEl.title = minimized ? 'Maximize' : 'Minimize';
    ui.style.minWidth = minimized ? '0' : '220px';
    ui.style.padding = minimized ? '6px 8px' : '12px 14px';
    timerEl.style.fontSize = minimized ? '16px' : '22px';
    timerEl.style.margin = minimized ? '0 22px 0 0' : '6px 0';
  }

  function updateUI() {
    remaining = getRemaining();
    countEl.textContent = String(followCount);
    totalEl.textContent = String(totalFollows);
    timerEl.textContent = formatTime(remaining);

    if (remaining > 0) {
      statusEl.textContent = 'Counting down';
      statusEl.style.color = '#4CAF50';
    } else if (followCount > 0) {
      statusEl.textContent = 'Idle — follow again to restart';
      statusEl.style.color = '#ff9800';
    } else {
      statusEl.textContent = 'Waiting for first follow';
      statusEl.style.color = '#999';
    }
  }

  function stopTimerLoop() {
    if (timerInt) {
      clearInterval(timerInt);
      timerInt = null;
    }
  }

  function startTimerLoop() {
    if (timerInt) return;
    updateUI();
    timerInt = setInterval(tick, 250);
  }

  function tick() {
    remaining = getRemaining();
    updateUI();
    if (periodStart && remaining <= 0) {
      stopTimerLoop();
      periodStart = 0;
      followCount = 0;
      save();
      updateUI();
    }
  }

  function syncFromStorage() {
    readState();
    applyMinimized();
    updateUI();
    if (getRemaining() > 0) startTimerLoop();
    else stopTimerLoop();
  }

  function recordFollow(user) {
    readState();
    totalFollows++;

    if (!periodStart || getRemaining() <= 0) {
      periodStart = Date.now();
      followCount = 1;
    } else {
      followCount++;
    }

    save();
    updateUI();
    startTimerLoop();
    console.log(`[Follow Timer] Followed ${user || '(unknown)'} — period ${followCount}, total ${totalFollows}`);
  }

  function isFollowButton(btn) {
    if (!btn || btn.tagName !== 'BUTTON') return false;
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    const testid = (btn.getAttribute('data-testid') || '').toLowerCase();

    if (label.includes('unfollow') || label.startsWith('following @') || testid.includes('unfollow')) {
      return false;
    }

    return (
      label.startsWith('follow @') ||
      label.includes('follow back @') ||
      testid === 'follow' ||
      /follow$/i.test(testid)
    );
  }

  function usernameFromButton(btn) {
    const label = btn.getAttribute('aria-label') || '';
    const m = label.match(/@([A-Za-z0-9_]+)/);
    return m ? m[1] : '';
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!isFollowButton(btn)) return;

    const user = usernameFromButton(btn);

    setTimeout(() => {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const testid = (btn.getAttribute('data-testid') || '').toLowerCase();
      const nowFollowing =
        label.startsWith('following @') ||
        label.includes('unfollow') ||
        testid.includes('unfollow') ||
        !document.body.contains(btn);

      if (nowFollowing) recordFollow(user);
    }, 700);
  }, true);

  const ui = document.createElement('div');
  ui.id = 'ft-root';
  ui.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'background:#111',
    'color:#fff',
    'padding:12px 14px',
    'border:2px solid #000',
    'border-radius:10px',
    'font-family:sans-serif',
    'font-size:13px',
    'min-width:220px',
    'box-shadow:0 4px 12px rgba(0,0,0,0.35)',
    'cursor:move',
    'user-select:none'
  ].join(';');

  ui.innerHTML = `
    <button id="ft-toggle" title="Minimize" style="
      position:absolute;top:4px;right:4px;width:22px;height:22px;
      border:none;border-radius:4px;background:#333;color:#fff;
      font-size:16px;line-height:20px;cursor:pointer;padding:0;
    ">−</button>
    <div id="ft-title" style="font-weight:bold;font-size:14px;margin-bottom:6px;padding-right:24px;">𝕏 Follow Timer</div>
    <div id="ft-timer" style="font-size:22px;font-weight:bold;margin:6px 0;">00:00</div>
    <div id="ft-details">
      <div>This period: <b id="ft-count">0</b></div>
      <div>Total tracked: <b id="ft-total">0</b></div>
      <div id="ft-status" style="font-size:12px;color:#999;margin-top:4px;">Waiting for first follow</div>
    </div>
    <button id="ft-reset" style="margin-top:8px;padding:6px 8px;width:100%;border:none;border-radius:6px;background:#2196F3;color:#fff;cursor:pointer;font-weight:bold;">Reset</button>
  `;
  document.documentElement.appendChild(ui);

  const titleEl = ui.querySelector('#ft-title');
  const detailsEl = ui.querySelector('#ft-details');
  const countEl = ui.querySelector('#ft-count');
  const totalEl = ui.querySelector('#ft-total');
  const timerEl = ui.querySelector('#ft-timer');
  const statusEl = ui.querySelector('#ft-status');
  const resetEl = ui.querySelector('#ft-reset');
  const toggleEl = ui.querySelector('#ft-toggle');

  toggleEl.onclick = (e) => {
    e.stopPropagation();
    minimized = !minimized;
    save();
    applyMinimized();
    savePos();
  };

  resetEl.onclick = (e) => {
    e.stopPropagation();
    followCount = 0;
    totalFollows = 0;
    periodStart = 0;
    stopTimerLoop();
    save();
    updateUI();
  };

  let dragging = false, dx = 0, dy = 0;
  ui.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    const rect = ui.getBoundingClientRect();
    dx = e.clientX - rect.left;
    dy = e.clientY - rect.top;
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    applyPos(e.clientX - dx, e.clientY - dy);
  });
  document.addEventListener('mouseup', () => {
    if (dragging) savePos();
    dragging = false;
  });
  window.addEventListener('resize', () => {
    const rect = ui.getBoundingClientRect();
    applyPos(rect.left, rect.top);
    savePos();
  });

  window.addEventListener('storage', (e) => {
    if (!e.key || !Object.values(STORAGE).includes(e.key)) return;
    if (e.key === STORAGE.pos) return;
    syncFromStorage();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncFromStorage();
  });
  window.addEventListener('focus', syncFromStorage);
  setInterval(syncFromStorage, 1000);

  readState();
  applyMinimized();

  let start = defaultPos();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.pos) || 'null');
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) start = saved;
  } catch (e) {}
  applyPos(start.left, start.top);

  if (getRemaining() > 0) startTimerLoop();
  else if (periodStart) {
    periodStart = 0;
    followCount = 0;
    save();
  }
  updateUI();
})();
