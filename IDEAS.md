# Feature ideas

Brainstorm notes for future work — nothing here is implemented, scoped, or
committed to. Kept as a single running file rather than scattered chat
history, so a future session can pick a concept back up without re-deriving
context. Write-ups here should still follow the project's usual documentation
standard (concrete, references real file paths/patterns) even though the
feature itself doesn't exist yet.

## Ship hacking (PvP)

**Concept**: give every ship (and maybe the drone/station) a "system
password." Within a certain range, another player can attempt to log in to
it via a script they write themselves — reusing the drone's existing
Colobot-style DSL (`js/drone/dsl.js`/`interpreter.js`) rather than inventing
a second scripting system. Fits the game's existing "write a small program
to interact with the world" loop instead of a bolted-on separate minigame.

### Proposed DSL additions

Numeric-first, same philosophy as the existing builtins (strings only exist
for `print()` today — see CLAUDE.md):

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
  defense-in-depth model (see CLAUDE.md's "Security model" section), would
  need a new `SECURITY DEFINER` RPC analogous to `bite_body` — something
  like `try_hack(p_target_actor, p_target_ship_index, p_guess) returns
  boolean`, checking a server-held secret and rate-limited the same way
  `bump_activity_rate()` already throttles `bite_body`/`admin_activity_log`/
  `set_my_nick`. That means giving ships *some* server-side identity for
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
scanning/timing logic in `js/drone/drone.js`'s builtin switch. Only escalate
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

Today, `js/drone/drone.js`'s `driveGenerator()` resolves every *instant*
builtin (`fuel()`, `attack()`, arithmetic, comparisons, the `while` loop's
`__tick__` checkpoint, ...) synchronously, in a single JS call, up to
`MAX_INSTANT_STEPS_PER_FRAME` (currently 2000) — that constant exists purely
as a **tab-freeze safety net** (see CLAUDE.md: a `while(true){}` with no
blocking call would otherwise spin forever inside one native call), not as
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

**Update (2026-09-23)**: the user built a standalone prototype (`test.html`,
still local-only, not checked into this repo) exploring the orbital-physics
and programming-model pieces together — a small solar system (sun +
planets on real elliptical/inclined orbits, two with moons), patched-conics
gravity (the ship is pulled by exactly one dominant body at a time,
whichever's sphere-of-influence — derived from mass — it's currently
inside; otherwise the sun), and a Scratch-style block palette (engine
thrust %, yaw/pitch/roll degrees, wait, repeat-with-nesting) instead of the
drone's text DSL, plus a live predicted-trajectory line (one from current
velocity alone, one simulating the whole planned block program first).

**Update (2026-09-23, since landed for real, v2.0.0+)**: the fixed-orbit
and patched-conics-gravity pieces of this prototype have since actually
shipped in the live game, not just as a prototype — see CLAUDE.md's "Solar
system" architecture bullet. Applied to the game's existing 9 planet-ish
bodies (not the prototype's own moons/multi-planet system) and to
comets specifically got taken a step further than the prototype ever did:
a comet's flight is genuinely *simulated* frame-by-frame under real
gravity (curving, sun-grazing swing-by), not just a closed-form ellipse —
see CLAUDE.md's "Comets" bullet, including a real predicted-trajectory
line for each comet's own flight path (`scene/orbitLines.js#
buildCometTrajectoryLine`), the same concept the prototype's own
predicted-trajectory line explored. **What's still genuinely open from
this prototype**: the Scratch-style block programming model (the drone
still only has the text DSL — see the "Programming model" subsection
below, unaffected by this update) and moons (see the "Real celestial body
types" subsection below — planets have real orbits now, but nothing orbits
a *moving* parent body yet). The game's existing UI/UX carried over as
expected — no visual-design changes rode along with the orbital-mechanics
work.

### Programming model — still undecided: Scratch-style blocks, or text scripts

The drone already has a real scripting language (`js/drone/dsl.js`'s
hand-rolled lexer/parser + `interpreter.js`'s generator-based interpreter —
see CLAUDE.md's "Programmable drone" section), deliberately numeric-first,
not JavaScript. Extending automation to production chains (see below) raises
the same question again at bigger scope: keep the existing **text DSL**
(consistent with the drone, and with the "Ship hacking" idea above which
already proposes reusing it), or add a **Scratch-style visual block editor**
as an alternative/additional input mode that still compiles down to the same
AST `interpreter.js` already walks.

- Reusing the existing DSL is the cheap path: no new interpreter, no new
  safety net (the `MAX_INSTANT_STEPS_PER_FRAME` runaway-script guard and the
  `while`-loop `__tick__` checkpoint — see CLAUDE.md — would just keep
  working), and it's already proven for one automation use case (the drone).
- A Scratch-style block UI would need its own editor component (nothing
  like it exists yet — `js/drone/*` is text-only) but could lower the
  barrier for players who'd never touch a text script, at the cost of a
  real new UI subsystem to build and maintain alongside the DSL.
- A middle path: keep the DSL as the one actual language, but eventually
  offer a block editor that's just a friendlier *authoring* surface for the
  same syntax (like Blockly compiling to a text language) — worth keeping
  in mind if this gets picked up, so the two modes don't diverge into two
  separate script engines.
- **This question now has a concrete data point, not just a hypothetical.**
  The orbital-physics prototype (see the "Update" note above) implements
  the Scratch-style option directly, and — notably — applies it to the
  *main ship*, not a side unit like the drone: a palette of blocks (thrust
  %, yaw/pitch/roll degrees, wait, repeat) built into a list, with nesting
  for `repeat`. It's its own from-scratch block model (own `program`/
  `activeContainer`/block-registry data structures), **not** built on top
  of `dsl.js`/`interpreter.js` — so as of this prototype the "middle path"
  above (blocks as a friendlier front-end that still compiles to the
  existing DSL/AST) hasn't actually been tried; if the block direction is
  adopted, that reuse work is still fully ahead, not already done. The
  prototype's own interpreter is much simpler than `interpreter.js`'s
  generator-based approach: `execBlock()` is `async`, and blocking actions
  (`wait`, the turn-rotation blocks) just `await sleep(ms)` in a loop
  rather than yielding control back to a per-frame driver — fine for a
  single-ship toy with one program running at a time, but the existing
  drone interpreter's generator/yield design was specifically chosen so
  `driveGenerator()` could pace execution against the frame loop and
  enforce `MAX_INSTANT_STEPS_PER_FRAME` (see CLAUDE.md's drone bullets) —
  something to revisit if this scales to multiple player-controlled ships
  running programs concurrently rather than one ship with one script.

### Real elements & minerals → processing/manufacturing

**Concept**: replace (or supplement) the current single abstract
`state.points` currency with a small set of real elements/minerals mined
from bodies, processed into intermediate materials, and used to build ships
(see the in-progress `shipEditor.html` prototype and its per-block
`category`/`shape`/`color` data) or trade with other players.

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
  and only in `localStorage`, never server-side — see CLAUDE.md's
  "Postęp gracza... zostaje lokalny" note in the original multiplayer plan).

### Real celestial body types (moons, pulsars, and friends)

**Concept**: expand the roster of interactable body kinds beyond today's 7
(`js/content.js`'s `CONTENT`: sun, ice/neutral/volcanic planet, comet,
meteoroid, black hole) toward more astronomically real variety — moons
orbiting planets, pulsars as an actual body type, maybe asteroid belts.

- **Pulsars already exist visually** (`js/scene/pulsars.js`) but are purely
  decorative background dressing — small sprites with a randomized
  brightness pulse, not part of `ctx.planets`, not edible, not spawned
  through the `CONTENT` system at all (see CLAUDE.md's "Pulsars" note).
  Turning them into a real gameplay body would mean moving them into the
  same data-driven pipeline as everything else in `js/bodies/*.js`, which
  they deliberately aren't today.
- **Moons** are the one kind here that isn't just "a new leaf" in the flat
  `CONTENT` list — a moon needs a parent body to orbit, which is the one
  still-open piece of the "Simplified orbital physics" subsection below
  (real orbits around the Sun already shipped, v2.0.0+; orbiting a
  *moving* parent body specifically doesn't exist yet). Worth building
  after (or together with) that piece, not before.
- Each new kind slots into the existing per-kind pattern (own file under
  `js/bodies/`, own entry in `CONTENT`, `variantForTemp()`-style
  derivation if it needs sub-variants) — this part of the plan is low-risk
  precisely because the body-type system was already built to be
  data-driven or extension.

### Simplified orbital physics affecting navigation — DONE for planets/comets, moons still open

**Original concept**: real (if simplified) gravity/orbits instead of the
old either-stationary-or-straight-line body motion, so navigating toward a
body means accounting for its orbit, not just its current position. **This
shipped for real** (v2.0.0+, see the "Update" note above and CLAUDE.md's
"Solar system"/"Comets" architecture bullets) — kept here only for the one
piece that's still genuinely open:

- **Moons** — the fixed 9-orbit solar system that shipped has every planet
  on its own real orbit around the Sun, and `world/solarGravity.js`'s
  patched-conics gravity already picks whichever body's SOI a ship is
  currently inside as the dominant pull source, exactly the mechanism a
  moon would need — but nothing in the shipped system orbits a *moving*
  parent body yet, only the Sun. Orbiting a moving parent is a genuinely
  different closed-form problem (the parent's own position has to feed
  into the moon's orbit calculation each frame, not just a fixed center),
  not something the current `bodyPosAt(slot, t)` formula handles as-is.
  See the "Real celestial body types" subsection below — this is still
  the one piece of that subsection that depends on orbital mechanics
  rather than being a standalone new body kind.
- The old networking argument for why this fits the existing model
  ("still just a function of time, nothing new to sync") held up exactly
  as predicted for the 9 fixed bodies, and should still hold for a moon
  too: `moon_world_pos(t) = parent_pos(t) + local_ellipse_point(t)` is
  still a pure sum of two closed-form functions, no simulation needed —
  unlike comets, which notably did *not* end up fitting this model at all
  (see CLAUDE.md's "Comets" bullet: a gravity-curved swing-by isn't a
  fixed ellipse, so a late-joining client has to replay a real simulation
  instead of evaluating a formula). Worth flagging comets as the
  exception, not the pattern, if this gets scoped for real.

### Open questions (all four pieces)

- Sequencing: orbital physics (now shipped, v2.0.0+ — see the "Simplified
  orbital physics" subsection above) was a prerequisite for moons and
  still is; it was never a prerequisite for elements/materials or
  pulsars-as-a-body, so those don't have to wait on moons specifically —
  the pieces don't all have to land together, and probably shouldn't.
- How much of this becomes visible in the existing side-panel UI patterns
  (the planet info panel added for planet selection, the station's
  "read-only for now" docking panel) versus needing wholly new UI.
  Nothing here has been scoped into concrete UI yet — this section is
  still at the "what should exist" stage, not "how it's built."
- Whether a real economy changes the game's existing "no login, anonymous,
  friction-free" identity model (see CLAUDE.md's security-model section) —
  persistent inventory/trading is a much stronger reason to want a stable
  identity than today's local-only points ever was, which loops back to the
  Google-login discussion already floated for the community ship-voting
  idea (`nickGoogleBtn` in `index.html`, currently a disabled placeholder).
