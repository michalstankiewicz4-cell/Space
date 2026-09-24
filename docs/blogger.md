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
