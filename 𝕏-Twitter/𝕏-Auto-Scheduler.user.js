// ==UserScript==
// @name         X-Auto-Scheduler
// @namespace    http://tampermonkey.net/
// @version      1.17
// @description  Auto-Scheduler for X.
// @author       YanaHeat
// @match        https://x.com/*
// @match        https://x.com/compose*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// ==/UserScript==

(async function() {
    'use strict';

    // Add 3-second delay at start
    await wait(3000);

    async function wait(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    async function waitForProfileLink() {
        while (true) {
            const link = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
            if (link) return link;
            await wait(200);
        }
    }

    const profileLink = await waitForProfileLink();
    let href = profileLink.getAttribute('href') || '';
    href = href.replace(/^\/+/, '').replace(/\/+$/, '');
    if (href.startsWith('@')) href = href.slice(1);
    let currentUsername = href;

    const storagePrefix = currentUsername ? `xSched_${currentUsername}_` : 'xSched_anon_';

    const modes = {
        'Flirty': {
            phrases: [
                "Can't stop thinking about you.", "You make my heart race.", "Dreaming of your smile.", "Missing your touch.", "You're my favorite distraction.",
                "Let's make some memories.", "You're so irresistible.", "Feeling flirty today.", "You're on my mind.", "Send me a kiss.",
                "Your smile is my favorite.", "You make me blush.", "Can't wait to see you.", "You're too cute.", "Kissing you in my dreams.",
                "You light up my day.", "Be mine?", "Flirting with you is fun.", "You're adorable.", "Love your vibe.",
                "You're still drawing my attention.", "I wish I was your mirror.",
                "I need a pick me up.",
                "I'm feeling strong.", "Wanna be my little spoon?", "Can I warm you up?",
                "Your smile is my new happy place.", "Messy sheets and morning coffees. Hi!", "You looked hot last night.",
                "If pretty was a content category you'd be trending."
            ],
            actions: [
                "put me in a bikini",
                "draw me as a superhero",
                "do me on the beach",
                "show me in a sexy dress",
                "do me smiling",
                "put me in lingerie",
                "do me as a teacher",
                "do me by the pool",
                "put me in space",
                "make me black",
                "put me in a swimsuit",
                "make me gay",
                "make me latino",
                "imagine me sunbathing",
                "show me on mars"
            ],
            closers: ["xoxo", "kisses", "yours", "love", "dear", "hugs", "sweetie", "darling", "babe", "hun"],
            morningEmojis: ["💕", "❤️", "😘", "😍", "🌹", "😊", "💋", "🥰", "💖", "😊"],
            afternoonEmojis: ["🔥", "💦", "😎", "💋", "🌹", "😘", "💖", "🥰", "😍", "🌞"],
            eveningNightEmojis: ["🌙", "💋", "🥂", "😘", "💖", "🥰", "🌌", "⭐", "🤍", "😍"]
        },

        'Boost': {
            phrases: [
                "Just say Hello. Gain 59+ Grinders",
                "Just say Hi. Gain 39 +",
                "Drop a reply. Gain 101 + Actives",
                "Turn on my notifications for huge gains.",
                "Any active accounts?",
                "Grow 101+ Organics",
                "Let's Gain 87+ actives.",
                "Who needs 500 plus actives?",
                "We will connect fast",
                "Gain 200 plus easy!",
                "Say Hi, we connect you instantly",
                "God bless reply guys",
                "Thank you God for the boost",
                "Thank you God for Consistency",
                "TY God, appreciate the foll0w.",
                "Can we b00st you?",
                "I follow from the RT section.",
                "Support small accounts",
                "Gain Train",
                "We’ll help you reach 10k+",
                "Looking to grow your handle?",
                "Normalize supporting Small Accounts",
                "Keep on crankin' massive gains.",
                "If you see this, kindly repost.",

                "Drop a Hi, gain 77+ actives",
                "Active crew, check in",
                "Let’s run gains today",
                "Push for 150+ actives",
                "Who’s boosting today?",
                "Engage for clean gains",
                "Run it up, gain style",
                "Small accounts matter",
                "Boost wave incoming",
                "Let’s spark 200+ reach",
                "Reply once, gain plenty",
                "Organic gains only",
                "Keep the gains rolling",
                "Big energy, big gains",
                "Actives check‑in time",
                "Push your reach today",
                "Let’s build momentum",
                "Drop a word, gain more",
                "Steady gains all day",
                "Boost mode activated"
            ],
            closers: ["fam", "crew", "squad", "grinders", "actives", "team", "legends", "boosters", "gains", "network"],
            morningEmojis: ["🚀", "💪", "🚂", "☕", "💚", "🌟", "⚡", "🔥", "✅", "🏆"],
            afternoonEmojis: ["💥", "⚡", "🚀", "🔥", "🏆", "💪", "👍", "✅", "🎉", "🤩"],
            eveningNightEmojis: ["👍", "⭐", "💎", "🏆", "✅", "💪", "🌌", "✨", "🥇", "🔥"]
        },

        'Crypto': {
            phrases: [
                "Builders", "Peeps", "Fam", "Frens", "Fren", "Crew", "Squad", "Tribe", "Network",
                "Allies", "Partners", "Supporters", "Connections", "Circle", "Group", "Let's network",
                "Connect with me", "Let's engage", "Whats the ticker?",

                "Drop your ticker",
                "Share your alpha",
                "Who’s building today?",
                "Builders tap in",
                "On‑chain crew here",
                "Web3 fam check in",
                "Show your chart",
                "What are you building?",
                "Roll call for builders",
                "Any new projects today?"
            ],
            closers: ["fren", "fam", "builders", "degens", "hodlers", "traders", "web3", "onchain", "crypto", "alpha"],
            morningEmojis: ["💰", "📈", "🚀", "💎", "🪙", "🌅", "☕", "✨", "🔥", "⚡"],
            afternoonEmojis: ["💥", "📊", "🚀", "💰", "🪙", "💎", "🌞", "🔥", "⚡", "📈"],
            eveningNightEmojis: ["🌙", "💎", "📈", "💰", "🪙", "🌌", "⭐", "🚀", "🔥", "✨"]
        },

        'Pro': {
            phrases: [
                "Everyone", "Friends", "Friend", "Colleagues", "Team", "Community", "Partners", "Network",
                "Let's connect", "Drop a hi", "Say hello", "Follow along", "Let's vibe", "Let's chat",
                "Hit reply", "Tag a friend", "Reply below",

                "Share your thoughts",
                "Join the conversation",
                "Let’s keep learning",
                "Stay inspired",
                "Keep growing",
                "Add your take",
                "What do you think?",
                "Chime in",
                "Your turn"
            ],
            closers: ["everyone", "friends", "fam", "team", "world", "all", "you", "folks", "peeps", "crew"],
            morningEmojis: ["☕", "🌅", "😊", "🌻", "✨", "🌟", "🙏", "🌞", "🕊️", "🌈"],
            afternoonEmojis: ["🌤️", "🕒", "🍽️", "😎", "🌳", "☀️", "⚡", "🌈", "💥", "🌬️"],
            eveningNightEmojis: ["🌙", "💎", "📈", "🌆", "✨", "🌌", "⭐", "🤍", "🥰", "🌉"]
        },

        'Cute': {
            phrases: [
                "Little bean", "Tiny panda", "Sweet bunny", "Happy puppy", "Sleepy kitten",
                "Tiny sprout", "Soft peach", "Berry sweet", "Sweet muffin", "Cookie crumb",
                "Cherry drop", "Petal heart", "Poppy bloom", "Daisy face", "Lucky clover",
                "Soft sparkle", "Little bubble", "Tiny nugget", "Cute button", "Shining star"
            ],
            closers: ["aww", "cutie", "sweetie", "adorable", "precious", "tiny", "fluffy", "bubbly", "sparkly", "happy"],
            morningEmojis: ["🌸", "🐣", "☀️", "🐻", "🐰", "🍓", "😊", "🌼", "✨", "🧸"],
            afternoonEmojis: ["🌤️", "🐱", "🐶", "🍉", "🍪", "🌈", "😄", "🫧", "💖", "🌻"],
            eveningNightEmojis: ["🌙", "🧸", "⭐", "🌌", "🐱", "🐰", "💤", "✨", "🤍", "🌟"]
        },

        'Zen': {
            phrases: [
                "Stay calm", "Stay soft", "Breathe easy", "Find your center", "Stay grounded",
                "Move gently", "Stay present", "Keep it light", "Soft focus", "Quiet mind",
                "Gentle pace", "Slow and steady", "Calm energy", "Soft landing", "Peaceful night",
                "Easy morning", "Soft reset", "Quiet moment", "Steady heart", "Calm and clear"
            ],
            closers: ["peace", "zen", "breathe", "flow", "balance", "serene", "calm", "gentle", "present", "grounded"],
            morningEmojis: ["🌅", "☕", "🧘", "🍃", "🌿", "🌞", "🕊️", "💧", "✨", "🌻"],
            afternoonEmojis: ["🌤️", "🍃", "🌳", "🧘", "💭", "☀️", "🌈", "💧", "✨", "😌"],
            eveningNightEmojis: ["🌙", "🧘", "🌌", "⭐", "🕯️", "💤", "🍃", "🤍", "✨", "🌊"]
        },

        'Hype': {
            phrases: [
                "Full send", "Big energy", "We go again", "Run it up", "Locked in",
                "All gas", "No brakes", "Max volume", "Turn it up", "We move",
                "No limits", "All in", "Let’s cook", "Turn the dial", "Push the line",
                "No slowing down", "Keep it rolling", "Stay loud", "Stay winning", "We’re live"
            ],
            closers: ["let's go", "no cap", "vibes", "energy", "hype", "win", "grind", "push", "move", "live"],
            morningEmojis: ["⚡", "🔥", "🚀", "🌞", "💪", "🏁", "🎧", "🌟", "✅", "🏆"],
            afternoonEmojis: ["💥", "🔥", "🚀", "⚡", "😎", "🏆", "🎉", "📈", "🤘", "⭐"],
            eveningNightEmojis: ["🌙", "🔥", "🌌", "⭐", "⚡", "🏆", "🎇", "🎆", "💣", "🚀"]
        },

        'Sports': {
            phrases: [
                "Game day", "All I do is win", "Winners never quit", "Refuse to lose", "Dream big work harder",
                "Hard days make champions", "Let's get ready to rumble", "Whatever it takes", "Fast and furious",
                "Born to win", "No excuses", "Push limits", "Team strong", "Victory mode", "Rise and grind",
                "Champions mindset", "Go hard or go home", "Unstoppable force", "Dominate the field", "Epic comeback"
            ],
            closers: ["team", "champ", "victory", "grind", "hustle", "win", "play", "score", "dominate", "legend"],
            morningEmojis: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏆", "🥇", "🔥", "⚡", "💪", "🏒", "🥅", "🏁", "👟", "☕"],
            afternoonEmojis: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏆", "🥇", "🔥", "⚡", "💪", "🏒", "🥅", "🏁", "👟", "☀️"],
            eveningNightEmojis: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏆", "🥇", "🔥", "⚡", "💪", "🏒", "🥅", "🏁", "👟", "⭐"]
        },

        'Greetings': {
            phrases: [
                "Have an amazing day", "Stay positive", "Rise and shine", "Make it count", "Embrace the day",
                "Keep smiling", "Be kind", "Chase dreams", "Enjoy the moment", "Spread joy"
            ],
            closers: ["Stay Blessed", "You got this", "Keep going", "All the best", "Shine bright", "Be awesome", "Stay strong", "Have fun", "Peace out", "Take care"],
            morningEmojis: ["☕", "🌅", "😊", "🌻", "✨", "🌟", "🙏", "🌞", "🕊️", "🌈"],
            afternoonEmojis: ["🌤️", "🕒", "🍽️", "😎", "🌳", "☀️", "⚡", "🌈", "💥", "🌬️"],
            eveningNightEmojis: ["🌙", "💎", "📈", "🌆", "✨", "🌌", "⭐", "🤍", "🥰", "🌉"]
        }
    };

    const accountConfigs = {
        'YanaHeat': {
            closersExtras: ["Legend", "Love"],
            morningEmojisExtras: ["🖌️", "🦁"],
            afternoonEmojisExtras: ["🪭", "💬"],
            eveningNightEmojisExtras: ["🐐", "🕔"]
        },
        'YanaSn0w1': {
            closersExtras: ["Legend", "Love"],
            morningEmojisExtras: ["🎨", "🌞"],
            afternoonEmojisExtras: ["⚡", "🌈"],
            eveningNightEmojisExtras: ["🌌", "🥰"]
        },
        'YanaFan01': {
            closersExtras: ["Legend", "Love"],
            morningEmojisExtras: ["🫶🏻", "🍑", "🌮"],
            afternoonEmojisExtras: ["🌻", "💦", "🐪"],
            eveningNightEmojisExtras: ["🌆", "✨", "🍸"]
        },
        'YanaFan02': {
            closersExtras: ["Legend"],
            morningEmojisExtras: ["⚔️", "😊", "🌐"],
            afternoonEmojisExtras: ["🤔", "🎉", "💬"],
            eveningNightEmojisExtras: ["💜", "🙏", "🏆"]
        },
        'YanaFan03': {
            closersExtras: ["Legend"],
            morningEmojisExtras: ["🌅", "🌞", "😘"],
            afternoonEmojisExtras: ["😍", "❤️", "🌅"],
            eveningNightEmojisExtras: ["🌆", "🌉", "🌙"]
        },
        'YanaFan04': {
            closersExtras: ["Legend"],
            morningEmojisExtras: ["🌅", "🌞", "😘"],
            afternoonEmojisExtras: ["😍", "❤️", "🌅"],
            eveningNightEmojisExtras: ["🌆", "🌉", "🌙"]
        }
        // Add more accounts here as needed
    };

    function getAccountConfig(username) {
        if (!username) return {};
        const unameNorm = username.toLowerCase();
        for (const key of Object.keys(accountConfigs)) {
            if (key.toLowerCase() === unameNorm) return accountConfigs[key];
        }
        return {};
    }

    const defaults = {
        mode: 'Flirty', // Changed default to Flirty as per context
        startDate: new Date().toISOString().split('T')[0],
        startTime: '20:59',
        intervalHours: 2,
        intervalMins: 30,
        maxEmojis: 'random',
        regenerateOnAuto: true,
        includePhrases: true,
        paragraphFormat: true,
        messages: []
    };

    const resolvedAccountConfig = getAccountConfig(currentUsername);

    let mode = GM_getValue(storagePrefix + 'mode', defaults.mode);
    let phrases = modes[mode].phrases.concat(resolvedAccountConfig.phrasesExtras || []);
    let actions = modes[mode].actions || [];
    let closers = modes[mode].closers.concat(resolvedAccountConfig.closersExtras || []);
    let morningEmojis = modes[mode].morningEmojis.concat(resolvedAccountConfig.morningEmojisExtras || []);
    let afternoonEmojis = modes[mode].afternoonEmojis.concat(resolvedAccountConfig.afternoonEmojisExtras || []);
    let eveningNightEmojis = modes[mode].eveningNightEmojis.concat(resolvedAccountConfig.eveningNightEmojisExtras || []);

    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const interval = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearInterval(interval);
                    resolve(el);
                } else if (Date.now() - start > timeout) {
                    clearInterval(interval);
                    reject(`Timeout waiting for ${selector}`);
                }
            }, 100);
        });
    }

    async function injectText(editor, text) {
        if (typeof text !== 'string' || !text.trim()) return false;
        if (!editor) return false;

        editor.focus();

        // Clear editor deterministically with retries
        let tries = 0;
        while (editor.textContent.trim() && tries < 3) {
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            await wait(150);
            tries++;
        }

        // Trigger real paste event without writing to clipboard
        const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: new DataTransfer()
        });
        pasteEvent.clipboardData.setData("text/plain", text);

        editor.dispatchEvent(pasteEvent);

        await wait(1000);

        // Verify insertion
        let inserted = editor.textContent.includes(text.slice(0, Math.min(3, text.length)));
        if (!inserted) {
            // Retry
            editor.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            const retryPasteEvent = new ClipboardEvent("paste", {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            });
            retryPasteEvent.clipboardData.setData("text/plain", text);
            editor.dispatchEvent(retryPasteEvent);
            await wait(1000);
            inserted = editor.textContent.includes(text.slice(0, Math.min(3, text.length)));
        }

        // Dispatch events to notify X that content changed
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        editor.dispatchEvent(new Event('keydown', { bubbles: true }));
        editor.dispatchEvent(new Event('keyup', { bubbles: true }));

        editor.blur();

        return inserted;
    }

    async function closeModal() {
        try {
            const closeButton = document.querySelector('[data-testid="app-bar-close"]');
            if (closeButton) {
                closeButton.click();
                await wait(500);
            }
        } catch (e) {
            console.error('Error closing modal:', e);
        }
    }

    function getLocalDateStr() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function computeScheduleTimes(startDateStr, startTimeStr, intervalHours, intervalMins, numPosts) {
        if (!startDateStr || !startTimeStr || numPosts === 0) return [];
        let start = new Date(`${startDateStr}T${startTimeStr}:00`);
        if (isNaN(start.getTime())) return [];

        const now = new Date();
        const bufferMs = 10 * 60 * 1000; // 10 minutes buffer
        if (start.getTime() < now.getTime() + bufferMs) {
            start.setTime(start.getTime() + 24 * 60 * 60 * 1000);
        }

        const intervalMs = (intervalHours * 60 + intervalMins) * 60 * 1000;
        if (intervalMs === 0) {
            return [];
        }
        const times = [];
        for (let i = 0; i < numPosts; i++) {
            const t = new Date(start.getTime() + i * intervalMs);
            times.push(t);
        }
        return times;
    }

    async function schedulePost(targetTime, text) {
        try {
            await closeModal();

            const newPostButton = await waitForElement('[data-testid="SideNav_NewTweet_Button"], [data-testid="SideNav_NewPost_Button"]');
            newPostButton.click();

            await wait(1000);

            const scheduleOption = await waitForElement('[data-testid="scheduleOption"]');
            scheduleOption.click();

            await wait(1000);

            const yearStr = targetTime.getFullYear().toString();
            const monthStr = (targetTime.getMonth() + 1).toString();
            const dayStr = targetTime.getDate().toString();
            const hour = targetTime.getHours();
            const minuteStr = targetTime.getMinutes().toString();

            const dateInput = await waitForElement('input[type="date"]');
            dateInput.value = `${yearStr}-${monthStr.padStart(2, '0')}-${dayStr.padStart(2, '0')}`;
            dateInput.dispatchEvent(new Event('change', { bubbles: true }));

            await wait(500);

            const dateGroup = await waitForElement('[aria-label="Date"]');
            const dateSelects = dateGroup.querySelectorAll('select');

            if (dateSelects.length === 3) {
                let monthSelect, daySelect, yearSelect;
                dateSelects.forEach(select => {
                    const labelId = select.getAttribute('aria-labelledby');
                    if (labelId) {
                        const label = document.getElementById(labelId);
                        if (label) {
                            const text = label.textContent.toLowerCase();
                            if (text.includes('month')) monthSelect = select;
                            else if (text.includes('day')) daySelect = select;
                            else if (text.includes('year')) yearSelect = select;
                        }
                    }
                });
                if (!monthSelect || !daySelect || !yearSelect) {
                    monthSelect = dateSelects[0];
                    daySelect = dateSelects[1];
                    yearSelect = dateSelects[2];
                }

                yearSelect.value = yearStr;
                yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
                await wait(200);

                monthSelect.value = monthStr;
                monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
                await wait(200);

                daySelect.value = dayStr;
                daySelect.dispatchEvent(new Event('change', { bubbles: true }));
                await wait(200);
            }

            await wait(500);

            const timeGroup = await waitForElement('[aria-label="Time"]');
            const timeSelects = timeGroup.querySelectorAll('select');

            let hourSelect, minuteSelect, ampmSelect;
            timeSelects.forEach(select => {
                const labelId = select.getAttribute('aria-labelledby');
                if (labelId) {
                    const label = document.getElementById(labelId);
                    if (label) {
                        const text = label.textContent.toLowerCase();
                        if (text.includes('hour')) hourSelect = select;
                        else if (text.includes('minute')) minuteSelect = select;
                        else if (text.includes('am') || text.includes('pm')) ampmSelect = select;
                    }
                }
            });

            if (ampmSelect) {
                let hour12 = hour % 12;
                if (hour12 === 0) hour12 = 12;
                const hour12Str = hour12.toString();
                const ampm = hour < 12 ? 'am' : 'pm';

                if (hourSelect) {
                    hourSelect.value = hour12Str;
                    hourSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    await wait(200);
                }
                if (minuteSelect) {
                    minuteSelect.value = minuteStr;
                    minuteSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    await wait(200);
                }
                if (ampmSelect) {
                    ampmSelect.value = ampm;
                    ampmSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    await wait(200);
                }
            } else {
                const hour24Str = hour.toString();

                if (hourSelect) {
                    hourSelect.value = hour24Str;
                    hourSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    await wait(200);
                }
                if (minuteSelect) {
                    minuteSelect.value = minuteStr;
                    minuteSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    await wait(200);
                }
            }

            const confirmButton = await waitForElement('[data-testid="scheduledConfirmationPrimaryAction"]:not([disabled])');
            confirmButton.click();

            await wait(1000);

            const editor = await waitForElement('[data-testid="tweetTextarea_0"]');
            const success = await injectText(editor, text);
            if (!success) {
                console.log('Failed to insert text for:', text);
                await closeModal();
                return false;
            }

            await wait(1000);

            const scheduleButton = await waitForElement('[data-testid="tweetButton"]:not([disabled])');
            scheduleButton.click();

            await wait(2000);

            return true;
        } catch (e) {
            console.error('Error scheduling post:', e);
            await closeModal();
            return false;
        }
    }

    async function openScheduledView() {
        try {
            await closeModal();

            const newPostButton = await waitForElement('[data-testid="SideNav_NewTweet_Button"], [data-testid="SideNav_NewPost_Button"]');
            newPostButton.click();
            await wait(1000);

            const scheduleOption = await waitForElement('[data-testid="scheduleOption"]');
            scheduleOption.click();
            await wait(1000);

            let schedBtn;
            const buttons = document.querySelectorAll('button');
            for (let btn of buttons) {
                if (btn.textContent.includes('Scheduled posts')) {
                    schedBtn = btn;
                    break;
                }
            }
            if (!schedBtn) {
                console.log('Could not find "Scheduled posts" button.');
                await closeModal();
                return;
            }
            schedBtn.click();
            await wait(1000);

        } catch (e) {
            console.error('Error opening scheduled view:', e);
            await closeModal();
        }
    }

    async function getScheduledInfo(logArea, dontClose = false) {
        try {
            await closeModal();

            const newPostButton = await waitForElement('[data-testid="SideNav_NewTweet_Button"], [data-testid="SideNav_NewPost_Button"]');
            newPostButton.click();
            await wait(1000);

            const scheduleOption = await waitForElement('[data-testid="scheduleOption"]');
            scheduleOption.click();
            await wait(1000);

            let schedBtn;
            const buttons = document.querySelectorAll('button');
            for (let btn of buttons) {
                if (btn.textContent.includes('Scheduled posts')) {
                    schedBtn = btn;
                    break;
                }
            }
            if (!schedBtn) {
                logArea.innerHTML += 'Could not find "Scheduled posts" button.<br>';
                await closeModal();
                return {count: 0, latestTime: null};
            }
            schedBtn.click();
            await wait(1000);

            const emptyState = document.querySelector('[data-testid="emptyState"]');
            let count = 0;
            let latestTime = null;
            if (emptyState) {
                logArea.innerHTML += 'Scheduled queue is empty.<br>';
            } else {
                const posts = document.querySelectorAll('[data-testid="unsentTweet"]');
                count = posts.length;
                logArea.innerHTML += `Scheduled posts count: ${count}<br>`;
                if (count >= 100) {
                    logArea.innerHTML += '<span style="color:red;">Warning: Queue may be approaching practical limits (100+ reported in some tools).</span><br>';
                }
                let maxTime = 0;
                posts.forEach(post => {
                    const timeEls = post.querySelectorAll('span');
                    for (let el of timeEls) {
                        if (el.textContent.includes('Will send on')) {
                            const match = el.textContent.match(/ \w{3}, (\w{3})\.? (\d+), (\d{4}) at (\d+):(\d+) (\wM)/);
                            if (match) {
                                const [_, month, day, year, hour, min, ampm] = match;
                                const dateStr = `${month} ${day}, ${year} ${hour}:${min} ${ampm}`;
                                const postTime = new Date(dateStr).getTime();
                                if (!isNaN(postTime) && postTime > maxTime) maxTime = postTime;
                            }
                            break;
                        }
                    }
                });
                if (maxTime > 0) {
                    latestTime = maxTime;
                    logArea.innerHTML += `Latest scheduled post at: ${new Date(latestTime).toLocaleString()}<br>`;
                } else {
                    logArea.innerHTML += 'Could not parse scheduled times.<br>';
                }
            }

            if (!dontClose) {
                await closeModal();
            }
            return {count, latestTime};
        } catch (e) {
            console.error('Error checking scheduled info:', e);
            await closeModal();
            logArea.innerHTML += 'Error checking queue.<br>';
            return {count: 0, latestTime: null};
        }
    }

    async function generateRandomMessages() {
        const groups = [
            {timeGreeting: "Good morning", emojiPool: morningEmojis, count: 2},
            {timeGreeting: "Good afternoon", emojiPool: afternoonEmojis, count: 2},
            {timeGreeting: "Good evening", emojiPool: eveningNightEmojis, count: 2},
            {timeGreeting: "Good night", emojiPool: eveningNightEmojis, count: 2}
        ];
        const salutations = ["Hey", "Hi", "Hello"];
        const messagesLocal = [];
        for (const group of groups) {
            let usedLine2 = [];
            let usedClosers = [];
            for (let i = 0; i < group.count; i++) {
                let opener = '';
                if (i > 0) {
                    const salutation = salutations[Math.floor(Math.random() * salutations.length)];
                    opener = `${salutation} @grok`;
                }
                let line2 = '';
                if (includePhrases) {
                    const line2Pool = (i === 0 ? phrases : (actions.length > 0 ? actions : phrases));
                    if (line2Pool.length > 0) {
                        do {
                            line2 = line2Pool[Math.floor(Math.random() * line2Pool.length)];
                        } while (usedLine2.includes(line2) && usedLine2.length < line2Pool.length);
                        usedLine2.push(line2);
                    }
                }
                let closer = '';
                if (closers.length > 0) {
                    do {
                        closer = closers[Math.floor(Math.random() * closers.length)];
                    } while (usedClosers.includes(closer) && usedClosers.length < closers.length);
                    usedClosers.push(closer);
                }
                let numEmojis;
                if (maxEmojis === 'random') {
                    numEmojis = Math.random() < 0.5 ? 1 : 2;
                } else {
                    numEmojis = parseInt(maxEmojis, 10);
                }
                let emojis = [];
                for (let j = 0; j < numEmojis; j++) {
                    const emoji = group.emojiPool[Math.floor(Math.random() * group.emojiPool.length)];
                    emojis.push(emoji);
                }
                let lines = [];
                if (i === 0 && paragraphFormat) {
                    lines.push(group.timeGreeting);
                }
                if (opener) {
                    lines.push(opener);
                }
                if (line2) {
                    lines.push(line2);
                }
                if (closer) {
                    lines.push(closer);
                }
                // Always add first emoji to first line
                if (lines.length > 0 && emojis.length > 0) {
                    lines[0] += ` ${emojis.shift()}`;
                }
                // If second emoji, add to random line 2 or 3 if exist
                if (emojis.length > 0) {
                    const candidateLines = [];
                    if (lines.length > 1) candidateLines.push(1);
                    if (lines.length > 2) candidateLines.push(2);
                    if (candidateLines.length > 0) {
                        const randomIndex = candidateLines[Math.floor(Math.random() * candidateLines.length)];
                        lines[randomIndex] += ` ${emojis.shift()}`;
                    } else {
                        // Fallback to first line if no other lines
                        lines[0] += ` ${emojis.shift()}`;
                    }
                }
                let message;
                if (paragraphFormat) {
                    message = lines.join('\n\n');
                } else {
                    message = lines.join(' ');
                }
                messagesLocal.push(message);
            }
        }
        return messagesLocal;
    }

    let startDate = GM_getValue(storagePrefix + 'startDate', defaults.startDate);
    let startTime = GM_getValue(storagePrefix + 'startTime', defaults.startTime);
    let intervalHours = GM_getValue(storagePrefix + 'intervalHours', defaults.intervalHours);
    let intervalMins = GM_getValue(storagePrefix + 'intervalMins', defaults.intervalMins);
    let maxEmojis = String(GM_getValue(storagePrefix + 'maxEmojis', defaults.maxEmojis));
    let regenerateOnAuto = GM_getValue(storagePrefix + 'regenerateOnAuto', defaults.regenerateOnAuto);
    let includePhrases = GM_getValue(storagePrefix + 'includePhrases', defaults.includePhrases);
    let paragraphFormat = GM_getValue(storagePrefix + 'paragraphFormat', defaults.paragraphFormat);
    let messages = GM_getValue(storagePrefix + 'messages', defaults.messages);

    // Always set current date on load
    startDate = getLocalDateStr();

    if (!Array.isArray(messages) || messages.length === 0) {
        messages = await generateRandomMessages();
    }

    function saveSettings() {
        GM_setValue(storagePrefix + 'mode', mode);
        GM_setValue(storagePrefix + 'startDate', startDate);
        GM_setValue(storagePrefix + 'startTime', startTime);
        GM_setValue(storagePrefix + 'intervalHours', intervalHours);
        GM_setValue(storagePrefix + 'intervalMins', intervalMins);
        GM_setValue(storagePrefix + 'maxEmojis', maxEmojis);
        GM_setValue(storagePrefix + 'regenerateOnAuto', regenerateOnAuto);
        GM_setValue(storagePrefix + 'includePhrases', includePhrases);
        GM_setValue(storagePrefix + 'paragraphFormat', paragraphFormat);
        GM_setValue(storagePrefix + 'messages', messages);
    }

    saveSettings(); // Save immediately after loading to persist any defaults or overrides

    const panel = document.createElement('div');
    panel.style.position = 'fixed';
    panel.style.top = '10px';
    panel.style.right = '10px';
    panel.style.width = '350px';
    panel.style.padding = '15px';
    panel.style.background = '#f8f9fa';
    panel.style.border = '1px solid #dee2e6';
    panel.style.zIndex = '9999';
    panel.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    panel.style.overflowY = 'auto';
    panel.style.maxHeight = '85vh';
    panel.style.borderRadius = '8px';
    panel.style.fontFamily = 'Arial, sans-serif';
    panel.innerHTML = `
        <h3 style="margin-top:0; color:#212529;">X Post Scheduler ${currentUsername ? '(' + currentUsername + ')' : ''}</h3>
        <div id="timerArea" style="margin-bottom:15px; color:#007bff; font-weight:bold;"></div>
        <div id="statusArea" style="margin-bottom:15px; padding:10px; background:#e9ecef; border-radius:4px; font-weight:bold;"></div>
        <label style="display:block; margin-bottom:10px;">Mode:
            <select id="modeSelect" style="padding:5px; border:1px solid #ced4da; border-radius:4px;">
                <option value="Flirty" ${mode === 'Flirty' ? 'selected' : ''}>Flirty</option>
                <option value="Boost" ${mode === 'Boost' ? 'selected' : ''}>Boost</option>
                <option value="Crypto" ${mode === 'Crypto' ? 'selected' : ''}>Crypto</option>
                <option value="Pro" ${mode === 'Pro' ? 'selected' : ''}>Pro</option>
                <option value="Cute" ${mode === 'Cute' ? 'selected' : ''}>Cute</option>
                <option value="Zen" ${mode === 'Zen' ? 'selected' : ''}>Zen</option>
                <option value="Hype" ${mode === 'Hype' ? 'selected' : ''}>Hype</option>
                <option value="Sports" ${mode === 'Sports' ? 'selected' : ''}>Sports</option>
                <option value="Greetings" ${mode === 'Greetings' ? 'selected' : ''}>Greetings</option>
            </select>
        </label>
        <label style="display:block; margin-bottom:10px;">Start Date:
            <input type="date" id="startDate" value="${startDate}" style="padding:5px; border:1px solid #ced4da; border-radius:4px;">
        </label>
        <label style="display:block; margin-bottom:10px;">Start Time:
            <input type="time" id="startTime" value="${startTime}" style="padding:5px; border:1px solid #ced4da; border-radius:4px;">
        </label>
        <label style="display:block; margin-bottom:10px;">Interval:
            <input type="number" id="intervalHours" value="${intervalHours}" min="0" style="width:60px; padding:5px; border:1px solid #ced4da; border-radius:4px;"> hours
            <input type="number" id="intervalMins" value="${intervalMins}" min="0" max="59" style="width:60px; padding:5px; border:1px solid #ced4da; border-radius:4px;"> mins
        </label>
        <label style="display:block; margin-bottom:10px;">Emojis per Message:
            <select id="maxEmojis" style="padding:5px; border:1px solid #ced4da; border-radius:4px;">
                <option value="0" ${maxEmojis === '0' ? 'selected' : ''}>0</option>
                <option value="1" ${maxEmojis === '1' ? 'selected' : ''}>1</option>
                <option value="2" ${maxEmojis === '2' ? 'selected' : ''}>2</option>
                <option value="random" ${maxEmojis === 'random' ? 'selected' : ''}>Random (1-2)</option>
            </select>
        </label>
        <label style="display:block; margin-bottom:10px;">
            <input type="checkbox" id="regenerateOnAuto" ${regenerateOnAuto ? 'checked' : ''}> Regenerate messages on auto-queue
        </label>
        <label style="display:block; margin-bottom:10px;">
            <input type="checkbox" id="includePhrases" ${includePhrases ? 'checked' : ''}> Include mode phrases/actions
        </label>
        <label style="display:block; margin-bottom:10px;">
            <input type="checkbox" id="paragraphFormat" ${paragraphFormat ? 'checked' : ''}> Use paragraph format
        </label>
        <textarea id="newMsg" placeholder="Add new message" style="width:100%; height:60px; padding:8px; border:1px solid #ced4da; border-radius:4px; margin-bottom:10px;"></textarea>
        <button id="addMsgBtn" style="padding:6px 12px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer;">Add Message</button>
        <button id="generateRandomBtn" style="padding:6px 12px; background:#17a2b8; color:white; border:none; border-radius:4px; cursor:pointer; margin-left:10px;">Generate Random Messages</button>
        <button id="resetDefaultsBtn" style="padding:6px 12px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer; margin-left:10px;">Reset Account Data</button>
        <div id="msgList" style="margin-top:15px;"></div>
        <button id="previewSlotsBtn" style="padding:6px 12px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer; margin-top:10px;">Preview Schedules</button>
        <div id="slotsTable" style="margin-top:15px;"></div>
        <button id="checkQueueBtn" style="padding:6px 12px; background:#6f42c1; color:white; border:none; border-radius:4px; cursor:pointer; margin-top:10px;">Check Scheduled Queue</button>
        <button id="scheduleAllBtn" style="padding:6px 12px; background:#ffc107; color:#212529; border:none; border-radius:4px; cursor:pointer; margin-top:10px;">Schedule All</button>
        <div id="logArea" style="margin-top:15px; border-top:1px solid #dee2e6; padding-top:10px; max-height:250px; overflow-y:auto; background:#e9ecef; padding:10px; border-radius:4px;"></div>
        <button id="closePanel" style="position:absolute; top:5px; right:5px; background:none; border:none; font-size:16px; cursor:pointer; color:#6c757d;">✕</button>
    `;
    document.body.appendChild(panel);

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    panel.addEventListener('mousedown', (e) => {
        if (e.target.id !== 'closePanel' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
            isDragging = true;
            initialX = e.clientX - panel.getBoundingClientRect().left;
            initialY = e.clientY - panel.getBoundingClientRect().top;
            panel.style.cursor = 'grabbing';
        }
    });
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            panel.style.left = `${currentX}px`;
            panel.style.top = `${currentY}px`;
            panel.style.right = 'auto';
        }
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        panel.style.cursor = 'default';
    });

    function updateMsgList() {
        const listDiv = document.getElementById('msgList');
        listDiv.innerHTML = '<h4 style="margin:0 0 5px; color:#495057;">Messages:</h4><ul style="list-style:none; padding:0;">' +
            messages.map((msg, i) => `<li style="margin-bottom:5px; background:#fff; padding:8px; border:1px solid #dee2e6; border-radius:4px; display:flex; justify-content:space-between; align-items:center;"><span>${msg.replace(/\n/g, '<br>')}</span><button data-idx="${i}" class="editBtn" style="background:#ffc107; color:#212529; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">Edit</button><button data-idx="${i}" class="removeBtn" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Remove</button></li>`).join('') + '</ul>';
        listDiv.querySelectorAll('.removeBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                messages.splice(idx, 1);
                saveSettings();
                updateMsgList();
            });
        });
        listDiv.querySelectorAll('.editBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                const li = btn.parentNode;
                const msg = messages[idx];
                li.innerHTML = `<textarea style="flex:1; padding:5px; border:1px solid #ced4da; border-radius:4px; margin-right:5px;">${msg}</textarea><button class="saveBtn" style="background:#28a745; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">Save</button><button class="cancelBtn" style="background:#6c757d; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Cancel</button>`;
                li.querySelector('.saveBtn').addEventListener('click', () => {
                    const newMsg = li.querySelector('textarea').value.trim();
                    if (newMsg) {
                        messages[idx] = newMsg;
                        saveSettings();
                    }
                    updateMsgList();
                });
                li.querySelector('.cancelBtn').addEventListener('click', () => {
                    updateMsgList();
                });
            });
        });
    }
    updateMsgList();

    const modeSelect = document.getElementById('modeSelect');
    const startDateInput = document.getElementById('startDate');
    const startTimeInput = document.getElementById('startTime');
    const intervalHoursInput = document.getElementById('intervalHours');
    const intervalMinsInput = document.getElementById('intervalMins');
    const maxEmojisSelect = document.getElementById('maxEmojis');
    const regenerateOnAutoCheckbox = document.getElementById('regenerateOnAuto');
    const includePhrasesCheckbox = document.getElementById('includePhrases');
    const paragraphFormatCheckbox = document.getElementById('paragraphFormat');
    const newMsgInput = document.getElementById('newMsg');
    const addMsgBtn = document.getElementById('addMsgBtn');
    const generateRandomBtn = document.getElementById('generateRandomBtn');
    const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
    const previewSlotsBtn = document.getElementById('previewSlotsBtn');
    const checkQueueBtn = document.getElementById('checkQueueBtn');
    const scheduleAllBtn = document.getElementById('scheduleAllBtn');
    const closePanelBtn = document.getElementById('closePanel');
    const slotsTableDiv = document.getElementById('slotsTable');
    const logArea = document.getElementById('logArea');
    const statusArea = document.getElementById('statusArea');
    const timerArea = document.getElementById('timerArea');

    let isScheduling = false;
    let isAutoQueueRunning = false;

    modeSelect.addEventListener('change', () => {
        mode = modeSelect.value;
        phrases = modes[mode].phrases.concat(resolvedAccountConfig.phrasesExtras || []);
        actions = modes[mode].actions || [];
        closers = modes[mode].closers.concat(resolvedAccountConfig.closersExtras || []);
        morningEmojis = modes[mode].morningEmojis.concat(resolvedAccountConfig.morningEmojisExtras || []);
        afternoonEmojis = modes[mode].afternoonEmojis.concat(resolvedAccountConfig.afternoonEmojisExtras || []);
        eveningNightEmojis = modes[mode].eveningNightEmojis.concat(resolvedAccountConfig.eveningNightEmojisExtras || []);
        saveSettings();
    });

    generateRandomBtn.addEventListener('click', async () => {
        if (isScheduling || isAutoQueueRunning) {
            logArea.innerHTML += 'Busy, cannot regenerate messages now.<br>';
            logArea.scrollTop = logArea.scrollHeight;
            return;
        }
        messages = await generateRandomMessages();
        saveSettings();
        updateMsgList();
    });

    resetDefaultsBtn.addEventListener('click', () => {
        if (isScheduling || isAutoQueueRunning) {
            logArea.innerHTML += 'Busy, cannot reset now.<br>';
            logArea.scrollTop = logArea.scrollHeight;
            return;
        }
        ['mode', 'startDate', 'startTime', 'intervalHours', 'intervalMins', 'maxEmojis', 'regenerateOnAuto', 'includePhrases', 'paragraphFormat', 'messages', 'nextAutoCheckTime'].forEach(key => {
            GM_deleteValue(storagePrefix + key);
        });
        location.reload();
    });

    startDateInput.addEventListener('change', () => {
        startDate = startDateInput.value;
        saveSettings();
    });

    startTimeInput.addEventListener('change', () => {
        startTime = startTimeInput.value;
        saveSettings();
    });

    intervalHoursInput.addEventListener('change', () => {
        intervalHours = parseInt(intervalHoursInput.value, 10) || 0;
        saveSettings();
    });

    intervalMinsInput.addEventListener('change', () => {
        intervalMins = parseInt(intervalMinsInput.value, 10) || 0;
        if (intervalMins > 59) intervalMins = 59;
        intervalMinsInput.value = intervalMins;
        saveSettings();
    });

    maxEmojisSelect.addEventListener('change', () => {
        maxEmojis = maxEmojisSelect.value;
        saveSettings();
    });

    regenerateOnAutoCheckbox.addEventListener('change', () => {
        regenerateOnAuto = regenerateOnAutoCheckbox.checked;
        saveSettings();
    });

    includePhrasesCheckbox.addEventListener('change', () => {
        includePhrases = includePhrasesCheckbox.checked;
        saveSettings();
    });

    paragraphFormatCheckbox.addEventListener('change', () => {
        paragraphFormat = paragraphFormatCheckbox.checked;
        saveSettings();
    });

    addMsgBtn.addEventListener('click', () => {
        const newMsg = newMsgInput.value.trim();
        if (newMsg) {
            messages.push(newMsg);
            saveSettings();
            updateMsgList();
            newMsgInput.value = '';
        }
    });

    previewSlotsBtn.addEventListener('click', () => {
        const times = computeScheduleTimes(startDate, startTime, intervalHours, intervalMins, messages.length);
        const tableDiv = document.getElementById('slotsTable');
        tableDiv.innerHTML = '<h4 style="margin:0 0 5px; color:#495057;">Scheduled Slots:</h4><table style="width:100%; border-collapse:collapse;"><tr><th style="border:1px solid #dee2e6; padding:8px; background:#e9ecef;">Time</th><th style="border:1px solid #dee2e6; padding:8px; background:#e9ecef;">Message</th></tr>' +
            times.map((t, i) => `<tr><td style="border:1px solid #dee2e6; padding:8px;">${t.toLocaleString()}</td><td style="border:1px solid #dee2e6; padding:8px;">${messages[i].replace(/\n/g, '<br>')}</td></tr>`).join('') + '</table>';
    });

    checkQueueBtn.addEventListener('click', async () => {
        if (isScheduling || isAutoQueueRunning) {
            logArea.innerHTML += 'Busy, cannot check scheduled queue now.<br>';
            logArea.scrollTop = logArea.scrollHeight;
            return;
        }
        logArea.innerHTML += 'Checking scheduled queue...<br>';
        await getScheduledInfo(logArea);
        logArea.scrollTop = logArea.scrollHeight;
    });

    scheduleAllBtn.addEventListener('click', async () => {
        if (isScheduling || isAutoQueueRunning) {
            logArea.innerHTML += 'Already scheduling or auto-queue running.<br>';
            logArea.scrollTop = logArea.scrollHeight;
            return;
        }
        isScheduling = true;
        logArea.innerHTML = 'Scheduling...<br>';
        const times = computeScheduleTimes(startDate, startTime, intervalHours, intervalMins, messages.length);
        for (let i = 0; i < messages.length; i++) {
            const targetTime = times[i];
            const text = messages[i];
            logArea.innerHTML += `Scheduling at ${targetTime.toLocaleString()}: "${text.replace(/\n/g, '\\n')}"<br>`;
            const success = await schedulePost(targetTime, text);
            logArea.innerHTML += success ? '<span style="color:green;">Success</span><br>' : '<span style="color:red;">Failed</span><br>';
            logArea.scrollTop = logArea.scrollHeight;
            await wait(3000);
        }
        setTimeout(() => { openScheduledView(); }, 1000);
        isScheduling = false;
    });

    closePanelBtn.addEventListener('click', () => {
        panel.style.display = 'none';
    });

    // Watch for dynamic date change (e.g., midnight cross)
    let currentDay = new Date().getDate();
    setInterval(() => {
        const nowDay = new Date().getDate();
        if (nowDay !== currentDay) {
            currentDay = nowDay;
            startDate = getLocalDateStr();
            document.getElementById('startDate').value = startDate;
            saveSettings();
            const logArea = document.getElementById('logArea');
            logArea.innerHTML += 'Date updated dynamically to today.<br>';
            logArea.scrollTop = logArea.scrollHeight;
        }
    }, 60000); // Check every minute

    // Auto queue logic
    async function autoQueueIfNeeded() {
        const now = Date.now();
        let nextAutoCheckTime = GM_getValue(storagePrefix + 'nextAutoCheckTime', now); // default to now if not set
        if (now < nextAutoCheckTime) return;
        if (isScheduling || isAutoQueueRunning) return;

        isAutoQueueRunning = true;

        const logArea = document.getElementById('logArea');
        const statusArea = document.getElementById('statusArea');
        logArea.innerHTML += 'Auto-checking for queue...<br>';
        const {count, latestTime} = await getScheduledInfo(logArea);
        if (count === 0) {
            const today = getLocalDateStr();
            logArea.innerHTML += 'Queue is empty, auto-generating and scheduling posts...<br>';
            logArea.scrollTop = logArea.scrollHeight;
            if (regenerateOnAuto) {
                messages = await generateRandomMessages();
            }
            saveSettings();
            updateMsgList();

            const times = computeScheduleTimes(today, startTime, intervalHours, intervalMins, messages.length);
            let successCount = 0;
            for (let i = 0; i < messages.length; i++) {
                const targetTime = times[i];
                const text = messages[i];
                logArea.innerHTML += `Auto-scheduling at ${targetTime.toLocaleString()}: "${text.replace(/\n/g, '\\n')}"<br>`;
                logArea.scrollTop = logArea.scrollHeight;
                const success = await schedulePost(targetTime, text);
                logArea.innerHTML += success ? '<span style="color:green;">Success</span><br>' : '<span style="color:red;">Failed</span><br>';
                logArea.scrollTop = logArea.scrollHeight;
                if (success) successCount++;
                await wait(3000);
            }
            setTimeout(() => { openScheduledView(); }, 1000); // Leave on scheduled page for manual pic addition
            const lastGNTime = times[times.length - 1].getTime() + 5 * 60 * 1000;
            GM_setValue(storagePrefix + 'nextAutoCheckTime', lastGNTime);
            statusArea.innerHTML = `Auto-scheduled ${successCount} posts. Next check: ${new Date(lastGNTime).toLocaleString()}`;
        } else {
            if (latestTime) {
                const nextCheck = latestTime + 5 * 60 * 1000;
                GM_setValue(storagePrefix + 'nextAutoCheckTime', nextCheck);
                logArea.innerHTML += `Queue not empty (${count} posts), rechecking 5 min after latest post at ${new Date(latestTime).toLocaleString()}.<br>`;
                statusArea.innerHTML = `Queue: ${count} posts. Next check: ${new Date(nextCheck).toLocaleString()}`;
            } else {
                const assumedTimes = computeScheduleTimes(getLocalDateStr(), startTime, intervalHours, intervalMins, 8);
                const assumedLastGN = assumedTimes[assumedTimes.length - 1].getTime() + 5 * 60 * 1000;
                GM_setValue(storagePrefix + 'nextAutoCheckTime', assumedLastGN);
                logArea.innerHTML += 'Could not parse latest post time, assuming full queue and setting next check 5 min after assumed last GN.<br>';
                statusArea.innerHTML = `Queue: ${count} posts. Next check: ${new Date(assumedLastGN).toLocaleString()} (assumed)`;
            }
        }
        logArea.scrollTop = logArea.scrollHeight;
        isAutoQueueRunning = false;
    }

    function updateTimer() {
        const next = GM_getValue(storagePrefix + 'nextAutoCheckTime', 0);
        const remaining = next - Date.now();
        if (remaining <= 0) {
            document.getElementById('timerArea').innerText = 'Ready to check queue';
        } else {
            const hours = Math.floor(remaining / 3600000);
            const mins = Math.floor((remaining % 3600000) / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            document.getElementById('timerArea').innerText = `Next check in ${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }
    setInterval(updateTimer, 1000);
    updateTimer();

    // Periodic check to trigger autoQueueIfNeeded
    setInterval(async () => {
        if (isScheduling || isAutoQueueRunning) return;
        const now = Date.now();
        const next = GM_getValue(storagePrefix + 'nextAutoCheckTime', now);
        if (now >= next) {
            await autoQueueIfNeeded();
            updateTimer();
        }
    }, 60000); // Check every minute if it's time to run

    // Run initial auto queue check
    await autoQueueIfNeeded();
    updateTimer();

    // Monitor for account switches
    let lastUsername = currentUsername;
    setInterval(async () => {
        const newLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
        if (newLink) {
            let newHref = newLink.getAttribute('href') || '';
            newHref = newHref.replace(/^\/+/, '').replace(/\/+$/, '');
            if (newHref.startsWith('@')) newHref = newHref.slice(1);
            if (newHref !== lastUsername) {
                lastUsername = newHref;
                currentUsername = newHref;
                const newPrefix = `xSched_${newHref}_`;
                // Reload settings for new account
                mode = GM_getValue(newPrefix + 'mode', defaults.mode);
                startDate = GM_getValue(newPrefix + 'startDate', getLocalDateStr());
                startTime = GM_getValue(newPrefix + 'startTime', defaults.startTime);
                intervalHours = GM_getValue(newPrefix + 'intervalHours', defaults.intervalHours);
                intervalMins = GM_getValue(newPrefix + 'intervalMins', defaults.intervalMins);
                maxEmojis = String(GM_getValue(newPrefix + 'maxEmojis', defaults.maxEmojis));
                regenerateOnAuto = GM_getValue(newPrefix + 'regenerateOnAuto', defaults.regenerateOnAuto);
                includePhrases = GM_getValue(newPrefix + 'includePhrases', defaults.includePhrases);
                paragraphFormat = GM_getValue(newPrefix + 'paragraphFormat', defaults.paragraphFormat);
                messages = GM_getValue(newPrefix + 'messages', await generateRandomMessages());
                // Update phrases/closers/emojis based on new mode and account
                const newAccountConfig = getAccountConfig(currentUsername);
                phrases = modes[mode].phrases.concat(newAccountConfig.phrasesExtras || []);
                actions = modes[mode].actions || [];
                closers = modes[mode].closers.concat(newAccountConfig.closersExtras || []);
                morningEmojis = modes[mode].morningEmojis.concat(newAccountConfig.morningEmojisExtras || []);
                afternoonEmojis = modes[mode].afternoonEmojis.concat(newAccountConfig.afternoonEmojisExtras || []);
                eveningNightEmojis = modes[mode].eveningNightEmojis.concat(newAccountConfig.eveningNightEmojisExtras || []);
                // Update panel elements
                document.getElementById('modeSelect').value = mode;
                document.getElementById('startDate').value = startDate;
                document.getElementById('startTime').value = startTime;
                document.getElementById('intervalHours').value = intervalHours;
                document.getElementById('intervalMins').value = intervalMins;
                document.getElementById('maxEmojis').value = maxEmojis;
                document.getElementById('regenerateOnAuto').checked = regenerateOnAuto;
                document.getElementById('includePhrases').checked = includePhrases;
                document.getElementById('paragraphFormat').checked = paragraphFormat;
                updateMsgList();
                saveSettings(); // Persist for new account
            }
        }
    }, 2000); // Check every 2 seconds

})();
