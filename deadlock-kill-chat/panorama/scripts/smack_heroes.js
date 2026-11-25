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
        //           that hero. Victim detection is not wired up yet, so these are not used today.
        // }
        constructor(def) {
            this.id = def.id;
            this.name = def.name || def.id;
            this.lines = Array.isArray(def.lines) ? def.lines : [];
            this.vsHero = def.vsHero || {};
        }

        hasLines() {
            return this.lines.length > 0;
        }

        // Returns a random line, preferring victim-specific lines when we have some.
        pick(victimHero) {
            const special = victimHero ? this.vsHero[victimHero] : null;
            const pool = special && special.length ? special : this.lines;
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

    $.SmackChatHeroes = {
        HeroLines,

        // Internal name for a numeric hero id, or null if unknown.
        idFromNumber(n) {
            return HERO_NUMBERS[n] || null;
        },

        // Every known hero's internal name, whether or not it has a lines file.
        knownIds() {
            const ids = Object.keys(HERO_NUMBERS).map(n => HERO_NUMBERS[n]);
            for (const id of Object.keys(heroes)) if (ids.indexOf(id) === -1) ids.push(id);
            return ids;
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
