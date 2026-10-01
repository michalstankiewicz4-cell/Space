# Skin lab (skins.html)

A standalone prototype of the in-game HUD in new looks ("skins"), to
decide on a direction before anything touches the game — the project's
prototype-then-integrate workflow. Started 2026-09-28 at the user's
request: "one monochrome version tied to programming (a green CRT
display, the logo only changes colour), a second colourful one with a
programming theme".

Referenced from [`CLAUDE.md`](../CLAUDE.md) and
[`docs/architecture.md`](architecture.md) ("Skin lab").

Contents:
- [Using it](#using-it)
- [How it's built](#how-its-built)
- [TERMINAL](#terminal)
- [SYNTAX](#syntax)
- [Adopting a skin in the game](#adopting-a-skin-in-the-game)
- [Skins: chosen by the player or by race?](#skins-chosen-by-the-player-or-by-race)
- [Gotchas found while building it](#gotchas-found-while-building-it)

## Using it

- Open `skins.html` straight from disk (or `/skins.html` on the local
  server / GitHub Pages). No game modules, no server calls.
- **1** / **2** (or the buttons in the viewport's top-right corner)
  switch TERMINAL / SYNTAX; **C** (or the CRT button, TERMINAL only)
  toggles the CRT effects. The choice is remembered per browser
  (`localStorage["roj-skinlab"]`).
- Everything is sample data (points tick up so it feels alive); nothing
- The sample text is English (the repo's rule; until the 2026-10 review it
  was Polish, as in the devlog screenshots).
  is clickable beyond the switches and hover states.

## How it's built

- **The game's HUD layout**: a 1536×1024 design surface scaled to the
  window with `--uiScale` (like `css/ui/kit.css#.uiStage`), the same
  panels in the same places — logo, stats, clock, nav, fleet list,
  selected unit, viewport with the camera toggle and the command bar,
  object info, event log, minimap. Pixel positions are in the `#logo …
  #mini` rules at the top of the file's `<style>`.
- **One markup, two skins**: `body[data-skin="term"|"syn"]` scopes each
  skin's CSS. Text that differs per skin (nav items as a menu vs. files,
  stat rows as `LABEL value` vs. `let label = value`, button captions)
  is rebuilt by `renderText()` on every switch; small fixed bits carry
  `.term` / `.syn` classes and the other skin hides them.
- **Live sketch**: one `requestAnimationFrame` loop draws the viewport
  (`drawView`), the minimap (`drawMini`) and both miniatures
  (`drawThumbs`) on 2D canvases, each in the current skin's style — a
  stand-in for the 3D scene, only to judge the look.
- **Logo**: the game's SVG shape (the `<·>` insignia), unchanged; a skin
  sets only the gradient stops (`SKINS[skin].logoA/logoB`) and, for
  TERMINAL, a glow filter (`#phosphor`).

## TERMINAL

Monochrome green phosphor, "programming" as an old terminal.

| Technique | Where |
|---|---|
| Monospace everywhere (IBM Plex Mono, already self-hosted) | `#stage` font |
| Phosphor glow | `text-shadow` on `.glow` / values; canvas `shadowBlur` (`glowStroke`) |
| CRT layer | `#crt`: scanlines (`repeating-linear-gradient`, multiply), a slow roll band + vignette (`#crt::after`, `@keyframes roll`), flicker on the whole stage (`@keyframes flicker`) |
| Box-drawing panel headers | `.panel .hd::before/::after` → `┤ FLOTA ├`, the header sitting on the frame |
| Segmented LED bars | `.seg` — two `repeating-linear-gradient`s (dim empty segments, lit filled ones with a drop-shadow) |
| Inverse-video selection | nav/buttons: green background, black text on hover/active; `> ` cursor on the active menu item |
| Blinking cursor | the title's `::after` and the last log line (`@keyframes blink`, `steps(1)`) |
| Vector-display scene | wireframe planets (circle + two ellipses), dotted orbits, a polar grid, bracketed labels (`[ST-04]`, `!! ABYSS`) |
| Radar sweep | `createConicGradient` over the viewport and the minimap |

## SYNTAX

A colourful code-editor theme, with a made-up syntax palette (deliberately
not any existing editor theme): `--kw` pink #ff6ac1, `--fn` cyan #5ee7ff,
`--str` green #7ef29a, `--num` orange #ffb45c, `--type` violet #b58cff,
`--com` slate #6c7399, on `--bg` #161826 / `--bg2` #1d2033.

| Technique | Where |
|---|---|
| Panel headers as editor tabs (`fleet.swarm`, `terra_1.body`, `console`) | `.panel .hd .tab`, active tab with a coloured top line (`--accent`) |
| Line-number gutters | `.gutter` in nav and fleet list |
| Code-shaped content | stat rows `let status = "Program"`, buttons `attack()` / `run()`, log levels `info` / `warn` |
| Glass panels | `backdrop-filter: blur()` on panels, the camera toggle and the command bar |
| Animated gradient rim on the focused panel | `.panel.focus::before`: a conic gradient masked to a 1 px border, rotated via `@property --ang` |
| Gradient title | `background-clip:text` with a slow `background-position` animation |
| Gradient bars | cyan→green, orange→pink for the "hot" ones |
| Colourful scene | radial-gradient planets with glow, nebula blobs, a glowing Sun, the station ring in orange |

## Adopting a skin in the game

Not done yet — a separate, bigger step:

1. **Turn the game's colours into variables.** `css/ui/` and
   `css/ui/hud/` have ~150 hard-coded colours (measured 2026-09-28);
   `css/ui/kit.css` has only a few variables so far (`--uiFrame`,
   `--uiFrameGlow`, `--uiHdText`, `--uiText`, `--uiText2`, fonts). The
   current look becomes the default set of values — no visible change.
2. **A skin = a set of variable values + a small stylesheet of extras**
   (the CRT layer, gradient rims), switched by a `data-skin` attribute
   on `<html>`, like this lab.
3. **Canvas/3D colours** (minimap, trajectory lines, selection frames,
   orbit lines) read from the same variables at runtime
   (`getComputedStyle`), converted sRGB→linear for 3D materials
   (`scene/colorManagement.js` rules).
4. **Text that changes shape** (menu vs. file names, `let x =` rows)
   stays skin-specific markup or i18n variants — decide per item; the
   first version can keep the game's texts and change only the look.
5. Version bump + CHANGELOG, new CSS files into
   `js/versionCheck.js#MODULE_FILES`.

## Skins: chosen by the player or by race?

The user asked (2026-09-28). The proposal made: both —

- **By race by default**: TERMINAL suits the Swarm story (an AI waking up
  on old station hardware); the second race (Blade, planned with its own
  UI layout) would get its own look — the skin tells you who you're
  playing.
- **Overridable in Setup**: accessibility (flicker and a single green hue
  aren't for everyone for hours) and taste.
- No separate "skin picker" lab needed — this lab is for designing; the
  player's choice would live in Setup.

Not decided yet — waiting for the user's feedback on the two skins.

## Gotchas found while building it

- **Block characters (█ ░) don't line up**: IBM Plex Mono has no glyphs
  for them, the browser falls back to another font and the bars came out
  ragged. The bars are CSS (`.seg`) instead.
- **A header on the frame gets clipped**: TERMINAL's `┤ TITLE ├` sits
  half above the panel's border; `overflow:hidden` on `.panel` cut it —
  TERMINAL panels use `overflow:visible`.
- **Fixed-size lists overflow in the other skin**: the same nav list
  fits in TERMINAL (28 px rows) but not with SYNTAX's tab header — SYNTAX
  rows are 25 px. Check both skins after any layout change.
