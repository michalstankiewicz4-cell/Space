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
