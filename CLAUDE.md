# Project brief: Swarm Protocol

A lean index, loaded into every session — rules and pointers only. The
why and the history behind each item live in `docs/`:
[`architecture.md`](docs/architecture.md) (world, network, programs),
[`ui.md`](docs/ui.md) (screens, HUD, windows),
[`rendering.md`](docs/rendering.md) (models, graphics, post-processing),
[`security.md`](docs/security.md),
[`gotchas.md`](docs/gotchas.md), [`blogger.md`](docs/blogger.md),
[`ship.md`](docs/ship.md) / [`bodies.md`](docs/bodies.md) (the labs),
[`scale.md`](docs/scale.md) (sizes; `scale.html`), [`skins.md`](docs/skins.md)
(`skins.html`), [`systems.md`](docs/systems.md) (`systems.html`, SystemKit),
[`surface.md`](docs/surface.md) (`surface.html` / `buildings.html`, SurfaceKit, BaseKit),
[`vehicles.md`](docs/vehicles.md) (`vehicles.html`, VehicleKit),
[`marine.md`](docs/marine.md) (`marine.html`, MarineKit). **Read the relevant doc before changing a subsystem** —
the long ones have a Contents block: grep `^## ` and read only that section.
[`README.md`](README.md) has the file map, [`CHANGELOG.md`](CHANGELOG.md)
the versions, [`IDEAS.md`](IDEAS.md) the plans and open threads.

## What this is

A 3D space game: Three.js r128 (classic UMD `THREE` global), a static site
with no build step and no npm — native ES modules from `js/main.js`. No
CDN at runtime: Three.js and supabase-js in `vendor/`, fonts in `fonts/`.
Deployed on GitHub Pages by pushing to `main`
(`michalstankiewicz4-cell/Space`). The player's swarm eats bodies of a
fixed 9-orbit solar system for points spent on upgrades; ships and the
drone run player programs; other players are shared live via Supabase;
the player's own progress stays in `localStorage`.

## Working conventions

- **Language**: reply to the user in Polish. Everything in the repo — UI
  text, docs, commit messages, code comments (JS and SQL) — is English;
  the only exception is the Polish dictionary, `js/i18n/pl.js`.
- **Versioning**: every meaningful change to the game or
  `supabase/schema.sql` → bump `js/version.js`, a `CHANGELOG.md` entry,
  and the `?v=` params on `css/style.css` and `js/main.js` in `index.html`
  (hardcoded, easy to forget), and **always** a short `whatsNew` entry in
  both `js/i18n/en.js` and `pl.js` — every bump makes players refresh, so
  the update notice's WHAT'S NEW must say what's new, in a sentence a
  player understands (the user's call, 2026-10-03; under-the-hood work:
  say what it means for them, e.g. "fixes and stability"). **Not** for: `admin.html` (+ `js/admin/`,
  `css/admin.css`, `css/devTheme.css`), the labs `ship.html` /
  `bodies.html` / `scale.html` (+ `js/scalelab/`) / `skins.html` /
  `systems.html` (+ `js/systemkit/`, not in the game yet) / `surface.html`
  (+ `js/surfacekit/`) / `buildings.html` (+ `js/basekit/`) / `vehicles.html`
  (+ `js/vehiclekit/`) / `marine.html` (+ `js/marinekit/`) and their LabKit
  (`js/labkit/`, `css/lab.css`),
  `tools/`, the devlog (`blog/`, Blogger), and `.md`-only edits — those are
  plain commits, no changelog entry.
- **A new `js/`/`css/` game file → add it to
  `js/versionCheck.js#MODULE_FILES`** (incl. every stylesheet index.html
  links), or "Refresh now" silently misses it.
- **Testing**: no test suite. A local server (`python -m http.server
  8877`) + a throwaway Playwright script in the scratchpad (screenshots,
  console/pageerror listeners). **Kits and labs: `tools/kitcheck.html`**.
  - It holds the fingerprints of every default model (ShipKit, BodyKit,
    BaseKit, VehicleKit, MarineKit, SystemKit) against
    `tools/kitcheck.golden.json`, and opens every lab looking for errors.
  - It must PASS before and after a refactor.
  - A change meant to alter models: check the diff, then commit a new
    golden file with it. It hits the **live** Supabase — keep
  traffic light. Test "hidden" with `getComputedStyle(el).display` or a
  screenshot, never a class name.
- **Git**: new commits (amend only before anything is pushed); every
  commit ends with `Co-Authored-By: Claude Sonnet 5
  <noreply@anthropic.com>`. Ask before pushing; push to `main` after
  visual verification.
- **No trademarked franchise names** in code, comments or docs — generic
  descriptions instead (already-published blog posts may keep theirs).
- **New 3D assets / big UI changes: prototype first** — a standalone page
  (a lab or a throwaway file) to settle the look, then move the shared
  code into `js/`, then retire the throwaway prototype (ask before
  deleting). The labs themselves stay.
- **Never commit**: `pass` (tokens, DB password), the local story draft
  `FABULA.md` (in `.git/info/exclude`). The Supabase **anon key** in
  `js/env.js` is public by design.

## Architecture (map — details in docs/architecture.md, ui.md, rendering.md)

- **Bodies**: 7 kinds, one data file each in `js/bodies/`
  (`content.js#CONTENT`); only comets are rolled, the other 6 are fixed
  solar bodies. `world/bodies.js` = lifecycle, `bodyParams.js` = kind
  math, `bodyVisual.js` = the look (BodyKit), `rewards.js` = points for a
  kill (`bodies.js#isSpent`: an eaten body pays once). `scene/camera.js` =
  the camera (modes, focus, glide), `scene/controls.js` = mouse input,
  selection and orders; `picking.js`, `tooltip.js`,
  `selectionBrackets.js` (HTML overlay).
- **Ships move only on an explicit order** (`controls.js#commandTo` →
  `commandedTarget`, RETURN TO BASE) or their own program — never an
  automatic target.
- **Camera**: "base" (the station, default) and "system" (the Sun) on the
  toggle, plus "focus" (`focusCameraOn` / `focusCameraOnUnit`: a minimap
  click, VIEW buttons); every change glides ~1 s; a lost target → system.
  The black hole is selectable but never a course target. Trajectory lines
  (`scene/trajectories.js`): the object in view + the selected ones (a
  single ship, not a group).
- **Solar system** (`world/solarSystem.js`): the Sun + 9 fixed slots
  (orbit 4 = the station ring), positions closed-form from wall-clock time
  (`bodyPosAt`). Bodies are drawn bigger than their gameplay `size`
  (`BODY_VISUAL_SCALE`): gravity/value/health use `size`, anything "near a
  body" uses `radius + gap`. Health regenerates, never destroyed
  (`bite_solar_body`). Gravity: `world/solarGravity.js` (patched conics).
  **Keep the Sun and the black hole out of the primary-body loop**, and
  **keep the `MAX_GRAVITY_ACCEL` cap** (both real bugs, see the doc).
  **Ordered ships are gravity-immune while cruising** (skipped outright
  since v2.19.0 — tested alternatives never arrived); units flown by a
  program get gravity as a position drift; idle ships outside the station
  field feel real gravity.
- **Comets** are the one simulated body (`world/cometPhysics.js`): one at a
  time (`net/bodiesSync.js#maintainComet`), replayed for late joiners,
  their own trajectory line.
- **Multiplayer**: a steward (smallest `(joined_at, client_id)`) only tops
  up comets; any steward-driven spawn must be gated on
  `net/connect.js#isConnected()` + a staleness fallback
  (`stewardFallback.js`). A comet DELETE can mean eaten or flown out —
  check the local object's `health`, not the payload.
- **Settings / identity / i18n** stay three separate modules; all
  localStorage goes through `core/utils.js#readStorage/writeStorage`.
  Static UI text in `index.html` carries its key (`data-i18n`, `-title`,
  `-html`, `-placeholder`); `ui/i18nApply.js` only sets what depends on
  state.
- **Nicknames**: checked client-side and again on arrival (a modified
  client can send anything); `/^[\p{L}\p{N} ]+$/u`, `NET_MAX_NICK_LENGTH`.
- **Programs**: one DSL and one generator interpreter (`drone/dsl.js`,
  `interpreter.js`, not eval), one runner for the drone and every ship
  (`js/program/runner.js`, builtins per unit via `unit.api`), per-unit
  text script + block program + mode (`program/unitPrograms.js`) —
  **switching modes never deletes either program** (user's call). Blocks
  compile to the same DSL. Trajectory preview = the real interpreter on a
  copy (`program/simulate.js`).
- **UI kit** (`css/ui/`, v2.2.0): a 1536×1024 design surface scaled by
  `--uiScale`; the 3D scene renders only into the HUD's `#viewport`
  (`scene/viewRect.js`) — the unit/planet miniatures and the cockpit view
  are extra render passes on the same canvas (reset viewport/scissor to the
  full canvas before the main render; HUD panels have no fill because the
  miniatures are drawn under them); one JS + one CSS file per HUD panel / window
  (`js/ui/hud/`, `js/ui/windows/`). Research = data-driven upgrade trees
  (`ui/windows/techTreeData.js` → `techTree.js`; buying in `research.js`).
- **Rendering** (v2.8.0): sRGB + ACES + `ShipKit.makeEnvironment`; game
  colours converted to linear once per material (`scene/colorManagement.js`)
  — a colour set at runtime must be converted by hand.
- **ShipKit** (`js/shipkit/shipkit.js`) and **BodyKit**
  (`js/bodykit/bodykit.js`): one classic-script file each, shared by the
  lab (`ship.html` / `bodies.html`) and the game — changing them changes
  the game (version bump). Build ships from ShipKit's building blocks,
  never copy between ships; a new body is data, never a copied shader
  (rules in `docs/ship.md` / `docs/bodies.md`). Mark animated parts
  `userData.dynamic` or merging bakes them. **The ship lab is the
  reference lab** — new model ideas start there as ShipKit blocks.
  ShipKit SHAPING (rounded edges, joints as fillet / sealant) is **off in
  the game** until values are chosen and measured; **running lights never
  vanish — switched off they only go dark** (user's calls, 2026-10-03). **PostKit**
  (`js/postkit/postkit.js`, post-processing) is shared the same way — its
  IMAGE EFFECTS panel in the labs is the camera's, kept apart from the
  model's own controls (user's call).
- **Other players' ships, drones and stations are never tinted** (user's
  call): owner-coloured diamond markers; only a station shows the name.
- **Wiki**: filled in by play (`core/discovery.js`, `"tab:key"` ids; the
  key after the colon unique across tabs); texts in i18n
  `wiki.entries.<key>`. Story premise: humanity is gone, only AI and
  robots — keep lore consistent, no spoilers in game texts.
- **Station** (`js/station/`): ShipKit's ST-04 HAVEN, starting as a ruin
  (`STATION_START_DAMAGE`; repairs planned). Ships and the drone spawn
  inside its gravity-free field (`STATION_FIELD_RADIUS`) — **the field
  shields, it doesn't pull** (user's call, v2.19.0).

## Security (Supabase) — details in docs/security.md

- **No client-writable UPDATE policy on `bodies`, `solar_bodies`,
  `world_meta`**: health changes only via `bite_body` / `bite_solar_body`
  (security definer RPCs) — a permissive UPDATE reopens a real exploit.
- **INSERT/DELETE on `bodies` (comets)**: CHECK constraints + burst
  triggers are the defense; **rescaling distances/speeds means updating
  those CHECKs too** (missed once, rejected every comet).
- **Every new DB function is callable from the browser by default** →
  internal helpers get a `revoke execute` line at the end of
  `schema.sql`; client-callable ones take the actor from `auth.uid()`.
- **Deploy only the specific functions asked for**, never the whole
  `schema.sql`. **`player_count()` is not deployed yet** (user's call) —
  the start screen's "—" and its console 404 are expected; it must keep
  returning only a number.
- Rate limits: bites 20/s per actor (`bite_body` and `bite_solar_body`
  share `bump_bite_rate`; the client batches to 15/s,
  `net/biteBudget.js`), `set_my_nick` 5/30 s, `delete_my_data` 3/60 s —
  silently dropped. `activity_log` is a passive audit trail
  (read via `admin.html`, secret-gated; every cell rendered with
  `textContent`).
- **Anonymous auth**: reuse the session (`getSession` before
  `signInAnonymously`).
- **Privacy (GDPR)**: `privacy.html` must match what's stored (shortened
  IP only, logs 30 days, nicks 180 days, `delete_my_data` only the
  caller's own); **nothing connects to Supabase before the policy is
  accepted** (`ui/privacy.js#whenPrivacyAccepted`) — keep new server calls
  behind it. Code licence: MIT.

## Devlog

Polish Blogger devlog, published through the API (credentials in `pass`):
workflow, style and gotchas in [`docs/blogger.md`](docs/blogger.md) —
drafts by default, real screenshots, WebM clips not GIFs, honest and
personal tone.

## Known gotchas (full stories in docs/gotchas.md)

- `RingGeometry` has planar UVs — rotate the mesh, not the texture offset.
- Repeated test sign-ups hit Supabase's anonymous sign-in limit (HTTP
  429); test nicknames are visible to real players while a test runs.
- A GitHub Pages deploy "error" is often just a cancel by a quick second
  push — check `gh run list`. `?v=` cache-busting isn't airtight for
  transitively imported files. The supabase-js "falling back to REST API"
  warning is harmless.
- Building labs (2026-10): `THREE.Color` has no `addScaledVector`;
  `LatheGeometry` spreads UV v over the whole profile; vertex normals lie
  at a box's corners; far objects z-fight (depth precision) — the list is
  in docs/gotchas.md, "Lab-building lessons".
- An SVG gradient with the default `objectBoundingBox` units paints
  nothing on a perfectly vertical or horizontal line (the research tree's
  traces) — use a flat colour or `userSpaceOnUse`.
