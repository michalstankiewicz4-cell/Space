# Changelog

All notable changes to the game, version by version. The version number is
shown next to the title on the start screen and in the browser tab title
(see [`js/version.js`](js/version.js)).

## [1.5.1]

### Fixed
- The "Refresh now" button on the outdated-version overlay used a plain
  `location.reload()` — effectively F5, which can still serve
  `js/main.js`/`css/style.css` straight from cache if they're within
  GitHub Pages' 10-minute freshness window, since a normal reload only
  revalidates resources the browser already considers stale. There's no
  standard cross-browser JS API for a true hard reload (Ctrl+Shift+R).
  Now navigates to a cache-busted URL instead (`?_=<timestamp>`), which
  guarantees a real fetch since it's a URL the browser has never seen.

## [1.5.0]

### Fixed
- Diagnosed and fixed a class of silent multiplayer desync: the Realtime
  channel's `subscribe()` callback only ever handled the `"SUBSCRIBED"`
  status — a dropped socket (sleep/wake, network change, a token expiring
  during a long background period) that didn't fully self-heal left a
  client permanently deaf to other players' actions, while its own local
  gameplay (ship movement, biting, spawning — all plain REST calls,
  independent of the socket) kept working normally with zero visible sign
  anything was wrong.
- That silent desync also had a dangerous side effect on the steward
  top-up logic added in 1.2.1: a disconnected client's view of the world
  looks perpetually under-populated (it stops receiving others' spawns),
  so it could end up flooding the shared world with duplicate bodies via
  plain REST inserts, unaware anything was wrong.

### Added
- `net/connect.js` now handles `"CHANNEL_ERROR"`/`"TIMED_OUT"`/`"CLOSED"`
  with an exponential-backoff reconnect (capped at 30s), and exposes
  `isConnected()` so `maintainPlanetCount()` refuses to spawn anything
  while disconnected, closing the flooding risk above.
- A small non-blocking "⚠ Reconnecting to server…" badge appears while
  disconnected — deliberately based on the channel's own reported status,
  not a "gone quiet" timer, since a quiet-but-healthy connection (nobody
  else playing right now) would otherwise look identical to a dead one.
- `bootstrapWorld()` now reconciles local state against a fresh fetch on
  every (re)connect, silently removing anything tracked locally that no
  longer exists server-side — catching up on deletes a reconnecting client
  missed while offline, since Realtime never replays missed events.

Verified live: forcibly closing the channel correctly shows the badge and
freezes local body count with no spawn attempts; the automatic reconnect
recovers cleanly with no errors or duplicate state.

## [1.4.1]

### Fixed
- A destroyed planet/sun/meteoroid could occasionally vanish silently
  (no breakup effect) for other players instead of exploding. The
  DELETE handler decided "was this eaten?" from a locally-tracked
  `health` value that depends on an earlier, separate UPDATE event
  having already arrived — if that update was ever delayed or dropped
  (e.g. a brief network hiccup, plausibly right as someone's connection
  is dropping), the guess came out wrong. Since a planet/sun/meteoroid
  can never leave the database for any reason other than being eaten
  (only comets ever legitimately despawn by flying out of the field),
  it's now always treated as eaten regardless of local health state;
  comets keep the health-based check since they're the one case that
  genuinely has two outcomes.

## [1.4.0]

### Added
- Version check (`js/versionCheck.js`): a page that's already open never
  re-fetches its own JS, so a long-lived tab keeps running whatever code
  was live when it loaded regardless of later deploys. The game now
  periodically re-fetches `js/version.js` itself (bypassing HTTP cache)
  and, if what's actually deployed is newer than what this tab is
  running, shows a blocking "please refresh" overlay — not dismissible
  except by reloading — so a stale client can't keep playing against
  game/network logic that may have moved on.

## [1.3.0]

### Added
- Nickname profanity filter (`js/moderation.js`): rejects offensive
  nicknames (English/Polish, with basic leetspeak-evasion handling) when a
  player tries to confirm their own nick, with an on-screen message. Since
  a modified client could still broadcast a raw nick straight over the
  WebSocket regardless, every remote player's nick is also re-checked
  before display and swapped for the generic fallback name if it's flagged
  — the real defense, matching this project's existing "never trust
  broadcast data" approach to multiplayer.

## [1.2.2]

### Fixed
- Added cache-busting (`?v=1.2.2`) to `css/style.css` and `js/main.js` in
  `index.html`, so a fresh page load shortly after a deploy is less likely
  to pick up a stale cached file (GitHub Pages serves everything with only
  a 10-minute `Cache-Control`). Doesn't help an already-open tab, which
  never re-fetches anything until reloaded regardless.

## [1.2.1]

### Fixed
- Diagnosed a live incident where a player left their tab open but
  inactive (frozen/backgrounded) after building up a large fleet and
  eating much of the shared world — since Presence-based steward election
  only reacts to an explicit disconnect, that stalled client stayed
  "steward" forever, so nobody topped up the world (confirmed live: body
  count dropped 8→6→4→4 over 45s with zero replenishment). Added a
  staleness fallback: if nothing has spawned in 8-12s (jittered per
  client) despite being under the target count, any client tops up
  instead of waiting forever for a steward that may never reconnect.
  Verified live: growth resumed within the expected window once the
  fallback engaged.

## [1.2.0]

### Added
- **Tech** button next to Wiki: the upgrade tree moves off the always-on
  bottom dock into an on-demand centered modal (a responsive grid, so it
  fits the screen regardless of size instead of a single row that could
  overflow).
- **Fleet** button: lists every ship in the swarm; clicking one opens a
  small picture-in-picture **ship cam** — a second camera rendered into a
  corner window, sitting at that ship and facing the way it's facing, like
  a cockpit view. Closable from its own button or Escape.

## [1.1.1]

### Fixed
- Closed a live exploit in the Supabase backend: `bodies` and `world_meta`
  had a permissive `UPDATE` RLS policy that let any anon-authenticated
  client bypass the atomic `bite_body` RPC entirely — set a body's health
  straight to 0 with a direct `update`, then land one trivial hit to
  instantly "kill" it and collect its full point value for free. Removed
  the permissive policies and made `bite_body`/`claim_world_init`
  `SECURITY DEFINER` (with a locked `search_path`) so they no longer need
  one. Verified against the live project: the exploit is closed and normal
  gameplay damage still works.

## [1.1.0]

### Added
- Centered **Setup** modal window (replacing the panel built into the
  banner), with **Language**, **Mouse** and **Help** tabs.
- Mouse settings: invert X/Y camera rotation (right-drag) and swap
  left/right mouse button — persisted locally (`js/settings.js`).
- **Help** tab in Setup with the controls explanation (previously a
  permanent hint box on the HUD).
- **Wiki** button that shows/hides the celestial body legend (previously
  always visible in the bottom-left corner).
- Vertical collapse toggle on the telemetry and players HUD panels.
- Hover tooltip on any celestial body: type, health and estimated point
  value (planets/suns/comets/meteoroids), or remaining lifetime and a
  hazard warning (black holes).

### Changed
- Players panel moved to the top-right (the spot freed up by removing the
  permanent controls hint).
- On-screen messages (planet devoured, orders, selection) are now
  centered on screen instead of pinned to the top-left.
- Panel collapse buttons enlarged (previously barely clickable).

## [1.0.0]

First versioned snapshot of the game — covers all work up to this point:

### Added
- Multiplayer via Supabase (anonymous session, no login): a shared, live
  world (planets, suns, comets, meteoroids, black holes) and other
  players' swarms visible in real time; a "steward" election handles
  world upkeep without a dedicated backend.
- Nickname required before entering the game, plus a players-online panel.
- Multiplayer hardening (RLS policies, protection against a malicious client).
- Animated, volumetric-looking sun corona and gradient rays (real 3D
  geometry, not a flat sprite).
- Fixed black hole disk rotation (texture no longer slides sideways).
- Comets reworked to look like rocky meteoroids with a fading tail.
- Neutral planets with a realistic surface (oceans, continents, polar
  caps, equatorial deserts) generated with simplex noise.
- Standalone parameter editor (`editor.html`) for all 7 body types, with
  a live 3D preview and file-download export.
- Body types split into 7 separate files/objects (`js/bodies/*.js`).
- Full English UI by default, with a Polish toggle.
- Small quality-of-life additions: a dice button to randomize the
  nickname, Escape reopens the start screen, inverted horizontal
  right-drag camera rotation.
- Introduced the version number shown in the game's title.
