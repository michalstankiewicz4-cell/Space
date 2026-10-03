# Feature ideas

Brainstorm notes for future work — not scoped or committed to; the few
pieces that have shipped since are marked as such. Kept as a single running file rather than scattered chat
history, so a future session can pick a concept back up without re-deriving
context. Write-ups here should still follow the project's usual documentation
standard (concrete, references real file paths/patterns) even though the
feature itself doesn't exist yet.

## Ship hacking (PvP)

**Concept**: give every ship (and maybe the drone/station) a "system
password." Within a certain range, another player can attempt to log in to
it via a script they write themselves — reusing the drone's existing
DSL (`js/drone/dsl.js`/`interpreter.js`) rather than inventing
a second scripting system. Fits the game's existing "write a small program
to interact with the world" loop instead of a bolted-on separate minigame.

### Proposed DSL additions

Numeric-first, same philosophy as the existing builtins (strings only exist
for `print()` today — see `docs/architecture.md`):

- `scanNearestEnemy()` — 1 if an enemy ship/drone/station is within hacking
  range, else 0. Same shape as `nearPlanet()`.
- `tryLogin(code)` — attempts `code` (a number) against the target's
  password; returns 1 (success), 0 (wrong), or some sentinel for "locked
  out, try later."
- `hackCooldown()` — seconds until another attempt is allowed. Same getter
  shape as `fuel()`/`maxFuel()`.

### The hard problem: where does the password actually live?

This is the real open question, not the DSL syntax:

- Ships have **no server-side row at all** today — positions are pure
  ephemeral Realtime Broadcast (`net/shipsBroadcast.js`), nothing persisted
  to Postgres, nothing else even knows a given ship exists beyond "some
  numbers in a recent broadcast payload." A password broadcast alongside a
  ship's position would be readable by literally anyone listening on the
  channel (no per-recipient encryption exists or is planned) — so if it's
  ever transmitted at all, "guessing" it is pointless, you'd just read it.
- Doing this with real security, consistent with the project's established
  defense-in-depth model (`docs/security.md`), would
  need a new `SECURITY DEFINER` RPC analogous to `bite_body` — something
  like `try_hack(p_target_actor, p_target_ship_index, p_guess) returns
  boolean`, checking a server-held secret and rate-limited the way
  `bump_bite_rate()` / `bump_activity_rate()` already throttle bites, the
  admin secret and `set_my_nick`. That means giving ships *some* server-side identity for
  the first time — a real architectural step up from "ephemeral broadcast
  only," not a small addition.
- **Cheaper first-pass alternative**: don't try to make it real security at
  all. Make the "password" a short deterministic puzzle derived from
  something already public (e.g. a function of the target's `client_id`
  plus a rotating time window) — not secret, just something you have to
  write the right script to compute. This fits the DSL's existing spirit
  (a puzzle-solving toy, not a security boundary) and needs zero backend
  changes, at the cost of not being a "real" password anyone could keep
  truly private.

### Balance / anti-grief

- Rate-limit attempts per attacker-target pair, same pattern as
  `bite_rate_limit` — otherwise a `while(true){ tryLogin(...) }` script
  brute-forces instantly.
- Cooldown before the *same* victim can be retargeted, so this can't become
  constant harassment of one player.
- A failed/successful attempt probably shouldn't be silent to the victim —
  something like the existing `toast.blackholeDetected` "hazard nearby"
  pattern, so it reads as a game mechanic, not passive surveillance.
- Consider a defensive stat (new `TREE` upgrade node, or extending the
  drone's existing per-entity `defense` field to ships) so hacking isn't a
  free, unopposed action against an undefended player.
- See "Drone computational power" below — if `tryLogin()` attempts cost CPU
  budget (or are a *blocking* call like `move()`/`turn()`/`wait()`, paced
  by it), brute-forcing is throttled by the attacker's own upgrade level
  for free, without needing a server-side rate limiter for the cheap
  public-puzzle version of this idea.

### What happens on success — pick one to start

Roughly increasing in risk/complexity:

1. **Reveal info only** (fuel, upgrade levels, nickname if hidden) — pure
   scouting, safest starting point, no capture/disable logic needed.
2. **Temporary disable** ("stunned" — can't move/attack for N seconds) —
   a tactical debuff, still recoverable, no permanent loss.
3. **Capture** (ship switches swarms) — the most dramatic version of the
   original idea, but also the most punishing for an undefended victim and
   the hardest to make feel fair without the real-security backend above.

### Suggested smallest first slice

Start with the public-puzzle password + reveal-only outcome (#1 above) —
no schema changes, no new RPC, just new DSL builtins plus client-side
scanning/timing logic in the units' builtins (`unit.api`: `drone.js#DRONE_API`,
`ships/shipProgram.js`). Only escalate
toward disable/capture, and the properly-secured server-backed password,
once that first slice is actually fun and balanced.

## Drone computational power (script execution speed)

**Concept**: an upgradeable stat that limits how fast/how much a script can
*compute* per frame — separate from movement speed, and separate from the
runaway-script safety net that already exists. Gives players a reason to
invest in "thinking faster," not just moving faster or hitting harder, and
(see the hacking idea above) doubles as a natural, free throttle on
brute-force-y scripts without any server involvement.

### Where this hooks into the existing interpreter

Today, `js/program/runner.js`'s `driveGenerator()` (shared by the drone
and every ship since v2.19.0; it lived in `js/drone/drone.js` before)
resolves every *instant*
builtin (`fuel()`, `attack()`, arithmetic, comparisons, the `while` loop's
`__tick__` checkpoint, ...) synchronously, in a single JS call, up to
`MAX_INSTANT_STEPS_PER_FRAME` (currently 2000) — that constant exists purely
as a **tab-freeze safety net** (see `docs/architecture.md`: a
`while(true){}` with no blocking call would otherwise spin forever inside
one native call), not as
a deliberate pacing mechanism. Only `move()`/`turn()`/`wait()` are actually
paced against real time today (via `DRONE_MOVE_SPEED`/`DRONE_TURN_SPEED`),
so a script that's all branching/arithmetic and no movement effectively
runs "free" and instantly every frame.

### Proposed shape

- A new, much smaller **per-player** budget (e.g. `DRONE_CPU_STEPS_PER_FRAME`,
  upgradeable — likely a new `TREE` node in `config.js`, same
  `{icon, base, growth, maxLvl, effect(lvl)}` shape as `speed`/`power`/etc.)
  that gates how many instant-builtin resolutions `driveGenerator()` does
  before it must stop and wait for the next frame — independent of, and
  much lower than, the existing safety ceiling.
- **Keep `MAX_INSTANT_STEPS_PER_FRAME` itself as a hard, non-upgradeable
  ceiling.** The per-player CPU budget should only ever make a script
  *slower* than that ceiling, never let it go higher — otherwise a
  maxed-out "CPU power" upgrade (or a modified client claiming one) could
  reintroduce the exact tab-freeze risk that constant exists to prevent.
  Two separate constants, two separate purposes: one is player-facing
  pacing, the other is non-negotiable engine safety.
- A low-CPU drone would visibly "think slower" — a complex `if`/`while`-
  heavy script takes several frames to get through logic that a
  high-CPU drone resolves in one — while a script that's mostly
  `move()`/`wait()` wouldn't feel very different either way, since those
  were already paced by real-world speed constants.

### In the Research window already (v2.20.0)

The Research window's second tree, PROGRAMMING (`ui/windows/
techTreeData.js`), shows this idea's upgrades as planned, locked nodes:
CPU speed (→ overclock, cache), memory (→ deeper stack, compression),
link bandwidth (→ relays, control range), threads (→ parallelism,
synchronization). Making one real = giving the node `kind: "upgrade"` and
an entry in `config.js#TREE`, plus what the upgrade does.

### Story hook (the user's idea, 2026-09-27)

The in-world reason computers are slow here: **the black hole distorts
time across the system** — in the story it's the wreck of something
built, not a natural one, so "its field is strange" carries the physics
(gravity alone from a small black hole at these distances would do next
to nothing). That makes the CPU budget a lore feature, not an arbitrary
anti-spam cap. Possible mechanic: the per-frame budget shrinks the closer
the drone is to the black hole (`world/solarSystem.js` already knows its
position), and the CPU upgrade reads as a time-correction module rebuilt
on the station. Full story notes are in the local, untracked `FABULA.md`.

### Open questions

- Does this apply only to the drone, or also to whatever "hacking" scripts
  end up being (see above) — probably yes to both, same budget or a
  separate one per activity?
- Flat per-frame step budget, or something that scales more smoothly (e.g.
  a steps-per-*second* budget, decoupled from frame rate)?

## Deep economy: real materials, orbital physics, expanded scripting

**Concept**: a longer-term direction, not a single feature — moving the
game from "eat planets for an abstract points currency" toward a real
production/trade economy built on real elements and minerals, real
celestial-body variety, and simplified orbital mechanics that actually
matter for navigation. The four pieces below are separate design threads
the user raised together; they're written up separately since each has its
own open questions, but they're meant to connect (materials feed building/
trading, orbits affect how you reach the bodies you mine, scripting is what
lets players automate the resulting complexity).

**Already shipped from this direction**: the fixed 9-orbit solar system
with patched-conics gravity (v2.0.0+, prototyped first in the user's
standalone `test.html`, since deleted), comets with a really simulated,
gravity-curved flight and their own predicted trajectory line, and
programs built from blocks that compile to the text DSL and run through
the one interpreter — for the drone (v2.4.0) and every ship (v2.19.0),
with the flight previewed as a trajectory (`program/simulate.js`). What's
still open: moons, real materials and the economy, more body kinds.

### Real elements & minerals → processing/manufacturing

**Update (2026-09-25)**: the Wiki (v2.3.0+) already describes the chain
this would use — real elements, minerals and ores → refined resources
(pig iron, steel, silicon, water…) → materials (hull plating, glass,
electronics…) → buildings (mine, refinery, shipyard, lab) — all as
not-yet-discoverable placeholders. The user's stated direction since:
planets should eventually be **transformed, farmed and built on** rather
than just devoured for points.

**Concept**: replace (or supplement) the current single abstract
`state.points` currency with a small set of real elements/minerals mined
from bodies, processed into intermediate materials, and used to build ships
(see the `ship.html` lab — its ShipKit ship definitions are built to be
ported into the game) or trade with other players.

- **What a body "contains"** would need to be derived from its existing
  data-driven type (`js/content.js`'s `CONTENT`, one file per kind under
  `js/bodies/*.js`) — e.g. a volcanic planet's high `temp` could bias toward
  heavier/rarer elements, an ice planet toward volatiles, a meteoroid toward
  raw ore, following the same "kind + temp → variant" derivation
  `variantForTemp()`/`bodyParams()` already do for visuals, extended to also
  drive yield composition.
- **Processing/crafting** (raw element → refined material → ship
  component) is a genuinely new system — no economy beyond the flat
  `state.points` + `TREE` upgrade spend exists today (see `config.js`'s
  `TREE`). This is the biggest open piece: whether refining happens
  passively, at the station (`js/station/*.js` already has an unused "docking
  panel, read-only for now" per its own header comment — a natural place to
  eventually hang a refinery/production UI), or via scripted automation (see
  the programming-model question above).
- **Trading between players** implies moving actual valued items across the
  network for the first time — everything synced today is either ephemeral
  broadcast (ship positions) or world-owned (`bodies` table). A player-to-
  player trade would need its own `SECURITY DEFINER` RPC in the same spirit
  as `bite_body` (atomic, so two simultaneous trades can't double-spend), and
  a real inventory table, which is a new category of persisted per-player
  data this project doesn't have yet (today only points/levels persist,
  and only in `localStorage`, never server-side — CLAUDE.md, "What this is").

### Real celestial body types (moons, pulsars, and friends)

**Concept**: expand the roster of interactable body kinds beyond today's 7
(`js/content.js`'s `CONTENT`: sun, ice/neutral/volcanic planet, comet,
meteoroid, black hole) toward more astronomically real variety — moons
orbiting planets, pulsars as an actual body type, maybe asteroid belts.

- **Pulsars already exist visually** — a few points in BodyKit's SKY
  (`scene/skybox.js`; the old sprite `js/scene/pulsars.js` is gone) — but
  are purely decorative background dressing, not part of `ctx.planets`,
  not edible, not spawned through the `CONTENT` system at all.
  Turning them into a real gameplay body would mean moving them into the
  same data-driven pipeline as everything else in `js/bodies/*.js`, which
  they deliberately aren't today.
- **Moons** are the one kind here that isn't just "a new leaf" in the flat
  `CONTENT` list — a moon needs a parent body to orbit (see "Moons" below).
- Each new kind slots into the existing per-kind pattern (own file under
  `js/bodies/`, own entry in `CONTENT`, `variantForTemp()`-style
  derivation if it needs sub-variants) — this part of the plan is low-risk
  precisely because the body-type system was already built to be
  data-driven for extension.

### Moons (orbital physics: the one open piece)

Every body orbits the Sun today; nothing orbits a *moving* parent. The
gravity side is ready — `world/solarGravity.js` already picks the body
whose sphere of influence a ship is inside — but `bodyPosAt(slot, t)`
only knows a fixed centre. A moon stays a pure function of time,
`moon_pos(t) = parent_pos(t) + local_ellipse_point(t)`, so nothing new to
sync (comets are the exception: a swing-by isn't an ellipse, so late
joiners replay a simulation).

### Open questions (all four pieces)

- Sequencing: orbital physics (shipped, v2.0.0+) was a prerequisite for
  moons; it was never one for elements/materials or
  pulsars-as-a-body, so those don't have to wait on moons specifically —
  the pieces don't all have to land together, and probably shouldn't.
- How much of this becomes visible in the existing side-panel UI patterns
  (the planet info panel added for planet selection, the station's
  "read-only for now" docking panel) versus needing wholly new UI.
  Nothing here has been scoped into concrete UI yet — this section is
  still at the "what should exist" stage, not "how it's built."
- Whether a real economy changes the game's existing "no login, anonymous,
  friction-free" identity model (`docs/security.md`, "Anonymous-auth spam") —
  persistent inventory/trading is a much stronger reason to want a stable
  identity than today's local-only points ever was, which loops back to the
  Google-login discussion already floated for the community ship-voting
  idea (`nickGoogleBtn` in `index.html`, currently a disabled placeholder).

## Interface: community feedback (2026-10)

Players commented on the HUD; key C (hide the interface step by step,
`ui/hud/uiMode.js`, v2.28.0) was the first answer. Ideas for what's next,
the recommended start marked ★ (least work, biggest effect). Ask what the
exact complaints were before picking — too cramped, text too small, too
many panels, features hard to find. A big layout change gets a prototype
first (the skin lab, `skins.html`), per the project's rule.

**Screen space**
- ★ **UI scale slider** in Setup (e.g. 70–130 %). The HUD is a fixed
  1536×1024 design scaled to the window (`--uiScale`, set by the inline
  `<head>` script in `index.html`): on a 1366×768 laptop the text gets
  small, on a big monitor the panels get needlessly large. A multiplier
  on `--uiScale`, kept in `settings.js`; the 3D view rect
  (`scene/viewRect.js`) follows the HUD anyway.
- ★ **Collapsible panels**: a click on a panel's header folds it to the
  header bar (fleet list, event log, minimap, object info), remembered
  per panel — a lasting, per-player version of key C. The 3D view and the
  stretching panels would need to take over the freed space.
- **Overlay layout** as an alternative: the 3D view fills the window and
  the panels float over it, translucent, instead of framing it; a panel
  opacity slider. Note the miniatures are drawn on the canvas *under* the
  panels (`docs/ui.md`, "In-game HUD") — they still need their boxes.
- **Fade while dragging the camera**: panels dim during a right-drag so
  they don't cover the scene.

**Controls** (what strategy players expect)
- ★ **Control groups**: Ctrl+1…9 stores the selected ships, 1…9 recalls
  them (double press: the camera on the group). Kept with the fleet
  memory (`ships/fleetMemory.js`), by ship index.
- **Hotkeys** for the windows (F fleet, R research, W wiki), H = RETURN TO
  BASE, Tab = next ship, Space = VIEW the selected unit. Same rules as C
  and O: ignored while typing or with a window open; listed in Setup →
  Help (`setup.controls`).
- **Key hints on buttons**: a small letter in a button's corner, so
  players find out the shortcuts exist.

**Readability**
- **Text size and contrast** as a setting of its own, separate from the
  UI scale.
- **Event log filter** (combat, discoveries, network): in a long session
  the log floods. `ui/hud/eventLog.js#showToast` takes a `kind` (info /
  arrive / alert) — a filter needs a category per message on top.
- **First-run hints**: 3–4 dismissable bubbles ("select ships → click a
  planet", "C hides the interface", "SCRIPT programs a unit"), shown once
  (a localStorage flag through `readStorage`/`writeStorage`).

## Travelling in time (2026-10)

The user's idea: log the world's state every so often and let a player go
back in time — "desynchronising" their game from the server — and come back
to the present, which resyncs it.

**What the architecture already gives for free**
- **Positions are a function of time.** Every fixed body is closed-form
  from the clock (`world/solarSystem.js#bodyPosAt(slot, t)`): any moment,
  past or future, is just another `t` — nothing to log.
- **Health** is a checkpoint plus regeneration (`healthBase`,
  `healthUpdatedAtMs`); the past needs only rare snapshots — 9 bodies
  every few minutes is tiny.
- **Comets** already replay from their spawn state for late joiners
  (`world/cometPhysics.js#advanceComet`); the past needs their spawn rows
  kept as history instead of deleted.

**What not to go back for**
- **Other players**: their positions are never stored and should stay
  that way (cost, and personal data the privacy policy would have to
  cover). The past is empty of other players — which fits the lore.

**How it could work**
1. **Desync**: pick a moment; the client stops sending anything (no bites,
   no broadcasts) and computes that moment locally — bodies from the
   formula, health from the snapshots, comets from their history.
2. **A local branch**: fly, look, even eat — locally only, never on the
   shared world.
3. **Back to the present**: the branch is dropped, the game rejoins real
   time and the room.

**Watch out**
- **Rewards**: points earned in the past would be farmed (go back to full
  bodies, eat, repeat). Simplest rule: no points there; the trip pays in
  knowledge (where a comet went, what the system looked like, story
  fragments).
- **The future**: fixed bodies can be shown ahead, comets can't (they
  don't exist yet) — consistent with the game's physics.
- **Lore**: the notes already have the black hole distorting time (see
  "Drone computational power", "Story hook"); travelling back could be an
  ability the AI recovers — the station's records, or the hole's field.
  Details stay in the local `FABULA.md`.

**Smallest useful version**: a time slider in the system view, view-only —
scrub hours or days back and forth, the bodies move along their orbits, a
NOW button returns. Almost all client-side; branches with actions later.
Server side for the full version: a small snapshot table (solar-body
health) and comet history, both purged after a set time, behind privacy
acceptance like every other server call.

## Privacy policy version history

The user's idea (2026-09-27), for later — there's only one version of the
policy so far, so nothing to switch between yet.

A styled dropdown in `privacy.html`'s pinned top bar (next to the
Polski / English / ← Gra buttons, in the same look) to pick which version
of the policy to read: "Current", then past versions by the period they
were in force, e.g. "2026–2028", "2028–2029".

- **Where old versions live**: frozen copies next to the page, e.g.
  `privacy/2026-09-27.html` (the date the version took effect), never
  edited after they're replaced. `privacy.html` stays the current one, so
  every existing link (the game's notice, About, Setup → Privacy) keeps
  working.
- **The list**: a small hand-maintained array in the page itself
  (`{ from, to, file }`), newest first; picking an entry navigates to that
  file and keeps the `#pl` / `#en` hash. An archived copy shows a banner
  "This is an archived version — see the current policy" with a link back.
- **Nice extra**: a short "What changed" line per version, so a player
  doesn't have to diff two legal texts by eye.
- **When it becomes worth doing**: at the first real policy change (the
  policy already promises to update the effective date and announce
  significant changes in the game or on the devlog — keeping the old text
  reachable is the natural companion to that). Plain HTML, no server
  side; the page is outside the game bundle's `versionCheck.js` list, but
  a change to it still gets the usual version bump (it's served to
  players).

## Open threads and roadmap

Moved here from the assistant's memory (2026-09-28) — things the user
wants eventually, not scheduled.

**Priorities** (the user's call, 2026-10-03):
1. **Bring the labs into the game and grow the game.** Surface, landing,
   bases, vehicles, the sea, the sky, model shaping.
2. **Tools and docs for players** who build their own games on the
   engine. Further down the list.

- **Station: from overview to management.** v1 (2026-09-21) was scoped
  down on purpose to a read-only overview + shortcuts to Research/Fleet;
  the original ask was a station to *manage* the fleet and resources.
  Natural next steps: renaming/customizing it, spending points from its
  panel, a resource of its own distinct from points — and **repairs**:
  the HAVEN model's ruin is its damage (`STATION_START_DAMAGE`), and
  repairing should lower it.
- **A second playable race, Blade**: its own HUD look *and* layout plus
  its own ships (the first mockup was deleted 2026-09-27, the race stays
  planned; its role in the story is in the local `FABULA.md`). Build it
  with shared panel logic (`js/ui/hud/*.js` talk to DOM ids) and a
  separate markup/CSS layout (e.g. `css/ui/hud-blade/`), ships from the
  ship lab (ShipKit); the skin lab (`docs/skins.md`) proposes skins tied
  to race by default.
- **Visual follow-ups**: planet rings as a BodyKit parameter, further
  scale steps (`docs/scale.md`: comet/black-hole visual size, camera/fog,
  distances). Done since: the far-ship glow dot and adjustable LOD
  distance (v2.21), bite sparks and hot spot (v2.24). Open from the image
  effects (v2.23–v2.25): eclipses between bodies (BodyKit shaders don't
  take part yet), depth of field from real depth instead of screen
  distance, selective (HDR) bloom so bright planets don't glow, trails
  for other players' ships (neutral colour — never tinted). From the
  big-game settings comparison (v2.26.0): camera motion blur, texture /
  reflection quality (ShipKit texture and environment-map sizes), real
  shadow maps in the game (the ship lab has them), the frame limiter in
  the labs.
- **Model shaping, next steps** (ShipKit SHAPING, 2026-10-03):
  - choose `round` / `seal` / `sealStyle` values for the game's ships and
    measure them with many ships on screen (fillet is the cheap one; see
    the cost table in `docs/ship.md`);
  - give BaseKit, VehicleKit and MarineKit the same options: they build
    from ShipKit's generators, and `withRounding` / `sealJoints` are
    exported;
  - planar UVs on rounded cylinders' caps.
- **The ground in the game, next** (v2.34.0 brought the landing, the
  descent, driving and building): a rover from VehicleKit instead of the
  hover craft; building costs (materials, points); the real terrain height
  for a ship landing seen from space; the ship landing on the pad when the
  base has one; other players' bases (the server).
- **The surface, vehicles and sea, joined up**: a rover from VehicleKit
  instead of the surface lab's hover craft, MarineKit's water and seabed
  on the planets' seas, the barge carrying vehicles, logistics between a
  base's modules (`docs/surface.md`, `vehicles.md`, `marine.md`).
- **A single-player copy of the database** (the admin panel's "Compare
  database with single player" button is a disabled placeholder for it).
- **Planets to be transformed, farmed and built on**, not devoured — the
  current eat-for-points loop is a placeholder for that economy (the
  Wiki's mines/refineries/shipyards, ores → refined resources →
  materials already point that way).

