// SmackChat in-game settings panel (Esc menu > SmackChat).
//
// Deadlock gives mods no storage (tested 2026-11-26: no localStorage, no GameUI, nothing), and
// every match starts a fresh HUD. So:
//   - smack_config.js and each hero file's `vsChance` are the permanent settings;
//   - this panel changes them for the current match only;
//   - Export prints the changed values to paste back into those files.
//
// Everything is built from script ($.CreatePanel + inline styles), so no CSS file has to be
// compiled. Other scripts read settings through $.SmackChatSettings.

(() => {
    'use strict';

    const STORE_KEY = 'SmackChatSettings';
    const BUTTON_ID = 'SmackChatMenuButton';
    const PANEL_ID = 'SmackChatSettingsPanel';
    const ENSURE_RATE = 1.0; // seconds between checks that our Esc-menu button still exists

    // Used when smack_config.js is missing a key.
    const DEFAULTS = { enabled: true, debug: true };
    const CHANCE_STEP = 10;

    const COLORS = {
        text: '#e8e2d0', dim: '#8a8478', accent: '#f2c14e', panel: '#14110df2',
        border: '#8c7a55', button: '#3a3226', on: '#7bc96f', off: '#d9725b',
    };

    const CTX = $.GetContextPanel();

    function log(message) {
        try {
            if (!$.SmackChatSettings || $.SmackChatSettings.get('debug')) $.Msg('[SmackChat settings] ' + message);
        } catch (e) {}
    }

    function valid(panel) {
        return !!(panel && (!panel.IsValid || panel.IsValid()));
    }

    function attempt(fn, fallback) {
        try {
            return fn();
        } catch (e) {
            return fallback;
        }
    }

    function childById(panel, id) {
        if (!valid(panel)) return null;
        const kids = attempt(() => panel.Children(), []) || [];
        return kids.find(k => valid(k) && k.id === id) || null;
    }

    function clamp(n, lo, hi) {
        return Math.max(lo, Math.min(hi, n));
    }

    // Sorts internal names by display name. Plain comparison on purpose: Deadlock's V8 has no ICU
    // data, so String.prototype.localeCompare throws "RangeError: Internal error. Icu error."
    function byName(a, b) {
        const x = $.SmackChatHeroes.nameOf(a).toLowerCase();
        const y = $.SmackChatHeroes.nameOf(b).toLowerCase();
        return x < y ? -1 : x > y ? 1 : 0;
    }

    // ---------------------------------------------------------------- settings store

    function getSharedStore() {
        try {
            if (typeof GameUI !== 'undefined' && GameUI.CustomUIConfig) return GameUI.CustomUIConfig();
        } catch (e) {}
        globalThis.__SmackChatFallbackStore = globalThis.__SmackChatFallbackStore || {};
        return globalThis.__SmackChatFallbackStore;
    }

    function configDefaults() {
        return Object.assign({}, DEFAULTS, $.SmackChatConfig || {});
    }

    // Kept across HUD reloads within a match through the shared store; a new match starts clean.
    const shared = getSharedStore();
    const previous = shared[STORE_KEY];
    // Random rather than a counter: the counter lives in script state, which resets every match,
    // so two loads could both be "1" and mistake each other's Esc-menu panels for their own.
    const GENERATION = 'g' + Math.floor(Math.random() * 1e9) + '_' + Date.now();
    const state = {
        values: Object.assign(configDefaults(), (previous && previous.values) || {}),
        // { hero_xxx: { default: 50, hero_lash: 70 } } -- changes on top of hero files' vsChance.
        vsChance: (previous && previous.vsChance) || {},
    };
    shared[STORE_KEY] = { generation: GENERATION, values: state.values, vsChance: state.vsChance };

    function isRetired() {
        if (!valid(CTX)) return true;
        const current = shared[STORE_KEY];
        return !current || current.generation !== GENERATION;
    }

    $.SmackChatSettings = {
        get(key) {
            return key in state.values ? state.values[key] : DEFAULTS[key];
        },
        set(key, value) {
            state.values[key] = value;
            log(key + ' = ' + JSON.stringify(value));
        },
        // This match's vsChance changes for one hero (read by HeroLines.chanceVs).
        vsChanceOverrides(heroId) {
            return state.vsChance[heroId] || {};
        },
        setVsChance(heroId, key, value) {
            state.vsChance[heroId] = state.vsChance[heroId] || {};
            state.vsChance[heroId][key] = value;
            log(heroId + ' vsChance ' + key + ' = ' + value);
        },
        reset() {
            for (const key of Object.keys(state.values)) delete state.values[key];
            Object.assign(state.values, configDefaults());
            for (const key of Object.keys(state.vsChance)) delete state.vsChance[key];
            log('reset to file settings');
        },
    };
    const S = $.SmackChatSettings;

    // ---------------------------------------------------------------- export

    function formatValue(v) {
        return typeof v === 'string' ? "'" + v + "'" : String(v);
    }

    // Lines to paste back into smack_config.js and the current hero's file.
    function buildExport(hero) {
        const lines = ['smack_config.js -- replace the matching lines:'];
        for (const key of Object.keys(DEFAULTS)) lines.push('    ' + key + ': ' + formatValue(S.get(key)) + ',');
        if (hero) {
            const chances = hero.effectiveVsChance();
            const keys = Object.keys(chances).filter(k => k !== 'default')
                .sort(byName);
            const parts = ['default: ' + (typeof chances.default === 'number' ? chances.default : 100)];
            for (const key of keys) parts.push(key + ': ' + chances[key]);
            lines.push('');
            lines.push(hero.id + '.js -- replace the vsChance line:');
            lines.push('    vsChance: { ' + parts.join(', ') + ' },');
        }
        return lines;
    }

    // ---------------------------------------------------------------- panel building blocks

    function makeLabel(parent, text, opts = {}) {
        const label = $.CreatePanel('Label', parent, opts.id || '');
        label.text = text;
        label.style.color = opts.color || COLORS.text;
        label.style.fontSize = (opts.size || 17) + 'px';
        label.style.marginBottom = (opts.gap == null ? 6 : opts.gap) + 'px';
        if (opts.bold) label.style.fontWeight = 'bold';
        if (opts.width) label.style.width = opts.width;
        else if (!opts.fit) label.style.width = '100%';
        return label;
    }

    function onClick(panel, fn) {
        const handler = () => {
            try {
                fn();
            } catch (e) {
                log('click handler threw: ' + e);
            }
        };
        try {
            panel.SetPanelEvent('onactivate', handler);
        } catch (e) {
            attempt(() => $.RegisterEventHandler('Activated', panel, handler));
        }
    }

    function makeButton(parent, text, fn, opts = {}) {
        const button = $.CreatePanel('Button', parent, '');
        button.style.backgroundColor = COLORS.button;
        button.style.border = '1px solid ' + COLORS.border;
        button.style.padding = '4px 12px';
        button.style.marginRight = '8px';
        button.style.marginBottom = '4px';
        button.style.verticalAlign = 'center';
        if (opts.width) button.style.width = opts.width;
        makeLabel(button, text, { gap: 0, fit: !opts.width, color: opts.color, size: opts.size || 16 });
        onClick(button, fn);
        return button;
    }

    function makeRow(parent) {
        const row = $.CreatePanel('Panel', parent, '');
        row.style.flowChildren = 'right';
        row.style.width = '100%';
        row.style.marginBottom = '4px';
        return row;
    }

    function makeHeading(parent, text) {
        const h = makeLabel(parent, text, { size: 19, bold: true, color: COLORS.accent, gap: 6 });
        h.style.marginTop = '10px';
        return h;
    }

    // "Name   [-]  value  [+]" on one row. Returns the row so callers can add more to it.
    function makeStepper(parent, name, valueText, onMinus, onPlus) {
        const row = makeRow(parent);
        const label = makeLabel(row, name, { width: '230px', gap: 0 });
        label.style.verticalAlign = 'center';
        makeButton(row, '-', onMinus, { width: '36px' });
        const value = makeLabel(row, valueText, { width: '70px', gap: 0, bold: true });
        value.style.verticalAlign = 'center';
        value.style.textAlign = 'center';
        makeButton(row, '+', onPlus, { width: '36px' });
        return row;
    }

    function makeToggle(parent, name, key) {
        const on = !!S.get(key);
        const row = makeRow(parent);
        const label = makeLabel(row, name, { width: '230px', gap: 0 });
        label.style.verticalAlign = 'center';
        makeButton(row, on ? 'ON' : 'OFF', () => {
            S.set(key, !S.get(key));
            render();
        }, { width: '70px', color: on ? COLORS.on : COLORS.off });
        return row;
    }

    // ---------------------------------------------------------------- panel content

    const ui = { panel: null, body: null, preview: '', exportLines: null, storageResult: '' };

    // ---------------------------------------------------------------- saving test (TEST BUILD)
    //
    // Checks that smack_storage.js can keep a value across a full game restart: "Save test value"
    // stores the current time; every time the panel opens it loads whatever was stored.

    const STORAGE_TEST_KEY = 'test';

    function storageLoadTest() {
        const storage = $.SmackChatStorage;
        if (!storage) return;
        storage.load(STORAGE_TEST_KEY, (error, value) => {
            ui.storageResult = error ? 'Load failed: ' + error
                : value == null ? 'Nothing saved yet.'
                : 'Saved value: ' + value;
            render();
        });
    }

    function storageSaveTest() {
        const storage = $.SmackChatStorage;
        if (!storage) return;
        const value = 'saved at ' + new Date().toISOString();
        ui.storageResult = 'Saving...';
        render();
        storage.save(STORAGE_TEST_KEY, value, error => {
            ui.storageResult = error ? 'Save failed: ' + error : 'Saved: "' + value + '". Restart the game and open this panel.';
            render();
        });
    }

    function renderStorageTest(body) {
        const storage = $.SmackChatStorage;
        makeHeading(body, 'Saving test');
        if (!storage) {
            makeLabel(body, 'smack_storage.js is not loaded.', { color: COLORS.off });
            return;
        }
        const s = storage.status();
        const color = s.state === 'ready' ? COLORS.on : s.state === 'failed' ? COLORS.off : COLORS.text;
        makeLabel(body, 'Connection: ' + s.state + (s.detail ? ' -- ' + s.detail : ''), { size: 15, color, gap: 3 });
        if (ui.storageResult) makeLabel(body, ui.storageResult, { size: 15, gap: 3 });
        const row = makeRow(body);
        makeButton(row, 'Save test value', storageSaveTest);
        makeButton(row, 'Load again', storageLoadTest);
        makeButton(row, 'Refresh', () => render());
    }

    function previewText(hero, victim) {
        const line = hero.pick(victim);
        if (!line) return 'No lines to preview.';
        const special = victim && hero.hasLinesVs(victim) && hero.vsHero[victim].indexOf(line) !== -1;
        const kind = special ? $.SmackChatHeroes.nameOf(victim) + ' line' : 'general line';
        return 'Preview (' + kind + '): ' + line;
    }

    function renderGeneral(body) {
        makeHeading(body, 'General');
        makeToggle(body, 'SmackChat', 'enabled');
        makeToggle(body, 'Debug log (console)', 'debug');
    }

    function renderWeights(body, hero) {
        const registry = $.SmackChatHeroes;
        if (!hero) {
            makeHeading(body, 'Hero-specific lines');
            makeLabel(body, 'Pick a hero first -- weights are per hero.', { color: COLORS.dim });
            return;
        }
        makeHeading(body, 'Hero-specific lines -- playing as ' + hero.name);
        makeLabel(body, 'Chance of sending a line written for that enemy instead of a general one. '
            + 'Enemies marked "default" follow the default; change one to give it its own value.',
            { size: 14, color: COLORS.dim });

        const defaultChance = () => {
            const c = hero.effectiveVsChance();
            return typeof c.default === 'number' ? c.default : 100;
        };
        const stepDefault = delta => () => {
            S.setVsChance(hero.id, 'default', clamp(defaultChance() + delta, 0, 100));
            render();
        };
        const stepVictim = (victim, delta) => () => {
            S.setVsChance(hero.id, victim, clamp(hero.chanceVs(victim) + delta, 0, 100));
            render();
        };

        makeStepper(body, 'Default for all enemies', defaultChance() + '%',
            stepDefault(-CHANCE_STEP), stepDefault(CHANCE_STEP));

        let victims = registry.enemies();
        let source = 'this match\'s enemies';
        if (!victims.length) {
            // Top bar unreadable (or no match yet): offer every hero this hero has lines for.
            victims = Object.keys(hero.vsHero).filter(v => hero.hasLinesVs(v));
            source = 'every hero with lines (enemy team not found)';
        }
        makeLabel(body, 'Per enemy -- ' + source + ':', { size: 14, color: COLORS.dim, gap: 4 });
        victims.sort(byName);
        for (const victim of victims) {
            const name = registry.nameOf(victim);
            if (!hero.hasLinesVs(victim)) {
                makeLabel(body, name + ' -- no specific lines, always general', { size: 15, color: COLORS.dim, gap: 4 });
                continue;
            }
            const row = makeStepper(body, name + ' (' + hero.vsHero[victim].length + ' lines)', hero.chanceVs(victim) + '%',
                stepVictim(victim, -CHANCE_STEP), stepVictim(victim, CHANCE_STEP));
            if (hero.hasOwnChance(victim)) {
                // null drops the value (also one from the hero file) so it follows the default.
                makeButton(row, 'Use default', () => {
                    S.setVsChance(hero.id, victim, null);
                    render();
                }, { width: '120px' });
            } else {
                const tag = makeLabel(row, 'default', { width: '120px', gap: 0, size: 15, color: COLORS.dim });
                tag.style.verticalAlign = 'center';
                tag.style.marginRight = '8px';
                tag.style.textAlign = 'center';
            }
            makeButton(row, 'Preview', () => {
                ui.preview = previewText(hero, victim);
                render();
            });
        }
        if (!victims.length) makeLabel(body, hero.name + ' has no hero-specific lines yet.', { color: COLORS.dim });
    }

    function renderExport(body) {
        if (!ui.exportLines) return;
        makeHeading(body, 'Export');
        makeLabel(body, 'Also printed to the console. Paste into the files and rebuild to keep these settings.',
            { size: 14, color: COLORS.dim, gap: 4 });
        const text = ui.exportLines.join('\n');
        // A TextEntry lets you select and copy; fall back to a label if it can't be created.
        const entry = attempt(() => $.CreatePanel('TextEntry', body, 'SmackChatExportText', { multiline: 'true' }), null);
        if (entry) {
            entry.text = text;
            entry.style.width = '100%';
            entry.style.height = '150px';
            entry.style.fontSize = '14px';
            entry.style.color = COLORS.text;
            entry.style.backgroundColor = '#000000aa';
            entry.style.border = '1px solid ' + COLORS.border;
        } else {
            makeLabel(body, text, { size: 14 });
        }
    }

    function render() {
        if (!valid(ui.body)) return;
        attempt(() => ui.body.RemoveAndDeleteChildren());
        const body = ui.body;
        const hero = $.SmackChatHeroes ? $.SmackChatHeroes.local() : null;

        renderGeneral(body);
        renderWeights(body, hero);

        if (ui.preview) makeLabel(body, ui.preview, { size: 16, color: COLORS.accent, gap: 4 }).style.marginTop = '8px';

        const row = makeRow(body);
        row.style.marginTop = '12px';
        makeButton(row, 'Preview general line', () => {
            ui.preview = hero ? previewText(hero, null) : 'Pick a hero first.';
            render();
        });
        makeButton(row, 'Export', () => {
            ui.exportLines = buildExport(hero);
            for (const line of ui.exportLines) $.Msg('[SmackChat export] ' + line);
            render();
        });
        makeButton(row, 'Undo match changes', () => {
            S.reset();
            ui.preview = '';
            ui.exportLines = null;
            render();
        });
        makeButton(row, 'Close', () => { ui.panel.visible = false; });

        renderExport(body);
        renderStorageTest(body);
    }

    function buildPanel(menu) {
        const panel = $.CreatePanel('Panel', menu, PANEL_ID);
        panel.__smackChatGeneration = GENERATION;
        panel.hittest = true;
        const s = panel.style;
        s.width = '720px';
        s.height = 'fit-children';
        s.maxHeight = '90%';
        s.overflow = 'squish scroll';
        s.horizontalAlign = 'center';
        s.verticalAlign = 'center';
        s.flowChildren = 'down';
        s.backgroundColor = COLORS.panel;
        s.border = '2px solid ' + COLORS.border;
        s.padding = '20px';
        s.zIndex = '100';

        makeLabel(panel, 'SmackChat', { size: 28, bold: true, color: COLORS.accent, gap: 2 });
        makeLabel(panel, 'Changes last until this match ends. Export to keep them.', { size: 14, color: COLORS.dim, gap: 4 });

        const body = $.CreatePanel('Panel', panel, 'SmackChatSettingsBody');
        body.style.flowChildren = 'down';
        body.style.width = '100%';

        ui.panel = panel;
        ui.body = body;
        log('panel built');
        return panel;
    }

    function togglePanel() {
        const menu = $.ModHudLookup.find('EscapeMenu');
        if (!valid(menu)) {
            log('EscapeMenu not found, cannot open panel');
            return;
        }
        let panel = childById(menu, PANEL_ID);
        if (panel && panel.__smackChatGeneration !== GENERATION) {
            attempt(() => panel.DeleteAsync(0));
            panel = null;
        }
        if (!panel) panel = buildPanel(menu);
        else panel.visible = !panel.visible;
        // Re-read hero and enemies every time it opens; they change after the panel is built.
        if (panel.visible) {
            ui.preview = '';
            ui.storageResult = 'Loading saved value...';
            render();
            storageLoadTest();
        }
    }

    // ---------------------------------------------------------------- Esc menu button

    function ensureButton() {
        const sub = $.ModHudLookup.find('SubOptions');
        if (!valid(sub)) return false;

        const existing = childById(sub, BUTTON_ID);
        if (existing && existing.__smackChatGeneration === GENERATION) return true;
        // A button from an earlier HUD load points at that load's (dead) script; replace it.
        if (existing) attempt(() => existing.DeleteAsync(0));

        const button = $.CreatePanel('Button', sub, BUTTON_ID);
        button.__smackChatGeneration = GENERATION;
        attempt(() => button.AddClass('nav_menu_item'));
        attempt(() => button.AddClass('minor'));
        button.style.marginTop = '6px';
        button.style.marginBottom = '6px';
        const label = $.CreatePanel('Label', button, '');
        label.text = 'SmackChat';
        attempt(() => label.AddClass('menuButtonLabel'));
        label.style.color = COLORS.accent;
        onClick(button, togglePanel);

        const quit = childById(sub, 'quit');
        if (quit) attempt(() => sub.MoveChildBefore(button, quit));
        log('Esc menu button added (generation ' + GENERATION + ')');
        return true;
    }

    let reportedMissing = false;
    function ensureLoop() {
        if (isRetired()) {
            log('retired (generation ' + GENERATION + ')');
            return;
        }
        let ok = false;
        try {
            ok = ensureButton();
        } catch (e) {
            log('ensureButton threw: ' + e);
        }
        if (!ok && !reportedMissing) {
            log('Esc menu SubOptions not found yet, will keep checking');
            reportedMissing = true;
        }
        $.Schedule(ENSURE_RATE, ensureLoop);
    }

    log('loaded (generation ' + GENERATION + ')');
    ensureLoop();
})();
