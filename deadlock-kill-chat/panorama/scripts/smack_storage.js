// SmackChat persistent storage -- TEST BUILD.
//
// Deadlock gives Panorama scripts no storage, but a CitadelHTMLPanel is a real (CEF) browser, and
// its localStorage survives game restarts. So we open our own page, docs/bridge.html hosted on
// GitHub Pages, in a tiny hidden CitadelHTMLPanel and talk to it:
//   - requests go out by changing only the URL fragment (SetURL(BRIDGE_URL + '#' + json));
//   - answers come back as the page's title (the HTMLTitle event).
// Same technique as the QOLLOCK mod (github.com/civo7/QOLLOCK, core/ql_storage_transport.js).
// The full protocol is documented in docs/bridge.html.
//
// API: $.SmackChatStorage.save(key, string, cb) / load(key, cb) / remove(key, cb)
//      cb(error, value); status() -> { state, detail }; onReady(fn).
// Requests made before the page is ready are queued. One request is in flight at a time.

(() => {
    'use strict';

    // Where docs/bridge.html is published. Must be HTTPS -- the game's browser opens nothing else.
    const BRIDGE_URL = 'https://chernould.github.io/SmackChat/bridge.html';

    const PANEL_ID = 'SmackChatStorageBridge';
    const REQUEST_TIMEOUT = 5.0;   // seconds per request
    const READY_TIMEOUT = 10.0;    // seconds to wait for the page before reloading it
    const MAX_LOAD_ATTEMPTS = 4;

    const CTX = $.GetContextPanel();

    function log(message) {
        try {
            if (!$.SmackChatSettings || $.SmackChatSettings.get('debug')) $.Msg('[SmackChat storage] ' + message);
        } catch (e) {}
    }

    function valid(panel) {
        return !!(panel && (!panel.IsValid || panel.IsValid()));
    }

    const st = {
        panel: null,
        state: 'starting',  // starting | loading | ready | failed
        detail: '',
        token: '',
        attempts: 0,
        queue: [],
        active: null,       // { id, req, cb, timer }
        counter: 0,
        readyCallbacks: [],
        gen: Math.floor(Math.random() * 1e9),
    };

    function setState(state, detail) {
        st.state = state;
        st.detail = detail || '';
        log('state: ' + state + (detail ? ' (' + detail + ')' : ''));
    }

    function finish(error, value) {
        const active = st.active;
        if (!active) return;
        st.active = null;
        if (active.timer) {
            try { $.CancelScheduled(active.timer); } catch (e) {}
        }
        try {
            active.cb(error, value);
        } catch (e) {
            log('callback threw: ' + e);
        }
        pump();
    }

    function pump() {
        if (st.active || st.state !== 'ready' || !st.queue.length) return;
        const item = st.queue.shift();
        st.counter += 1;
        item.id = 'smack_' + st.gen + '_' + st.counter;
        st.active = item;
        const message = Object.assign({ id: item.id, token: st.token }, item.req);
        try {
            st.panel.SetURL(BRIDGE_URL + '#' + encodeURIComponent(JSON.stringify(message)));
        } catch (e) {
            finish('SetURL failed: ' + e);
            return;
        }
        const id = item.id;
        item.timer = $.Schedule(REQUEST_TIMEOUT, () => {
            if (st.active && st.active.id === id) finish('timed out');
        });
    }

    function failAll(error) {
        const pending = st.queue.splice(0);
        if (st.active) finish(error);
        for (const item of pending) {
            try { item.cb(error); } catch (e) {}
        }
    }

    // The HTMLTitle handler's arguments are not documented; take the first string one.
    function onTitle() {
        let title = null;
        for (let i = 0; i < arguments.length; i += 1) {
            if (typeof arguments[i] === 'string') { title = arguments[i]; break; }
        }
        if (!title) return;

        if (title.indexOf('SMACK_READY:') === 0) {
            st.token = title.slice('SMACK_READY:'.length);
            if (st.state !== 'ready') {
                setState('ready', 'connected after ' + st.attempts + ' load(s)');
                const callbacks = st.readyCallbacks.splice(0);
                for (const fn of callbacks) {
                    try { fn(); } catch (e) { log('onReady callback threw: ' + e); }
                }
            }
            pump();
            return;
        }
        if (title.indexOf('SMACK_ERROR:') === 0) {
            setState('failed', 'page error: ' + title.slice('SMACK_ERROR:'.length));
            failAll(st.detail);
            return;
        }
        if (title.indexOf('SMACK_RES:') === 0) {
            let res = null;
            try {
                res = JSON.parse(title.slice('SMACK_RES:'.length));
            } catch (e) {
                return;
            }
            if (!st.active || !res || res.id !== st.active.id) return; // stale or not ours
            if (res.ok) finish(null, res.value);
            else finish(res.error || 'request failed');
        }
    }

    function loadPage() {
        st.attempts += 1;
        setState('loading', 'attempt ' + st.attempts + ' of ' + MAX_LOAD_ATTEMPTS);
        try {
            st.panel.SetURL(BRIDGE_URL);
        } catch (e) {
            setState('failed', 'SetURL failed: ' + e);
            failAll(st.detail);
            return;
        }
        $.Schedule(READY_TIMEOUT, () => {
            if (st.state === 'ready' || st.state === 'failed') return;
            if (st.attempts < MAX_LOAD_ATTEMPTS) {
                loadPage();
            } else {
                setState('failed', 'page never answered -- offline, wrong BRIDGE_URL, or page not published');
                failAll(st.detail);
            }
        });
    }

    function init() {
        if (!valid(CTX)) return;
        // A bridge panel left over from an earlier HUD load belongs to that load's script.
        try {
            const old = CTX.FindChildTraverse(PANEL_ID);
            if (valid(old)) old.DeleteAsync(0);
        } catch (e) {}

        let panel = null;
        try {
            panel = $.CreatePanel('CitadelHTMLPanel', CTX, PANEL_ID);
        } catch (e) {
            setState('failed', 'cannot create CitadelHTMLPanel: ' + e);
            return;
        }
        if (!valid(panel)) {
            setState('failed', 'CitadelHTMLPanel was not created');
            return;
        }
        st.panel = panel;
        // Tiny and nearly invisible, but still "visible" so the browser keeps running.
        panel.hittest = false;
        try { panel.acceptsfocus = false; } catch (e) {}
        panel.style.width = '2px';
        panel.style.height = '2px';
        panel.style.opacity = '0.01';
        panel.style.visibility = 'visible';

        try {
            $.RegisterEventHandler('HTMLTitle', panel, onTitle);
        } catch (e) {
            setState('failed', 'cannot listen for HTMLTitle: ' + e);
            return;
        }
        loadPage();
    }

    function request(req, cb) {
        const callback = typeof cb === 'function' ? cb : () => {};
        if (st.state === 'failed') {
            callback('storage unavailable: ' + st.detail);
            return;
        }
        st.queue.push({ req, cb: callback });
        pump();
    }

    $.SmackChatStorage = {
        url: BRIDGE_URL,
        save(key, value, cb) {
            request({ op: 'save', key, value: String(value) }, cb);
        },
        load(key, cb) {
            request({ op: 'load', key }, cb);
        },
        remove(key, cb) {
            request({ op: 'remove', key }, cb);
        },
        status() {
            return { state: st.state, detail: st.detail };
        },
        onReady(fn) {
            if (st.state === 'ready') fn();
            else st.readyCallbacks.push(fn);
        },
    };

    init();
})();
