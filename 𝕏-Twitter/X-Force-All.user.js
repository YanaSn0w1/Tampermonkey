// ==UserScript==
// @name         X-Force-All
// @namespace    http://tampermonkey.net/
// @version      6.7
// @description  Force All + Back prefers /all and skips plain Posts
// @author       you
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let forcedForPath = null;
    let historyStack = [];
    const MAX_STACK = 10;

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

    function normalizeProfileUrl(url) {
        // Always prefer the /all version for profiles
        if (!url) return url;
        const match = url.match(/https?:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]+)/);
        if (match) {
            return `https://x.com/${match[1]}/all`;
        }
        return url;
    }

    function pushToStack(url) {
        if (!url) return;
        let clean = url.split('?')[0];
        if (isProfile()) {
            clean = normalizeProfileUrl(clean);
        }
        if (historyStack[historyStack.length - 1] === clean) return;
        historyStack.push(clean);
        if (historyStack.length > MAX_STACK) historyStack.shift();
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

    const updateStack = () => {
        if (isProfile() || isStatusPage()) {
            pushToStack(location.href);
        }
    };

    document.addEventListener('click', async (e) => {
        const backBtn = e.target.closest('button[data-testid="app-bar-back"], button[aria-label="Back"]');
        if (!backBtn) return;

        // Pop current page
        const current = location.href.split('?')[0];
        if (historyStack.length && (historyStack[historyStack.length - 1] === current || 
            historyStack[historyStack.length - 1] === normalizeProfileUrl(current))) {
            historyStack.pop();
        }

        if (historyStack.length > 0) {
            let target = historyStack.pop();
            // Force profile targets to /all
            if (/^https?:\/\/(?:x|twitter)\.com\/[A-Za-z0-9_]+\/?$/.test(target)) {
                target = normalizeProfileUrl(target);
            }
            console.log('[Force All] Back →', target);
            e.preventDefault();
            e.stopImmediatePropagation();
            await navigateTo(target);
        }
    }, true);

    const check = () => {
        updateStack();
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
