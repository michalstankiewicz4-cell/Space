# Space Swarm — ROJ

3D space game built with Three.js. Swarm of ships eats planets, suns, comets, meteoroids for points; avoid black holes.

Play: https://michalstankiewicz4-cell.github.io/Space/

See [`CHANGELOG.md`](CHANGELOG.md) for the version history, and
[`CLAUDE.md`](CLAUDE.md) for a condensed technical/context brief (useful
background if you're picking this project back up after a while).

## Project structure

A plain static site — no build step, no npm. `index.html` is a thin shell
(DOM + CSS); all the logic lives in native ES modules under `js/`, loaded
via `<script type="module" src="js/main.js">`:

```
css/style.css        game styling (HUD, upgrade dock, start banner, Setup modal)
js/
  version.js         current version number (shown next to the title) — bump on every meaningful release
  settings.js         local player prefs (mouse invert/swap), persisted in localStorage
  config.js          gameplay tuning constants (upgrade tree, radii, network intervals)
  i18n.js            UI text (English by default, Polish toggle — see the start screen)
  env.js             Supabase URL/key (anon key — safe to commit, see below)
  supabaseClient.js  Supabase client singleton
  core/              shared game state (scene/entity collections, player points) + small utilities
  scene/             camera, renderer, mouse controls/selection, hover tooltip
  world/             celestial body logic (mesh/textures/animation) — per-type data lives in js/bodies/
  bodies/            7 body types, one file each (sun.js, icePlanet.js, neutralPlanet.js,
                     volcanicPlanet.js, comet.js, meteoroid.js, blackhole.js) — see "Object editor" below
  content.js         aggregates js/bodies/ into one place the game and the editor both read from
  fx/                particles, debris, shockwaves, dust — planet-breakup effects
  ships/             player's ship swarm (movement, eating, bite-beam)
  ui/                HUD (telemetry, players list, collapsible panels, legend/Wiki toggle) and the upgrade dock
  net/               multiplayer: identity, "steward" election, world sync, ship broadcast
  main.js            entry point — wires the modules together and runs the game loop
supabase/schema.sql  database schema (tables, RLS, RPC functions) to paste into the Supabase SQL Editor
```

Adding a new mechanic (e.g. another upgrade type, a new kind of celestial
body) usually means editing a single file in the right folder, without
touching the rest.

## Object editor

[`editor.html`](editor.html) is a separate developer tool (not linked from
the game itself) for tuning the look of the procedurally generated bodies —
one tab and one slider per parameter for each of the 7 types in
[`js/bodies/`](js/bodies), with a live 3D preview. The preview reuses the
exact same functions as the game, so what you see in the editor looks
identical in actual play.

Since the site has no backend, the "Download" button produces a text file
with ready-to-paste `export const ... = {...}` blocks — one per file in
`js/bodies/` — which you then manually swap into the repo.

## Multiplayer / Supabase setup

The world (planets, comets, suns, meteoroids, black holes) and other
players' ships are shared live via [Supabase](https://supabase.com), with
no login at all (an invisible anonymous session). Points and upgrade
levels stay local to the browser (`localStorage`), as before.

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
a push while caches can still lag.
