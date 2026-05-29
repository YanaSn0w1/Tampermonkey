// ==UserScript==
// @name         X Bulk Deleter
// @namespace    https://x.com
// @version      3.1
// @description  Filename mode + proper persistent progress + start at number
// @match        https://x.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let postList = [];
    let currentIndex = 0;
    let jsonLoaded = false;
    let paused = false;
    let rememberProgress = false;
    let delaySeconds = 6;
    let goBackwards = false;
    let currentUsername = null;
    let currentFileName = '';

    let currentPartFinished = false;

    function isOnPostPage() { return location.href.includes('/status/'); }
    function isErrorPage() {
        return document.body.innerText.includes("this page doesn't exist") ||
               document.body.innerText.includes("Hmm...this page doesn't exist");
    }

    async function getCurrentUsername(retries = 6) {
        for (let i = 0; i < retries; i++) {
            let el = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]') ||
                     document.querySelector('a[aria-label*="Profile"][href^="/"]');
            if (el) {
                const href = el.getAttribute('href') || '';
                if (href.startsWith('/')) {
                    const u = href.substring(1).split(/[/?#]/)[0];
                    if (u) return u;
                }
            }
            await new Promise(r => setTimeout(r, 400));
        }
        return null;
    }

    function loadState() {
        rememberProgress = localStorage.getItem('xBulkDeleter_remember') === 'true';
        delaySeconds = parseFloat(localStorage.getItem('xBulkDeleter_delay')) || 6;
        goBackwards = localStorage.getItem('xBulkDeleter_reverse') === 'true';

        // Load from persistent storage if remember is enabled
        if (rememberProgress) {
            try {
                const persistent = GM_getValue('bulkDeleter_persistent', null);
                if (persistent) {
                    const d = JSON.parse(persistent);
                    postList = d.postList || [];
                    currentIndex = d.currentIndex || 0;
                    paused = d.paused || false;
                    jsonLoaded = postList.length > 0;
                    currentPartFinished = d.currentPartFinished || false;
                    currentFileName = d.currentFileName || '';
                    return;
                }
            } catch(e){}
        }

        // Fallback to sessionStorage
        try {
            const s = sessionStorage.getItem('xBulkDeleter');
            if (s) {
                const d = JSON.parse(s);
                postList = d.postList || [];
                currentIndex = d.currentIndex || 0;
                paused = d.paused || false;
                jsonLoaded = postList.length > 0;
                currentPartFinished = d.currentPartFinished || false;
                currentFileName = d.currentFileName || '';
            }
        } catch(e){}
    }

    function saveState() {
        const data = { postList, currentIndex, paused, currentPartFinished, currentFileName };

        sessionStorage.setItem('xBulkDeleter', JSON.stringify(data));

        if (rememberProgress) {
            GM_setValue('bulkDeleter_persistent', JSON.stringify(data));
        } else {
            GM_deleteValue('bulkDeleter_persistent');
        }

        localStorage.setItem('xBulkDeleter_delay', delaySeconds);
        localStorage.setItem('xBulkDeleter_reverse', goBackwards);
        localStorage.setItem('xBulkDeleter_remember', rememberProgress ? 'true' : 'false');
    }

    function updateUI() {
        const status = document.getElementById('status');
        const progress = document.getElementById('progress');
        const toggle = document.getElementById('toggleBtn');
        const loadBtn = document.getElementById('loadBtn');
        const fileEl = document.getElementById('fileDisplay');
        const usernameEl = document.getElementById('usernameDisplay');

        if (progress) progress.textContent = `${currentIndex}/${postList.length || 0}`;

        if (fileEl) {
            fileEl.textContent = jsonLoaded && currentFileName ? currentFileName : '—';
        }

        if (usernameEl) {
            usernameEl.textContent = currentUsername ? `Logged in as: @${currentUsername}` : '';
            usernameEl.style.color = '#4ade80';
        }

        if (!jsonLoaded) {
            status.textContent = 'Load first file to begin';
            if (loadBtn) loadBtn.textContent = 'Load JSON File';
            if (toggle) toggle.style.display = 'block';
            return;
        }

        if (currentPartFinished) {
            status.textContent = `Finished: ${currentFileName}`;
            if (loadBtn) loadBtn.textContent = 'Load Next File';
            if (toggle) toggle.style.display = 'none';
        } else {
            status.textContent = paused ? `Paused (${currentIndex}/${postList.length})` : 'Running...';
            if (toggle) {
                toggle.textContent = paused ? '▶ Resume' : '⏸ Pause';
                toggle.style.background = paused ? '#22c55e' : '#eab308';
                toggle.style.display = 'block';
            }
            if (loadBtn) loadBtn.textContent = 'Load / Replace File';
        }
    }

    async function advance() {
        if (paused) return;
        goBackwards ? currentIndex-- : currentIndex++;
        saveState();

        if ((goBackwards && currentIndex >= 0) || (!goBackwards && currentIndex < postList.length)) {
            await new Promise(r => setTimeout(r, delaySeconds * 1000));
            if (!paused) location.href = postList[currentIndex];
        } else {
            paused = true;
            currentPartFinished = true;
            saveState();
            updateUI();
            alert(`Finished file: ${currentFileName}`);
        }
    }

    async function processPage() {
        if (!isOnPostPage() || paused) return;
        if (isErrorPage()) { await advance(); return; }
        await deleteRepliesOnPage();
        await advance();
    }

    function getMyReplies() {
        if (!isOnPostPage() || !currentUsername) return [];
        if (isErrorPage()) return [];
        const tweets = document.querySelectorAll('article[data-testid="tweet"]');
        if (!tweets.length) return [];

        const myHandle = '@' + currentUsername;
        const myProfile = '/' + currentUsername;
        let mine = [];

        for (let t of tweets) {
            if (t.innerText.includes(myHandle) || t.querySelector(`a[href*="${myProfile}"]`)) mine.push(t);
        }
        if (mine.length) return [mine[mine.length-1]];

        for (let i = tweets.length-1; i >= 0; i--) {
            if (tweets[i].querySelector('[data-testid="caret"]') && tweets[i].innerText.includes(currentUsername)) return [tweets[i]];
        }
        return [];
    }

    async function deleteRepliesOnPage() {
        while (true) {
            if (paused || isErrorPage()) break;
            const r = getMyReplies();
            if (!r.length) break;

            const tweet = r[0];
            const caret = tweet.querySelector('[data-testid="caret"]') || tweet.querySelector('button[aria-label*="More"]');
            if (!caret) break;
            caret.click();
            await new Promise(r => setTimeout(r, 550));

            let del = null;
            for (let el of document.querySelectorAll('[role="menuitem"],[role="button"]')) {
                if ((el.innerText||'').toLowerCase().includes('delete')) { del = el; break; }
            }
            if (!del) break;
            del.click();
            await new Promise(r => setTimeout(r, 650));

            const confirm = document.querySelector('[data-testid="confirmationSheetConfirm"]');
            if (confirm) confirm.click();
            await new Promise(r => setTimeout(r, 1200));
        }
    }

    function createPanel() {
        if (document.getElementById('x-bulk-panel')) return;

        const p = document.createElement('div');
        p.id = 'x-bulk-panel';
        p.style.cssText = 'position:fixed;top:20px;right:20px;width:360px;background:#111827;color:white;padding:14px;border-radius:12px;z-index:999999;font-family:sans-serif;';

        p.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <b>X Bulk Deleter</b>
                <span id="progress" style="color:#9ca3af;font-size:12px;"></span>
            </div>

            <div style="background:#1f2937;padding:10px;border-radius:8px;margin-bottom:8px;text-align:center;">
                <div id="status">Load first file to begin</div>
                <div style="margin:6px 0;font-size:12px;color:#9ca3af;">
                    Current file: <span id="fileDisplay" style="color:#60a5fa;font-weight:bold;">—</span>
                </div>
                <div id="usernameDisplay" style="font-size:11px;margin-top:4px;color:#4ade80;"></div>
            </div>

            <button id="loadBtn" style="width:100%;padding:11px;margin-bottom:8px;background:#3b82f6;color:white;border:none;border-radius:8px;font-weight:600;">Load JSON File</button>
            <input type="file" id="fileInput" accept=".json" style="display:none;">

            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                <button id="startAtBtn" style="padding:6px 12px;background:#374151;color:white;border:none;border-radius:6px;font-size:12px;">Start at</button>
                <input id="startAtInput" type="number" value="1" style="width:80px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
            </div>

            <button id="toggleBtn" style="width:100%;padding:13px;background:#22c55e;color:black;border:none;border-radius:8px;font-weight:bold;margin-bottom:10px;">▶ Start</button>

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

        // Remember progress checkbox
        const rememberCheck = p.querySelector('#rememberCheck');
        rememberCheck.checked = rememberProgress;
        rememberCheck.onchange = () => {
            rememberProgress = rememberCheck.checked;
            if (!rememberProgress) {
                GM_deleteValue('bulkDeleter_persistent');
            }
            saveState();
        };

        p.querySelector('#loadBtn').onclick = () => p.querySelector('#fileInput').click();

        p.querySelector('#fileInput').onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const raw = JSON.parse(ev.target.result);
                    postList = raw.map(x => typeof x === 'string' ? x : (x?.url || ''))
                        .filter(u => u.includes('x.com') && u.includes('/status/'));

                    if (postList.length === 0) { alert('No valid URLs found'); return; }

                    currentFileName = file.name;
                    currentIndex = goBackwards ? postList.length - 1 : 0;
                    jsonLoaded = true;
                    paused = false;
                    currentPartFinished = false;

                    saveState();
                    updateUI();

                    alert(`Loaded file: ${file.name}\n${postList.length} posts`);

                    setTimeout(() => {
                        if (postList.length > 0) location.href = postList[currentIndex];
                    }, 500);
                } catch {
                    alert('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        };

        // Start at feature
        p.querySelector('#startAtBtn').onclick = () => {
            if (!jsonLoaded) { alert('Load a file first'); return; }
            const val = parseInt(p.querySelector('#startAtInput').value) || 1;
            currentIndex = Math.max(0, val - 1);
            saveState();
            if (postList.length > 0) {
                location.href = postList[currentIndex];
            }
        };

        const toggle = p.querySelector('#toggleBtn');
        toggle.onclick = () => {
            if (!jsonLoaded) { alert('Load a file first'); return; }
            paused = !paused;
            saveState();
            updateUI();
            if (!paused) {
                if (isOnPostPage()) processPage();
                else if (currentIndex >= 0 && currentIndex < postList.length) location.href = postList[currentIndex];
            }
        };

        p.querySelector('#delayInput').onchange = () => {
            delaySeconds = parseFloat(p.querySelector('#delayInput').value) || 6;
            saveState();
        };

        p.querySelector('#reverseCheck').onchange = () => { goBackwards = p.querySelector('#reverseCheck').checked; saveState(); };

        p.querySelector('#resetBtn').onclick = () => {
            if (confirm('Reset everything?')) {
                postList = []; currentIndex = 0; jsonLoaded = false; paused = false; currentPartFinished = false;
                currentFileName = '';
                sessionStorage.removeItem('xBulkDeleter');
                GM_deleteValue('bulkDeleter_persistent');
                location.reload();
            }
        };
    }

    async function init() {
        loadState();
        currentUsername = await getCurrentUsername();
        createPanel();
        updateUI();

        if (jsonLoaded && !paused && isOnPostPage() && !currentPartFinished) {
            setTimeout(() => {
                if (isErrorPage()) advance();
                else processPage();
            }, 1200);
        }
    }

    init();
})();
