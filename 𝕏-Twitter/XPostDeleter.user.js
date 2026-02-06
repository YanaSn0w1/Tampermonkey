// ==UserScript==
// @name         X Post Deleter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Deletes your posts/replies one by one on /with_replies page. Includes HUD showing successful deletions count, cycle progress, and 15-minute timer starting after first deletion. Stops at 200 deletions and resumes when timer reaches 0.
// @author       YanaHeat
// @match        https://x.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // === CONFIG ===
    const DELETE_DELAY    = 1800;      // ms after successful deletion before next attempt
    const COOLDOWN_TIME   = 15 * 60 * 1000; // 15 minutes in ms
    const MAX_PER_CYCLE   = 200;       // Max deletions before waiting for timer
    const ACTION_DELAY    = 900;       // ms between clicks
    const SCROLL_DELAY    = 3500;      // ms after scroll
    const OFFSET          = -120;      // Negative offset as per original request, but can be adjusted to 0 if scrolling is confusing
    const INIT_POLL       = 2000;

    // === HUD ===
    let hud = null;
    let successCount = 0;
    let cycleCount = 0;
    let cooldownEnd = 0;
    let newCycle = true;

    function createHUD() {
        if (hud) return;
        hud = document.createElement('div');
        hud.style.position = 'fixed';
        hud.style.top = '10px';
        hud.style.right = '10px';
        hud.style.background = 'rgba(0,0,0,0.85)';
        hud.style.color = '#fff';
        hud.style.padding = '12px 16px';
        hud.style.borderRadius = '8px';
        hud.style.fontFamily = 'system-ui, sans-serif';
        hud.style.fontSize = '14px';
        hud.style.zIndex = '999999';
        hud.style.minWidth = '220px';
        hud.style.boxShadow = '0 4px 20px rgba(0,0,0,0.6)';
        hud.style.pointerEvents = 'none';
        hud.innerHTML = `
            <div style="font-weight:bold; margin-bottom:6px;">X Deleter HUD</div>
            <div id="count">Deleted: 0</div>
            <div id="cycle">Cycle: 0/200</div>
            <div id="cooldown" style="color:#ff9800;">Timer: 00:00</div>
        `;
        document.body.appendChild(hud);
    }

    function updateHUD() {
        if (!hud) return;
        hud.querySelector('#count').textContent = `Deleted: ${successCount}`;
        hud.querySelector('#cycle').textContent = `Cycle: ${cycleCount}/${MAX_PER_CYCLE}`;

        const cdEl = hud.querySelector('#cooldown');
        let remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
        if (remaining <= 0) {
            remaining = 0;
        }
        const min = Math.floor(remaining / 60);
        const sec = remaining % 60;
        cdEl.textContent = `Timer: ${min.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
    }

    // Cooldown timer loop
    function startCooldownTimer() {
        const timerInterval = setInterval(() => {
            updateHUD();
            if (cooldownEnd <= Date.now()) {
                clearInterval(timerInterval);
                cycleCount = 0;
                newCycle = true;
                updateHUD();
                mainLoop();
            }
        }, 1000);
    }

    // Username detection
    function getUsername() {
        const path = window.location.pathname;
        if (path.endsWith('/with_replies')) {
            return path.split('/')[1];
        }
        const profile = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
        if (profile && profile.getAttribute('href')) {
            return profile.getAttribute('href').replace('/', '');
        }
        return null;
    }

    // Find next own tweet
    function findNextOwnTweet() {
        const tweets = document.querySelectorAll('article[data-testid="tweet"]');
        for (const t of tweets) {
            if (t.querySelector(`[data-testid*="UserAvatar-Container-${USER}"]`)) {
                return t;
            }
        }
        return null;
    }

    // Scroll to tweet + offset
    function scrollToTweet(tweet) {
        tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => window.scrollBy(0, OFFSET), 400);
    }

    // Attempt to delete one tweet
    function tryDelete(tweet) {
        scrollToTweet(tweet);

        const caret = tweet.querySelector('[data-testid="caret"]');
        if (!caret) {
            console.warn("No caret found → skipping");
            setTimeout(mainLoop, 1200);
            return;
        }

        caret.click();

        setTimeout(() => {
            const menu = document.querySelectorAll('[role="menuitem"]');
            const deleteBtn = Array.from(menu).find(el =>
                el.textContent.includes('Delete') || el.textContent.includes('Delete post')
            );

            if (!deleteBtn) {
                console.warn("Delete option not found → closing menu");
                caret.click();
                setTimeout(mainLoop, 1200);
                return;
            }

            deleteBtn.click();

            setTimeout(() => {
                const confirm = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                if (confirm) {
                    confirm.click();
                    console.log("Delete confirmed");
                    successCount++;
                    cycleCount++;
                    if (newCycle) {
                        cooldownEnd = Date.now() + COOLDOWN_TIME;
                        newCycle = false;
                        console.log("First deletion after pause → 15 min timer reset");
                        startCooldownTimer();
                    }
                    updateHUD();
                    if (cycleCount >= MAX_PER_CYCLE) {
                        console.log(`Hit ${MAX_PER_CYCLE} deletions → waiting for timer to reach 0`);
                        return;
                    }
                    setTimeout(mainLoop, DELETE_DELAY);
                } else {
                    console.error("Confirm button missing → likely rate limit");
                    cooldownEnd = Date.now() + COOLDOWN_TIME;
                    updateHUD();
                    startCooldownTimer();
                }
            }, ACTION_DELAY);
        }, ACTION_DELAY);
    }

    // Main loop
    function mainLoop() {
        if (cooldownEnd > Date.now() && cycleCount >= MAX_PER_CYCLE) {
            updateHUD();
            return; // Timer handles resumption
        }

        const next = findNextOwnTweet();

        if (next) {
            tryDelete(next);
        } else {
            window.scrollTo(0, document.body.scrollHeight);
            setTimeout(mainLoop, SCROLL_DELAY);
        }
    }

    // Start
    let USER = null;
    const init = setInterval(() => {
        USER = getUsername();
        if (USER) {
            clearInterval(init);

            if (!window.location.pathname.endsWith('/with_replies')) {
                window.location.href = `https://x.com/${USER}/with_replies`;
                return;
            }

            createHUD();
            updateHUD();
            console.log(`X Deleter started for @${USER}`);
            mainLoop();
        }
    }, INIT_POLL);
})();
