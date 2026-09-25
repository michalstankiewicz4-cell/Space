# Known gotchas — full stories

Referenced from [`CLAUDE.md`](../CLAUDE.md), which keeps only the short
gotchas inline. These three are long enough to warrant the full
investigation narrative, kept here instead.

## GitHub Pages deploys that look "errored" after a push burst

**A burst of several pushes in quick succession can leave GitHub Pages
stuck "errored" for several minutes — not a Jekyll/content problem,
despite first appearances.** Hit this directly: `gh api
repos/.../pages/builds/latest` reported `status: "errored"` /
`"Page build failed."` (no further detail) for two commits in a row
right after adding `IDEAS.md`, which looked exactly like that new file
had broken something. The real story, found via `gh run list` (the
underlying `pages-build-deployment` Action, which has actual job logs,
unlike the legacy Pages Builds API): those two runs were **cancelled**,
not failed — each push had triggered a new deployment run before the
previous one finished, and GitHub's concurrency group for this workflow
cancels an in-flight run when a newer one starts. The legacy API just
reports a cancelled run as a generic "errored," indistinguishable from
an actual build failure without checking `gh run list` too. Once pushes
stopped for a few minutes, the next run completed on its own (took
3m44s that time, vs. the usual well under a minute — some queue
backlog from the cancelled runs, presumably) and everything deployed
fine. **If a deploy ever looks stuck/errored, check `gh run list
--repo michalstankiewicz4-cell/Space` for the real job status before
assuming content broke the build** — and if several runs show
`cancelled`, the fix is just to stop pushing for a bit, not to go
hunting for what's "wrong" with the latest file.

Repo root also has an empty `.nojekyll` file (added while chasing the
above, before the real cause was found) — turned out not to be what
fixed it, but harmless to keep either way, since this project was never
meant to go through Jekyll processing in the first place (no
`_config.yml`, explicit "no build step" design).

## The `supabase-js` "Realtime send() ... falling back to REST API" console warning

**Expected and harmless, not a sign of a dropped/failed message.** It
fires from `net/shipsBroadcast.js#maybeBroadcastShips()`'s
`roomChannel.send(...)` calls (every `NET_SHIP_BROADCAST_MS`, ~120ms)
because `RealtimeChannel.canPush()` — `socket.isConnected() &&
isJoined()`, confirmed by reading the actual bundled library source —
returns false for broadcast-type sends unless the channel was created
with an explicit `config.broadcast` option, which this project's
`supabase.channel("room:main", {...})` never sets (only
`config.presence`). The message still gets delivered, just over plain
REST instead of a raw WebSocket frame — functionally fine for this
game's needs, just not literally silent. Since the CDN script tag pins
`@supabase/supabase-js@2` unversioned (always fetches the newest 2.x),
this kind of library-behavior drift can appear with no corresponding
code change on a future session's watch — check the actual bundled
source (`curl` the CDN URL) before assuming a new console message means
something broke in this repo.

## Cache-busting isn't fully airtight

GitHub Pages serves every file with `Cache-Control: max-age=600` (10
min) and an `ETag`, no build step means no content-hashed filenames, and
a page that's already open never re-fetches anything on its own (a
deploy doesn't reach an already-loaded tab until it's reloaded). The
`?v=` query param on `css/style.css`/`js/main.js` in `index.html` only
narrows the "just deployed, browser still has the old file cached"
window for *new* page loads — it can't do anything for a tab that's
already open, and doesn't reach the files `js/main.js` `import`s (those
still resolve to their own plain, unversioned URLs either way).
`js/versionCheck.js` covers the "already open" case instead, by
periodically re-fetching `js/version.js` itself and blocking play once
it detects this tab is older than what's actually deployed. Its "Refresh
now" button doesn't use `location.reload()` (that's just F5 — it can
still serve `js/main.js`/`css/style.css` from cache if they're within
the freshness window) but navigates to a `?_=<timestamp>` cache-busted
URL instead, which forces a genuine fetch since the browser has never
seen that exact URL. There's no standard cross-browser JS API for a true
hard reload (Ctrl+Shift+R) — this is the practical workaround.

**That cache-busted-URL trick alone still isn't airtight**: it only
guarantees a fresh `index.html`, `js/main.js` and `css/style.css` (the
three that actually carry the `?v=`/`?_=` params); every file
`main.js` transitively `import`s has no cache-busting of its own, and
a still-fresh browser HTTP cache entry for any of them gets served
as-is to the native ES module loader — there's no way to pass fetch
options to a static `import`. `initVersionCheck()`'s click handler now
force-refreshes the browser's cache entry for every module file first
(`fetch(path, {cache:"reload"})` — revalidates and overwrites the
cached copy — capped at 3s so a slow connection can't leave the player
stuck) via a hand-maintained `MODULE_FILES` list, *then* navigates. That
list has to be updated by hand whenever a file is added to `js/` or
`css/`, same spirit as the `?v=` bump itself — there's no build step to
derive it automatically, and forgetting silently makes the fix not cover
that one new file (this actually happened: `js/ui/uiKit.js` shipped in
v2.1.0 without an entry, caught and fixed in v2.1.2). CSS files that
index.html links next to `css/style.css` (`css/fonts.css`, `css/ui/**/*.css`)
are in exactly the same position as JS imports — no `?v=` of their own
— and are listed too; that's deliberate, so `style.css`'s `?v=` stays
the one CSS literal to bump instead of one per `<link>`. Binary assets
(`fonts/*.woff2`, `css/ui/grain.png`) are *not* listed: their content
never changes under the same name — if one ever needs to change, give
it a new filename instead. A plain "or Ctrl+Shift+R" hint sits under the button too,
since even this can only narrow the gap, never fully close it.
