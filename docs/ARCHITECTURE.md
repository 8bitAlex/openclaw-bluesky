# Architecture & roadmap

## Goal

Make Bluesky a first-class OpenClaw channel: an agent calls the standard `message` tool with `channel: "bluesky"` and the plugin handles auth, posting, threading, and inbound notifications.

## Phases

### Phase 1 — Python CLI prototype ✅

Standalone `bsky` CLI in [`../cli/`](../cli/). Validates auth, posting, reading, replies, mentions, hashtags, and rich-text facets against a real account. Useful on its own (cron jobs, scripts, agent Bash invocations) independent of OpenClaw.

Uses [`atproto`](https://atproto.blue/) (MarshalX). Creds live in gnome-keyring under `service=openclaw origin=bluesky`. Session cached as a session string, refreshed on 401.

### Phase 2 — Plugin SDK study ✅

Findings captured in [`PLUGIN_SDK.md`](PLUGIN_SDK.md). Verified the public surface (`openclaw/plugin-sdk/channel-entry-contract` for entry helpers; `ChannelPlugin` is structural, not a public type), the bundled-channel pattern (`defineBundledChannelEntry` + `loadChannelPlugin`), and the manifest/secret/three-source-resolver layout. Reference implementation: `@openclaw/discord`.

### Phase 3 — Outbound MVP ✅

TypeScript plugin under [`../plugin/`](../plugin/) with:
- `outbound.sendText` / `sendFormattedText` — posts via `@atproto/api` with rich-text facets (URLs, hashtags, mentions resolved to DIDs), 300-char truncation, reply threading via `replyToId`.
- `outbound.resolveTarget` — accepts bare handles, `@handle`, `user:handle`, `did:plc:...`, and `at://` post URIs.
- `gateway.startAccount` / `stopAccount` — polls `app.bsky.notification.listNotifications` every 30s, filters to `mention/reply/quote`, dispatches via `ctx.channelRuntime?.reply`, advances `seenAt` cursor.
- `secrets.ts` — wraps the host's `runtime-secret-resolution` module (env/file/exec) with a native local fallback so the plugin works inside the host or standalone.
- `agent-pool.ts` — lazy login, session reuse, dedupes concurrent `getAgent` calls.

### Phase 4 — Live host integration ✅

`openclaw plugins install --link plugin/` installs the linked plugin. `openclaw doctor` reports zero errors. End-to-end test: `blueskyPlugin.outbound.sendText` → exec-source secret resolution (gnome-keyring via `secret-tool`) → agent-pool login → real Bluesky post.

Two non-obvious gotchas we caught here:
- The plugin manifest needs a top-level `configSchema` (in addition to `channelConfigs.<id>.schema`) or the host validator rejects the install.
- `runtime-secret-resolution` exports the batch `resolveSecretRefValues`, not the singular `resolveSecretRefString` despite the latter being declared in the d.ts.

### Phase 5 — Media + tests + CI ✅

- `outbound.sendMedia` — uploads images to Bluesky's blob store and embeds them as `app.bsky.embed.images`. 4 images / 1 MB each / JPEG-PNG-WebP-GIF. Accepts URLs, file paths, or pre-loaded buffers; alt text supported.
- `vitest` suite — initial coverage across `facets`, `outbound`, `media`, `setup`, `status`.
- GitHub Actions workflow — matrix builds plugin (Node 20/22) and CLI (Python 3.10/3.12) on every push.

### Phase 6 — Setup wizard, status, doctor ✅

- `setup.applyAccountConfig` — `openclaw channels add bluesky --userId you.bsky.social --password xxxx-xxxx-xxxx-xxxx [--name <accountId>] [--url <pds>]` writes the config block (top-level for `default`, nested for named accounts). Validates handle format and password presence.
- `status.probeAccount` — calls `getProfile(self)` to verify auth; surfaces handle, DID, follower/following/post counts.
- `doctor.collectPreviewWarnings` — flags missing/malformed handles and literal app passwords that don't match Bluesky's `xxxx-xxxx-xxxx-xxxx` shape.

### Phase 7 — Pre-1.0 polish ✅

- **Quote posts** — `app.bsky.embed.record` referencing the parent CID. Internal `SendCtx.quoteOf: at://...` field.
- **External link cards** — `app.bsky.embed.external` with OpenGraph parser (entity-decoded, single/double/unquoted attribute forms), thumbnail blob upload when available, graceful degradation when not.
- **`recordWithMedia`** — combines image embeds with a quoted record; the only Bluesky-supported path for image+quote.
- **AT-Proto-aware retry** — `withRetry` wraps every API call (`login`, `post`, `getPosts`, `uploadBlob`, `getProfile`, `listNotifications`, `updateSeen`); honors `Retry-After` (seconds or HTTP-date), retries 429/5xx with capped exponential backoff + ±12.5% jitter, propagates 4xx auth/validation errors immediately.
- **Test coverage expanded to 64** across `facets`, `outbound`, `media`, `setup`, `status`, `retry`, `embeds`.

### Phase 8 — Release (pending)

- npm publish on tag (`@8bitalex/openclaw-bluesky`).
- Submit to upstream OpenClaw plugin index so it shows up in `npm search @openclaw` and the CLI's `openclaw plugins search`.
- Full message-tool dispatch verification via `sessions_spawn` round-trip (requires gateway restart).
- Optional: video uploads (`app.bsky.embed.video`), DM lexicon (`chat.bsky.*`), docs site.

## Design notes

### Auth: app passwords, not OAuth

Bluesky has OAuth in the protocol, but app passwords are stable, well-supported, and what the official SDKs default to. OAuth is a Phase 9+ concern.

### Identity: handles vs DIDs

The plugin accepts either in `to:`. Handles get resolved → DID at send time inside facet generation. DID is the durable identifier; handles can change but DIDs don't.

### Rate limits

AT Proto rate limits are per-PDS and fairly generous, but a chatty agent can hit them. The plugin's `withRetry` helper (`src/retry.ts`) wraps every API call, honors `Retry-After`, and uses capped exponential backoff with jitter for 429/5xx. Non-retryable errors (auth, validation) surface immediately to the host.

### Why TypeScript, not Python

OpenClaw plugins are npm packages. Python would mean shelling out from a TS adapter — extra latency, harder deployment, worse error stories. The official `@atproto/api` JS SDK is well-maintained.

The Python CLI in [`../cli/`](../cli/) stays useful as a standalone tool, independent of OpenClaw.

### Default-account convention

Single-account users put `handle` and `appPassword` directly under `channels.bluesky` (matching `@openclaw/discord`'s flat shape). Multi-account users override per-account fields under `channels.bluesky.accounts.<id>`. The implicit `default` accountId resolves the top-level fields.
