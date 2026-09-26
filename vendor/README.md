# vendor/

Local copies of the game's third-party libraries, so the game doesn't
depend on a CDN at runtime. Each file name carries its version: updating
a library means a new file under the new name plus the new `src` in
`index.html` (and `admin.html` for supabase-js) — the new name also keeps
players' browsers from reusing a cached old copy.

| File | Library | Source | License |
|---|---|---|---|
| `three-r128.min.js` | Three.js r128 (classic build, global `THREE`) | cdnjs `three.js/r128/three.min.js` | MIT |
| `supabase-js-2.117.2.js` | supabase-js 2.117.2 (UMD, global `supabase`) | jsDelivr `@supabase/supabase-js@2.117.2/dist/umd/supabase.js` | MIT |

`admin.html` → **Check library updates** compares these versions (read
from the file names in `index.html`) with the npm registry. Three.js
releases after r159 have no classic build any more, so moving past it
means loading the game, ShipKit and BodyKit as ES modules — not a file
swap. The fonts live in `fonts/` (see `css/fonts.css`).
