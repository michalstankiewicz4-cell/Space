# Project brief: Space Swarm — ROJ

Condensed context for picking this project back up. See [`README.md`](README.md)
for structure/setup and [`CHANGELOG.md`](CHANGELOG.md) for version history.

## What this is

A 3D space game built with Three.js (r128, classic UMD `THREE` global).
Static site, no build step, no npm — native ES modules loaded via
`<script type="module" src="js/main.js">`. Deployed on GitHub Pages by
pushing to `main` (repo: `michalstankiewicz4-cell/Space`).

Gameplay: the player's swarm of ships eats planets/suns/comets/meteoroids
for points, spent on upgrades (speed, bite power, thermal resistance,
swarm size); black holes are a hazard to avoid. World and other players'
ships are shared live via Supabase; a player's own points/upgrades stay
local (`localStorage`).

## Working conventions

- **Language**: the user writes in Polish; reply to them in Polish. All UI
  text in the game itself, and all project docs (README, CHANGELOG, this
  file, commit messages), are in **English**.
- **Versioning**: bump `js/version.js` and add a `CHANGELOG.md` entry for
  every meaningful change (feature, balance change, notable fix) — this
  is how two GitHub Pages deploys are told apart after a push.
- **Testing before commit**: there's no test suite. Verify changes with a
  local static server (`python -m http.server 8877` from the repo root)
  and a throwaway Playwright script in the scratchpad dir (headless
  Chromium, screenshot-based checks, console/pageerror listeners). This
  hits the **live** Supabase backend (see gotcha below), so keep test
  traffic light.
- **Git**: create new commits (don't amend, except right after a hook
  failure on a commit that never happened, or before anything's been
  pushed). Every commit/PR ends with the `Co-Authored-By: Claude Sonnet 5
  <noreply@anthropic.com>` trailer. Push to `main` after visual
  verification.

## Architecture notes

- **Body types are data-driven**: each of the 7 celestial body kinds (sun,
  ice/neutral/volcanic planet, comet, meteoroid, black hole) is a plain
  object in its own file under `js/bodies/`, aggregated by `js/content.js`.
  A "planet" DB row only stores `kind`+`temp`, not which of the 3 planet
  variants generated it — `variantForTemp()` re-derives it deterministically.
- **Object editor** (`editor.html`, not linked from the game) reuses the
  game's own `materializePlanet`/`materializeBlackHole` functions for its
  live preview, so it can never visually drift from actual gameplay. It
  has no backend, so "Download" just produces copy-pasteable
  `export const ... = {...}` blocks for `js/bodies/*.js`.
- **Multiplayer** (Supabase, anonymous auth, no login UI): bodies are
  kinematic (position/velocity computed from `spawned_at` client-side), so
  only two things need real-time sync: body health (via the `bite_body`
  Postgres RPC, atomic so simultaneous biters can't double-count a kill)
  and other players' ship positions (ephemeral Realtime Broadcast, never
  written to the DB). A **steward** — the Presence member with the
  smallest `(joined_at, client_id)` — is the only client responsible for
  spawning/topping-up bodies and black holes; re-elected automatically if
  it disconnects. `pendingSpawnCount` in `js/world/bodies.js` tracks
  in-flight inserts so top-up logic doesn't over-spawn while an insert is
  still in transit.
- **Settings vs. identity vs. i18n**: three separate small persisted
  modules, deliberately not merged — `js/settings.js` (local input/UX
  prefs: mouse invert/swap), `js/net/identity.js` (nickname/color, shared
  with other players), `js/i18n.js` (language toggle).

## Known gotchas

- `RingGeometry` has **planar** UV mapping (not polar around the ring).
  Animating `material.map.offset.x` on it slides the texture sideways
  instead of rotating it — rotate the **mesh** instead (see the black
  hole accretion disk in `js/world/blackholes.js`).
- Supabase anonymous sign-in rate-limits (HTTP 429) under repeated sign-ups
  from heavy same-session testing. Not a code bug — space out test runs.
- All local/Playwright testing hits the **same live Supabase project** as
  real players. Test bot nicknames are visible to real users in the
  players list while a test is running.
- The `pass` file (gitignored) holds the Supabase **Management API**
  token / DB password — never commit it. The Supabase **anon key** in
  `js/env.js`, by contrast, is meant to be public and safe to commit (RLS
  policies in `supabase/schema.sql` are what actually protect the data).
- CSS specificity: `#banner button` (id+type) beats a plain `#id` selector
  of equal id-specificity-count but lower total specificity — new
  ghost/secondary buttons inside `#banner` need `#banner button#id` or
  `!important` to not inherit the primary CTA style.
