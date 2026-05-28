// ==UserScript==
// @name         X Bulk Deleter (Persistent Progress Fix)
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

    function isOnPostPage() {
        return location.href.includes('/status/');
    }

    function isErrorPage() {
        return document.body.innerText.includes("this page doesn't exist") ||
               document.body.innerText.includes("Hmm...this page doesn't exist");
    }

    async function getCurrentUsername(retries = 5) {
        for (let i = 0; i < retries; i++) {
            let el = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
            if (!el) el = document.querySelector('a[aria-label="Profile"][href^="/"]');
            if (!el) el = document.querySelector('a[href^="/"][role="link"][aria-label*="Profile"]');
            if (!el) el = document.querySelector('a[href^="/"][aria-label*="Profile"]');

            if (el) {
                const href = el.getAttribute('href') || '';
                if (href.startsWith('/')) {
                    const username = href.substring(1).split(/[/?#]/)[0];
                    if (username) return username;
                }
            }
            await new Promise(r => setTimeout(r, 400));
        }
        return null;
    }

    function loadState() {
        const pref = localStorage.getItem('xBulkDeleter_remember');
        rememberProgress = pref === 'true';

        const savedDelay = localStorage.getItem('xBulkDeleter_delay');
        if (savedDelay) delaySeconds = parseFloat(savedDelay) || 6;

        const savedReverse = localStorage.getItem('xBulkDeleter_reverse');
        goBackwards = savedReverse === 'true';

        // Try sessionStorage first
        try {
            const sessionData = sessionStorage.getItem('xBulkDeleter');
            if (sessionData) {
                const d = JSON.parse(sessionData);
                postList = d.postList || [];
                currentIndex = d.currentIndex || 0;
                paused = d.paused || false;
                jsonLoaded = postList.length > 0;
                return;
            }
        } catch(e){}

        // Load from persistent storage if remember progress is enabled
        if (rememberProgress) {
            try {
                const persistentData = GM_getValue('bulkDeleter_persistent', null);
                if (persistentData) {
                    const d = JSON.parse(persistentData);
                    postList = d.postList || [];
                    currentIndex = d.currentIndex || 0;
                    paused = d.paused || false;
                    jsonLoaded = postList.length > 0;
                    console.log('[X Bulk Deleter] Restored progress from persistent storage');
                }
            } catch(e){}
        }
    }

    function saveState() {
        const data = { postList, currentIndex, paused };
        sessionStorage.setItem('xBulkDeleter', JSON.stringify(data));
        if (rememberProgress) {
            GM_setValue('bulkDeleter_persistent', JSON.stringify(data));
        }
        localStorage.setItem('xBulkDeleter_delay', delaySeconds);
        localStorage.setItem('xBulkDeleter_reverse', goBackwards);
    }

    function getMyReplies() {
        if (!isOnPostPage() || !currentUsername) return [];

        if (isErrorPage()) {
            console.log('[X Bulk Deleter] This post no longer exists. Skipping...');
            return [];
        }

        const tweets = document.querySelectorAll('article[data-testid="tweet"]');
        if (tweets.length === 0) return [];

        const myHandle = '@' + currentUsername;
        const myProfile = '/' + currentUsername;
        let myTweets = [];

        for (let tweet of tweets) {
            const text = tweet.innerText || '';
            const hasHandle = text.includes(myHandle);
            const hasProfileLink = tweet.querySelector(`a[href*="${myProfile}"]`) !== null;

            if (hasHandle || hasProfileLink) {
                myTweets.push(tweet);
            }
        }

        if (myTweets.length > 0) {
            console.log(`[X Bulk Deleter] Found ${myTweets.length} of your tweet(s).`);
            return [myTweets[myTweets.length - 1]];
        }

        for (let i = tweets.length - 1; i >= 0; i--) {
            const tweet = tweets[i];
            if (tweet.querySelector('[data-testid="caret"]') && tweet.innerText.includes(currentUsername)) {
                console.log('[X Bulk Deleter] Using fallback detection.');
                return [tweet];
            }
        }

        console.log('[X Bulk Deleter] No tweets from you found on this page.');
        return [];
    }

    async function deleteRepliesOnPage() {
        while (true) {
            if (paused) break;

            if (isErrorPage()) {
                console.log('[X Bulk Deleter] Skipping deleted post.');
                break;
            }

            const replies = getMyReplies();
            if (replies.length === 0) break;

            const tweet = replies[0];
            const caret = tweet.querySelector('[data-testid="caret"]') ||
                          tweet.querySelector('button[aria-label*="More"]');
            if (!caret) break;

            caret.click();
            await new Promise(r => setTimeout(r, 550));

            let delBtn = null;
            for (let el of document.querySelectorAll('[role="menuitem"],[role="button"]')) {
                if ((el.innerText || '').toLowerCase().includes('delete')) {
                    delBtn = el; break;
                }
            }
            if (!delBtn) break;

            delBtn.click();
            await new Promise(r => setTimeout(r, 650));

            const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
            if (confirmBtn) confirmBtn.click();
            await new Promise(r => setTimeout(r, 1200));
        }
    }

    function updateUI() {
        const status = document.getElementById('status');
        const progress = document.getElementById('progress');
        const toggle = document.getElementById('toggleBtn');
        const usernameDisplay = document.getElementById('usernameDisplay');

        if (!status || !toggle) return;
        if (progress) progress.textContent = `${currentIndex}/${postList.length || 0}`;

        if (usernameDisplay) {
            if (currentUsername) {
                usernameDisplay.textContent = `Logged in as: @${currentUsername}`;
                usernameDisplay.style.color = '#4ade80';
            } else {
                usernameDisplay.textContent = 'Username not detected';
                usernameDisplay.style.color = '#f87171';
            }
        }

        if (!jsonLoaded) {
            status.textContent = 'Waiting for JSON...';
            toggle.textContent = '▶ Start';
            toggle.style.background = '#22c55e';
            return;
        }

        status.textContent = paused 
            ? `Paused (${currentIndex}/${postList.length})` 
            : 'Running...';
        toggle.textContent = paused ? '▶ Resume' : '⏸ Pause';
        toggle.style.background = paused ? '#22c55e' : '#eab308';
    }

    async function advance() {
        if (paused) return;

        goBackwards ? currentIndex-- : currentIndex++;
        saveState();

        const hasMore = goBackwards ? currentIndex >= 0 : currentIndex < postList.length;

        if (hasMore) {
            await new Promise(r => setTimeout(r, delaySeconds * 1000));
            if (!paused) location.href = postList[currentIndex];
        } else {
            paused = true;
            saveState();
            alert(goBackwards ? 'Reached the beginning.' : 'All done!');
            updateUI();
        }
    }

    async function processPage() {
        if (!isOnPostPage() || paused) return;

        if (isErrorPage()) {
            console.log('[X Bulk Deleter] Post does not exist. Skipping to next...');
            await advance();
            return;
        }

        await deleteRepliesOnPage();
        await advance();
    }

    function createPanel() {
        if (document.getElementById('x-bulk-panel')) return;

        const p = document.createElement('div');
        p.id = 'x-bulk-panel';
        p.style.cssText = 'position:fixed;top:20px;right:20px;width:320px;background:#111827;color:white;padding:14px;border-radius:12px;z-index:999999;font-family:sans-serif;';

        p.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                <b>X Bulk Deleter</b>
                <span id="progress" style="color:#9ca3af;font-size:12px;"></span>
            </div>
            <div style="background:#1f2937;padding:10px;border-radius:8px;margin-bottom:8px;text-align:center;">
                <div id="status">Waiting for JSON...</div>
                <div id="usernameDisplay" style="font-size:11px;margin-top:4px;"></div>
            </div>
            <button id="loadBtn" style="width:100%;padding:9px;margin-bottom:8px;background:#3b82f6;color:white;border:none;border-radius:8px;">Load JSON</button>
            <input type="file" id="fileInput" accept=".json" style="display:none;">
            <button id="toggleBtn" style="width:100%;padding:12px;background:#22c55e;color:black;border:none;border-radius:8px;font-weight:bold;margin-bottom:10px;">▶ Start</button>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                <span style="font-size:12px;">Delay:</span>
                <input type="number" id="delayInput" step="0.5" min="1" style="width:70px;background:#374151;color:white;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">
                <span style="font-size:12px;color:#9ca3af;">sec</span>
            </div>
            <button id="resetBtn" style="width:100%;padding:7px;background:#374151;color:#ccc;border:none;border-radius:6px;font-size:12px;margin-bottom:8px;">Reset Everything</button>
            <label style="font-size:12px;display:flex;align-items:center;gap:6px;color:#9ca3af;margin-bottom:4px;">
                <input type="checkbox" id="reverseCheck"> Go backwards
            </label>
            <label style="font-size:12px;display:flex;align-items:center;gap:6px;color:#9ca3af;">
                <input type="checkbox" id="rememberCheck"> Remember progress after reload
            </label>
        `;
        document.body.appendChild(p);

        p.querySelector('#loadBtn').onclick = () => p.querySelector('#fileInput').click();

        p.querySelector('#fileInput').onchange = e => {
            const f = e.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    let raw = JSON.parse(ev.target.result);
                    postList = raw.map(x => typeof x === 'string' ? x : (x?.url || ''))
                        .filter(u => u.includes('x.com') && u.includes('/status/'));

                    if (postList.length === 0) {
                        alert('No valid post URLs found');
                        return;
                    }
                    currentIndex = goBackwards ? postList.length - 1 : 0;
                    jsonLoaded = true;
                    paused = false;
                    saveState();
                    alert(`Loaded ${postList.length} posts`);
                    updateUI();
                    setTimeout(() => { if (postList.length > 0) location.href = postList[currentIndex]; }, 500);
                } catch {
                    alert('Invalid JSON');
                }
            };
            reader.readAsText(f);
        };

        const toggle = p.querySelector('#toggleBtn');
        toggle.onclick = () => {
            if (!jsonLoaded) { alert('Load JSON first'); return; }
            paused = !paused;
            saveState();
            updateUI();
            if (!paused) {
                if (isOnPostPage()) processPage();
                else if (currentIndex >= 0 && currentIndex < postList.length) location.href = postList[currentIndex];
            }
        };

        const delayInput = p.querySelector('#delayInput');
        delayInput.value = delaySeconds;
        delayInput.onchange = () => { delaySeconds = parseFloat(delayInput.value) || 6; saveState(); };

        const reverseCheck = p.querySelector('#reverseCheck');
        reverseCheck.checked = goBackwards;
        reverseCheck.onchange = () => { goBackwards = reverseCheck.checked; saveState(); };

        p.querySelector('#resetBtn').onclick = () => {
            if (confirm('Reset everything?')) {
                postList = []; currentIndex = 0; jsonLoaded = false; paused = false; goBackwards = false;
                sessionStorage.removeItem('xBulkDeleter');
                GM_deleteValue('bulkDeleter_persistent');
                location.reload();
            }
        };

        const rememberCheck = p.querySelector('#rememberCheck');
        rememberCheck.checked = rememberProgress;
        rememberCheck.onchange = () => {
            rememberProgress = rememberCheck.checked;
            localStorage.setItem('xBulkDeleter_remember', rememberProgress ? 'true' : 'false');
            saveState();
        };
    }

    async function init() {
        loadState();
        currentUsername = await getCurrentUsername();

        if (currentUsername) {
            console.log('%c[X Bulk Deleter] Detected username: @' + currentUsername, 'color:#4ade80');
        } else {
            console.warn('[X Bulk Deleter] Username detection failed after retries.');
        }

        createPanel();
        updateUI();

        if (jsonLoaded && !paused && isOnPostPage()) {
            if (isErrorPage()) {
                console.log('[X Bulk Deleter] Current page is deleted. Skipping...');
                setTimeout(advance, 800);
            } else {
                setTimeout(processPage, 1500);
            }
        }
    }

    init();
})();
