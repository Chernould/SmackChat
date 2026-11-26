// Rat King (hero_ratking)
$.SmackChatHeroes.register({
    id: 'hero_ratking',
    name: 'Rat King',
    lines: [
        "Long live the king.",
        "The rats will clean up the rest.",
        "Bow before your king, peasant.",
    ],
    // Percent chance (0-100) of using a victim's vsHero lines instead of the generic ones,
    // when that victim has some. `default` covers every victim; add e.g. `hero_lash: 70,`
    // to override one. Kept as-is when the sheet is re-imported.
    vsChance: { default: 100 },
    // Lines used instead of `lines` when the victim is that hero.
    // Leave an array empty to fall back to the generic `lines` above.
    vsHero: {
        hero_atlas: [],      // Abrams
        hero_fencer: [],     // Apollo
        hero_baba: [],       // Baba
        hero_bebop: [],      // Bebop
        hero_punkgoat: [],   // Billy
        hero_nano: [],       // Calico
        hero_unicorn: [],    // Celeste
        hero_deadpack: [],   // Deadman Danny
        hero_drifter: [],    // Drifter
        hero_dynamo: [],     // Dynamo
        hero_necro: [],      // Graves
        hero_orion: [],      // Grey Talon
        hero_haze: [],       // Haze
        hero_astro: [],      // Holliday
        hero_inferno: [],    // Infernus
        hero_tengu: [],      // Ivy
        hero_kelvin: [],     // Kelvin
        hero_ghost: [],      // Lady Geist
        hero_lash: [],       // Lash
        hero_forge: [],      // McGinnis
        hero_vampirebat: [], // Mina
        hero_mirage: [],     // Mirage
        hero_krill: [],      // Mo & Krill
        hero_nurse: [],      // Nurse Harrow
        hero_bookworm: [],   // Paige
        hero_chrono: [],     // Paradox
        hero_synth: [],      // Pocket
        hero_ratking: [],    // Rat King
        hero_familiar: [],   // Rem
        hero_gigawatt: [],   // Seven
        hero_shiv: [],       // Shiv
        hero_werewolf: [],   // Silver
        hero_magician: [],   // Sinclair
        hero_chessmaster: [], // Solomon
        hero_doorman: [],    // The Doorman
        hero_priest: [],     // Venator
        hero_frank: [],      // Victor
        hero_hornet: [],     // Vindicta
        hero_artist: [],     // Violet
        hero_viscous: [],    // Viscous
        hero_viper: [],      // Vyper
        hero_warden: [],     // Warden
        hero_wraith: [],     // Wraith
        hero_yamato: [],     // Yamato
    },
});
