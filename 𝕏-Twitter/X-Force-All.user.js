// ==UserScript==
// @name         X-Force-All
// @namespace    http://tampermonkey.net/
// @version      3.6.2
// @description  Force All + reliable extra back
// @author       you
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let forcedForPath = null;
    let needsExtraBack = false;
    let lastForcedTime = 0;

    function isProfile() {
        return /^\/[A-Za-z0-9_]+(\/all)?\/?$/.test(location.pathname);
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

    function forceAll() {
        if (!isProfile()) return;

        const base = getBasePath();
        if (forcedForPath === base) return;

        const trigger = getPostsDropdown();
        if (!trigger) return;

        const text = trigger.textContent.trim().toLowerCase();

        if (text.includes('all')) {
            forcedForPath = base;
            if (location.pathname.endsWith('/all')) {
                history.replaceState(null, '', base);
            }
            return;
        }

        if (!text.includes('posts')) return;

        const hasContent = document.querySelector('article') ||
                           document.body.innerText.includes('Send a post') ||
                           document.querySelector('[data-testid="emptyState"]');
        if (!hasContent) return;

        console.log('[Force All] Switching Posts → All');
        forcedForPath = base;
        needsExtraBack = true;
        lastForcedTime = Date.now();

        trigger.click();

        const tryClick = () => {
            const menu = document.querySelector('div[role="menu"]');
            if (!menu) return false;
            const allItem = [...menu.querySelectorAll('div[role="menuitem"]')]
                .find(el => el.textContent.trim() === 'All');
            if (allItem) {
                allItem.click();
                setTimeout(() => {
                    if (location.pathname.endsWith('/all')) {
                        history.replaceState(null, '', base);
                    }
                }, 50);
                return true;
            }
            return false;
        };

        let tries = 0;
        const id = setInterval(() => {
            tries++;
            if (tryClick() || tries > 12) clearInterval(id);
        }, 40);
    }

    window.addEventListener('popstate', () => {
        if (needsExtraBack && (Date.now() - lastForcedTime < 12000)) {
            console.log('[Force All] Doing extra back');
            needsExtraBack = false;
            setTimeout(() => history.back(), 10);
        }
        setTimeout(forceAll, 300);
        setTimeout(forceAll, 900);
    });

    const check = () => {
        if (!location.pathname.endsWith('/all') && location.pathname !== forcedForPath) {
            forcedForPath = null;
        }
        forceAll();
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    setInterval(check, 800);

    const origPush = history.pushState;
    history.pushState = function() {
        origPush.apply(this, arguments);
        setTimeout(check, 250);
        setTimeout(check, 900);
    };
})();
