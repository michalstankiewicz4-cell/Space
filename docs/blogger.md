# Devlog (Blogger) — publishing workflow

Referenced from [`CLAUDE.md`](../CLAUDE.md). Only relevant when doing
devlog/blog work — the game itself doesn't depend on any of this.

There's a companion devlog at
[swarmprotocol.blogspot.com](https://swarmprotocol.blogspot.com/) (Polish;
blog ID `4054180551202581680`), set up 2026-09-21 — separate from the
game itself, published via the Blogger API rather than its web UI.
Credentials (`BLOGGER_OAUTH_CLIENT_ID`/`_SECRET`/`_BLOG_ID`/
`_REFRESH_TOKEN`) live in the gitignored `pass` file, same as the
Supabase Management API token.

- **Post images are hosted in this repo's `blog/` folder (served via
  GitHub Pages), not uploaded through Blogger** — the Blogger API has no
  endpoint for uploading post images directly, only for posting HTML
  content that can *reference* an image by URL. Every post's `<img>` tag
  points at a `blog/<file>` GitHub Pages URL.
- **Every AI-generated image needs a small caption disclosing it's
  AI-generated and isn't (and won't become) an actual in-game asset** —
  an explicit, standing instruction from the user after the first post's
  hero image went up without one initially.
- **The OAuth client's only registered redirect URI is
  `https://developers.google.com/oauthplayground`** — because the
  refresh token was minted by walking through Google's own OAuth
  Playground UI (gear icon → "Use your own OAuth credentials" → paste
  client ID/secret → add scope `https://www.googleapis.com/auth/blogger`
  → Authorize → Exchange authorization code for tokens), after a
  `localhost:PORT`-based manual flow failed with `redirect_uri_mismatch`
  (that redirect URI was never added to the client's authorized list).
  If the refresh token ever needs regenerating, redo it via OAuth
  Playground rather than fighting a fresh `localhost` flow again.
- **`posts.insert` publishes immediately by default — pass
  `?isDraft=true` on the URL to create a draft instead.** Confirmed live
  (2026-09-24): creating a post normally (via `POST .../posts/`) with no
  query param would go straight to `status: LIVE`; adding `?isDraft=true`
  made the same call return `status: DRAFT` instead, leaving the actual
  publish step to the user reviewing it in the Blogger UI — the
  established workflow (Claude drafts, the user reviews and publishes
  manually) depends on remembering this param every time, not just on
  leaving `posts.publish` uncalled.
- **`posts.publish`/`posts.revert` (and any other empty-body POST to the
  Blogger API) need an explicit `Content-Length: 0` header** — without
  it, Google's edge returns a bare `411 Length Required` HTML page
  instead of JSON, which `curl -X POST` (with no `-d`) doesn't send
  automatically.
- **A `posts.patch` call landing around the same time as the user
  manually clicking "Publish" in the Blogger UI looks identical to the
  patch itself having silently published the post** — this happened once:
  a content update was immediately followed by the post showing
  `status: LIVE` instead of the expected `DRAFT`, which looked exactly
  like the PATCH call had an undocumented side effect of publishing —
  leading to an unnecessary `posts.revert` that undid the user's own
  intentional manual publish. **Confirm with the user before assuming a
  status change was caused by an API call and reverting it** — it may
  just be their own concurrent action in the Blogger UI.

## Video clips (instead of GIFs)

The user's call (2026-09-27), after a same-scene test: a looping video
beat an animated GIF on every count (GIF 800×450, 256 colours, stuttering,
5.2 MB; WebM 1280×720, full colour, 1.3 MB).

- **Record** with Playwright's `recordVideo` (a new browser context with
  `recordVideo: { dir, size: { width: 1280, height: 720 } }`; the file is
  `page.video().path()` after the context closes). Drive the scene from
  the script — the scale lab has `window.scaleLab.flyTo(name, seconds)`
  for smooth camera flights; in the game, the camera functions in
  `scene/controls.js`.
- **The recording skips time while the page stalls** (shader compiles at
  load): a session 28 s long on the clock gave a 16.7 s file. Trim from
  the END (`-ss <duration − clip length>`), not by wall-clock offsets.
- **Trim/re-encode** with the ffmpeg Playwright ships
  (`%LOCALAPPDATA%/ms-playwright/ffmpeg-*/ffmpeg-win64.exe`): it only
  encodes VP8/WebM, e.g. `-ss 7.3 -i in.webm -c:v libvpx -b:v 1500k -crf 12
  -an out.webm`. MP4 would need a full ffmpeg install — WebM plays in
  Chrome, Firefox, Edge and Android; older Safari/iOS may not.
- **Host** in `blog/` like images; embed as
  `<video src="…/blog/<file>.webm" autoplay loop muted playsinline
  style="max-width:100%;height:auto;display:block;"></video>` — Blogger
  keeps the tag (verified by reading the saved draft back through the
  API). Keep clips short (≤10 s) and captioned like screenshots.
