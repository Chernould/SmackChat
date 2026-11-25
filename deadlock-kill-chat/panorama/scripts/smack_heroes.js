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

    $.SmackChatHeroes = {
        HeroLines,

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
