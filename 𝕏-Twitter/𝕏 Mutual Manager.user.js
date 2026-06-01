// ==UserScript==
// @name         𝕏 Mutual Manager
// @namespace    http://tampermonkey.net/
// @version      1.1.2
// @author       YanaHeat
// @match        https://x.com/*follow*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  let SKIP_DEFAULT_PIC = localStorage.getItem('um_skip_default_pic') !== 'false';
  let SKIP_NO_BIO = localStorage.getItem('um_skip_no_bio') !== 'false';
  let SKIP_KEY_WORDS = localStorage.getItem('um_skip_key_words') !== 'false';

  let KEY_WORDS = JSON.parse(localStorage.getItem('um_key_words')) || ['elon', 'musk', 'private', 'chat', 'dm'].map(w => w.toLowerCase());
  let WHITELIST = JSON.parse(localStorage.getItem('um_whitelist')) || ['YanaHeat', 'YanaSn0w1'];

  let scPauseCount = parseInt(localStorage.getItem('um_sc_pause_count')) || 200;
  let scPauseSeconds = parseInt(localStorage.getItem('um_sc_pause_seconds')) || 30;
  const fbMaxPerPeriod = 14;
  let fbCooldownMinutes = parseFloat(localStorage.getItem('um_fb_cooldown_minutes')) || 15;

  const MIN_DELAY = 200;
  const MAX_DELAY = 600;
  const BATCH_SIZE = 7;
  const SCROLL_POSITION = 107;
  const STUCK_THRESHOLD = 60;

  let UF_MAX_PER_PERIOD = 150;
  let ACTION_CD = fbCooldownMinutes * 60 * 1000;
  const SC_MAX_UNFOLLOW = 60000;

  const FB_SCAN_MIN = 50;
  const SC_INIT = 100;
  const SC_POST = 50;
  let fbScanMax = parseInt(localStorage.getItem('um_fb_scan_max')) || SC_INIT;

  const path = window.location.pathname;
  const parts = path.split('/').filter(p => p);
  if (parts.length < 2) return;
  const username = parts[0];
  const pageType = parts[1];

  const isFollowingPage = pageType === 'following';
  const isFollowersPage = pageType === 'followers' || pageType === 'verified_followers';
  if (!isFollowingPage && !isFollowersPage) return;

  const mode = isFollowingPage ? 'unfollow' : 'followback';
  const isVerified = pageType === 'verified_followers';

  const verifiedUrl = `https://x.com/${username}/verified_followers`;
  const followingUrl = `https://x.com/${username}/following`;
  const normalUrl = `https://x.com/${username}/followers`;

  function getFollowUnv() {
    const v = localStorage.getItem('um_fb_followUnv');
    return v === null ? true : v === 'true';
  }

  if (mode === 'followback' && !isVerified && !getFollowUnv()) {
    window.location.href = verifiedUrl;
  }

  function getCells() {
    return Array.from(document.querySelectorAll('button[data-testid="UserCell"]'));
  }

  function getUsername(cell) {
    const link = cell.querySelector('a[href^="/"][role="link"]');
    return link ? link.getAttribute('href').slice(1).split('/')[0] : '';
  }

  function extractTextWithEmojis(el) {
    if (!el) return '';
    return Array.from(el.querySelectorAll('span, img'))
      .map(node => node.tagName === 'IMG' ? node.alt : node.textContent.trim())
      .filter(t => t)
      .join(' ');
  }

  function getBotInfo(cell) {
    const img = cell.querySelector('img');
    const hasDefaultPic = img && img.src.includes('default_profile_normal.png');
    const nameDiv = cell.querySelector('div[class*="r-b88u0q"]');
    const name = extractTextWithEmojis(nameDiv);
    const bioDiv = cell.querySelector('div[dir="auto"][class*="r-1h8ys4a"]');
    const bio = extractTextWithEmojis(bioDiv);
    const noBio = bio.trim() === '';
    const username = getUsername(cell);
    const hasKeyword = SKIP_KEY_WORDS && KEY_WORDS.some(k =>
      name.toLowerCase().includes(k) || username.toLowerCase().includes(k) || bio.toLowerCase().includes(k)
    );

    const verifiedBadge = cell.querySelector('svg[aria-label="Verified account"]');
    const isVerified = !!verifiedBadge;

    const reasons = [];
    if (SKIP_DEFAULT_PIC && hasDefaultPic) reasons.push('default pic');
    if (SKIP_NO_BIO && noBio) reasons.push('no bio');
    if (hasKeyword) reasons.push('keyword');
    return { isBotLike: reasons.length > 0, reasons, isVerified };
  }

  async function randomDelay() {
    const ms = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
    await new Promise(r => setTimeout(r, ms));
  }

  function isRateLimited() {
    const toast = document.querySelector('[data-testid="toast"]');
    if (!toast) return false;
    const msg = toast.textContent.toLowerCase();
    if (
      msg.includes('rate limit') ||
      msg.includes('unable to follow more people') ||
      msg.includes('you are unable to follow')
    ) {
      console.log('FOLLOW/LIMIT TOAST DETECTED:', msg);
      return true;
    }
    return false;
  }

  async function waitForUnfollowConfirm() {
    return new Promise(resolve => {
      const obs = new MutationObserver(() => {
        const btn = Array.from(document.querySelectorAll('button[data-testid="confirmationSheetConfirm"]'))
          .find(b => b.textContent.trim().toLowerCase() === 'unfollow');
        if (btn && btn.offsetParent) {
          obs.disconnect();
          resolve(btn);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, 3000);
    });
  }

  function resetUI() {
    getCells().forEach(cell => {
      cell.style.border = '';
    });
    console.log('UI reset complete');
  }

  const ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;background:#fff;padding:12px;border:2px solid #000;border-radius:10px;font-family:sans-serif;font-size:13px;display:flex;flex-direction:column;gap:8px;min-width:280px;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-height:80vh;overflow-y:auto;';
  document.body.appendChild(ui);

  ui.style.cursor = 'move';
  let isDragging = false;
  let startX, startY;

  ui.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX - ui.getBoundingClientRect().left;
    startY = e.clientY - ui.getBoundingClientRect().top;
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      ui.style.left = `${e.clientX - startX}px`;
      ui.style.top = `${e.clientY - startY}px`;
      ui.style.right = 'auto';
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  const startBtn = document.createElement('button');
  startBtn.textContent = 'Start';
  startBtn.style.cssText = 'padding:10px;font-weight:bold;font-size:15px;border-radius:6px;background:#f44336;color:white;cursor:pointer;';
  ui.appendChild(startBtn);

  const modeLine = document.createElement('div');
  modeLine.style.fontWeight = 'bold';
  modeLine.style.fontSize = '14px';
  ui.appendChild(modeLine);

  const actionLine = document.createElement('div');
  ui.appendChild(actionLine);

  const scanLine = document.createElement('div');
  ui.appendChild(scanLine);

  const modeSwitchBtn = document.createElement('button');
  modeSwitchBtn.style.cssText = 'padding:8px;font-weight:bold;cursor:pointer;border-radius:6px;background:#9c27b0;color:white;';
  if (isFollowingPage) {
    modeSwitchBtn.textContent = 'Switch → Follow Back (Verified)';
    modeSwitchBtn.onclick = () => window.location.href = verifiedUrl;
  } else {
    modeSwitchBtn.textContent = 'Switch → Unfollow';
    modeSwitchBtn.onclick = () => window.location.href = followingUrl;
  }
  ui.appendChild(modeSwitchBtn);

  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset This Mode & Reload';
  resetBtn.style.cssText = 'padding:8px;font-weight:bold;cursor:pointer;border-radius:6px;background:#2196F3;color:white;';
  resetBtn.onclick = () => {
    const prefix = mode === 'unfollow' ? 'um_uf_' : 'um_fb_';
    Object.keys(localStorage)
      .filter(key => key.startsWith(prefix) && key !== 'um_fb_followUnv')
      .forEach(key => localStorage.removeItem(key));
    localStorage.removeItem('um_fb_firstScan');
    localStorage.removeItem('um_fb_scan_max');
    resetUI();
    location.reload();
  };
  ui.appendChild(resetBtn);

  function createCollapsible(title, content) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = title;
    summary.style.fontWeight = 'bold';
    details.appendChild(summary);
    details.appendChild(content);
    return details;
  }

  // ==================== BOT FILTERS ====================
  const botFiltersContent = document.createElement('div');
  botFiltersContent.style.display = 'flex';
  botFiltersContent.style.flexDirection = 'column';
  botFiltersContent.style.gap = '8px';

  function getFilterLabel(base) {
    return mode === 'unfollow' ? `Unfollow ${base}` : `Skip ${base}`;
  }

  const defaultPicDiv = document.createElement('div');
  defaultPicDiv.style.cssText = 'display:flex;align-items:center;';
  const defaultPicCheckbox = document.createElement('input');
  defaultPicCheckbox.type = 'checkbox';
  defaultPicCheckbox.id = 'skip-default-pic';
  defaultPicCheckbox.checked = SKIP_DEFAULT_PIC;
  defaultPicCheckbox.onchange = () => {
    SKIP_DEFAULT_PIC = defaultPicCheckbox.checked;
    localStorage.setItem('um_skip_default_pic', SKIP_DEFAULT_PIC);
  };
  const defaultPicLabel = document.createElement('label');
  defaultPicLabel.htmlFor = 'skip-default-pic';
  defaultPicLabel.textContent = getFilterLabel('Default Pic');
  defaultPicLabel.style.marginLeft = '5px';
  defaultPicDiv.appendChild(defaultPicCheckbox);
  defaultPicDiv.appendChild(defaultPicLabel);
  botFiltersContent.appendChild(defaultPicDiv);

  const noBioDiv = document.createElement('div');
  noBioDiv.style.cssText = 'display:flex;align-items:center;';
  const noBioCheckbox = document.createElement('input');
  noBioCheckbox.type = 'checkbox';
  noBioCheckbox.id = 'skip-no-bio';
  noBioCheckbox.checked = SKIP_NO_BIO;
  noBioCheckbox.onchange = () => {
    SKIP_NO_BIO = noBioCheckbox.checked;
    localStorage.setItem('um_skip_no_bio', SKIP_NO_BIO);
  };
  const noBioLabel = document.createElement('label');
  noBioLabel.htmlFor = 'skip-no-bio';
  noBioLabel.textContent = getFilterLabel('No Bio');
  noBioLabel.style.marginLeft = '5px';
  noBioDiv.appendChild(noBioCheckbox);
  noBioDiv.appendChild(noBioLabel);
  botFiltersContent.appendChild(noBioDiv);

  const keywordsDiv = document.createElement('div');
  keywordsDiv.style.cssText = 'display:flex;align-items:center;';
  const keywordsCheckbox = document.createElement('input');
  keywordsCheckbox.type = 'checkbox';
  keywordsCheckbox.id = 'skip-keywords';
  keywordsCheckbox.checked = SKIP_KEY_WORDS;
  keywordsCheckbox.onchange = () => {
    SKIP_KEY_WORDS = keywordsCheckbox.checked;
    localStorage.setItem('um_skip_key_words', SKIP_KEY_WORDS);
  };
  const keywordsLabel = document.createElement('label');
  keywordsLabel.htmlFor = 'skip-keywords';
  keywordsLabel.textContent = getFilterLabel('Keywords');
  keywordsLabel.style.marginLeft = '5px';
  keywordsDiv.appendChild(keywordsCheckbox);
  keywordsDiv.appendChild(keywordsLabel);
  botFiltersContent.appendChild(keywordsDiv);

  ui.appendChild(createCollapsible('Bot Filters', botFiltersContent));

  const keywordsContent = document.createElement('div');
  keywordsContent.style.display = 'flex';
  keywordsContent.style.flexDirection = 'column';
  keywordsContent.style.gap = '8px';

  const keywordsList = document.createElement('ul');
  keywordsList.style.cssText = 'list-style:none;padding:0;margin:0;';
  keywordsContent.appendChild(keywordsList);

  function updateKeywordsList() {
    keywordsList.innerHTML = '';
    KEY_WORDS.forEach((kw, index) => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;gap:5px;margin-bottom:5px;';
      const span = document.createElement('span');
      span.textContent = kw;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.style.cssText = 'font-size:12px;padding:2px 4px;background:#f44336;color:white;border:none;cursor:pointer;';
      removeBtn.onclick = () => {
        KEY_WORDS.splice(index, 1);
        localStorage.setItem('um_key_words', JSON.stringify(KEY_WORDS));
        updateKeywordsList();
      };
      li.appendChild(span);
      li.appendChild(removeBtn);
      keywordsList.appendChild(li);
    });
  }
  updateKeywordsList();

  const addKeywordDiv = document.createElement('div');
  addKeywordDiv.style.cssText = 'display:flex;gap:5px;';
  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.placeholder = 'New keyword';
  addInput.style.flex = '1';
  const addBtn = document.createElement('button');
  addBtn.textContent = 'Add';
  addBtn.style.cssText = 'padding:4px 8px;background:#4CAF50;color:white;border:none;cursor:pointer;';
  addBtn.onclick = () => {
    const newKw = addInput.value.trim().toLowerCase();
    if (newKw && !KEY_WORDS.includes(newKw)) {
      KEY_WORDS.push(newKw);
      localStorage.setItem('um_key_words', JSON.stringify(KEY_WORDS));
      updateKeywordsList();
      addInput.value = '';
    }
  };
  addKeywordDiv.appendChild(addInput);
  addKeywordDiv.appendChild(addBtn);
  keywordsContent.appendChild(addKeywordDiv);

  ui.appendChild(createCollapsible('Manage Keywords', keywordsContent));

  const whitelistContent = document.createElement('div');
  whitelistContent.style.display = 'flex';
  whitelistContent.style.flexDirection = 'column';
  whitelistContent.style.gap = '8px';

  const whitelistList = document.createElement('ul');
  whitelistList.style.cssText = 'list-style:none;padding:0;margin:0;';
  whitelistContent.appendChild(whitelistList);

  function updateWhitelistList() {
    whitelistList.innerHTML = '';
    WHITELIST.forEach((wl, index) => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;gap:5px;margin-bottom:5px;';
      const span = document.createElement('span');
      span.textContent = wl;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.style.cssText = 'font-size:12px;padding:2px 4px;background:#f44336;color:white;border:none;cursor:pointer;';
      removeBtn.onclick = () => {
        WHITELIST.splice(index, 1);
        localStorage.setItem('um_whitelist', JSON.stringify(WHITELIST));
        updateWhitelistList();
      };
      li.appendChild(span);
      li.appendChild(removeBtn);
      whitelistList.appendChild(li);
    });
  }
  updateWhitelistList();

  const addWhitelistDiv = document.createElement('div');
  addWhitelistDiv.style.cssText = 'display:flex;gap:5px;';
  const addWlInput = document.createElement('input');
  addWlInput.type = 'text';
  addWlInput.placeholder = 'New whitelist username';
  addWlInput.style.flex = '1';
  const addWlBtn = document.createElement('button');
  addWlBtn.textContent = 'Add';
  addWlBtn.style.cssText = 'padding:4px 8px;background:#4CAF50;color:white;border:none;cursor:pointer;';
  addWlBtn.onclick = () => {
    const newWl = addWlInput.value.trim();
    if (newWl && !WHITELIST.includes(newWl)) {
      WHITELIST.push(newWl);
      localStorage.setItem('um_whitelist', JSON.stringify(WHITELIST));
      updateWhitelistList();
      addWlInput.value = '';
    }
  };
  addWhitelistDiv.appendChild(addWlInput);
  addWhitelistDiv.appendChild(addWlBtn);
  whitelistContent.appendChild(addWhitelistDiv);

  ui.appendChild(createCollapsible('Manage Whitelist', whitelistContent));

  const advancedContent = document.createElement('div');
  advancedContent.style.display = 'flex';
  advancedContent.style.flexDirection = 'column';
  advancedContent.style.gap = '8px';

  const pauseEveryDiv = document.createElement('div');
  pauseEveryDiv.style.cssText = 'display:flex;align-items:center;gap:5px;';
  const pauseEveryLabel = document.createElement('label');
  pauseEveryLabel.textContent = 'Pause every:';
  const pauseEveryInput = document.createElement('input');
  pauseEveryInput.type = 'number';
  pauseEveryInput.value = scPauseCount;
  pauseEveryInput.min = '1';
  pauseEveryInput.onchange = () => {
    scPauseCount = parseInt(pauseEveryInput.value) || 200;
    localStorage.setItem('um_sc_pause_count', scPauseCount);
  };
  pauseEveryDiv.appendChild(pauseEveryLabel);
  pauseEveryDiv.appendChild(pauseEveryInput);
  advancedContent.appendChild(pauseEveryDiv);

  const pauseSecondsDiv = document.createElement('div');
  pauseSecondsDiv.style.cssText = 'display:flex;align-items:center;gap:5px;';
  const pauseSecondsLabel = document.createElement('label');
  pauseSecondsLabel.textContent = 'Pause seconds:';
  const pauseSecondsInput = document.createElement('input');
  pauseSecondsInput.type = 'number';
  pauseSecondsInput.value = scPauseSeconds;
  pauseSecondsInput.min = '1';
  pauseSecondsInput.onchange = () => {
    scPauseSeconds = parseInt(pauseSecondsInput.value) || 30;
    localStorage.setItem('um_sc_pause_seconds', scPauseSeconds);
  };
  pauseSecondsDiv.appendChild(pauseSecondsLabel);
  pauseSecondsDiv.appendChild(pauseSecondsInput);
  advancedContent.appendChild(pauseSecondsDiv);

  // === Cooldown Minutes with decimal support ===
  const cooldownDiv = document.createElement('div');
  cooldownDiv.style.cssText = 'display:flex;align-items:center;gap:5px;';
  const cooldownLabel = document.createElement('label');
  cooldownLabel.textContent = 'Cooldown Minutes:';
  const cooldownInput = document.createElement('input');
  cooldownInput.type = 'number';
  cooldownInput.value = fbCooldownMinutes;
  cooldownInput.min = '0.01';
  cooldownInput.step = '0.1';
  cooldownInput.onchange = () => {
    fbCooldownMinutes = parseFloat(cooldownInput.value) || 15;
    localStorage.setItem('um_fb_cooldown_minutes', fbCooldownMinutes);
    ACTION_CD = fbCooldownMinutes * 60 * 1000;
  };
  cooldownDiv.appendChild(cooldownLabel);
  cooldownDiv.appendChild(cooldownInput);
  advancedContent.appendChild(cooldownDiv);

  if (mode === 'unfollow') {
    const maxUnfollowDiv = document.createElement('div');
    maxUnfollowDiv.style.cssText = 'display:flex;align-items:center;gap:5px;';
    const maxUnfollowLabel = document.createElement('label');
    maxUnfollowLabel.textContent = 'Max unfollow (per cooldown):';
    const maxUnfollowInput = document.createElement('input');
    maxUnfollowInput.type = 'number';
    maxUnfollowInput.value = parseInt(localStorage.getItem('um_uf_max_per_period')) || 50;
    maxUnfollowInput.min = '1';
    maxUnfollowInput.onchange = () => {
      UF_MAX_PER_PERIOD = parseInt(maxUnfollowInput.value) || 50;
      localStorage.setItem('um_uf_max_per_period', UF_MAX_PER_PERIOD);
      updateUI();
    };
    maxUnfollowDiv.appendChild(maxUnfollowLabel);
    maxUnfollowDiv.appendChild(maxUnfollowInput);
    advancedContent.appendChild(maxUnfollowDiv);

    const maxScanDiv = document.createElement('div');
    maxScanDiv.style.cssText = 'display:flex;align-items:center;gap:5px;';
    const maxScanLabel = document.createElement('label');
    maxScanLabel.textContent = 'Max scan:';
    const maxScanInput = document.createElement('input');
    maxScanInput.type = 'number';
    maxScanInput.value = parseInt(localStorage.getItem('um_sc_max_scan')) || 60000;
    maxScanInput.min = '1';
    maxScanInput.onchange = () => {
      localStorage.setItem('um_sc_max_scan', maxScanInput.value);
      updateUI();
    };
    maxScanDiv.appendChild(maxScanLabel);
    maxScanDiv.appendChild(maxScanInput);
    advancedContent.appendChild(maxScanDiv);
  }

  let followUnvCheckbox;
  if (mode !== 'unfollow') {
    const followUnvDiv = document.createElement('div');
    followUnvDiv.style.cssText = 'display:flex;align-items:center;';
    followUnvCheckbox = document.createElement('input');
    followUnvCheckbox.type = 'checkbox';
    followUnvCheckbox.id = 'follow-unv';
    const storedUnv = localStorage.getItem('um_fb_followUnv');
    followUnvCheckbox.checked = storedUnv === null ? true : storedUnv === 'true';
    followUnvCheckbox.onchange = () => {
      const val = followUnvCheckbox.checked ? 'true' : 'false';
      localStorage.setItem('um_fb_followUnv', val);
      modeLine.textContent = `Mode: Follow Back (${followUnvCheckbox.checked ? 'All' : 'Verified'} Followers)`;
      if (!followUnvCheckbox.checked && !isVerified) {
        window.location.href = verifiedUrl;
      }
    };
    const followUnvLabel = document.createElement('label');
    followUnvLabel.htmlFor = 'follow-unv';
    followUnvLabel.textContent = 'Follow Unverified';
    followUnvLabel.style.marginLeft = '5px';
    followUnvDiv.appendChild(followUnvCheckbox);
    followUnvDiv.appendChild(followUnvLabel);
    advancedContent.appendChild(followUnvDiv);

    const fbScanMaxDiv = document.createElement('div');
    fbScanMaxDiv.style.cssText = 'display:flex;align-items:center;gap:5px;';
    const fbScanMaxLabel = document.createElement('label');
    fbScanMaxLabel.textContent = 'FB Scan Max:';
    const fbScanMaxInput = document.createElement('input');
    fbScanMaxInput.type = 'number';
    fbScanMaxInput.value = fbScanMax;
    fbScanMaxInput.min = '1';
    fbScanMaxInput.onchange = () => {
      fbScanMax = parseInt(fbScanMaxInput.value) || SC_INIT;
      localStorage.setItem('um_fb_scan_max', fbScanMax);
    };
    fbScanMaxDiv.appendChild(fbScanMaxLabel);
    fbScanMaxDiv.appendChild(fbScanMaxInput);
    advancedContent.appendChild(fbScanMaxDiv);
  } else {
    const unfollowUnvDiv = document.createElement('div');
    unfollowUnvDiv.style.cssText = 'display:flex;align-items:center;';
    const unfollowUnvCheckbox = document.createElement('input');
    unfollowUnvCheckbox.type = 'checkbox';
    unfollowUnvCheckbox.id = 'unfollow-unv';
    const storedUnfollowUnv = localStorage.getItem('um_unfollow_unverified');
    unfollowUnvCheckbox.checked = storedUnfollowUnv === 'true';
    unfollowUnvCheckbox.onchange = () => {
      const val = unfollowUnvCheckbox.checked ? 'true' : 'false';
      localStorage.setItem('um_unfollow_unverified', val);
      console.log('Unfollow unverified setting changed to:', val);
    };
    const unfollowUnvLabel = document.createElement('label');
    unfollowUnvLabel.htmlFor = 'unfollow-unv';
    unfollowUnvLabel.textContent = 'Unfollow Unverified';
    unfollowUnvLabel.style.marginLeft = '5px';
    unfollowUnvDiv.appendChild(unfollowUnvCheckbox);
    unfollowUnvDiv.appendChild(unfollowUnvLabel);
    advancedContent.appendChild(unfollowUnvDiv);
  }

  ui.appendChild(createCollapsible('Advanced Settings', advancedContent));

  let running = false;
  let paused = true;
  let manuallyPaused = false;

  if (mode === 'unfollow') {
    function getUnfollowUnverified() {
      return localStorage.getItem('um_unfollow_unverified') === 'true';
    }

    modeLine.textContent = 'Mode: Unfollow non-mutuals + bots';
    actionLine.innerHTML = `Unfollows: <span id="action-count">0/50</span><span id="timer"></span>`;
    scanLine.innerHTML = `Scan: <span id="scan-count">0/60000</span> <span id="scan-timer">00:00:00</span>`;

    const actionCountSpan = document.getElementById('action-count');
    const timerSpan = document.getElementById('timer');
    const scanCountSpan = document.getElementById('scan-count');
    const scanTimerSpan = document.getElementById('scan-timer');

    let processed = new Set();
    let total = 0;
    let actionedInPeriod = 0;
    let remainingTime = 0;
    let hasActioned = false;
    let timerInt = null;
    let periodStart = null;

    UF_MAX_PER_PERIOD = parseInt(localStorage.getItem('um_uf_max_per_period')) || 50;

    const storagePrefix = 'um_uf_';

    function loadState() {
      periodStart = parseInt(localStorage.getItem(storagePrefix + 'periodStart') || '0') || null;
      actionedInPeriod = parseInt(localStorage.getItem(storagePrefix + 'count') || '0');
      if (periodStart) {
        const elapsed = Date.now() - periodStart;
        if (elapsed < ACTION_CD) {
          remainingTime = Math.floor((ACTION_CD - elapsed) / 1000);
          startTimerFrom(remainingTime);
        } else {
          periodStart = null;
          actionedInPeriod = 0;
        }
      }
      updateUI();
      updateStartButton();
    }

    function saveState() {
      if (periodStart) localStorage.setItem(storagePrefix + 'periodStart', periodStart);
      else localStorage.removeItem(storagePrefix + 'periodStart');
      localStorage.setItem(storagePrefix + 'count', actionedInPeriod);
    }

    function startTimerFrom(sec) {
      remainingTime = sec;
      hasActioned = true;
      updateUI();
      if (timerInt) clearInterval(timerInt);
      timerInt = setInterval(() => {
        remainingTime--;
        updateUI();
        if (remainingTime <= 0) {
          clearInterval(timerInt);
          periodStart = null;
          actionedInPeriod = 0;
          hasActioned = false;

          const shouldAutoResume = !manuallyPaused;

          paused = true;
          manuallyPaused = false;
          saveState();
          updateUI();
          updateStartButton();

          if (shouldAutoResume) {
            setTimeout(() => {
              if (startBtn.textContent === 'Start' || startBtn.textContent === 'Paused') {
                startBtn.click();
              }
            }, 1200);
          }
        }
      }, 1000);
    }

    function startNewTimer() {
      if (timerInt) clearInterval(timerInt);
      periodStart = Date.now();
      remainingTime = Math.floor(ACTION_CD / 1000);
      hasActioned = true;
      saveState();
      updateUI();
      updateStartButton();
      timerInt = setInterval(() => {
        remainingTime--;
        updateUI();
        if (remainingTime <= 0) {
          clearInterval(timerInt);
          periodStart = null;
          actionedInPeriod = 0;
          hasActioned = false;

          const shouldAutoResume = !manuallyPaused;

          paused = true;
          manuallyPaused = false;
          saveState();
          updateUI();
          updateStartButton();

          if (shouldAutoResume) {
            setTimeout(() => {
              if (startBtn.textContent === 'Start' || startBtn.textContent === 'Paused') {
                startBtn.click();
              }
            }, 1200);
          }
        }
      }, 1000);
    }

    function updateUI() {
      const currentMaxUnfollow = UF_MAX_PER_PERIOD;
      const currentMaxScan = parseInt(localStorage.getItem('um_sc_max_scan')) || SC_MAX_UNFOLLOW;

      actionCountSpan.textContent = `${actionedInPeriod}/${currentMaxUnfollow}`;
      if (hasActioned) {
        const h = String(Math.floor(remainingTime / 3600)).padStart(2, '0');
        const m = String(Math.floor((remainingTime % 3600) / 60)).padStart(2, '0');
        const s = String(remainingTime % 60).padStart(2, '0');
        timerSpan.textContent = ` (${h}:${m}:${s})`;
      } else {
        timerSpan.textContent = ' 00:00:00';
      }
      scanCountSpan.textContent = `${total}/${currentMaxScan}`;
    }

    function updateStartButton() {
      const isMaxed = actionedInPeriod >= UF_MAX_PER_PERIOD;

      if (isMaxed) {
        startBtn.textContent = paused ? 'Paused' : 'Running';
        startBtn.style.background = paused ? '#f44336' : '#4CAF50';
        startBtn.style.cursor = 'pointer';
      } else if (running && !paused) {
        startBtn.textContent = 'Pause';
        startBtn.style.background = '#4CAF50';
        startBtn.style.cursor = 'pointer';
      } else if (running && paused) {
        startBtn.textContent = 'Paused';
        startBtn.style.background = '#f44336';
        startBtn.style.cursor = 'pointer';
      } else {
        startBtn.textContent = 'Start';
        startBtn.style.background = '#f44336';
        startBtn.style.cursor = 'pointer';
      }
    }

    async function pauseWithCountdown(seconds) {
      for (let i = seconds; i >= 0; i--) {
        if (paused) {
          scanTimerSpan.textContent = '00:00:00';
          return;
        }
        const h = String(Math.floor(i / 3600)).padStart(2, '0');
        const m = String(Math.floor((i % 3600) / 60)).padStart(2, '0');
        const s = String(i % 60).padStart(2, '0');
        scanTimerSpan.textContent = `${h}:${m}:${s}`;
        await new Promise(r => setTimeout(r, 1000));
      }
      scanTimerSpan.textContent = '00:00:00';
    }

    loadState();

    async function processBatch() {
      let cells = getCells().filter(c => !processed.has(getUsername(c)));
      let batch = cells.slice(0, BATCH_SIZE);
      if (!batch.length) return 0;

      window.scrollBy({ top: batch[0].getBoundingClientRect().top - SCROLL_POSITION });
      await new Promise(r => setTimeout(r, 300));

      batch.forEach(c => c.style.border = '2px solid yellow');
      await new Promise(r => setTimeout(r, 500));

      let processedCount = 0;
      for (let cell of batch) {
        if (paused) break;
        if (actionedInPeriod >= UF_MAX_PER_PERIOD) {
          paused = false;           // ← Fixed: stays in Running state so you can still pause
          running = true;
          manuallyPaused = false;
          updateStartButton();
          console.log('Max unfollows reached this period → will auto-resume after cooldown');
          break;
        }

        const user = getUsername(cell);
        processed.add(user);
        total++;
        processedCount++;
        updateUI();

        if (WHITELIST.includes(user)) {
          cell.style.border = '2px solid orange';
          console.log(`Skipping ${user}: whitelisted`);
          continue;
        }

        const isMutual = !!cell.querySelector('[data-testid="userFollowIndicator"]');
        const { isBotLike, reasons: botReasons, isVerified } = getBotInfo(cell);
        let reasons = [];
        if (!isMutual) reasons.push('non-mutual');
        reasons = reasons.concat(botReasons);

        const unfollowUnverifiedEnabled = getUnfollowUnverified();
        if (unfollowUnverifiedEnabled && !isVerified) {
          reasons.push('unverified');
        }

        if (reasons.length === 0) {
          cell.style.border = '2px solid green';
          console.log(`Skipping ${user}: mutual and not bot-like`);
          continue;
        }

        const btn = cell.querySelector('button[aria-label^="Following @"], button[data-testid$="-unfollow"]');
        if (!btn) {
          cell.style.border = '2px solid orange';
          console.log(`Skipping ${user}: no unfollow button`);
          continue;
        }

        btn.click();
        const confirm = await waitForUnfollowConfirm();
        if (confirm) {
          confirm.click();
          cell.style.border = '2px solid red';
          actionedInPeriod++;
          if (actionedInPeriod === 1) startNewTimer();
          updateUI();
          saveState();
          updateStartButton();
          console.log(`Unfollowed ${user}: ${reasons.join(', ')}`);
        } else {
          if (isRateLimited()) startNewTimer();
          cell.style.border = '2px solid orange';
          console.log(`Failed to unfollow ${user}`);
        }

        await randomDelay();
      }
      return processedCount;
    }

    startBtn.onclick = async () => {
      if (running) {
        paused = !paused;
        if (paused) {
          manuallyPaused = true;
        } else {
          manuallyPaused = false;
        }
        updateStartButton();
        return;
      }
      running = true;
      paused = false;
      manuallyPaused = false;
      updateStartButton();

      let stuckCount = 0;
      let lastCellsCount = 0;
      let scanSincePause = 0;
      while (running) {
        if (paused) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
        if (actionedInPeriod >= UF_MAX_PER_PERIOD) {
          updateStartButton();
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
        const proc = await processBatch();
        scanSincePause += proc;
        if (scanSincePause >= scPauseCount) {
          await pauseWithCountdown(scPauseSeconds);
          scanSincePause = 0;
        }
        const curr = getCells().length;
        if (curr === lastCellsCount) stuckCount++;
        else stuckCount = 0;
        lastCellsCount = curr;
        if (stuckCount >= STUCK_THRESHOLD || total >= SC_MAX_UNFOLLOW) {
          running = false;
          updateStartButton();
          break;
        }
        window.scrollBy({ top: 800 });
        await new Promise(r => setTimeout(r, 100));
      }
    };

  } else {
    // Follow Back mode
    const followUnvEnabled = getFollowUnv();
    modeLine.textContent = `Mode: Follow Back (${followUnvEnabled ? 'All' : (isVerified ? 'Verified' : 'Verified')} Followers)`;

    actionLine.innerHTML = `
      FB: <span id="fb-count-val">0/${fbMaxPerPeriod}</span>
      <span id="fb-timer">00:00:00</span>
    `;
    scanLine.innerHTML = `Scan: <span id="scan-count">0/${fbScanMax}</span> <span id="scan-timer">00:00:00</span>`;

    const fbCountSpan = document.getElementById('fb-count-val');
    const fbTimerSpan = document.getElementById('fb-timer');
    const scanCountSpan = document.getElementById('scan-count');
    const scanTimerSpan = document.getElementById('scan-timer');

    let processed = new Set();
    let scanTotal = 0;
    let cycleFollows = parseInt(localStorage.getItem('um_fb_cycle') || '0');

    let fbCooldownEnd = parseInt(localStorage.getItem('um_fb_cooldownEnd') || '0');
    let fbCooldownRemaining = 0;
    let fbCooldownInt = null;

    if (localStorage.getItem('um_fb_firstScan') === null) {
      localStorage.setItem('um_fb_firstScan', 'true');
    }
    let firstScan = localStorage.getItem('um_fb_firstScan') === 'true';

    function updateCooldownUI() {
      const h = String(Math.floor(fbCooldownRemaining / 3600)).padStart(2, '0');
      const m = String(Math.floor((fbCooldownRemaining % 3600) / 60)).padStart(2, '0');
      const s = String(fbCooldownRemaining % 60).padStart(2, '0');
      fbTimerSpan.textContent = `${h}:${m}:${s}`;
    }

    function startCooldown() {
      fbCooldownEnd = Date.now() + ACTION_CD;
      localStorage.setItem('um_fb_cooldownEnd', String(fbCooldownEnd));
      fbCooldownRemaining = Math.floor(ACTION_CD / 1000);
      updateCooldownUI();
      if (fbCooldownInt) clearInterval(fbCooldownInt);
      fbCooldownInt = setInterval(() => {
        fbCooldownRemaining = Math.max(0, Math.floor((fbCooldownEnd - Date.now()) / 1000));
        updateCooldownUI();
        if (fbCooldownRemaining <= 0) {
          clearInterval(fbCooldownInt);
          fbCooldownInt = null;
          localStorage.removeItem('um_fb_cooldownEnd');
          localStorage.setItem('um_fb_cycle', '0');
          cycleFollows = 0;
          resetUI();
          window.location.href = verifiedUrl;
        }
      }, 1000);
    }

    if (fbCooldownEnd > Date.now()) {
      fbCooldownRemaining = Math.floor((fbCooldownEnd - Date.now()) / 1000);
      startCooldown();
    } else {
      fbCooldownRemaining = 0;
      updateCooldownUI();
    }

    function updateUI() {
      fbCountSpan.textContent = `${cycleFollows}/${fbMaxPerPeriod}`;
      scanCountSpan.textContent = `${scanTotal}/${fbScanMax}`;
    }

    async function pauseWithCountdown(seconds) {
      for (let i = seconds; i >= 0; i--) {
        if (paused) {
          scanTimerSpan.textContent = '00:00:00';
          return;
        }
        const h = String(Math.floor(i / 3600)).padStart(2, '0');
        const m = String(Math.floor((i % 3600) / 60)).padStart(2, '0');
        const s = String(i % 60).padStart(2, '0');
        scanTimerSpan.textContent = `${h}:${m}:${s}`;
        await new Promise(r => setTimeout(r, 1000));
      }
      scanTimerSpan.textContent = '00:00:00';
    }

    async function processBatch() {
      let cells = getCells().filter(c => !processed.has(getUsername(c)));
      let batch = cells.slice(0, BATCH_SIZE);
      if (!batch.length) return 0;

      window.scrollBy({ top: batch[0].getBoundingClientRect().top - SCROLL_POSITION });
      await new Promise(r => setTimeout(r, 300));

      batch.forEach(c => c.style.border = '2px solid yellow');
      await new Promise(r => setTimeout(r, 500));

      let proc = 0;
      for (let cell of batch) {
        if (paused || cycleFollows >= fbMaxPerPeriod || scanTotal >= fbScanMax) break;

        const user = getUsername(cell);
        processed.add(user);
        scanTotal++;
        proc++;
        updateUI();

        if (WHITELIST.includes(user)) {
          cell.style.border = '2px solid orange';
          console.log(`Skipping ${user}: whitelisted`);
          continue;
        }

        const { isBotLike, reasons } = getBotInfo(cell);
        if (isBotLike) {
          cell.style.border = '2px solid purple';
          console.log(`Skipping ${user}: bot-like (${reasons.join(', ')})`);
          continue;
        }

        const alreadyFollowing = cell.querySelector('button[aria-label^="Following @"]');
        if (alreadyFollowing) {
          cell.style.border = '2px solid green';
          console.log(`Skipping ${user}: already following`);
          continue;
        }

        const followBackBtn = cell.querySelector('button[aria-label*="Follow back @"]');
        if (!followBackBtn) {
          cell.style.border = '2px solid gray';
          console.log(`Skipping ${user}: no follow back button`);
          continue;
        }

        let success = false;
        let attempts = 0;
        while (!success && attempts < 3) {
          attempts++;
          followBackBtn.click();
          await new Promise(r => setTimeout(r, 800));
          if (isRateLimited()) {
            console.log('Daily cap hit, starting cooldown');
            running = false;
            paused = true;
            startBtn.textContent = 'Start';
            startCooldown();
            return proc;
          }
          if (!cell.querySelector('button[aria-label*="Follow back @"]')) {
            success = true;
          }
        }

        if (success) {
          cell.style.border = '2px solid blue';
          cycleFollows++;
          localStorage.setItem('um_fb_cycle', String(cycleFollows));
          updateUI();
          console.log(`Followed ${user}: eligible follow back`);
        } else {
          console.log(`Failed to follow ${user}: after ${attempts} attempts`);
        }

        await randomDelay();
      }
      return proc;
    }

    async function finishPage() {
      if (getFollowUnv() && isVerified && (scanTotal >= FB_SCAN_MIN || scanTotal >= fbScanMax)) {
        console.log('Verified page done, switching to unverified followers');
        await new Promise(r => setTimeout(r, 5000));
        window.location.href = normalUrl;
        return;
      }

      if (firstScan && scanTotal >= fbScanMax) {
        localStorage.setItem('um_fb_firstScan', 'false');
        firstScan = false;
        fbScanMax = SC_POST;
        localStorage.setItem('um_fb_scan_max', SC_POST);
        console.log('First scan complete: Set scan max to 50 for next times');
      }

      if (cycleFollows > 0 || scanTotal >= fbScanMax) {
        console.log('Starting cooldown after page finish');
        startCooldown();
      }
    }

    updateUI();

    startBtn.onclick = () => {
      paused = !paused;
      startBtn.textContent = paused ? 'Start' : 'Pause';
      if (!running && !paused) {
        if (fbCooldownEnd > Date.now()) {
          console.log('Cooldown active, cannot start yet');
          paused = true;
          startBtn.textContent = 'Start';
          return;
        }
        running = true;
        (async () => {
          let lastScroll = window.scrollY;
          let lastScrollTime = Date.now();
          let scanSincePause = 0;
          while (running) {
            if (paused) {
              await new Promise(r => setTimeout(r, 300));
              continue;
            }
            if (cycleFollows >= fbMaxPerPeriod) {
              await finishPage();
              return;
            }
            const proc = await processBatch();
            scanSincePause += proc;
            if (scanSincePause >= scPauseCount) {
              await pauseWithCountdown(scPauseSeconds);
              scanSincePause = 0;
            }
            if (scanTotal >= fbScanMax) {
              await finishPage();
              return;
            }
            window.scrollBy({ top: window.innerHeight });
            const curr = window.scrollY;
            if (curr === lastScroll) {
              if (Date.now() - lastScrollTime > 6000 && scanTotal >= FB_SCAN_MIN) {
                await finishPage();
                return;
              }
            } else {
              lastScroll = curr;
              lastScrollTime = Date.now();
            }
            await new Promise(r => setTimeout(r, 100));
          }
        })();
      }
    };
  }

  setTimeout(() => {
    if (startBtn && startBtn.textContent.trim() === 'Start') {
      startBtn.click();
    }
  }, 10000);

})();
