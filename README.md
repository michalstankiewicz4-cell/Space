# Swarm Protocol

3D space game built with Three.js. Swarm of ships eats planets, suns, comets, meteoroids for points (select ships, then click a target to send them — they never move on their own); avoid black holes.

Play: https://michalstankiewicz4-cell.github.io/Space/

See [`CHANGELOG.md`](CHANGELOG.md) for the version history, and
[`CLAUDE.md`](CLAUDE.md) for a condensed technical/context brief (useful
background if you're picking this project back up after a while).

## Project structure

A plain static site — no build step, no npm. `index.html` is a thin shell
(DOM + CSS); all the logic lives in native ES modules under `js/`, loaded
via `<script type="module" src="js/main.js">`:

```
css/style.css        game styling (HUD, upgrade dock, start banner, Setup/Tech/Fleet modals)
js/
  version.js         current version number (shown next to the title) — bump on every meaningful release
  versionCheck.js    periodically checks for a newer deploy; blocks play with a "please refresh" overlay if this tab is stale
  moderation.js      profanity filter, shared by nickname confirmation and the drone's print() effect
  settings.js         local player prefs (mouse invert/swap), persisted in localStorage
  config.js          gameplay tuning constants (upgrade tree, radii, network intervals)
  i18n.js            UI text (English by default, Polish toggle — see the start screen)
  env.js             Supabase URL/key (anon key — safe to commit, see below)
  supabaseClient.js  Supabase client singleton
  core/              shared game state (scene/entity collections, player points) + small utilities
  scene/             camera, renderer, mouse controls/selection, hover tooltip, ship cam (picture-in-picture cockpit view),
                     nebula skybox (skybox.js), background pulsars (pulsars.js)
  world/             celestial body logic (mesh/textures/animation) — per-type data lives in js/bodies/
  bodies/            7 body types, one file each (sun.js, icePlanet.js, neutralPlanet.js,
                     volcanicPlanet.js, comet.js, meteoroid.js, blackhole.js) — see "Object editor" below
  content.js         aggregates js/bodies/ into one place the game and the editor both read from
  fx/                particles, debris, shockwaves, dust — planet-breakup effects
  ships/             player's ship swarm (movement, eating, bite-beam)
  drone/             the programmable drone — its own DSL (dsl.js), a generator-based
                     interpreter (interpreter.js), the entity/script driver (drone.js),
                     its live thumbnail camera (droneThumb.js), and the print() gas+laser
                     effect (dronePrintFx.js) — see "Programmable drone" below
  station/           each player's static space station — the procedural mesh
                     (stationModel.js) and the game-side entity (station.js) —
                     see "Space station" below
  ui/                HUD (telemetry, players list, collapsible panels, Wiki/Tech/Fleet buttons and modals,
                     legend, upgrade dock, drone panel) and the Setup modal (banner.js)
  net/               multiplayer: identity, "steward" election, world sync, ship broadcast,
                     Realtime reconnect handling
  main.js            entry point — wires the modules together and runs the game loop
supabase/schema.sql  database schema (tables, RLS, RPC functions) to paste into the Supabase SQL Editor
```

`admin.html`/`css/admin.css`/`js/admin/`, `planetEditor.html`/`css/editor.css`/`js/editor/`,
and `shipEditor.html` are separate developer-tool entry points, not part of
the game's own module graph above — see "Object editor", "Admin panel" and
"Ship editor" below. `blog/` isn't part of the game at all — see "Devlog"
below.

Adding a new mechanic (e.g. another upgrade type, a new kind of celestial
body) usually means editing a single file in the right folder, without
touching the rest.

## Object editor

[`planetEditor.html`](planetEditor.html) is a separate developer tool (not linked from
the game itself) for tuning the look of the procedurally generated bodies —
one tab and one slider per parameter for each of the 7 types in
[`js/bodies/`](js/bodies), with a live 3D preview. The preview reuses the
exact same functions as the game, so what you see in the editor looks
identical in actual play.

Since the site has no backend, the "Download" button produces a text file
with ready-to-paste `export const ... = {...}` blocks — one per file in
`js/bodies/` — which you then manually swap into the repo.

## Ship editor

[`shipEditor.html`](shipEditor.html) is an early, standalone prototype
(not linked from the game, not yet integrated with anything) of a
Space-Engineers-style modular ship builder: a 10x10x10 grid, block
category/shape/color pickers, left-click to place and shift+left-click to
remove. Three shapes per block category (cube/wedge/rounded corner), all
built from plain Three.js primitives — no model files. "Download" exports
the current build as JSON (grid position, category, shape, color, rotation
per block) — there's no backend or persistence yet, so that JSON is the
only way to keep a design between sessions. No hidden-face culling or any
other rendering optimization yet either — deliberately deferred until
there's an actual gameplay use for the format this produces.

## Admin panel

[`admin.html`](admin.html) is another developer tool, not linked from the
game — a read-only view of `activity_log` (see "Network-behavior
observation" below): a total anomaly-count summary, recent entries (with
nick, IP, browser and the rest of each entry's detail) and a
per-actor/event-type summary, color-coded by category. It's gated by
a secret, entered into the page itself (remembered in that browser's
`localStorage` after the first time, never written to this repo) and
checked **server-side** against a SHA-256 hash in `admin_activity_log()`
(`supabase/schema.sql`) — without it the RPC just returns nothing, so the
page is safe to leave deployed alongside the game even though it isn't
linked anywhere. Every cell is rendered with `textContent`, never
`innerHTML` — nick/IP/browser all ultimately come from something a
client controls, so this page treats all of it as untrusted the same way
the game itself treats broadcast data.

## Network-behavior observation

`activity_log` (`supabase/schema.sql`) is a passive audit trail — nothing
reads it and auto-bans anyone. Three sources feed it, all server-side and
unspoofable by a client, and all of them now also actually throttle the
behavior they log, not just record it: the existing `bite_body` rate
limiter (a real client can never hit that limit, so it's already an
unambiguous signal), triggers on `bodies` that reject a burst once a
single actor's insert/delete rate clearly exceeds what legitimate play
(including the steward's one-time world-seed insert) ever produces, and
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
reference. `blog/` in this repo holds each post's hero image (AI-generated,
one per post) — the Blogger API has no endpoint to upload post images
directly, so images are hosted here instead and pulled into the post's
HTML by URL via GitHub Pages, the same way the game itself is served.
Every AI-generated image gets a small caption disclosing that and stating
it isn't (and won't become) an actual in-game asset.

Publishing goes through the Blogger API (OAuth credentials in the
gitignored `pass` file, same pattern as the Supabase Management API
token) rather than the Blogger web UI.

## Programmable drone

Every player also has one drone (a distinct gold octahedron, spawned well
away from the ship swarm) that never moves on its own — select it and open
its Script button to write a small program for it (`if`/`while`/variables,
plus `move()`, `turn()`, `wait()`, `attack()`, `fuel()`, `nearPlanet()`,
`print("text")` — the in-game `[?]` button lists all of them with
examples). `print()` doesn't just log the text — it puffs gas from the
drone's nose and writes the message into it with a laser, visible to
other players too, not just you. Its side panel also has Run/Stop
shortcuts to restart or stop the last saved script without reopening the
editor. It's not JavaScript: `js/drone/dsl.js`
parses this tiny language into an AST, and `js/drone/interpreter.js` walks
it as a generator, so a script's `move()`/`wait()` calls can pause
execution for real time without blocking the game loop or the browser tab.

## Space station

Every player also has one static space station (a DS9-style ring-and-hub
structure, built entirely from primitive geometry — no model files) that
spawns once and never moves. Select it to open its docking panel: a
read-only overview (fleet size, evolution points, upgrade levels) with
shortcuts into the existing Tech/Fleet modals — no separate resource
economy, just a window onto the same points/upgrades everything else
already uses.

## Multiplayer / Supabase setup

The world (planets, comets, suns, meteoroids, black holes) and other
players' ships, drones **and stations** are shared live via
[Supabase](https://supabase.com), with no login at all (an invisible
anonymous session) — just a nickname (letters, digits and spaces only,
max 20 characters). Points and upgrade levels stay local to the browser
(`localStorage`), as before.

To run your own instance:

1. Create a free project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, paste and run the contents of
   [`supabase/schema.sql`](supabase/schema.sql).
3. **Authentication → Sign In / Providers** → enable **Anonymous Sign-ins**.
4. **Database → Replication** → enable Realtime for the `bodies` table
   (insert / update / delete).
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
list in that file — needs updating when a new file is added to `js/`),
plus an "or Ctrl+Shift+R" hint underneath either way, since a static
site with no build step can't guarantee a clean cache bypass on its own.
