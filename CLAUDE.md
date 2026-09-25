# Project brief: Swarm Protocol

Condensed context for picking this project back up. See [`README.md`](README.md)
for structure/setup and [`CHANGELOG.md`](CHANGELOG.md) for version history.

**This file is a lean index, kept short on purpose since it's loaded into
every session automatically.** The full history/verification behind each
architecture and security bullet below (why a design was chosen, live bugs
found and fixed, exact function names) lives in `docs/`:
[`docs/architecture.md`](docs/architecture.md),
[`docs/security.md`](docs/security.md),
[`docs/gotchas.md`](docs/gotchas.md), [`docs/blogger.md`](docs/blogger.md);
the standalone ship/body labs are documented in [`docs/ship.md`](docs/ship.md)
and [`docs/bodies.md`](docs/bodies.md).
Read the relevant one with the Read tool before modifying that subsystem —
the summaries here are for orientation, not enough detail to safely change
the code. Don't read the long ones whole: `docs/architecture.md` and
`docs/security.md` have one `## ` section per subsystem (listed in a
Contents block at the top) — grep `^## ` for line numbers, then read
only the section you need.

## What this is

A 3D space game built with Three.js (r128, classic UMD `THREE` global).
Static site, no build step, no npm — native ES modules loaded via
`<script type="module" src="js/main.js">`. Deployed on GitHub Pages by
pushing to `main` (repo: `michalstankiewicz4-cell/Space`).

Gameplay: the player's swarm of ships eats planets/suns/comets/meteoroids
for points, spent on upgrades (speed, bite power, thermal resistance,
swarm size); black holes are a hazard to avoid. The world is a fixed
9-orbit solar system (see "Architecture" below); other players' ships are
shared live via Supabase; a player's own points/upgrades stay local
(`localStorage`).

## Working conventions

- **Language**: the user writes in Polish; reply to them in Polish. All UI
  text in the game itself, all project docs (README, CHANGELOG, this file,
  `docs/`, commit messages), and **all inline code comments** (JS and the
  SQL schema) are in **English** — the `pl` dictionary in `js/i18n.js` is
  the one deliberate exception, since that's translation data, not a
  comment.
- **Versioning**: bump `js/version.js` and add a `CHANGELOG.md` entry for
  every meaningful change (feature, balance change, notable fix) **to the
  game itself or `supabase/schema.sql`** — this is how two GitHub Pages
  deploys of the actual game are told apart after a push. Also bump the
  `?v=` cache-busting query param on `css/style.css` and `js/main.js` in
  `index.html` to the same value (see `docs/gotchas.md`) — it's a
  hardcoded literal, not read from `js/version.js`, so it's easy to
  forget. **Explicitly excluded** (all explicit user calls, not
  oversights — the common thread is "doesn't change what a player's
  browser actually loads/runs"):
  - `admin.html` (+ `js/admin/`, `css/admin.css`, `css/devTheme.css`),
    the `ship.html`/`bodies.html` labs, plus
    `tools/` (e.g. `grainTexture.html`, regenerates `css/ui/grain.png`) —
    standalone dev tools with no version-check mechanism of their own
    (`js/versionCheck.js` only ever watches the *game's* `js/version.js`).
  - The devlog (`blog/` folder, and publishing via the Blogger API — see
    `docs/blogger.md`) — a completely separate site on a separate host.
  - **Pure documentation edits** — a change touching only `.md` files
    (`README.md`, this file, `IDEAS.md`, `docs/*.md`, or a `CHANGELOG.md`
    edit *not* accompanying an actual game/schema change) — nothing about
    the deployed game bundle changed, so there's nothing for a version
    bump to distinguish.

  `CHANGELOG.md` follows the same split, since its own header frames it
  as "changes to the game, version by version" — none of the above have
  a version number to file themselves under, so they're just a plain git
  commit, not a changelog entry.

  **New `js/`/`css/` file → add it to `js/versionCheck.js#MODULE_FILES`**
  (incl. every stylesheet index.html links) — hand-maintained, easy to forget, and
  forgetting silently breaks the "Refresh now" cache refresh for that
  file (see `docs/gotchas.md`).
- **Testing before commit**: there's no test suite. Verify changes with a
  local static server (`python -m http.server 8877` from the repo root)
  and a throwaway Playwright script in the scratchpad dir (headless
  Chromium, screenshot-based checks, console/pageerror listeners). This
  hits the **live** Supabase backend (see `docs/gotchas.md`), so keep
  test traffic light. When testing whether a panel/overlay is actually
  *hidden*, assert on `getComputedStyle(el).display` (or a screenshot),
  never just `classList.contains("hidden")` — a class can be applied
  perfectly correctly by JS and still visually do nothing if no CSS rule
  maps it to `display:none` (see `docs/architecture.md`'s drone bullets
  for the exact bug this caused, twice).
- **Git**: create new commits (don't amend, except right after a hook
  failure on a commit that never happened, or before anything's been
  pushed). Every commit/PR ends with the `Co-Authored-By: Claude Sonnet 5
  <noreply@anthropic.com>` trailer. Push to `main` after visual
  verification.
- **No trademarked franchise names** in code, comments, or docs (e.g. not
  "Kerbal-style", "DS9-style") — generic descriptions instead. Already
  named references may stay in already-published blog posts, but nothing
  new goes in this repo. (`test.html`, a separate scratch prototype not
  part of this repo's own code, is exempt — it's off-limits to edit at
  all, see below.)
- **`test.html`**: a standalone scratch prototype the user built in
  another conversation (patched-conics orbital mechanics + visual block
  programming, see `IDEAS.md`'s "Deep economy" section) — **never modify,
  delete, or commit it**. It's untracked on purpose.

## Architecture

High-level map — see [`docs/architecture.md`](docs/architecture.md) for
the full detail behind each of these.

- **Body types**: 7 kinds, one data file each under `js/bodies/`,
  aggregated by `js/content.js#CONTENT`. Only comets are still randomly
  rolled — the other 6 are fixed, permanent bodies in the solar system
  (see below).
- **`world/bodies.js`** = body lifecycle only; pure kind/temp math lives
  in `world/bodyParams.js`, decoration mesh builders in
  `world/bodyMeshParts.js`. **`scene/controls.js`** = camera +
  selection/event-wiring only; raycasts in `scene/picking.js`, hover
  tooltip in `scene/tooltip.js`.
- **Ships only ever move on an explicit order** (`commandTo()` in
  `scene/controls.js` → `commandedTarget`) — no automatic nearest-planet
  fallback. Don't reintroduce one; it was removed deliberately.
- **Camera has two modes** (top-center HUD toggle, `scene/controls.js#
  setCameraMode()`): "base" (default) orbits the player's own station,
  framed so the Sun sits behind and a bit above it; "system" orbits the
  Sun. Same spherical-orbit math either way (`camState.az/pol/radius`),
  just a different pivot — both stay fully player-controlled.
- **The world is a fixed 9-orbit solar system** (`world/solarSystem.js`),
  not a random pool — Sun + 9 hand-placed orbit slots (2 volcanic, 2
  neutral, 2 ice, 1 meteoroid, 1 permanent black hole, orbit 4 = the
  player-station ring). Position is closed-form from wall-clock time
  (`bodyPosAt`); health regenerates from a checkpoint
  (`SOLAR_REGEN_RATE`) via `bite_solar_body`, never destroyed.
  Patched-conics gravity on ships/drone lives in `world/solarGravity.js`;
  orbit lines in `scene/orbitLines.js`. **The Sun must stay excluded from
  the primary-body competition loop there** (`b.kind === "sun"`, same as
  `"blackhole"`) — it has `soiRadius:Infinity`, so it otherwise always
  "wins" as primary at its own weak per-body `gm` (~66.7) instead of the
  real `GM_SUN` (60000), a real ~900x-undershoot bug live since v2.0.0
  until fixed in v2.0.9 (see docs/architecture.md for the full story).
  **Raw `GM/r²` accel is capped** (`MAX_GRAVITY_ACCEL`, 20/s²) — a close
  pass near a body's own `minR` clamp could otherwise spike to
  thousands/s² in one frame, a real numerical-blowup bug this Sun fix
  immediately exposed. **Commanded ships still stay gravity-immune while
  cruising even so** (`ships/swarm.js#updateShips()`) — tested and
  reverted twice (bounded steering, then capped-gravity-under-the-old-
  lerp): both let a ship never arrive at a target after a close SOI
  encounter. Reliable point-to-point travel is load-bearing, confirmed by
  testing, not just cautious.
- **Comets are the one body genuinely SIMULATED, not closed-form**
  (`world/cometPhysics.js`) — real gravity-curved swing-by, replayed via
  `advanceComet()` for late joiners. Exactly one exists at a time
  (`net/bodiesSync.js#maintainComet()`, a 60s cooldown after despawn, not
  a population pool). Entry velocity is solved via vis-viva + angular
  momentum for an accurate perihelion. Tail always points away from the
  Sun, re-oriented every frame. Each comet gets its own precomputed
  trajectory line, added/removed alongside its mesh.
- **Multiplayer steward** (Presence member with smallest `(joined_at,
  client_id)`) now only tops up comets — the 9 fixed bodies are DB-seeded
  once, never spawned by a client. `net/stewardFallback.js#
  createStalenessGate` lets any connected client step in if the steward
  goes quiet too long.
- **Realtime channel health has no free lunch**: `net/connect.js` exposes
  `isConnected()` — always gate any steward-driven spawn on it (a dead
  socket doesn't stop local REST calls like `bite_body`/insert/delete, so
  a desynced client looks deceptively normal). Don't add a new
  steward-gated loop without this + a staleness fallback.
- **A DELETE on `bodies` (comet-only)** can mean eaten OR flown out —
  `onBodyDeleted()` checks the local object's `health <= 0`, never a
  field off the DELETE payload itself (Realtime DELETE may omit columns
  without `REPLICA IDENTITY FULL`).
- **Settings / identity / i18n** stay three separate small persisted
  modules on purpose (not merged) — all localStorage access goes through
  `core/utils.js#readStorage`/`writeStorage`.
- **Nickname moderation is defense-in-depth**: checked client-side as a
  courtesy AND again server-side/on-arrival for remote data — a modified
  client can send anything. Nicknames also restricted to
  `/^[\p{L}\p{N} ]+$/u`, capped at `NET_MAX_NICK_LENGTH`.
- **Ship cam** (`scene/shipcam.js`): a second viewport/scissor render pass
  on the same renderer, not a second `WebGLRenderer` — must reset
  viewport/scissor to full-canvas before the main render each frame.
- **Nebula skybox + starfield** (`scene/skybox.js`, `scene/setup.js`) both
  need `fog:false` on their materials or they wash out into the fog color.
- **Pulsars** (`scene/pulsars.js`) are purely decorative — not part of
  `ctx.planets`, not edible.
- **Programmable drone** (`js/drone/*.js`): a single extra ship that only
  moves via a player-written script in a small custom DSL
  (`dsl.js`/`interpreter.js`, generator-based, not JS/eval). Full
  gotchas (runaway-script safety net, click-priority bug history, the
  `.hidden`/`display:none` CSS trap, `pointerdown` vs `click`) in the doc.
  A visual **block editor** (`js/blocks/`, `ui/windows/block*.js`)
  compiles to that same DSL — one interpreter only. Text script and
  block program are both kept; `drone/droneMode.js` only picks which one
  runs (never delete either on a mode switch — explicit user call).
- **New-style UI kit** (`css/ui/`): start screen, setup modal and the
  whole in-game HUD (v2.2.0, ported from a standalone mockup since
  deleted — the game itself is now the reference). `.uiStage` (fixed 1536x1024),
  `.uiBar`/`.uiScreen` (stretch with the window), all scaled by
  `--uiScale` set in an inline `<head>` script. `main.js` inits and
  paints the start screen *before* `initScene()` (which blocks the main
  thread); fonts are self-hosted + preloaded. **The 3D scene renders
  only into the HUD's `#viewport` rect** (`scene/viewRect.js` — picking,
  miniatures and ship cam all go through it); HUD panels have no fill
  because miniatures are drawn on the canvas under them. Files mirror the
  UI: `js/ui/hud/` + `css/ui/hud/` one per panel (`hud/hud.js` is
  main.js's only entry point), `js/ui/windows/` + `css/ui/windows/` the
  same for windows. Full detail,
  gotchas and where every old HUD feature went: docs/architecture.md's
  "UI kit" and "In-game HUD" sections.
- **Wiki** (`ui/windows/wiki*.js`): read-only, filled in by play via
  `core/discovery.js` (`"tab:key"` ids, localStorage). Texts in i18n
  `wiki.entries.<key>` — **the key after the colon must be unique across
  all tabs**. The Story tab's memory fragments come from
  `core/storyLog.js`, paced (one per 3 min of play). The game's story
  premise: the humans are gone, only AI and robots remain — the full
  draft lives in a **local, untracked `FABULA.md`** (in
  `.git/info/exclude`): never commit it.
- **Space station** (`js/station/*.js`): one static per-player landmark,
  read-only info in the HUD's PLANET INFO slot, mesh shared between local + ghost rendering
  via `buildStationMesh(opts)`. Ships spawn arranged around it on a
  golden-angle spiral (`ships/swarm.js#shipSpawnPosition()`), inside a
  gravity-free containment field (`STATION_FIELD_RADIUS`) —
  `world/solarGravity.js` skips ambient gravity for any ship inside it,
  `station/stationField.js` pulls back anything that's drifted beyond it.
  The drone spawns nearby too and shares the gravity exemption, but
  deliberately *not* the pull-back (would drag it off a distant dock).

## Security model (Supabase)

Core rules — see [`docs/security.md`](docs/security.md) for the exploit
post-mortems and live-verification detail behind each:

- **No client-writable UPDATE policy on `bodies`, `solar_bodies`, or
  `world_meta`.** Health only changes via `bite_body`/`bite_solar_body`
  (`SECURITY DEFINER` RPCs). Re-adding a permissive UPDATE policy reopens
  a real "set health to 0 then land one trivial hit" exploit.
- **INSERT/DELETE on `bodies` (comet-only) stay permissive but
  rate-limited** — CHECK constraints (per-kind ranges, `bodies_pos_check`/
  `bodies_vel_check`) and burst-rejecting triggers (15-in-10s) are the
  real defense, not the steward-election courtesy. When rescaling
  distances/speeds, remember these CHECK constraints too — missing this
  once already silently rejected every real comet spawn for several
  commits (see `docs/security.md`).
- **`activity_log` is a passive audit trail** — RLS enabled, zero client
  policies, nothing auto-bans anyone. View via `admin.html` (gated by a
  server-side-hashed secret) or the Management API.
- **`bite_body` rate-limited 20 calls/sec/actor**; `set_my_nick()` 5
  calls/30s/actor — both silently drop over the limit, no error.
- **Anonymous-auth**: `initNet()` calls `getSession()` before
  `signInAnonymously()` — reusing an existing session, not minting a new
  anon user on every page load (this was a real bug, fixed).
- **`player_count()`** (start screen counter) is the only client read
  path into `actor_nicks` and returns just a number — keep it that way.
- **`admin.html`** renders every cell with `textContent`, never
  `innerHTML` — nickname/IP/browser are all client-controlled data (a
  stored-XSS hole here was found and fixed before ever shipping).

## Devlog (Blogger)

Companion Polish-language devlog at
[swarmprotocol.blogspot.com](https://swarmprotocol.blogspot.com/),
published via the Blogger API (credentials in the gitignored `pass`
file) — see [`docs/blogger.md`](docs/blogger.md) for the publishing
workflow/gotchas (image hosting, OAuth redirect URI, the
`Content-Length: 0` requirement, etc.).

## Known gotchas

- `RingGeometry` has **planar** UV mapping — animating
  `material.map.offset.x` slides the texture, doesn't rotate it; rotate
  the **mesh** instead (see the black hole accretion disk in
  `js/world/blackholes.js`).
- Supabase anonymous sign-in rate-limits (HTTP 429) under repeated
  sign-ups from heavy same-session testing — space out test runs.
- All local/Playwright testing hits the **same live Supabase project** as
  real players — keep test traffic light, test bot nicknames are visible
  to real users in the players list while a test is running.
- The `pass` file (gitignored) holds the Supabase **Management API**
  token / DB password — never commit it. The Supabase **anon key** in
  `js/env.js`, by contrast, is meant to be public and safe to commit (RLS
  policies in `supabase/schema.sql` are what actually protect the data).
- GitHub Pages deploys can look "errored" when they were actually just
  **cancelled** by a rapid second push (check `gh run list`, not the
  legacy Pages Builds API); `?v=`/`versionCheck.js` cache-busting isn't
  fully airtight for files `main.js` transitively `import`s; the
  `supabase-js` console warning about `Realtime send() ... falling back
  to REST API` is expected/harmless library behavior, not a dropped
  message. Full stories for all three in
  [`docs/gotchas.md`](docs/gotchas.md).
