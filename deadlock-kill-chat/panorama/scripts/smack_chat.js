// Chat Message On Kill
//
// Auto-sends a chat line the instant the damage-impact HUD flags a kill (not a kill assist for now).
// Kill detection: hud_damage_impact.css distinguishes .killed (KILL) from .assist (KILL ASSIST) on each .damageImpactInstance panel. We poll #damageImpactInfo children for `killed && !assist`.
//
// Chat sending: there is no scriptable "say" API, so we drive the stock chat panel, open it with a console command, write into #ChatInput, dispatch CitadelChatInputSubmitted,
// then blur. Same trick works in other mods; the timing hacks below are why it is not a one-liner.

(() => {
    'use strict';

    const CONFIG = {
        MESSAGES_BY_HERO: {
            hero_chessmaster: [
                "Checkmate. Though I suppose you've known that for several moves now.",
                "A respectable effort. Unfortunately, respectability seldom wins games.",
                "You played beautifully. For someone who never stood a chance.",
                "I must commend your persistence. It almost resembled strategy.",
                "You weren't defeated by a superior position, but a superior mind.",
                "There is a certain elegance to inevitability, wouldn't you agree?",
                "A good fight. I enjoyed the part where you believed you were winning.",
                "One must admire a man who marches so confidently toward his own destruction.",
                "Your greatest mistake was assuming we were playing the same game.",
                "Do forgive me. I had hoped to make this fight more interesting.",
                "Oh, don't look so surprised. I certainly wasn't.",
                "Would you care for another fight? I do so enjoy consistency.",
                "I believe the appropriate expression is 'better luck next time.'",
                "You almost had me. Not in any meaningful sense, of course.",
                "There it is. That moment when understanding finally catches up with defeat.",
                "I would offer you advice, but I fear we'd be here until morning.",
                "Oh, that was your plan? How wonderfully optimistic.",
                "I assure you, the outcome was never in question. Merely the moves required.",
                "You may take comfort in knowing that you lost to someone extraordinary.",
                "Chess is a conversation between intellects. I fear I'm speaking to myself.",
                "You see pieces. I see possibilities. That, is where our difficulties began.",
                "The difference between us is simple. You calculate consequences. I make them.",
                "It's fascinating how confidently you make decisions you don't fully understand.",
                "You were thinking three moves ahead. How quaint.",
                "I don't predict your moves. I simply leave you with the moves I desire.",
                "A lesser mind sees a sacrifice. A greater one sees an investment.",
                "Your strategy was sound, provided I was incompetent to cooperate.",
                "The board is impartial. Unfortunately for you, intelligence is not.",
                "I admire your mind. It takes creativity to see victory from your position.",
                "You lost twelve moves ago. The remainder was merely a formality.",
                "I saw your defeat before you saw your opportunity.",
                "You were never my opponent. You were simply the other player.",
                "I didn't need to defeat you. I merely had to let you finish making mistakes.",
                "Every move you made was permitted. Do consider what that implies.",
                "You mistook my patience for hesitation.",
                "I offered you choices. None of them were good.",
                "You were dead long before you noticed the danger.",
                "I do not gamble on outcomes. I arrange them.",
                "Checkmate. Precisely where I intended.",
                "A king surrounded by subjects is a fool if he cannot see the hand of doom.",
                "You spent the fight defending your life. I spent it deciding your death.",
                "The beauty of chess is that it becomes impossible for a fool to deny his loss.",
                "Predictable.",
                "Was that intentional?",
                "How unfortunate. For you.",
                "I expected more.",
                "A foregone conclusion.",
                "You may resign earlier next time.",
                "Ah. You've finally caught up.",
                "I was beginning to grow bored.",
                "And you thought that was a trap.",
                "Shall I play blindfolded next time?",
                "Checkmate. I trust the lesson was worth the humiliation.",
                "Don't be disheartened. Someone had to lose. It was just never going to be me.",
                "I must apologize. I seem to have mistaken your confidence for competence.",
                "I could explain where you went wrong, but we'd have to begin with queuing.",
                "The trouble with playing against me is that you must be correct every time.",
                "You were so occupied searching for my weaknesses that you showed yours.",
                "I didn't outplay your final move. I outplayed every move that made it possible.",
                "It's not often people demonstrates the difference between confidence & ability.",
                "You call it checkmate. I call it the inevitable.",
            ],
            hero_punkgoat: [
                "You had a whole health bar to change your mind.",
                "Quit lookin at me like I started it! I did, but quit lookin at me, asshole.",
                "You're lucky I like this bat! I was about to throw it at you, dick!",
                "You come all the way to New York to get your ass kicked? Could've stayed home.",
                "Oh, you wanted a fair fight? Go file a complaint.",
                "You saw the horns an' figured, 'Yeah, I'll fight that!'",
                "All that fancy occult shit an'd' you still got hit with a bat.",
                "What'dd you think the chain was for? Holdin' my pants up?",
                "I was in a bad mood before you donated souls. Now I'm feelin' pretty good!",
                "Next time, bring somebody who likes you enough to help, dumbass.",
                "Hey, you dropped your souls. I'm keepin' em, but I thought you should know.",
                "I take back what I said about you. Whatever it was, wasn't mean enough!",
                "Somebody tell the Patron I'm doin damn my part. Loudly!",
                "You know what your problem is? You let me get close enough to tell ya!",
                "I was gonna let you walk. Then you opened your damn mouth!",
                "They let you into the ritual with that? The hell am I payin' taxes for?",
                "I got thrown outta protests for less than that piss-poor display!",
                "That was the big move? I put my drink down for that? Lame as hell!",
                "If anybody asks, you fell down the stairs. A looootta stairs, buddy.",
                "You hit me first! This shit's on you!",
                "You gotta stop buyin' shit and learn how to take a hit asshole!",
                "Nice build. Does it come with a guy who knows how to use it?",
                "Piss off! Actually, stay down there. That's fine too.",
                "I've had worse fights with park security!",
                "You call that a cheap shot? Buddy, I paid good money for this bat!",
                "I'd say good fight, but then you'd go around tellin' people I said that!",
                "You came at me like I owed you souls! Now I got yours!",
                "Get up! I thought of somethin' better to say!",
                "Hold on, you were tryin' to kill me? Nice try, asshole!",
                "Who told you I was bluffing? Go be mad at them instead!",
                "I got one good swing in. Then I got a couple more 'cause you stayed, dick!",
                "I've seen better exits at Penn Station, and nobody knows how to get outta there!",
                "Oh good, you're done! I can hear myself think again!",
                "The hell was that little movement supposed to do?",
                "Keep your voice down. You're dead!",
                "You want my autograph? Shove it up your ass!",
                "You got all the way up to me and you still got thrashed, asshole!",
                "I can do this all night, bar's got my tab open!",
                "You wanna know how I did that? Get up and watch closer!",
                "You had backup? And how'd that work out, dick?!",
                "Leave the goat head outta this! You walked into it.",
                "Man, I didn't even get to the part where I lose my shit!",
                "I'll give ya this. You made me a lil' pissed!",
                "Go ahead, blame the parry lag. I'll be here when it clears up!",
                "You coulda gone home to your lame girlfiend. Look what you chose!",
                "What, you thought I brought the bat to get it signed?! Wake up asshole!",
                "You almost had me worried you'd put up a fight, loser!",
                "I hope your team saw that. I ain't explainin' it twice!",
                "You're gonna tell this story different. I can aaaaalready hear it.",
                "You saw a goat come flyin' at you and your plan was to stand your ground?",
                "You can get a permit for that bullshit, but I can't have a beer on the sidewalk?",
                "That's it? I got worse from the bouncer, and I knew the guy!",
                "Where'd all that attitude go!? You had plenty a second ago asshole!",
                "For a second I thought you knew what you were doin'! Scared the shit outta me!",
                "Take a minute. I gotta find where I put my cocktails.",
                "I'm gonna be honest. I was just swingin' at whatever was close.",
                "You made me chase you for three blocks. Of course I'm pissed off!",
                "Tell your buddies I'm comin. Actually, don't. I wanna see their faces.",
                "Yeah, I'm still mad. What the hell's that got to do with winnin'!?",
                "Who\'s next!? And can you send somebody who's actually mad at me?",
                "The horns are real. I dunno why so many assholes needs a demonstration!",
                "Newsflash buddy, I'm outscaling you!",
            ],
        },

        // How often we look for a fresh kill. $.Schedule is frame-bound, so a callback cannot run
        // more than once per frame -- this is "every frame", not 100 scans per second, and the
        // ceiling is the frame rate rather than this number. Idle cost is three calls across the
        // JS/C++ boundary: #damageImpactInfo is cached, and it has zero children unless you are
        // actively hitting a hero, so the scan loop does not execute at all most of the time.
        POLL_RATE: 0.01,
        // Poll rate while #damageImpactInfo cannot be resolved (menus, loading, hideout).
        POLL_RATE_IDLE: 1.0,

        // Console commands that open the ALL chat, tried in order until one produces an ALL
        // target. The winner is cached for the rest of the session. `say_chat_team` is the
        // confirmed team-chat command; the ALL variant is inferred from the ChatTeam/Chat
        // keybind pair in popup_settings.xml, so it may need a manual fix after testing.
        OPEN_COMMANDS: ['say_chat', 'say_chat_all', 'chat_all'],

        // Delays before each submit attempt, in seconds. First one is next-frame.
        RETRY_DELAYS: [0, 0.016, 0.033, 0.05, 0.1, 0.2],
        // Extra ticks the chat target must stay ready before we submit. The chat label goes
        // live two ticks before the input actually accepts a submit, so 0 drops messages.
        CONFIRM_TICKS: 2,

        // Refuse to submit unless the chat target really is ALL. Set false to send into
        // whatever channel happens to be open (useful to isolate a broken OPEN_COMMANDS list).
        REQUIRE_ALL_TARGET: true,

        // Kills within this window of the last accepted one send nothing. A double kill is one
        // chat message, not two. Measured from when the kill is detected, so a burst of kills
        // never queues up behind the send -- extras are dropped outright.
        COOLDOWN_MS: 2000,

        DEBUG: false,
    };

    const IDS = {
        info: 'damageImpactInfo',
        chatInput: 'ChatInput',
        chatTargetLabel: 'ChatTargetLabel',
    };

    const FIRED_FLAG = '__smackChatFired';
    const STORE_KEY = 'SmackChat';

    const CTX = $.GetContextPanel();

    const State = {
        info: null,
        chatInput: null,
        chatTargetLabel: null,
        primed: false,
        sending: false,
        message: '',
        lastAcceptedMs: 0,
        attempt: 0,
        readyStreak: 0,
        cmdIndex: 0,
        cmdLocked: false,
    };

    function log(message) {
        if (!CONFIG.DEBUG) return;
        try {
            $.Msg('[SmackChat] ' + message);
        } catch (e) {}
    }

    function isValid(panel) {
        return !!(panel && (!panel.IsValid || panel.IsValid()));
    }

    function hasClass(panel, className) {
        if (!isValid(panel) || typeof panel.BHasClass !== 'function') return false;
        try {
            return panel.BHasClass(className);
        } catch (e) {
            return false;
        }
    }

    function findChild(root, id) {
        if (!isValid(root) || typeof root.FindChildTraverse !== 'function') return null;
        try {
            const found = $.ModHudLookup.find(id);
            return isValid(found) ? found : null;
        } catch (e) {
            return null;
        }
    }

    function getRoot() {
        let cursor = CTX;
        let guard = 0;
        while (cursor && cursor.GetParent && cursor.GetParent() && guard < 50) {
            cursor = cursor.GetParent();
            guard += 1;
        }
        return cursor || CTX;
    }

    // ---------------------------------------------------------------- instance guard

    // The layout that hosts this script is instantiated once per HUD load -- the kill panels
    // are snippet children, and snippets do not re-run layout scripts. But a HUD reload (or a
    // second copy of the mod) would leave two poll loops racing, so each instance stamps a
    // generation into the shared store and older loops retire on their next tick.
    function getStore() {
        try {
            if (typeof GameUI !== 'undefined' && GameUI.CustomUIConfig) return GameUI.CustomUIConfig();
        } catch (e) {}
        try {
            globalThis.__SmackChatFallbackStore = globalThis.__SmackChatFallbackStore || {};
            return globalThis.__SmackChatFallbackStore;
        } catch (e) {
            return {};
        }
    }

    const store = getStore();
    const previous = store[STORE_KEY];
    const GENERATION = ((previous && previous.generation) || 0) + 1;
    store[STORE_KEY] = { generation: GENERATION };

    function isRetired() {
        if (!isValid(CTX)) return true;
        const current = store[STORE_KEY];
        return !current || current.generation !== GENERATION;
    }

    // ---------------------------------------------------------------- chat sending

    function resolveChatPanels() {
        if (isValid(State.chatInput) && isValid(State.chatTargetLabel)) return true;

        const root = getRoot();
        State.chatInput = findChild(root, IDS.chatInput);
        State.chatTargetLabel = findChild(root, IDS.chatTargetLabel);
        return !!(State.chatInput && State.chatTargetLabel);
    }

    function isAllChatTarget() {
        if (!CONFIG.REQUIRE_ALL_TARGET) return true;
        if (!isValid(State.chatTargetLabel)) return false;

        // The text is localized, so checking for "(ALL)" breaks on non-English clients.
        // The root chat panel has a class indicating the current target, e.g. "ChatTarget_GameAll".
        let cursor = State.chatTargetLabel;
        let guard = 0;
        while (cursor && guard < 20) {
            if (hasClass(cursor, 'ChatTarget_GameAll')) return true;
            if (hasClass(cursor, 'ChatTarget_Team') || hasClass(cursor, 'ChatTarget_Party')) return false;
            try {
                if (typeof cursor.GetParent === 'function') {
                    cursor = cursor.GetParent();
                } else {
                    break;
                }
            } catch (e) {
                break;
            }
            guard += 1;
        }

        // Fallback for safety
        let text = '';
        try {
            text = String(State.chatTargetLabel.text || '').trim();
        } catch (e) {
            return false;
        }
        if (!text) return false;

        // Unlocalized token, or the resolved "[ALL]" / "To (ALL):" forms. The closing bracket
        // keeps these from matching the ALLIES channel.
        return text === '#citadel_chat_placeholder' || text.indexOf('(ALL)') !== -1 || text.indexOf('[ALL]') !== -1;
    }

    function openChat() {
        const command = CONFIG.OPEN_COMMANDS[State.cmdIndex];
        try {
            $.DispatchEvent('CitadelConCommand', command);
        } catch (e) {}
        log('open chat via ' + command);
    }

    function closeChat(input) {
        try {
            $.DispatchEvent('CitadelChatInputBlur', input);
        } catch (e) {}
        try {
            $.DispatchEvent('DropInputFocus', input);
        } catch (e) {}
    }

    function submit(input) {
        try {
            input.text = State.message;
            $.DispatchEvent('CitadelChatInputSubmitted', input);
            input.text = '';
        } catch (e) {
            log('submit threw, aborting');
            State.sending = false;
            return;
        }
        closeChat(input);
        State.cmdLocked = true;
        log('sent "' + State.message + '" via ' + CONFIG.OPEN_COMMANDS[State.cmdIndex]);
        State.sending = false;
    }

    function trySubmit() {
        if (isRetired()) return;

        if (resolveChatPanels() && isAllChatTarget()) {
            // Seen ready once; give the input the extra tick it needs before submitting.
            if (State.readyStreak >= CONFIG.CONFIRM_TICKS) {
                submit(State.chatInput);
                return;
            }
            State.readyStreak += 1;
        } else {
            State.readyStreak = 0;
        }

        State.attempt += 1;
        if (State.attempt < CONFIG.RETRY_DELAYS.length) {
            $.Schedule(CONFIG.RETRY_DELAYS[State.attempt], trySubmit);
            return;
        }

        // This open command never produced a usable ALL target -- try the next candidate.
        if (!State.cmdLocked && State.cmdIndex < CONFIG.OPEN_COMMANDS.length - 1) {
            State.cmdIndex += 1;
            State.attempt = 0;
            State.readyStreak = 0;
            openChat();
            $.Schedule(CONFIG.RETRY_DELAYS[0], trySubmit);
            return;
        }

        log('gave up: no usable ALL chat target');
        if (isValid(State.chatInput)) closeChat(State.chatInput);
        State.sending = false;
    }

    function beginSend() {
        State.sending = true;
        State.attempt = 0;
        State.readyStreak = 0;
        openChat();
        $.Schedule(CONFIG.RETRY_DELAYS[0], trySubmit);
    }

    function onKill() {
        // The local shop panel carries the current hero's internal name as a class.
        const root = getRoot();
        const shop = root.FindChildTraverse('CitadelHudHeroShop');
        const hero = Object.keys(CONFIG.MESSAGES_BY_HERO).find(key => hasClass(shop, key));
        const lines = CONFIG.MESSAGES_BY_HERO[hero];
        if (!lines || !lines.length) return;

        const now = Date.now();

        // Stamped on the accepted kill rather than on the completed send, so kills landing in the
        // same instant as the first one are rejected here instead of stacking behind it.
        if (State.lastAcceptedMs && now - State.lastAcceptedMs < CONFIG.COOLDOWN_MS) {
            log('kill within ' + CONFIG.COOLDOWN_MS + 'ms cooldown, ignored');
            return;
        }
        // Redundant while the cooldown outlasts a send, but guarantees we never overwrite the
        // text of a submit that is still in flight.
        if (State.sending) {
            log('send in flight, kill ignored');
            return;
        }

        State.message = lines[Math.floor(Math.random() * lines.length)];
        State.lastAcceptedMs = now;
        log('kill detected, sending');
        beginSend();
    }

    // ---------------------------------------------------------------- kill detection

    function resolveInfo() {
        if (isValid(State.info)) return State.info;
        State.info = findChild(CTX, IDS.info) || findChild(getRoot(), IDS.info);
        return State.info;
    }

    function scan() {
        if (isRetired()) {
            log('retired, stopping poll loop');
            return;
        }

        const info = resolveInfo();
        if (!info) {
            State.info = null;
            $.Schedule(CONFIG.POLL_RATE_IDLE, scan);
            return;
        }

        let count = 0;
        try {
            count = info.GetChildCount() || 0;
        } catch (e) {
            State.info = null;
            $.Schedule(CONFIG.POLL_RATE_IDLE, scan);
            return;
        }

        for (let i = 0; i < count; i += 1) {
            let panel = null;
            try {
                panel = info.GetChild(i);
            } catch (e) {}
            if (!isValid(panel)) continue;

            if (!hasClass(panel, 'killed') || hasClass(panel, 'assist')) {
                // Panels can be pooled and reused for the next damage instance, which always
                // starts without `killed` -- clearing here lets a reused panel fire again.
                panel[FIRED_FLAG] = false;
                continue;
            }
            if (panel[FIRED_FLAG]) continue;

            panel[FIRED_FLAG] = true;
            // First scan may see kills that landed before the script started (HUD reload).
            if (State.primed) onKill();
        }

        State.primed = true;
        $.Schedule(CONFIG.POLL_RATE, scan);
    }

    log('loaded (generation ' + GENERATION + ')');
    scan();
})();
