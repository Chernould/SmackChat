// SmackChat permanent settings.
//
// Deadlock gives mods no way to save anything, so this file IS the saved settings. The in-game
// panel (Esc menu > SmackChat) can change these for the current match only; its Export button
// prints a ready-made copy of these lines with your changes -- paste them here and rebuild.
//
// Per-hero line weights are not here: they live in each hero file's `vsChance`.

$.SmackChatConfig = {
    // Master switch. false = never send anything.
    enabled: true,

    // Log what the mod is doing to the console as "[SmackChat] ...".
    debug: true,
};
