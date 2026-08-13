// ==UserScript==
// @name         X-Force-All
// @namespace    http://tampermonkey.net/
// @version      6.4
// @description  Force All + correct back chain (no stale navigation entry)
// @author       you
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let forcedForPath = null;
    let lastStatusUrl = null;
    let lastProfileUrl = null;
    let usedInitialReferrer = false;

    function isProfile() {
        return /^\/[A-Za-z0-9_]+(\/all)?\/?$/.test(location.pathname);
    }

    function isStatusPage() {
        return /\/status\/\d+/.test(location.pathname);
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

    async function navigateTo(url) {
        if (!url) return false;
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

    function forceAll() {
        if (!isProfile()) return;

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
                           document.body.innerText.includes('Send a post') ||
                           document.querySelector('[data-testid="emptyState"]');
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

    // Clean memory update — NO performance.navigation, NO overwriting
    const updateMemory = () => {
        if (isStatusPage()) {
            lastStatusUrl = location.href;

            // Only use document.referrer ONCE on real page load
            if (!usedInitialReferrer) {
                usedInitialReferrer = true;
                const prev = document.referrer;
                if (prev && !lastProfileUrl) {
                    try {
                        const u = new URL(prev);
                        if ((u.hostname.endsWith('x.com') || u.hostname.endsWith('twitter.com')) &&
                            /^\/[A-Za-z0-9_]+\/?$/.test(u.pathname)) {
                            lastProfileUrl = u.origin + u.pathname.replace(/\/$/, '');
                            console.log('[Force All] Origin set from referrer:', lastProfileUrl);
                        }
                    } catch (e) {}
                }
            }
        }

        // Capture profile on click / navigation (this is the reliable source)
        if (isProfile() && !lastProfileUrl) {
            lastProfileUrl = location.href.split('?')[0];
        }
    };

    // Back button handling
    document.addEventListener('click', async (e) => {
        const backBtn = e.target.closest('button[data-testid="app-bar-back"], button[aria-label="Back"]');
        if (!backBtn) return;

        // Profile → last post
        if (isProfile() && lastStatusUrl) {
            console.log('[Force All] Profile → last post');
            e.preventDefault();
            e.stopImmediatePropagation();
            const url = lastStatusUrl;
            lastStatusUrl = null;
            await navigateTo(url);
            return;
        }

        // Post → original profile
        if (isStatusPage() && lastProfileUrl) {
            console.log('[Force All] Post → original profile');
            e.preventDefault();
            e.stopImmediatePropagation();
            await navigateTo(lastProfileUrl);
            return;
        }
    }, true);

    const check = () => {
        updateMemory();
        if (location.pathname !== forcedForPath && !location.pathname.endsWith('/all')) {
            forcedForPath = null;
        }
        forceAll();
    };

    new MutationObserver(check).observe(document.body, { childList: true, subtree: true, attributes: true });
    setInterval(check, 700);

    const origPush = history.pushState;
    history.pushState = function() {
        origPush.apply(this, arguments);
        setTimeout(check, 200);
        setTimeout(check, 600);
    };

    window.addEventListener('popstate', () => {
        setTimeout(check, 200);
        setTimeout(check, 600);
    });
})();
