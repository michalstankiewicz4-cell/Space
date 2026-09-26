// Bump this on every meaningful release (features, balance changes, fixes
// worth telling apart). Shown next to the title on the start screen and in
// the browser tab title, so it's easy to tell which build is live —
// especially useful right after a GitHub Pages deploy, since caches can lag.
//
// Also update the "?v=" cache-busting query param on css/style.css and
// js/main.js in index.html to this same value (see docs/gotchas.md) — GitHub
// Pages serves files with only a 10-minute Cache-Control, but a returning
// player loading the page within that window would otherwise still risk
// getting a stale main.js.
export const VERSION = "2.11.0";
