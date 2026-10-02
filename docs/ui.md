# UI notes: screens, HUD, windows

Split out of [`architecture.md`](architecture.md) (2026-10-02). The why and
the history behind the interface: the UI kit, the HUD and its windows,
interface modes, the research trees and how the page loads. Read the
relevant section before touching that part of the UI.

The game's notes are in three files: [`architecture.md`](architecture.md)
(world, network, programs, units), [`ui.md`](ui.md) (screens, HUD,
windows, load order) and [`rendering.md`](rendering.md) (models,
image quality, post-processing, sky).

## Contents

Section names only (no line numbers — they'd go stale). To jump to one
without reading the whole file: grep `^## ` for its current line number,
then read just that range.

- [UI kit (start screen and setup modal)](#ui-kit-start-screen-and-setup-modal)
- [In-game HUD](#in-game-hud)
- [Interface modes, lines toggle, controls help](#interface-modes-lines-toggle-controls-help)
- [Research trees](#research-trees)
- [Load order and first paint](#load-order-and-first-paint)
- [Skin lab](#skin-lab)

## UI kit (start screen and setup modal)

- **New UI kit (start screen + setup modal, v2.1.0)**: ported from the
  standalone single-file mockup (`UI-start.html`, deleted once fully
  ported — the game itself is now the reference). File layout: `css/ui/kit.css` holds
  the shared primitives (`.uiStage`, `.mat` + color variants, `.uiPanel`,
  `.hdLine`, `.oBtn`), one CSS file per screen next to it
  (`startScreen.css`, `setupModal.css`), all linked from index.html's
  `<head>` without a `?v=` of their own, so `css/style.css`'s stays the
  only CSS cache-busting literal (they're in `versionCheck.js#
  MODULE_FILES` instead). They used to be `@import`s inside style.css,
  switched to parallel `<link>`s in v2.2.1 (see "Load order"). The `.mat` grain is a static
  `css/ui/grain.png` (regenerate with `tools/grainTexture.html`), not
  generated at runtime anymore (v2.1.3). JS side: `ui/banner.js` (start
  screen only),
  `ui/setupModal.js`, and `ui/escapeKey.js` (the global Escape priority
  chain, a table of `[isOpen, close]` pairs — add new overlays there).
  Language-dependent text refreshes via `i18n.js#onLangChange()`
  subscribers, not a hardcoded callback list in whoever calls `setLang()`.
  `.uiStage` is a fixed 1536x1024 design (everything absolutely positioned
  in design pixels), scaled by the `--uiScale` CSS var, which is set by an
  inline `<head>` script in `index.html` — deliberately not a module: as
  one it only ran once main.js and all its imports had loaded, and the
  start screen flashed at full size until then (v2.1.1). Anchored to the
  top edge so the top bar stays on top on portrait screens. The top bar
  itself is *not* in `.uiStage` but in a `.uiBar` (v2.1.4): a
  full-window-width strip in the same scaled design-pixel space, whose
  width in design px is `100% / --uiScale` — left-group elements use
  `left`, right-group ones `right`, and the two rails use both, so they
  stretch with the window. Gotchas: the
  kit's button reset is wrapped in `:where(.uiStage)` on purpose — at
  normal `.uiStage button` specificity its `background:none` beats `.mat`
  and every material button renders transparent. The old HUD's `.panel`
  class (removed in v2.2.0) was unrelated — the kit uses `.uiPanel` to avoid colliding
  with it. The start screen is translucent over the live scene, so the
  HUD is hidden while it's open via `body:has(#banner:not(.hidden))` in
  CSS, no JS. `.setupCheckRow` is shared with the dev tools menu, so the
  kit's toggle-switch styling is scoped to `#setupModal`. The in-game HUD
  was ported onto the same kit in v2.2.0 — see the next section.

- **Start screen extras (v2.2.0)**: live player counters centered on
  the top bar's rails (`ui/playerCounts.js` — online = this client +
  `ctx.remotePlayers`, same as the HUD's slot; registered = the public
  `player_count()` RPC, see docs/security.md; both only refreshed while
  the start screen is open, "—" until known, hidden in offline mode), a
  [?] button opening the About window (`ui/about.js`, a `.uiWindow`),
  and a Graphics tab in Setup (filled in since — `rendering.md`, "Image quality"; setup
  tabs and panels are matched by `data-tab`, so a new tab is markup + one
  i18n key, no JS change).
- **Story intro (v2.6.1)**: the description is the story opening
  (`banner.boot` — a terminal-style line in `#bannerBoot` — plus
  `banner.desc`, two paragraphs split by a `\n` that `#bannerDesc`'s
  `white-space:pre-line` keeps). The panel grew 40px for it; `#box` and
  everything below the description are positioned in fixed design px,
  so a longer text means shifting those tops too. In `js/i18n/*.js` the
  break must be the two characters `\n` inside the string — a real line
  break there is a syntax error that silently leaves a non-English start
  panel blank (it happened once).

## In-game HUD

- **Ported from the `UI-standalone.html` mockup (v2.2.0; the mockup was
  deleted afterwards, the game is now the reference)** — its layout 1:1
  (top bar, left nav, fleet list, selected unit, 3D viewport frame,
  command bar, planet info, event log, minimap), wired to every feature
  the old HUD had. `#hud` is a **`.uiScreen`** (css/ui/kit.css): like
  `.uiBar` but in both axes — the whole window in design pixels (never
  less than 1536x1024), so each element anchors to the edge it sits
  against (css/ui/hud/): left column left, right column right, bottom
  row bottom, and the viewport, fleet list and event log stretch.
  Shared top-bar pieces (logo, title, end cap) are classes in
  css/ui/topBar.css used by both the start screen and the HUD; SVG
  gradients live in one always-rendered `#uiDefs` block in index.html
  (a `url(#id)` paint server inside a `display:none` subtree stops
  rendering). Windows opened from the HUD (Research, Fleet,
  Diplomacy, Wiki, drone script, drone blocks) share `.uiWindow`
  (css/ui/windows/).
- **File layout mirrors the UI**: `js/ui/hud/` has one module per HUD
  panel (topBar, nav, fleetList, unitPanel, infoPanel + planetPanel/
  blackHolePanel/stationPanel/remoteStationPanel, eventLog,
  connectionStatus, minimap, commandBar, returnBase, uiMode, devTools +
  perfStats) plus `hud.js`, the HUD's only entry points for main.js —
  `initHudShell()` (before the scene), `initHudWorld()` (after it) and
  `updateHud(dt)` (every frame; runs the ~0.1s/0.4s refresh timers).
  `js/ui/windows/` is the same for the windows (`windows.js#
  initWindows/refreshWindows` + research (+ techTree/techTreeData, the
  upgrade trees), fleet, players, droneScript, wiki + wikiEntries/wikiArt,
  blockEditor + blockPalette/blockRender/blockDrag).
  CSS mirrors it one file per component in `css/ui/hud/` and
  `css/ui/windows/`, each its own `<link>` in index.html's `<head>`, in
  cascade order (style.css last). `showToast()` lives in `ui/hud/eventLog.js` (it only feeds the
  event log now); a new panel goes in as its own module + CSS file,
  wired through hud.js.
- **The 3D view renders into the viewport rect only**
  (`scene/viewRect.js`): the canvas still covers the whole window, but
  `renderMainView()` clears it black and draws the scene with
  viewport/scissor set to `#viewport`'s box (the whole window while the
  start screen is open, so the scene still shows behind it), keeping
  `camera.aspect` in sync. Picking (`scene/picking.js`) and
  `controls.js#screenPos` use the same rect; presses/scrolls/hover
  outside it are ignored (the gaps between panels are still canvas).
  Miniatures (`scene/unitThumb.js`, `scene/infoThumb.js`) and the ship
  cam render into their own elements' boxes via `renderIntoElement()`.
  **HUD panels have no fill** (`#hud .uiPanel::before{background:none}`)
  because those miniatures are drawn on the canvas *underneath* the
  panels — a 90% fill made them look nearly black (found by testing,
  not an obvious one). Miniatures also get a "studio" PointLight at the
  camera, permanently in the scene with only its intensity toggled per
  pass (adding/removing a light would recompile every shader), and a
  raised near plane so station struts between camera and ship get
  clipped.
- **Where every old HUD feature went** (so nothing got lost): telemetry
  -> the top bar's four slots; players list -> DIPLOMACY window; body
  legend -> the Wiki's Planets tab (PLANETS nav); Tech -> RESEARCH window (also the station's Tech
  button); Fleet window -> FLEET nav + station's Fleet button (plus the
  always-visible FLEET LIST panel, same click behavior); Setup ->
  SETTINGS; camera Base/System toggle -> top-center of the viewport; Dev
  Tools -> wrench in the viewport's bottom-right; ship cam -> the
  viewport's top-right (under the ORBITS button since v2.28.0), toggled by the fleet-list card or the COCKPIT
  button in SELECTED UNIT (the CAM button until v2.19.0); drone panel -> SELECTED UNIT in drone mode
  (Start/Stop/Script buttons, `ui/windows/droneScript.js` keeps its old open/close
  API on top of `ui/hud/unitPanel.js`); station and planet panels -> the
  shared PLANET INFO slot (`ui/hud/infoPanel.js`, owner-tracked so a late
  "close planet" can't blank the station); toasts -> EVENT LOG
  (`showToast(msg, kind)` still the one entry point). BUILD nav, the command bar's orders, the planet's Waypoint/Scan/Colonize and
  the ship quick buttons are deliberately inert ("Coming soon"), as are
  the top bar's time controls (multiplayer can't pause).
- **Wiki** (`ui/windows/wiki.js`, v2.3.0; WIKI nav, and PLANETS opens it
  on the Planets tab) is read-only: tabs -> entry list -> picture +
  description. Entries live in `wikiEntries.js` (`{id, unlock, meta?,
  art}`, id = `"tab-kind:key"`), pictures are inline SVG drawn by
  `wikiArt.js` (each gradient gets a unique id, since the same art shows
  as both thumbnail and big picture), texts in i18n
  `wiki.entries.<key>` — **the key after the colon must be unique across
  all tabs** (`body:ice` and a `mineral:ice` once silently shared one
  text; the mineral is now `waterice`). `unlock` is `start` (always
  known), `inspect` (bodies: `planetPanel.js` / `tooltip.js` call
  `discover()`), `research` (`research.js` on purchase), `script`
  (`droneScript.js` on run), `use` (programming entries:
  `drone/scriptFeatures.js` reads which commands a program contains off
  its parsed AST, and `droneScript.js#runActive` discovers them once the
  program actually starts), `blocks` (a block-mode run), `files` (a
  second block-editor file), `progress` (Story tab: `core/storyLog.js`
  — `storyEvent()` from banner.js on entering orbit / stationPanel.js on
  opening the station, plus a 1s check of `state.eaten`, bought upgrades
  and other discoveries — paced: only the reboot log is instant, the
  rest come one at a time, in LOG order, at most one per 3 minutes of
  play (the timer starts at page load, so a veteran player's backlog
  trickles in instead of arriving as six toasts at once),
  `story` (Story fragments tied to features not built yet; the story
  itself is drafted in a local, untracked `FABULA.md`), `life`/`relic` (like `future`, with their
  own story hint — life forms and artifacts) or `future` (placeholder for features not
  built yet — elements/minerals/ores/refined resources/materials/most
  buildings and ships). Programming entries' pictures are the real
  blocks, drawn in SVG from the block editor's own category colors and
  i18n labels (`wikiArt.js#code`).
  Discovery state is `core/discovery.js` (a Set persisted under
  localStorage `roj-discovered`, `onDiscover` listeners -> event-log
  toast). Elements/minerals/ores carry real data in `meta` (Z, symbol,
  standard atomic weight; chemical formulas) — keep them factual.
- **Minimap** (`ui/hud/minimap.js`) is schematic, not to scale: 9 evenly
  spaced rings, each body on its own ring at its real angle; the comet
  and ships are mapped piecewise-linearly between rings, with only a
  small margin past the outer ring — an arriving/leaving comet (out to
  ~1.3x the outer orbit) was once drawn past the map's left edge. The
  +/- zoom lives in the panel header since v2.6.0: sitting on the map it
  covered the outer orbits' lower right, hiding bodies there. A click goes
  through `scene/controls.js#clickPlanet`/`clickStation` — the exact
  code path of a click in the 3D view (course order if ships are
  selected, otherwise select; shift toggles multi-select).
- **SELECTED UNIT** (`ui/hud/unitPanel.js`) watches selection instead of
  being told about it: `updateUnitPanel()` runs every frame but only
  touches the DOM when *which* unit is shown changes (drone > single
  ship > group > empty), plus a forced stats refresh every ~0.4s.

## Interface modes, lines toggle, controls help

v2.28.0, the user's design. **Key C** (`ui/hud/uiMode.js`) steps
`body[data-ui]` through 1 (every `#hud` child but `#viewport` hidden — the
view's own buttons stay put), 2 (only `#cameraModeToggle` and `#miniPanel`,
which gets a backing of its own), 3 (all of `#hud` and `#selectionBrackets`)
and back; Escape restores it (last in the Escape chain before the start
screen). Hidden means `display:none` — `renderIntoElement` skips elements
without an `offsetParent`, so hidden miniatures don't draw over the scene —
and `viewRect.js#getViewRect` returns the full window while hidden. Keys are
ignored while typing, with a modifier (Ctrl+C), on the start screen, or with
Setup or a window open. **Lines** (`scene/linesToggle.js`, button top-right,
key O, `settings.showLines`): orbit and comet lines sit on `ORBIT_LAYER` 3
(`orbitLines.js`), trajectories on layer 2; the toggle only switches those
layers on the main camera — the miniature cameras and the ship cam enable
layer 3 themselves, so they still show orbits. **Sensitivity**:
`settings.mouseRotSens` / `mouseZoomSens` (0.25–3) multiply the rotation and
zoom steps in `camera.js`. **Idle hiding** (v2.29.0, Setup → Mouse,
`settings.uiAutoHideS` 0–10 s, 0 = off): `uiMode.js#checkIdle` (every 250 ms)
lays mode 3 over the player's own mode after that long without pointer,
wheel, touch or key input, in the game view only; the next input restores it,
and a key that wakes it is swallowed (else Escape would also open the start
screen). The Setup box grew 50 design px for the third slider. **"Coming soon" tooltips**: `ui/soonTip.js`, one
pointermove listener using `elementsFromPoint` (disabled buttons get no
mouse events of their own); selector `SOON`; the native titles those
controls had are gone. The same module explains a locked ENTER ORBIT once
loading is done (`startBlocked`: no nickname, or the privacy policy not
accepted — the two things `banner.js#updateStartEnabled` waits for). **Help**: Setup → Help uses the wide window
(`i18n setup.controls`, app-authored HTML) — update it when a control changes.

## Research trees

v2.20.0, from the user's concept art (`UpgradeTree.png`, an AI image of a
circuit-board tree with round badge nodes and a "programming" branch —
never committed, deleted by the user once the tree was built).
The Research window (`#techModal`, BADANIA / the station's Research
button) shows one tree at a time, ◀ ▶ to switch.

- **Shape = data** (`ui/windows/techTreeData.js#TECH_TREES`): nested
  nodes `{ id, kind: root|hub|upgrade|soon, upgrade?, icon, children }`,
  no coordinates — to grow a tree, add a node (a branch point is just a
  node with children, of any kind). Names/descriptions in i18n
  `upgrades.tree.<id>` / `<id>Desc` (an upgrade node uses
  `upgrades.<key>` for its name). Working upgrades point at
  `config.js#TREE` (cost, levels, effect unchanged).
- **Layout** (`ui/windows/techTree.js#layout`): leaves spread evenly over
  a fan (`FAN`, 170°→10°) in depth-first order, every other node at the
  mean angle of its children, one radius per depth (`RING`), the root at
  `ROOT`. Branches are PCB-routed (`trace()`: straight along the longer
  axis, then 45°).
- **Drawing**: one SVG rebuilt by `refreshResearch()` (after every
  purchase/reset/language change): seeded stars, hex-grid corners, a
  planet horizon with an atmosphere glow, a trunk of five traces with
  roots, copper traces with a teal core and `stroke-dashoffset` pulses on
  live ones (since v2.20.1 each trace is an edge, flat copper and a
  highlight under the `#ttRough` filter — low-frequency displacement for
  uneven edges, noise patches and glints; **flat colour, not a gradient**:
  an objectBoundingBox gradient paints nothing on a perfectly vertical or
  horizontal path), nodes with a gold (steel when planned) metal rim, rivets,
  a level ring, a cost pill; states `affordable` (pulsing gold halo),
  `poor`, `owned`, `maxed`, `soon` (locked). Tooltip is HTML over the
  SVG. Styles: `css/ui/windows/research.css`.
- **Buying/reset** stay in `ui/windows/research.js` (`buy()`,
  `resetUpgrades()`), the tree calls back into it.
- **Background**: `css/ui/windows/researchBg.jpg` (1248×832), an
  AI-generated picture the user made from a prompt we wrote (a planet's
  horizon with circuit lines, a nebula, hexagon corners). `techTree.js#BG`
  places it so its horizon (measured at y = 579 px in the picture) meets
  the trunk's base (`HORIZON_Y`); ~70 seeded stars twinkle on top. A new
  picture: update `BG` (size and the horizon's y). The devlog's "AI
  image" caption rule is for blog posts, not the game.

## Load order and first paint

- **Load order / first paint (v2.1.3)**: `initScene()` (WebGL context +
  first shader compiles) blocks the main thread long enough to notice,
  and the browser can't paint or restyle during it. Three consequences,
  each handled explicitly: (1) `main.js` runs all start-screen UI init
  (texts, banner, setup modal, Escape) *first*, then awaits one painted
  frame (top-level `await` on rAF + setTimeout) before building the scene
  — don't move UI init back below `initScene()`. (2) Fonts are
  self-hosted (`fonts/`, `css/fonts.css`, latin + latin-ext subsets) and
  the start-screen ones plus `grain.png` are `<link rel=preload>`ed in
  `index.html` — a font is otherwise only requested once the browser
  restyles text using it, i.e. after the scene init, so the page painted
  with fallback fonts and swapped ~1.5s later. (3) A non-English saved
  language sets `data-lang-pending` on `<html>` from the `<head>` script
  (also preloading the latin-ext subsets), hiding `#box` until
  `i18nApply.js#applyStaticText()` clears it — the HTML ships English, so
  a Polish player otherwise saw it flash. Measured locally (Chrome with
  GPU, returning Polish player): translated text 1457ms -> 318ms, fonts
  1535ms -> ~80ms, first frame already final.
- **Parallel downloads (v2.2.1)**, measured on the live site: (1) the 22
  UI kit stylesheets are plain `<link>`s in `<head>` rather than
  `@import`s inside style.css — an `@import` is only discovered after its
  parent file has arrived, which cost a whole extra round trip before
  first paint; order is the cascade order, style.css's own rules last.
  (2) three.js and supabase-js are `defer`: as plain classic scripts they
  blocked the HTML parser, and since a module script's dependency graph
  only starts downloading once the parser reaches it, `main.js`'s ~100
  imports waited for the slower script to arrive (they were on a CDN
  then; both are in `vendor/` now). Deferred classic
  scripts and module scripts still execute in document order, so `THREE`
  and `supabase` exist before `main.js`/`supabaseClient.js` evaluate.
  (3) The inline pre-paint `<head>` script sits *above* the stylesheets —
  an inline script after a stylesheet waits for that stylesheet (and
  stalls the parser meanwhile).
- **Loading bar (v2.22.0)**, `ui/loader.js`: drawn inside the ENTER ORBIT
  button (a dark `::after` covering everything right of `--load`). The
  HTML ships it as `loading waiting` (a sweeping glint, no number — the
  browser reports no progress for deferred scripts); once `main.js` runs
  the libraries are in, so it starts at 30%. The rest of the start-up is
  split into chunks with `await nextPaint()` between them — a chunk
  blocks the main thread, so the bar can only move *between* chunks, and
  a new heavy init step should get its own `setLoad()` + `nextPaint()`.
  Last chunk: `renderer.compile(scene, camera)` + the first frame, so the
  shader stall happens under the bar instead of right after ENTER ORBIT.
  `loadDone()` then shows a random `load.jokes` line for 0.5 s and
  unlocks the button (`banner.js#updateStartEnabled` checks
  `isLoading()`; `i18nApply.js` leaves the label alone while loading).
  Anything reacting to UI input during the awaits (Setup, language) must
  not assume the scene exists yet.

## Skin lab

`skins.html` (2026-09-28): a standalone prototype of the in-game HUD in
two new looks — TERMINAL (green phosphor CRT) and SYNTAX (a colourful
code-editor theme) — not part of the game yet. Everything about it (how
it's built, each skin's techniques, the plan for adopting a skin in the
game, skins by race vs. by the player) is in
[`docs/skins.md`](skins.md).
