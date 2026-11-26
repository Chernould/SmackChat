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

        // User-facing settings (on/off, debug) are in smack_config.js
        // and can be changed per match from the Esc menu panel -- read them with setting().
    };

    // A user setting: this match's panel value, else smack_config.js, else `fallback`.
    function setting(key, fallback) {
        try {
            if ($.SmackChatSettings) return $.SmackChatSettings.get(key);
            if ($.SmackChatConfig && key in $.SmackChatConfig) return $.SmackChatConfig[key];
        } catch (e) {}
        return fallback;
    }

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
        attempt: 0,
        readyStreak: 0,
        cmdIndex: 0,
        cmdLocked: false,
    };

    function log(message) {
        if (!setting('debug', true)) return;
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

    // Hero lines are registered by scripts/heroes/*.js through smack_heroes.js.
    function getLocalHero() {
        const registry = $.SmackChatHeroes;
        return registry ? registry.local() : null;
    }

    // ---------------------------------------------------------------- spectating
    //
    // The top bar (citadel_hud_top_bar.xml) has one CitadelHudTopBarPlayer per player under
    // TeamFriendly/TeamEnemy > PlayersContainer. Stock CSS (citadel_hud_top_bar.css) shows the
    // engine tags your own portrait `LocalPlayer`, the hero the camera follows `SpectatorTarget`,
    // and dead heroes `Dead`.

    function getTopBarPlayers() {
        const topBar = findChild(getRoot(), 'TopBar');
        const players = [];
        for (const teamId of ['TeamFriendly', 'TeamEnemy']) {
            const container = findIn(findIn(topBar, teamId), 'PlayersContainer');
            if (!container) continue;
            const kids = probe(() => container.Children()) || [];
            for (const kid of kids) if (isValid(kid)) players.push(kid);
        }
        return players;
    }

    // { players, spectatingOther, localDead } for the current moment.
    function getSpectateState() {
        const players = getTopBarPlayers();
        let spectatingOther = false;
        let localDead = false;
        for (const p of players) {
            const isLocal = hasClass(p, 'LocalPlayer');
            if (hasClass(p, 'SpectatorTarget') && !isLocal) spectatingOther = true;
            if (isLocal && hasClass(p, 'Dead')) localDead = true;
        }
        return { players: players.length, spectatingOther, localDead };
    }

    // True when the kill on screen should not count for our hero: we are watching someone else,
    // or our hero is dead (kills that land after death, e.g. from damage over time, are skipped
    // too -- by design).
    function isSomeoneElsesKill() {
        const s = getSpectateState();
        log('spectate state: topBarPlayers=' + s.players + ' spectatingOther=' + s.spectatingOther + ' localDead=' + s.localDead);
        return s.spectatingOther || s.localDead;
    }

    // ---------------------------------------------------------------- victim detection
    //
    // Each kill panel holds CitadelHeroBadge#heroBadge, whose stock layout (hero_badge.xml) builds
    // a CitadelHeroImage#HeroImage child. CitadelHeroImage takes a numeric `heroid` attribute
    // (citadel_hud_playerintents_player.xml uses heroid="1" for Infernus), so that number is our
    // best lead. None of this is confirmed in-game yet: with debug on, every kill logs what
    // each probe returned so we can see which one (if any) the game actually exposes.

    function findIn(panel, id) {
        if (!isValid(panel) || typeof panel.FindChildTraverse !== 'function') return null;
        try {
            const found = panel.FindChildTraverse(id);
            return isValid(found) ? found : null;
        } catch (e) {
            return null;
        }
    }

    function probe(fn) {
        try {
            return fn();
        } catch (e) {
            return undefined;
        }
    }

    function describePanel(label, panel) {
        if (!isValid(panel)) return label + ': <missing>';
        const parts = [label + ': type=' + probe(() => panel.paneltype) + ' id=' + probe(() => panel.id)];
        const values = $.SmackChatHeroes.heroNumberProbes(panel);
        for (const key in values) {
            if (values[key] !== undefined) parts.push(key + '=' + JSON.stringify(values[key]));
        }
        const registry = $.SmackChatHeroes;
        const classes = registry ? registry.knownIds().filter(key => hasClass(panel, key)) : [];
        parts.push('heroClasses=[' + classes.join(',') + ']');
        const src = probe(() => panel.GetAttributeString('src', ''));
        if (src) parts.push('src=' + src);
        const bg = probe(() => panel.style.backgroundImage);
        if (bg) parts.push('bg=' + bg);
        return parts.join(' ');
    }

    // Internal name (e.g. 'hero_atlas') of the hero on this kill panel, or null if unknown.
    function getVictimHero(killPanel) {
        const registry = $.SmackChatHeroes;
        if (!registry) return null;

        const badge = findIn(killPanel, 'heroBadge');
        const image = findIn(badge, 'HeroImage');
        const candidates = [image, badge, killPanel];

        if (setting('debug', true)) {
            log('victim probe ' + describePanel('panel', killPanel));
            log('victim probe ' + describePanel('badge', badge));
            log('victim probe ' + describePanel('image', image));
        }

        // Numeric hero id first, then an internal name used as a CSS class.
        const found = registry.identify(candidates);
        if (found) {
            log('victim is ' + found.id + ' (' + found.how + ')');
            return found.id;
        }

        log('victim hero unknown, using generic lines');
        return null;
    }

    function onKill(killPanel) {
        // Master switch (smack_config.js, or the Esc menu panel for this match).
        if (!setting('enabled', true)) {
            log('mod switched off in settings, kill ignored');
            return;
        }

        const hero = getLocalHero();
        if (!hero || !hero.hasLines()) return;

        if (isSomeoneElsesKill()) {
            log('kill is not ours (spectating, or our hero is dead), ignored');
            return;
        }

        // No cooldown: every kill sends. The one exception is a kill landing while the previous
        // line is still being typed into chat (a fraction of a second) -- it is dropped, because
        // overwriting the in-flight text would garble or lose the first line.
        if (State.sending) {
            log('send in flight, kill ignored');
            return;
        }

        State.message = hero.pick(getVictimHero(killPanel));
        if (!State.message) return;
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
            if (State.primed) onKill(panel);
        }

        State.primed = true;
        $.Schedule(CONFIG.POLL_RATE, scan);
    }

    log('loaded (generation ' + GENERATION + ')');
    scan();
})();
