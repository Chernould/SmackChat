# SmackChat — project context

A client-side **Panorama UI mod for Valve's Deadlock**. When the local player gets a kill, it
automatically posts a random, hero-flavoured "smack talk" line to **ALL chat**. Lines are written
in the voice of the hero the mod user is playing.

Status (2026-11-26): working for kills only. Every playable hero (44) has a file; lines are
imported from the Google Sheet (see below). Victim detection works in-game (user confirmed).
Hero-vs-hero lines are weighted per hero file (`vsChance`). Kills by a spectated teammate are
ignored (fix written 2026-11-26, not yet confirmed in-game). In-game settings panel in the Esc
menu (test build confirmed in-game; full panel built 2026-11-26, not yet tried in-game). Plans:
an optional "also fire on assists" setting.

**Panorama itself has no storage** (tested in-game 2026-11-26): no `localStorage`/`sessionStorage`,
no `GameUI` (so no `CustomUIConfig`), no `Game`/`Players`/`GameInterfaceAPI`. Globals are only
`$`, `panorama`, the sound functions and JS builtins. `$` has `AsyncWebRequest`,
`CreatePanel(WithProperties)`, `RegisterKeyBind`, `RegisterEventHandler`,
`RegisterForUnhandledEvent`, `Schedule`, `CancelScheduled`, `Localize`, … Every match starts a
fresh HUD, so script state (`globalThis`) resets each match. **But** a `CitadelHTMLPanel` is a
real CEF browser whose `localStorage` survives restarts — that's how the QOLLOCK mod saves
settings, and what `smack_storage.js` + `docs/bridge.html` do (TEST BUILD, see below). Mods can
never write the `.js` files inside the VPK; those stay the defaults.

## Layout

```
deadlock-kill-chat/panorama/
  layout/hud_damage_impact.xml   Override of the stock damage-impact HUD layout (reconstructed
                                 with Source 2 Viewer). Only change vs. stock: it includes our
                                 scripts. This is the mod's entry point.
  scripts/hud_lookup.js          Shared helper: $.ModHudLookup.find(id) walks known routes from
                                 Hud > HudCore to find native panels by id, with caching. Copied
                                 from a canonical source (tools/sync_hud_lookup.py, not in this repo).
  scripts/smack_config.js        Permanent user settings ($.SmackChatConfig): enabled, debug.
  scripts/smack_heroes.js        Hero line registry: HeroLines class + $.SmackChatHeroes
                                 (register / get / ids / local / enemies / identify / nameOf).
                                 Shared via `$`, like $.ModHudLookup.
  scripts/heroes/hero_*.js       One file per hero, named by internal name. Each calls
                                 $.SmackChatHeroes.register({ id, name, lines, vsChance, vsHero }).
  scripts/smack_storage.js       $.SmackChatStorage: persistent key/value storage through a
                                 hidden CitadelHTMLPanel running docs/bridge.html. TEST BUILD.
  scripts/smack_settings.js      Esc menu > SmackChat panel + $.SmackChatSettings (per-match).
docs/bridge.html                 Storage bridge web page, published with GitHub Pages (HTTPS).
  scripts/smack_chat.js          Kill detection + chat sending (CONFIG is technical tuning only).
tools/Import-SheetLines.ps1      Imports lines from the Google Sheet into heroes/*.js (see below).
tools/Export-HeroLines.ps1       Exports heroes' generic lines as text to paste into the sheet.
```

**Script load order matters** and is set by the `<include>` list in `hud_damage_impact.xml`:
`hud_lookup` → `smack_config` → `smack_heroes` → every `heroes/hero_*.js` → `smack_storage` →
`smack_settings` → `smack_chat`.

**Adding a new hero** (when Valve ships one):
1. Copy any hero file to `heroes/<internal name>.js`; change `id`, `name` and `lines`.
2. Add its `<include src="s2r://panorama/scripts/heroes/<internal name>.vjs_c" />` to the XML
   before `smack_settings` (hero includes are sorted by internal name). A hero file missing from the XML
   silently sends nothing.
3. Add `<internal name>: [],` to the `vsHero` map of **every** hero file (maps are sorted by
   display name, with the display name as a trailing comment).
4. Add its numeric id to `HERO_NUMBERS` in `smack_heroes.js` (needed for victim detection).

**vsHero** (`{ hero_xxx: [lines] }`): lines used *instead of* `lines` when the victim is that hero.
An empty array (the default) falls back to the generic `lines`, as does an unknown victim.
Victim detection (`getVictimHero()` in `smack_chat.js`) works in-game — see below.

**vsChance** (`{ default: 100, hero_xxx: 70 }`): percent chance that a kill on a victim *with*
vsHero lines uses them; otherwise a generic line is sent. `default` covers every victim, a
per-hero key overrides it; missing = 100. If generic `lines` is empty the vsHero lines are always
used. `HeroLines.chanceVs()` / `pick()` in `smack_heroes.js`; `effectiveVsChance()` layers this
match's panel changes (`$.SmackChatSettings.vsChanceOverrides(heroId)`) over the file, key by key.
Weights are not in the sheet: the importer keeps each file's `vsChance` block as-is.

Paths in the XML use compiled names (`s2r://panorama/scripts/smack_chat.vjs_c`), so source files
must be compiled into the game's addon/VPK format to run. The user's `tools/build.ps1` compiles
every `scripts/**/*.js` plus the layout and packs `dist/SmackChat.vpk` (CSDK + Source 2 Viewer CLI).

## How smack_chat.js works

- **Kill detection** — polls the children of `#damageImpactInfo` every frame (`POLL_RATE`, 1s when
  the panel is missing). A child panel with class `killed` and *without* `assist` is a kill.
  `assist` panels are skipped today; that check (`scan()`) is where an assist option would go.
  A per-panel `__smackChatFired` flag stops repeat fires; the first scan after load is "priming"
  and never sends (avoids firing on old kills after a HUD reload).
- **Which hero am I?** — `$.SmackChatHeroes.local()` reads the `CitadelHudHeroShop` panel, which
  carries the local hero's internal name as a CSS class, and matches it against the registered ids.
  So **each hero file's `id` must be the internal class name** (see table below). Heroes with
  no file send nothing. `onKill(panel)` then calls `hero.pick(getVictimHero(panel))`.
- **Spectating** — while dead you can spectate teammates, and the damage-impact HUD then shows
  *their* kills. `isSomeoneElsesKill()` reads the top bar (`TopBar` > `TeamFriendly`/`TeamEnemy`
  > `PlayersContainer` > `CitadelHudTopBarPlayer`): stock CSS shows the engine tags your portrait
  `LocalPlayer`, the camera's hero `SpectatorTarget`, dead heroes `Dead`. A `SpectatorTarget`
  that isn't `LocalPlayer` = skip. A `Dead` local portrait = skip too, always (user's choice,
  2026-11-26: not a setting; kills landing after death, e.g. DoTs, send nothing). Debug logs
  `spectate state: ...` on every kill.
- **Settings** — `setting(key, fallback)` reads `$.SmackChatSettings` (panel, per match), else
  `$.SmackChatConfig`, else the fallback. Read at use time, so panel changes apply immediately.
- **No cooldown** (user's choice, 2026-11-26) — every kill sends. Only a kill arriving while the
  previous line is mid-send (`State.sending`, a fraction of a second) is dropped.
- **Sending chat** — no scripting API exists, so it drives the stock chat UI: dispatches
  `CitadelConCommand` with a command from `OPEN_COMMANDS` (tried in order, the working one is
  locked in), waits until `#ChatTargetLabel` shows the ALL target (class `ChatTarget_GameAll`,
  or text fallback) for `CONFIRM_TICKS` extra ticks, sets `#ChatInput.text`, dispatches
  `CitadelChatInputSubmitted`, then blurs. `RETRY_DELAYS` controls the retry schedule.
  `REQUIRE_ALL_TARGET: false` sends into whatever channel is open (debug aid).
- **Instance guard** — a generation number in the shared store (`GameUI.CustomUIConfig()`, which
  doesn't exist in Deadlock, so in practice `globalThis.__SmackChatFallbackStore`) under key
  `SmackChat`; older poll loops retire after a HUD reload.
- Setting `debug` logs via `$.Msg('[SmackChat] ...')`.
- **Master switch** — `onKill()` returns early when setting `enabled` is false.

### In-game settings panel (smack_settings.js)

Esc menu > **SmackChat** (button confirmed in-game with the test build; the full panel is
untested in-game). Changes last **until the match ends**; Export prints them for the files.
Built entirely from script (`$.CreatePanel` + inline `panel.style`; stock signature
`$.CreatePanel(type, parent, id, props)`), so no CSS file needs compiling. Controls are
buttons (`-`/`+` steppers, ON/OFF toggles) rather than `Slider`/`ToggleButton`, which would need
stock CSS that may not apply to injected panels.
- **Esc menu button** — `ensureButton()` adds `Button#SmackChatMenuButton` to
  `EscapeMenu > LeftStripe > Menu > SubOptions` above `#quit`, via `$.ModHudLookup.find('SubOptions')`,
  with stock classes `nav_menu_item minor` / `menuButtonLabel`. A 1s loop re-adds it and replaces
  buttons from older HUD loads (generation stamp).
- **Panel** — `Panel#SmackChatSettingsPanel`, child of `#EscapeMenu` (hides with the menu). Body
  (`#SmackChatSettingsBody`) is rebuilt by `render()` on every open and every change. Sections:
  - General: SmackChat ON/OFF, debug log.
  - Hero-specific lines for the local hero: "Default for all enemies" plus one stepper per enemy
    in this match (`$.SmackChatHeroes.enemies()` reads `TopBar > TeamEnemy > PlayersContainer >
    CitadelHudTopBarPlayer > #HeroBadge > #HeroImage` with `identify()`), 10% steps. Each row
    shows "default" while it follows the default, or a "Use default" button once it has its own
    value (sets the override to `null`, which `effectiveVsChance()` drops — also hides a value from
    the hero file). Then a Preview button. Enemies without vsHero lines are listed greyed out. If
    the enemy team can't be read, it lists every hero the local hero has lines for.
  - Buttons: Preview general line, Export, Undo match changes, Close.
  - Export: shows the text in a `TextEntry#SmackChatExportText` (for copying) and logs each line
    as `[SmackChat export] ...`: the `smack_config.js` key lines and the hero's whole `vsChance` line.
  Clicks use `SetPanelEvent('onactivate', fn)`, falling back to `$.RegisterEventHandler('Activated')`.
- **No ICU in Deadlock's V8** — `localeCompare` throws `RangeError: Internal error. Icu error.`
  (seen in-game). Avoid it and other locale APIs (`Intl`, `toLocale*`); sort with `byName()`.
- **`$.SmackChatSettings`** — `get/set` (keys of `smack_config.js`), `vsChanceOverrides(heroId)`,
  `setVsChance(heroId, key, n)`, `reset()`. Stored in the shared store under `SmackChatSettings`,
  so it survives HUD reloads within a match.

### Persistent storage (smack_storage.js + docs/bridge.html — TEST BUILD, built 2026-11-26)

Same technique as QOLLOCK (github.com/civo7/QOLLOCK, `core/ql_storage_transport.js`, Apache-2.0;
ours is written from scratch, not copied):
- `smack_storage.js` creates `CitadelHTMLPanel#SmackChatStorageBridge` as a child of the context
  panel (2px, opacity 0.01, still visible so CEF keeps running), registers `HTMLTitle`, and
  `SetURL(BRIDGE_URL)`. `BRIDGE_URL = https://chernould.github.io/SmackChat/bridge.html`
  (GitHub Pages from `main` / `docs`; CEF only opens HTTPS). Retries the page load up to 4×,
  10s apart, then state `failed` (offline / not published) and every request errors.
- Requests: `SetURL(BRIDGE_URL + '#' + encodeURIComponent(JSON.stringify({id, op, key, value,
  token})))` — fragment-only change, no reload. One in flight at a time, 5s timeout, queued until
  ready. Replies arrive as the page title: `SMACK_READY:<token>`, `SMACK_RES:<json>`,
  `SMACK_ERROR:<msg>`. The handler takes the first string argument (signature undocumented).
- `bridge.html`: ignores a fragment present at load, refuses requests without the per-install
  token (random, kept in its localStorage, revealed only in its title), keys `[A-Za-z0-9_.-]{1,64}`
  stored as `smackchat.<key>`, values ≤ 20000 chars, refuses to run inside a frame.
- API: `$.SmackChatStorage.save(key, str, cb)`, `load(key, cb)`, `remove(key, cb)`,
  `cb(error, value)`; `status()` → `{state, detail}`; `onReady(fn)`.
- Settings panel "Saving test" section: shows connection state, loads key `test` on every open,
  "Save test value" stores the current time. In-game test = save, fully restart, reopen panel.
- Tested in headless Edge only: the real page (protocol + value surviving a browser restart) and
  the mod against a fake CitadelHTMLPanel running the real page script. Not yet tried in-game.
- Next, if it works in-game: save settings automatically on every panel change and load them at
  match start (files stay the defaults), drop Export.
- Settings panel generation is now a random id (`'g' + random + '_' + Date.now()`), not a
  counter — counters reset each match, so two loads could both be "1".

### Victim detection (confirmed working in-game)

What the stock files show (SteamDatabase/GameTracking-Deadlock decompiled Panorama):
- `CitadelHeroBadge` (`layout/hero_badge.xml`) builds a `CitadelHeroImage#HeroImage` child.
  C++ sets the hero; no stock layout or JS sets a hero on the badge itself.
- `CitadelHeroImage` accepts a numeric `heroid` attribute (`citadel_hud_playerintents_player.xml`:
  `heroid="1"` = Infernus). Numbers match the ID column below.
- No hero dialog variable or per-hero CSS class on `.damageImpactInstance`.

`getVictimHero(killPanel)` passes `HeroImage`, `heroBadge` and the kill panel to
`$.SmackChatHeroes.identify(panels)` (smack_heroes.js, also used for the enemy list), which tries:
1. numeric hero id via several probes (`heroNumberProbes()`: `.heroid`, `GetAttributeInt('heroid')`,
   …), mapped by `idFromNumber()` (the `HERO_NUMBERS` table);
2. any known internal name present as a CSS class (`knownIds()`).
Returns `null` (generic lines) if nothing matches. With setting `debug` on, every kill logs
`victim probe panel/badge/image: ...` lines showing what each probe returned — use those from
the console to fix the probes if detection fails. If Valve adds a hero, add it to `HERO_NUMBERS`.

### Importing lines from the Google Sheet

`tools/Import-SheetLines.ps1` (PowerShell 5.1; this machine has no Python/Node) rewrites hero
files from the user's public Google Sheet ("Chatlock"). It downloads the whole sheet once via
`/export?format=xlsx` and parses the xlsx itself (zip + XML, no Excel needed).

Sheet format: one tab per hero named by display name; row 1 = headers; **column A = generic
lines**; every other column is headed by a *victim* hero's display name. Columns are matched by
header text, so order and the presence/absence of the hero's own column don't matter. Tab and
header names map to hero files via each file's `name:`; `$NameAliases` covers spellings like
"Gray Talon".

Behaviour: regenerates each matched file whole (id/name/vsChance kept, vsHero lists all 44 heroes);
trims, collapses whitespace, strips newlines, drops duplicate lines (warns); keeps curly quotes;
escapes `"` and `\`. Skips (and warns about) tabs with an empty column A, unknown tabs/headers,
and headerless columns with data. Warns when a hero's generic lines would drop below half.
Options: `-SheetUrl` (or set `$DefaultSheetUrl`), `-XlsxPath` (local file), `-Heroes "A,B"`,
`-DryRun`, `-HeroDir` (for testing on a copy). Generated files carry a "Generated by" header —
edit the sheet, not the files.

Run: `powershell -ExecutionPolicy Bypass -File tools\Import-SheetLines.ps1 -DryRun`
(`$DefaultSheetUrl` holds the sheet link, so no `-SheetUrl` is needed. Download verified 2026-11-26.)

The reverse direction, `tools/Export-HeroLines.ps1 -Heroes "Billy,Solomon" [-Clipboard]`, writes
each hero's generic lines to `dist/sheet_export/<Name>.txt` (one per row, `=+-@` starts prefixed
with `'`) for pasting into column A from A2. There is no Sheets write access (view-only link, no
connector), so getting lines *into* the sheet is a manual paste. vsHero lines are not exported.

### Writing message lines

- Plain JS strings in an array per hero. Watch quoting: lines contain `'` so they use `"..."`.
- Keep lines fairly short — Deadlock chat has a length limit (exact number not confirmed; the
  longest existing lines are ~80 chars).

## Deadlock hero internal names

Source: [Deadworks modding DB](https://deadworks.net/db/heroes), game build 6868 (Nov 24 2026),
fetched 2026-11-25. Internal names can change between patches and differ from model/asset folder
names (e.g. Lady Geist's model folder is `geist` but the class is `hero_ghost`). Use the
`hero_*` class name as the hero file's `id` (and file name).

### Playable heroes (44)

Baba and Violet shipped after the Deadworks snapshot, which still flagged them as in development
(confirmed by the user, 2026-11-25).

| Hero | Internal name | ID |
|---|---|---|
| Abrams | `hero_atlas` | 6 |
| Apollo | `hero_fencer` | 77 |
| Baba | `hero_baba` | 88 |
| Bebop | `hero_bebop` | 15 |
| Billy | `hero_punkgoat` | 72 |
| Calico | `hero_nano` | 16 |
| Celeste | `hero_unicorn` | 81 |
| Deadman Danny | `hero_deadpack` | 78 |
| The Doorman | `hero_doorman` | 69 |
| Drifter | `hero_drifter` | 64 |
| Dynamo | `hero_dynamo` | 11 |
| Graves | `hero_necro` | 76 |
| Grey Talon | `hero_orion` | 17 |
| Haze | `hero_haze` | 13 |
| Holliday | `hero_astro` | 14 |
| Infernus | `hero_inferno` | 1 |
| Ivy | `hero_tengu` | 20 |
| Kelvin | `hero_kelvin` | 12 |
| Lady Geist | `hero_ghost` | 4 |
| Lash | `hero_lash` | 31 |
| McGinnis | `hero_forge` | 8 |
| Mina | `hero_vampirebat` | 63 |
| Mirage | `hero_mirage` | 52 |
| Mo & Krill | `hero_krill` | 18 |
| Nurse Harrow | `hero_nurse` | 87 |
| Paige | `hero_bookworm` | 67 |
| Paradox | `hero_chrono` | 10 |
| Pocket | `hero_synth` | 50 |
| Rat King | `hero_ratking` | 84 |
| Rem | `hero_familiar` | 79 |
| Seven | `hero_gigawatt` | 2 |
| Shiv | `hero_shiv` | 19 |
| Silver | `hero_werewolf` | 80 |
| Sinclair | `hero_magician` | 60 |
| Solomon | `hero_chessmaster` | 85 |
| Venator | `hero_priest` | 65 |
| Victor | `hero_frank` | 66 |
| Vindicta | `hero_hornet` | 3 |
| Violet | `hero_artist` | 86 |
| Viscous | `hero_viscous` | 35 |
| Vyper | `hero_viper` | 58 |
| Warden | `hero_warden` | 25 |
| Wraith | `hero_wraith` | 7 |
| Yamato | `hero_yamato` | 27 |

(`hero_targetdummy`, ID 55, is also flagged playable — it's the sandbox dummy, not a real hero.)

### In development / disabled (not in the normal pool)

In development: Generic Person `hero_genericperson` (46) — likely an internal test hero.

Disabled: Kali `hero_kali`, Gunslinger `hero_gunslinger`, The Boss `hero_yakuza`,
Wrecker `hero_wrecker`, Rutger `hero_rutger`, Thumper `hero_thumper`, Fathom `hero_slork`,
Cadence `hero_cadence`, Bomber `hero_bomber`, Shield Guy `hero_shieldguy`, Vandal `hero_vandal`,
Trapper `hero_trapper`, Raven `hero_operative`, Boho `hero_boho`, Skyrunner `hero_skyrunner`,
Swan `hero_swan`, Druid `hero_druid`, Graf `hero_graf`, Fortuna `hero_fortuna`,
Opera `hero_opera`, TestHero `hero_testhero`.
