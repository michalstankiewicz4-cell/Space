# Labs changelog

The labs' own version, apart from the game's (`CHANGELOG.md` in the root).
It covers the labs (`labs/`, their start screen `labs.html`), the tools
(`tools/`), LabKit and the menu bar (`js/labkit/`) — and a kit change when it
changes what a lab shows. The number lives in `js/labkit/menubar.js`
(`LABS_VERSION`); the menu bar, the start screen and HELP → About show it.

`x.y.z`: **y** a new lab, tool or feature; **z** a fix or a small change;
**x** a big turn (none yet).

## [1.0.0] — 2026-10-05

The labs get a home, a menu and a version of their own.

### Added
- **The start screen** (`labs.html`): a tile for every lab and tool — its
  drawn picture, what it's for, in the game / lab only / tool, its kit —
  with the counts and both versions. Drag a tile by its six-dot grip to
  reorder (Alt+arrows from the keyboard); RESET ORDER brings the default
  back.
- **The menu bar** on every lab and tool: FILES (the start screen, back to
  the game), OPTIONS (full screen, reload, reset this lab's saved
  settings), TOOLS (every lab and tool), HELP (this lab's keys and mouse,
  its notes, all docs, what's new, about). Always visible; the labs' top
  panels sit under it.
- **The model doctor** (`tools/doctor.html`): every kit model examined for
  repeating mistakes — inside-out shapes, flickering coplanar faces,
  floating and hidden parts, specks, needle triangles — each finding
  lit up red on the model.
- This changelog and the version.

### Changed
- The labs moved to `labs/` (the start screen stays in the root); the
  game's Dev Tools → LABS has one button to the start screen.
- The surface lab runs on SurfaceKit's shared ground (`ground.js`), the
  same the game lands on; the descent is procedural (entry, clouds, the
  burn, dust).
- The ship lab matches the game: exposure, environment map, anisotropy;
  GAME BUILD at the game's detail; GAME LIGHTING shows the game's lights.

### Removed
- The labs' old root addresses (`ship.html`…) and the studio logo files.
