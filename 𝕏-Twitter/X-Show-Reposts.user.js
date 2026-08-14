// ==UserScript==
// @name         X-Show-Reposts
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  Opens the All tab on every new profile. Skips going from "All" to "Posts" when clicking back.
// @author       you
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let forcedForPath = null;
    let historyStack = [];            // entries: { url, idx }
    let frozen = false;               // hard freeze flag (compose/reply open)
    let navigating = false;           // true while we're jumping via history.go / fallback stepping
    let freezeTimer = null;
    const MAX_STACK = 10;
    const MAX_BACK_STEPS = 15;        // safety cap, fallback path only

    function isProfile() {
        return /^\/[A-Za-z0-9_]+(\/all)?\/?$/.test(location.pathname);
    }

    function isStatusPage() {
        return /\/status\/\d+/.test(location.pathname);
    }

    function isCompose() {
        return location.pathname.includes('/compose/');
    }

    function getBasePath() {
        return location.pathname.replace(/\/all\/?$/, '') || location.pathname;
    }

    function getPostsDropdown() {
        return document.querySelector('a[role="tab"][aria-selected="true"][aria-haspopup="menu"]') ||
               [...document.querySelectorAll('a[role="tab"][aria-haspopup="menu"]')]
                   .find(el => {
                       const t = el.textContent.trim().toLowerCase();
                       return t.includes('posts') || t.includes('all');
                   });
    }

    function normalizeProfileUrl(url) {
        if (!url) return url;
        const match = url.match(/https?:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]+)/);
        if (match) return `https://x.com/${match[1]}/all`;
        return url;
    }

    function currentNormalized() {
        const clean = location.href.split('?')[0];
        return isProfile() ? normalizeProfileUrl(clean) : clean;
    }

    // React Router's browser history implementation (which X's compose/reply
    // modal routing depends on) stamps every entry with history.state — an
    // object usually containing idx/key/usr fields. Capturing the WHOLE object
    // (not just idx) lets us replay it byte-for-byte later.
    function getHistoryState() {
        try {
            return history.state ? JSON.parse(JSON.stringify(history.state)) : null;
        } catch (e) {
            return null;
        }
    }
    function getHistoryIdx() {
        const s = history.state;
        return (s && typeof s.idx === 'number') ? s.idx : null;
    }

    function pushToStack(url) {
        if (!url || frozen || navigating || isCompose()) return;
        let clean = url.split('?')[0];
        if (isProfile()) clean = normalizeProfileUrl(clean);
        const idx = getHistoryIdx();
        const state = getHistoryState();
        const top = historyStack[historyStack.length - 1];
        if (top && top.url === clean) {
            // Same page as last time — refresh the captured state/idx instead of
            // a one-shot capture. If you land on a profile and click back fast
            // (before forceAll's Posts->All switch settles), the FIRST capture
            // can be mid-transition; refreshing on every tick means by the time
            // you actually click back, the stored entry reflects the settled
            // "All" tab state instead of a stale pre-switch snapshot.
            if (idx !== top.idx || JSON.stringify(state) !== JSON.stringify(top.state)) {
                console.log('[Force All][refresh]', { url: clean, idx });
                top.idx = idx;
                top.state = state;
            }
            return;
        }
        console.log('[Force All][push]', { url: clean, idx, path: location.pathname });
        historyStack.push({ url: clean, idx, state });
        if (historyStack.length > MAX_STACK) historyStack.shift();
    }

    // PRIMARY: synthetic jump, same technique as the original script (pushState
    // + manual popstate dispatch — instant, no real navigation, no network
    // fetch), but replaying the EXACT state object that entry had instead of
    // wiping it to {}. Since idx/key/usr are all intact, React Router treats it
    // the same as if you'd genuinely visited that entry, so compose/reply's
    // backgroundLocation resolves correctly — while staying as fast as before.
    async function fastJumpTo(entry) {
        if (!entry || !entry.url) return false;
        navigating = true;
        try {
            const state = entry.state !== undefined && entry.state !== null ? entry.state : {};
            history.pushState(state, '', entry.url);
            window.dispatchEvent(new PopStateEvent('popstate', { state }));
            await new Promise(r => setTimeout(r, 50)); // brief settle, same order as native back
            return true;
        } finally {
            navigating = false;
        }
    }

    // PRIMARY: jump straight to the target's real history index in one atomic
    // history.go(-n) call. A multi-step go() fires a single popstate landing
    // directly on the target entry — no intermediate rendering (no Posts-tab
    // flash), and it's a genuine entry so React Router's own state for it
    // (including whatever backgroundLocation compose/reply modals rely on)
    // comes back intact.
    async function jumpToIdx(targetIdx, targetUrl) {
        const curIdx = getHistoryIdx();
        if (curIdx === null || targetIdx === null) return false;
        const delta = curIdx - targetIdx;
        if (delta <= 0) return false;

        navigating = true;
        showOverlay(); // hide the blank beat while the SPA mounts a route it hasn't rendered recently
        try {
            history.go(-delta);
            // wait for the single popstate + SPA render
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 100));
                if (getHistoryIdx() === targetIdx) {
                    // small settle delay so content has actually painted before reveal
                    await new Promise(r => setTimeout(r, 120));
                    return true;
                }
            }
            // landed somewhere, but not confirmed at targetIdx — accept if URL matches
            if (targetUrl && (currentNormalized() === targetUrl || location.href.split('?')[0] === targetUrl)) {
                await new Promise(r => setTimeout(r, 120));
                return true;
            }
            return false;
        } finally {
            hideOverlay();
            navigating = false;
        }
    }

    // FALLBACK: used only when idx isn't available (e.g. entry predates React
    // Router attaching state, or browser doesn't expose it). Steps one real
    // history.back() at a time, hidden behind an overlay so intermediate
    // entries (like the Posts-tab flash) aren't visible.
    let overlayEl = null;
    function showOverlay() {
        if (overlayEl) return;
        overlayEl = document.createElement('div');
        overlayEl.style.cssText = 'position:fixed; inset:0; z-index:2147483647; background:#000;';
        const bg = getComputedStyle(document.body).backgroundColor;
        if (bg) overlayEl.style.background = bg;
        document.documentElement.appendChild(overlayEl);
    }
    function hideOverlay() {
        if (overlayEl) {
            overlayEl.remove();
            overlayEl = null;
        }
    }

    async function stepBackTo(targetUrl) {
        if (!targetUrl) return false;
        navigating = true;
        showOverlay();
        try {
            for (let i = 0; i < MAX_BACK_STEPS; i++) {
                if (isCompose()) break;
                const before = location.href;
                history.back();
                await new Promise(r => setTimeout(r, 220));
                if (location.href === before) break;
                if (currentNormalized() === targetUrl || location.href.split('?')[0] === targetUrl) {
                    await new Promise(r => setTimeout(r, 150));
                    return true;
                }
            }
            return false;
        } finally {
            hideOverlay();
            navigating = false;
        }
    }

    // LAST RESORT: fake jump via pushState. Breaks router state for any modal
    // opened immediately after, so only used if both jumpToIdx and stepBackTo fail.
    async function forceNavigateTo(url) {
        if (!url || isCompose()) return false;
        try {
            history.pushState({}, '', url);
            window.dispatchEvent(new PopStateEvent('popstate'));
            await new Promise(r => setTimeout(r, 400));
            return true;
        } catch (e) {}

        const a = document.createElement('a');
        a.href = url;
        a.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
        document.body.appendChild(a);
        try {
            a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
            a.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
            a.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        } catch (e) {
            a.click();
        }
        setTimeout(() => a.remove(), 150);
        await new Promise(r => setTimeout(r, 700));
        return true;
    }

    async function goToTarget(entry) {
        // entry: { url, idx, state }
        if (entry.state) {
            const ok = await fastJumpTo(entry);
            if (ok) {
                console.log('[Force All] Back → fast jump →', entry.url);
                return true;
            }
        }
        if (entry.idx !== null && entry.idx !== undefined) {
            const ok = await jumpToIdx(entry.idx, entry.url);
            if (ok) {
                console.log('[Force All] Back → real idx jump →', entry.url);
                return true;
            }
        }
        const stepped = await stepBackTo(entry.url);
        if (stepped) {
            console.log('[Force All] Back → stepped fallback →', entry.url);
            return true;
        }
        console.log('[Force All] Back → pushState fallback →', entry.url);
        return await forceNavigateTo(entry.url);
    }

    function forceAll() {
        if (!isProfile() || frozen || navigating || isCompose()) return;

        const base = getBasePath();
        if (forcedForPath === base) return;

        const trigger = getPostsDropdown();
        if (!trigger) return;

        const text = trigger.textContent.trim().toLowerCase();
        if (text.includes('all')) {
            forcedForPath = base;
            return;
        }
        if (!text.includes('posts')) return;

        const hasContent = document.querySelector('article') ||
                           document.body.innerText.includes('Send a post');
        if (!hasContent) return;

        console.log('[Force All] Switching to All');
        forcedForPath = base;

        trigger.click();

        let tries = 0;
        const id = setInterval(() => {
            const allItem = [...document.querySelectorAll('div[role="menuitem"]')]
                .find(el => el.textContent.trim() === 'All');
            if (allItem) {
                allItem.click();
                clearInterval(id);
            }
            if (++tries > 12) clearInterval(id);
        }, 40);
    }

    // Freeze / unfreeze logic
    function updateFreeze() {
        if (isCompose()) {
            frozen = true;
            if (freezeTimer) clearTimeout(freezeTimer);
            // keep frozen for 2 seconds after leaving /compose/
            freezeTimer = setTimeout(() => {
                if (!isCompose()) frozen = false;
            }, 2000);
        }
    }

    const updateStack = () => {
        if (frozen || navigating || isCompose()) return;
        if (isProfile() || isStatusPage()) {
            pushToStack(location.href);
        }
    };

    document.addEventListener('click', async (e) => {
        if (navigating || isCompose()) return; // frozen intentionally NOT checked here —
        // frozen's 2s post-compose cooldown is meant to pause background tracking
        // (pushToStack/forceAll), not to disable back-button interception. Bailing
        // on frozen here was why closing a reply box and hitting back quickly
        // fell through to native (unintercepted) back -> landed on Posts tab.

        const backBtn = e.target.closest('button[data-testid="app-bar-back"], button[aria-label="Back"]');
        if (!backBtn) return;

        const current = location.href.split('?')[0];
        const currentNorm = normalizeProfileUrl(current);
        console.log('[Force All][back-click]', { current, currentNorm, stack: historyStack.map(e => e.url) });
        if (historyStack.length &&
            (historyStack[historyStack.length - 1].url === current ||
             historyStack[historyStack.length - 1].url === currentNorm)) {
            historyStack.pop();
        }

        if (historyStack.length > 0) {
            const entry = historyStack.pop();
            console.log('[Force All][back-target]', entry);
            e.preventDefault();
            e.stopImmediatePropagation();
            await goToTarget(entry);
        }
    }, true);

    const check = () => {
        updateFreeze();
        if (frozen || navigating || isCompose()) return;

        updateStack();
        if (location.pathname !== forcedForPath && !location.pathname.endsWith('/all')) {
            forcedForPath = null;
        }
        forceAll();
    };

    new MutationObserver(check).observe(document.body, { childList: true, subtree: true, attributes: true });
    setInterval(check, 600);

    const origPush = history.pushState;
    history.pushState = function() {
        origPush.apply(this, arguments);
        setTimeout(check, 200);
    };

    window.addEventListener('popstate', () => {
        setTimeout(check, 200);
    });
})();
