// Hero line registry for SmackChat.
//
// Each hero's lines live in their own file under scripts/heroes/, which calls
// $.SmackChatHeroes.register({...}). The layout includes this file first, then the hero files,
// then smack_chat.js, so everything is registered before the kill loop starts.
//
// Shared through `$` (same trick as $.ModHudLookup) because scripts included by one layout
// do not otherwise see each other's locals.

(() => {
    'use strict';

    class HeroLines {
        // def: {
        //   id:     internal hero name, e.g. 'hero_punkgoat' (see CLAUDE.md for the full list)
        //   name:   display name, for logs and readability only
        //   lines:  generic smack lines, used against any victim
        //   vsHero: optional { hero_xxx: [lines] } used instead of `lines` when the victim is
        //           that hero. An empty array falls back to `lines`.
        //   vsChance: optional { default: 100, hero_xxx: 70 } -- percent chance (0-100) that a
        //           kill on a hero with vsHero lines uses those lines; otherwise a generic line is
        //           sent. `default` covers every victim not listed. Missing = 100.
        // }
        constructor(def) {
            this.id = def.id;
            this.name = def.name || def.id;
            this.lines = Array.isArray(def.lines) ? def.lines : [];
            this.vsHero = def.vsHero || {};
            this.vsChance = def.vsChance || {};
        }

        hasLines() {
            return this.lines.length > 0;
        }

        // vsChance with this match's panel changes (smack_settings.js) layered on top, key by key.
        // A null override removes that key, so the victim follows `default` again.
        effectiveVsChance() {
            const settings = $.SmackChatSettings;
            const overrides = settings ? settings.vsChanceOverrides(this.id) : {};
            const merged = Object.assign({}, this.vsChance, overrides);
            for (const key of Object.keys(merged)) if (merged[key] === null) delete merged[key];
            return merged;
        }

        // Whether this victim has its own chance rather than following `default`.
        hasOwnChance(victimHero) {
            return typeof this.effectiveVsChance()[victimHero] === 'number';
        }

        // Percent chance (0-100) of using victim-specific lines against this victim.
        chanceVs(victimHero) {
            const chances = this.effectiveVsChance();
            const own = chances[victimHero];
            const value = typeof own === 'number' ? own
                : typeof chances.default === 'number' ? chances.default : 100;
            return Math.max(0, Math.min(100, value));
        }

        // Whether this hero has any lines specific to that victim.
        hasLinesVs(victimHero) {
            const special = this.vsHero[victimHero];
            return !!(special && special.length);
        }

        // Returns a random line. When the victim has specific lines, they are used with the
        // chance from vsChance; otherwise (or when the roll fails) a generic line is used.
        pick(victimHero) {
            const special = victimHero ? this.vsHero[victimHero] : null;
            let pool = this.lines;
            if (special && special.length) {
                // Roll against the chance, but never fall back to an empty generic list.
                if (!pool.length || Math.random() * 100 < this.chanceVs(victimHero)) pool = special;
            }
            if (!pool.length) return '';
            return pool[Math.floor(Math.random() * pool.length)];
        }
    }

    const heroes = {};

    // Numeric hero id (as used by CitadelHeroImage's `heroid` attribute) -> internal name.
    // Same numbers as the ID column in CLAUDE.md (Deadworks DB, build 6868).
    const HERO_NUMBERS = {
        1: 'hero_inferno', 2: 'hero_gigawatt', 3: 'hero_hornet', 4: 'hero_ghost',
        6: 'hero_atlas', 7: 'hero_wraith', 8: 'hero_forge', 10: 'hero_chrono',
        11: 'hero_dynamo', 12: 'hero_kelvin', 13: 'hero_haze', 14: 'hero_astro',
        15: 'hero_bebop', 16: 'hero_nano', 17: 'hero_orion', 18: 'hero_krill',
        19: 'hero_shiv', 20: 'hero_tengu', 25: 'hero_warden', 27: 'hero_yamato',
        31: 'hero_lash', 35: 'hero_viscous', 50: 'hero_synth', 52: 'hero_mirage',
        58: 'hero_viper', 60: 'hero_magician', 63: 'hero_vampirebat', 64: 'hero_drifter',
        65: 'hero_priest', 66: 'hero_frank', 67: 'hero_bookworm', 69: 'hero_doorman',
        72: 'hero_punkgoat', 76: 'hero_necro', 77: 'hero_fencer', 78: 'hero_deadpack',
        79: 'hero_familiar', 80: 'hero_werewolf', 81: 'hero_unicorn', 84: 'hero_ratking',
        85: 'hero_chessmaster', 86: 'hero_artist', 87: 'hero_nurse', 88: 'hero_baba',
    };

    function idFromNumber(n) {
        return HERO_NUMBERS[n] || null;
    }

    function knownIds() {
        const ids = Object.keys(HERO_NUMBERS).map(n => HERO_NUMBERS[n]);
        for (const id of Object.keys(heroes)) if (ids.indexOf(id) === -1) ids.push(id);
        return ids;
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

    function probe(fn) {
        try {
            return fn();
        } catch (e) {
            return undefined;
        }
    }

    // Every way we know of to read a numeric hero id off a panel (CitadelHeroImage takes a
    // `heroid` attribute), by name, so smack_chat.js can log them when debugging.
    function heroNumberProbes(panel) {
        return {
            'prop heroid': probe(() => panel.heroid),
            'prop heroID': probe(() => panel.heroID),
            'prop hero_id': probe(() => panel.hero_id),
            'attrInt heroid': probe(() => panel.GetAttributeInt('heroid', -1)),
            'attrStr heroid': probe(() => panel.GetAttributeString('heroid', '')),
            'attrInt hero_id': probe(() => panel.GetAttributeInt('hero_id', -1)),
            'dvarInt hero_id': probe(() => panel.GetDialogVariableInt('hero_id')),
        };
    }

    function readHeroNumber(panel) {
        if (!isValid(panel)) return -1;
        const values = heroNumberProbes(panel);
        for (const key in values) {
            const n = parseInt(values[key], 10);
            if (n > 0) return n;
        }
        return -1;
    }

    // Internal name of the hero shown by any of these panels, tried in order: first a numeric hero
    // id on any panel, then an internal name used as a CSS class. Returns { id, how } or null.
    function identify(panels) {
        for (const panel of panels) {
            const id = idFromNumber(readHeroNumber(panel));
            if (id) return { id, how: 'hero id' };
        }
        const ids = knownIds();
        for (const panel of panels) {
            const id = ids.find(key => hasClass(panel, key));
            if (id) return { id, how: 'class' };
        }
        return null;
    }

    function findIn(panel, id) {
        if (!isValid(panel) || typeof panel.FindChildTraverse !== 'function') return null;
        const found = probe(() => panel.FindChildTraverse(id));
        return isValid(found) ? found : null;
    }

    // Top of the panel tree, where the HUD's native panels live.
    function getRoot() {
        let cursor = $.GetContextPanel();
        for (let guard = 0; cursor && cursor.GetParent && cursor.GetParent() && guard < 50; guard += 1) {
            cursor = cursor.GetParent();
        }
        return cursor;
    }

    $.SmackChatHeroes = {
        HeroLines,
        idFromNumber,
        knownIds,
        heroNumberProbes,
        identify,
        findIn,

        // HeroLines for the hero you are playing, or null. The local shop panel carries the
        // current hero's internal name as a CSS class.
        local() {
            const shop = findIn(getRoot(), 'CitadelHudHeroShop');
            const id = Object.keys(heroes).find(key => hasClass(shop, key));
            return id ? heroes[id] : null;
        },

        // Internal names of the enemy team's heroes, read off the top bar portraits
        // (TopBar > TeamEnemy > PlayersContainer > CitadelHudTopBarPlayer > HeroBadge).
        enemies() {
            const topBar = $.ModHudLookup.find('TopBar');
            const container = findIn(findIn(topBar, 'TeamEnemy'), 'PlayersContainer');
            const kids = (container && probe(() => container.Children())) || [];
            const ids = [];
            for (const player of kids) {
                if (!isValid(player)) continue;
                const badge = findIn(player, 'HeroBadge');
                const found = identify([findIn(badge, 'HeroImage'), badge, player]);
                if (found && ids.indexOf(found.id) === -1) ids.push(found.id);
            }
            return ids;
        },

        // Display name for an internal name (falls back to the internal name).
        nameOf(id) {
            return heroes[id] ? heroes[id].name : id;
        },

        register(def) {
            if (!def || !def.id) return;
            heroes[def.id] = new HeroLines(def);
        },

        get(id) {
            return heroes[id] || null;
        },

        ids() {
            return Object.keys(heroes);
        },
    };
})();
