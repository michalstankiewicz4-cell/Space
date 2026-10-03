# Swarm Protocol

3D space game built with Three.js. You're an AI waking up on a ruined station after the humans are gone, with a swarm of ships and a whole solar system to explore — and a story to piece back together from recovered memory fragments. For now the swarm eats planets, suns, comets and meteoroids for points (select ships, then click a target to send them — they never move on their own), and every ship as well as a drone can run a program (text scripts or blocks) with its flight previewed as a trajectory; avoid black holes. Upgrades grow on circuit-board trees in the Research window, and an in-game Wiki you fill in by playing rounds it out.

Play: https://michalstankiewicz4-cell.github.io/Space/

See [`CHANGELOG.md`](CHANGELOG.md) for the version history, and
[`CLAUDE.md`](CLAUDE.md) for a condensed technical/context brief (useful
background if you're picking this project back up after a while).

## Project structure

A plain static site — no build step, no npm. `index.html` is a thin shell
(DOM + CSS, plus one tiny inline `<head>` script that has to run before
first paint — UI scaling and the saved language); all the logic lives in
native ES modules under `js/`, loaded via
`<script type="module" src="js/main.js">`:

```
css/style.css        global base + overlays (tooltip, selection box, update notice); loaded after
                     the UI kit files below, all linked from index.html
css/fonts.css        self-hosted web fonts (@font-face for fonts/, latin + latin-ext subsets)
css/ui/              the new-style UI kit: shared primitives (kit.css — scaled design stage,
                     full-width/full-window screens, "material" surfaces, panels), the start
                     screen/setup modal (topBar.css, startScreen.css, setupModal.css), and one
                     file per component in hud/ and windows/ (mirroring js/ui/);
                     grain.png is the material's texture
fonts/               the .woff2 font files (SIL Open Font License, originally from Google Fonts)
vendor/              local copies of Three.js r128 and supabase-js (versioned file names, MIT) —
                     no CDN at runtime; see vendor/README.md
js/
  version.js         current version number (shown next to the title) — bump on every meaningful release
  versionCheck.js    periodically checks for a newer deploy; blocks play with a "please refresh" overlay if this tab is stale
  moderation.js      profanity filter, shared by nickname confirmation and the drone's print() effect
  settings.js        local player prefs (mouse, image quality, lines on/off), persisted in localStorage
  config.js          gameplay tuning constants (upgrade tree, radii, network intervals)
  i18n.js            the i18n API (t, languages); the text itself is one file per language in i18n/
  env.js             Supabase URL/key (anon key — safe to commit, see below)
  supabaseClient.js  Supabase client singleton
  shipkit/           ShipKit — the procedural ship models (swarm ships, the drone), one classic
                     script shared with the ship lab (ship.html); see docs/ship.md
  bodykit/           BodyKit — every procedural celestial body, one classic script shared with the
                     body lab (bodies.html); see docs/bodies.md
  labkit/            LabKit — what the ship and body labs share around their models (grain, sliders,
                     HUD scale, performance counters, image effects); styles in css/lab.css
  galaxy/            the galaxy map's picture: the Milky Way from above as one WebGL shader
                     (galaxyRender.js; the window is ui/windows/galaxyMap.js, key M)
  systemkit/         SystemKit — star systems from BodyKit's bodies (data, presets, a seeded
                     generator, building); the system lab's (systems.html), not in the game yet
  postkit/           PostKit — post-processing (bloom, MSAA, FXAA, lensing, depth of field, sun
                     flare, the "robot eyes" filter) and the labs' IMAGE EFFECTS panel, one classic
                     script shared by the game (scene/post.js) and both labs
  core/              shared game state (scene/entity collections, player points), Wiki discovery
                     state (discovery.js), the Story's memory fragments (storyLog.js) + small utilities
  scene/             renderer and lights (setup.js), camera (camera.js), mouse input and selection
                     (controls.js, picking.js, selectionBrackets.js), the 3D view's rect inside the
                     HUD + miniature render passes (viewRect.js, unitThumb.js, infoThumb.js), hover tooltip,
                     ship cam (picture-in-picture cockpit view, ships and the drone),
                     trajectory lines of the object in view + the selected ones (trajectories.js),
                     orbits/trajectories on-off (linesToggle.js),
                     image quality (Setup → Graphics): graphics.js (settings, presets), resolution.js
                     (auto resolution, AUTO preset's tier), lines.js (smooth lines), post.js (settings →
                     PostKit), eclipse.js (planets shading ships/drone/station), anisotropy.js
                     (texture filtering),
                     the sky backdrop (skybox.js, BodyKit's SKY: nebulae, stars, pulsars),
                     the 9 fixed orbit lines + each comet's own trajectory line (orbitLines.js),
                     Dev Tools' debug views (lightMarkers.js, lightsToggle.js, planetDistanceLines.js)
  world/             celestial body logic — the 9-orbit solar system's fixed bodies
                     (solarSystem.js: orbit table/positions, solarGravity.js: patched-conics
                     gravity on ships/drone), comet-specific real physics (cometPhysics.js:
                     gravity-curved flight simulation), body lifecycle and look (bodies.js,
                     bodyParams.js, bodyVisual.js), the black hole (blackholes.js), points for a
                     kill (rewards.js) — per-type data lives in js/bodies/
  bodies/            7 body types, one file each (sun.js, icePlanet.js, neutralPlanet.js,
                     volcanicPlanet.js, comet.js, meteoroid.js, blackhole.js).
                     Only comets are still randomly rolled; the other 6 are each one fixed,
                     hand-placed body in the solar system (see docs/architecture.md)
  content.js         aggregates js/bodies/ into one place the game reads from
  fx/                particles (incl. cooling bite sparks), debris, shockwaves, dust — planet-breakup
                     effects; engine trails (trails.js), the bite beam's hot spot (impact.js)
  ships/             player's ship swarm (swarm.js: movement, eating, RETURN TO BASE; shipVisual.js: the
                     model and its far stand-in; biteBeam.js: the bite beam; shipProgram.js: a ship
                     flown by its program; fleetMemory.js: positions kept in localStorage)
  drone/             the programmable drone — its own DSL (dsl.js), a generator-based
                     interpreter (interpreter.js), the entity and its builtins (drone.js; ships
                     have their own in ships/shipProgram.js), which commands a program uses, for the Wiki
                     (scriptFeatures.js), and the print() gas+laser effect (dronePrintFx.js)
                     — see "Programmable units" below
  program/           running programs on any unit (runner.js), per-unit programs and mode
                     (unitPrograms.js), shared builtins (unitMotion/unitBite/unitPrint.js),
                     and the trajectory preview (simulate.js: the real interpreter on a copy)
  blocks/            block programs (any unit): block catalog (blockSpecs.js), the
                     project with its virtual files (blockProject.js), the compiler to
                     the drone DSL (blockCompile.js) and the example programs
  station/           each player's static space station — its look (stationVisual.js:
                     ShipKit's ST-04 HAVEN) and the game-side entity (station.js);
                     ships/the drone spawn arranged around it, inside its
                     gravity-free protective field (world/solarGravity.js) — see
                     "Space station" below
  ui/                the start screen (banner.js, its live player counters in playerCounts.js,
                     the About window in about.js, the loading bar in its button: loader.js),
                     privacy acceptance (privacy.js), the Setup modal (setupModal.js), the global
                     Escape-key chain (escapeKey.js), "coming soon" and locked-start tooltips
                     (soonTip.js), key C interface modes (hud/uiMode.js), all static UI text (i18nApply.js), HUD icons
                     (icons.js), and:
    hud/             the in-game HUD, one module per panel (topBar, nav, fleetList, unitPanel,
                     infoPanel + planetPanel/blackHolePanel/stationPanel/remoteStationPanel,
                     eventLog, connectionStatus, minimap, commandBar, returnBase, uiMode,
                     devTools + perfStats); hud.js is main.js's single entry point into it
    windows/         the windows opened from the HUD (windows.js entry point + research with
                     the upgrade trees techTree/techTreeData, fleet, players, droneScript,
                     wiki + wikiEntries/wikiArt, the galaxy map (galaxyMap), and the block editor: blockEditor +
                     blockPalette/blockRender/blockDrag)
  net/               multiplayer: identity, "steward" election (presence.js, stewardFallback.js,
                     stewardStats.js), world sync (bodiesSync.js, solarBodiesSync.js), ship
                     broadcast, bite batching (biteBudget.js), Realtime reconnect handling (connect.js)
  main.js            entry point — wires the modules together and runs the game loop
supabase/schema.sql  database schema (tables, RLS, RPC functions) to paste into the Supabase SQL Editor
```

`admin.html`/`css/admin.css`/`css/devTheme.css`/`js/admin/` is a separate
developer-tool entry point, not part of the game's own module graph above —
see "Admin panel" below. `ship.html` and `bodies.html` are standalone
labs for procedural ships and celestial bodies; their models live in
`js/shipkit/` and `js/bodykit/`, shared with the game (they replaced the
older `planetEditor.html` and `shipEditor.html`, removed in v2.2.1) — see
[`docs/ship.md`](docs/ship.md) and
[`docs/bodies.md`](docs/bodies.md). `scale.html` (+ `js/scalelab/`) is the
scale lab: every game object in one row at its in-game size, sizes
imported from the game's own modules (needs the local server) — see
[`docs/scale.md`](docs/scale.md). `skins.html` is the skin lab: a standalone
prototype of the in-game HUD in two new looks (a green CRT terminal and a
colourful code-editor theme), switchable, not yet part of the game — see
[`docs/skins.md`](docs/skins.md). `systems.html` is the system lab: star
systems built from the body lab's bodies — presets, random systems from a
seed, editing (centres, orbits, rings, moons, background) — see
[`docs/systems.md`](docs/systems.md).
`tools/` holds small standalone dev
utilities (e.g. `grainTexture.html`, which regenerates `css/ui/grain.png`). `blog/` isn't part of the game at all — see "Devlog"
below.

Adding a new mechanic (e.g. another upgrade type, a new kind of celestial
body) usually means editing a single file in the right folder, without
touching the rest.

## Admin panel

[`admin.html`](admin.html) is another developer tool, not linked from the
game. It shows aggregate statistics (`admin_stats()`: players online per
hour, connections per hour, new accounts per day — counts only, as bar
charts) and a read-only view of `activity_log` (see "Network-behavior
observation" below): a total anomaly-count summary, recent entries (with
nick, IP, browser and the rest of each entry's detail) and a
per-actor/event-type summary, color-coded by category. It's gated by
a secret, entered into the page itself (remembered in that browser's
`localStorage` after the first time, never written to this repo) and
checked **server-side** against a SHA-256 hash (`admin_secret_ok()` in
`supabase/schema.sql`) — without it the RPCs just return nothing, so the
page is safe to leave deployed alongside the game even though it isn't
linked anywhere. Every cell is rendered with `textContent`, never
`innerHTML` — nick/IP/browser all ultimately come from something a
client controls, so this page treats all of it as untrusted the same way
the game itself treats broadcast data.

## Network-behavior observation

`activity_log` (`supabase/schema.sql`) is a passive audit trail — nothing
reads it and auto-bans anyone. Three sources feed it, all server-side and
unspoofable by a client, and all of them also throttle the behavior they
log, not just record it: the bite rate limit shared by `bite_body` and
`bite_solar_body` (the client batches its bites well under it, so hitting
it is an unambiguous signal), triggers on `bodies` (comets) that skip the
row once a single actor's insert/delete rate clearly exceeds what
legitimate play ever produces, and
`set_my_nick()` (5 calls/30s per actor — a real client only calls it once
per connection). Every entry also carries IP/browser/country
automatically (pulled from the HTTP request itself — nothing the client
sends explicitly, nothing it can suppress) and a best-effort
**self-reported** nickname (`actor_nicks`, upserted once per connection —
explicitly not verified, a modified client could claim any nick).
`print()`'s in-world effect has its own, more limited protection: a 1.5s
client-side cooldown, since broadcast messages never touch the database
at all (nothing there to rate-limit against) — this stops a runaway
script written in the drone's own DSL, not a fully custom client.
`activity_log` itself has no client-facing read access at
all — view it via the [Admin panel](#admin-panel) above, the Supabase SQL
Editor, or the Management API.

## Devlog

There's a companion devlog at
[swarmprotocol.blogspot.com](https://swarmprotocol.blogspot.com/) (Polish),
hosted on Blogger — separate from this repo's own docs, for
announcement/behind-the-scenes style posts rather than technical
reference. `blog/` in this repo holds each post's images (real
gameplay screenshots for most posts, occasionally AI-generated) — the
Blogger API has no endpoint to upload post images directly, so images
are hosted here instead and pulled into the post's HTML by URL via
GitHub Pages, the same way the game itself is served. Any AI-generated
image gets a small caption disclosing that and stating it isn't (and
won't become) an actual in-game asset; a real screenshot's caption just
says so instead.

Publishing goes through the Blogger API (OAuth credentials in the
gitignored `pass` file, same pattern as the Supabase Management API
token) rather than the Blogger web UI.

## Programmable units

Every player also has one drone (ShipKit's DR-01 SCRIBE, spawned next
to the player's own station, just above the ship swarm's own formation
there) that never moves on its own — and since v2.19 every swarm ship can
run a program the same way (while it runs, the program flies the ship; a
click order takes it back). Select one (it shows up in the HUD's
SELECTED UNIT panel) and press SCRIPT to write a small program for it (`if`/`while`/`repeat`/variables/
your own functions with `def`/`return`, plus `move()`, `turn()`, `wait()`, `attack()` — at most 4 hits a
second — `fuel()`, `nearPlanet()`,
`print("text")` — the in-game `[?]` button lists all of them with
examples). `print()` doesn't just log the text — it puffs gas from the
drone's nose and writes the message into it with a laser, visible to
other players too, not just you. The panel's START/STOP buttons
restart or stop the last saved script without reopening the editor.
Ships use the same commands (they have no fuel: `fuel()` reports a full
100). It's not JavaScript: `js/drone/dsl.js`
parses this tiny language into an AST, and `js/drone/interpreter.js` walks
it as a generator, so a script's `move()`/`wait()` calls can pause
execution for real time without blocking the game loop or the browser tab.

The same programs can also be built from blocks: a SCRIPT/BLOCKS switch in
the editor's header opens a visual block editor (categories Control,
Engine, Logic, Variables, My blocks, Examples; your own variables,
procedures and functions; programs split into virtual files with color
markers, the ★ main file being the one that runs). The blocks compile to
the very same script language (`js/blocks/blockCompile.js`), so there's
still exactly one interpreter. Both programs are kept, per unit — the
switch only picks which one START runs.

## Space station

Every player also has one static space station (ShipKit's ST-04 HAVEN: a
spinning habitat ring, a greenhouse dome, solar panels — a ruin at the
start, as the story says) that spawns once and never moves. Select it (in the view or on the minimap)
and the HUD's PLANET INFO panel shows a read-only overview (fleet size,
evolution points, upgrade levels) with shortcuts into the Research and
Fleet windows — no separate resource
economy, just a window onto the same points/upgrades everything else
already uses. The ship swarm and drone both spawn arranged around it,
inside a small protective field where ambient gravity doesn't apply, so
a fresh fleet doesn't immediately start drifting toward the Sun. The
field only shields — it doesn't pull anything back: a ship left idle
outside it feels real gravity.

## Game UI

The in-game HUD is laid out in a fixed style that scales with the window
(the side columns stick to the edges, the middle stretches): a top bar
with points / units / planets devoured / players online; a left menu
(FLEET, PLANETS — the Wiki's planets tab, RESEARCH — the upgrade trees, BUILD,
DIPLOMACY — players online, WIKI, SETTINGS); the fleet list and the selected unit (a ship
or the drone with icon buttons VIEW / START / STOP / SCRIPT and COCKPIT, or a group) on the
left; the 3D view with the camera switch, ship cam and Dev Tools in its corners and
the command bar under it; object info (a planet, the black hole, your or another
player's station — each with a VIEW button), the event log (every in-game message) and a
clickable minimap on the right. Some controls are placeholders for now (BUILD, the
command bar's orders, a planet's Waypoint/Scan). Details in docs/ui.md's
"In-game HUD" section.

The **Wiki** is a read-only encyclopedia filled in by playing: the Story
(memory fragments of the AI's past, recovered gradually), systems,
planets, real elements, minerals, ores and refined resources, materials,
buildings, ships, technologies, drone programming, races, life forms and
artifacts humans left behind. Undiscovered entries show as silhouettes
with a hint; many are placeholders for features still to come.

## Camera

Top-center of the 3D view, a toggle switches between two fully mouse-
controlled camera modes (drag to rotate, scroll to zoom either way):
**Base** (the default) orbits the player's own station, framed so the
Sun sits behind and a little above it; **System** orbits the Sun,
showing the whole solar system at once. A third mode, **focus**, orbits
and follows one object: a minimap click on a body, or VIEW on a ship,
the drone, a planet or the black hole. Trajectory lines show for the
object in view and the selected ones (a single ship, not a group). The
ORBITS button at the view's top right (or key O) hides every orbit and
trajectory; key C hides the interface step by step. Setup → Help lists
every key and mouse action.

## Multiplayer / Supabase setup

The world is a fixed 9-orbit solar system (one Sun, 9 hand-placed orbit
slots, plus a single sun-grazing comet passing through at a time — see
docs/architecture.md for the mechanics) and other
players' ships, drones **and stations** are shared live via
[Supabase](https://supabase.com), with no login at all (an invisible
anonymous session) — just a nickname (letters, digits and spaces only,
max 20 characters). Points and upgrade levels stay local to the browser
(`localStorage`), as before.

To run your own instance:

1. Create a free project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, paste and run the contents of
   [`supabase/schema.sql`](supabase/schema.sql) — this also seeds the 9
   fixed solar bodies + Sun into `solar_bodies`.
3. **Authentication → Sign In / Providers** → enable **Anonymous Sign-ins**.
4. **Database → Replication** → enable Realtime for the `bodies` table
   (insert / update / delete — comets only now) **and** the `solar_bodies`
   table (update only — the 9 fixed bodies + Sun never get inserted or
   deleted after the schema seeds them).
5. **Project Settings → API** → copy the **Project URL** and **anon public
   key** and paste them into [`js/env.js`](js/env.js) as the
   `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants (or set
   `window.ROJ_ENV = {SUPABASE_URL, SUPABASE_ANON_KEY}` before the game
   loads, to point at a different project without editing the file).

The anon key is public by design (security comes from the RLS policies
defined in `schema.sql`), so it's safe to keep in the code of a static
site hosted on GitHub Pages.

## Versioning

Bump [`js/version.js`](js/version.js) and add an entry to
[`CHANGELOG.md`](CHANGELOG.md) for every meaningful change (a new feature,
a balance change, a fix worth telling apart from the previous build) —
this is what tells two GitHub Pages deploys apart, especially right after
a push while caches can still lag. Also bump the `?v=` query param on
`css/style.css` and `js/main.js` in [`index.html`](index.html) to the same
value — it's a hardcoded literal (not read from `js/version.js`), so it's
easy to forget. A tab left open across a deploy won't pick either up on
its own regardless; [`js/versionCheck.js`](js/versionCheck.js) handles
that case by blocking play with a "please refresh" prompt once it detects
a newer version is live. Its "Refresh now" button force-refreshes every
JS/CSS file's browser cache entry before navigating (a hand-maintained
`MODULE_FILES` list in that file — needs updating whenever a file is
added to `js/` or `css/`, including every stylesheet index.html links),
plus an "or Ctrl+Shift+R" hint underneath either way, since a static
site with no build step can't guarantee a clean cache bypass on its own.

## License and privacy

The code is released under the [MIT License](LICENSE); the third-party
components (Three.js, supabase-js, the fonts, the GLSL noise) keep their
own licenses, listed in the same file. What the game stores about players
and for how long: [privacy.html](privacy.html) (Polish and English), with
the implementation notes in `docs/security.md` ("Privacy (GDPR)").
