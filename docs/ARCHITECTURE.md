# Architecture & roadmap

## Goal

Make Bluesky a first-class OpenClaw channel: an agent calls the standard `message` tool with `channel: "bluesky"` and the plugin handles auth, posting, threading, and inbound notifications.

## Phases

### Phase 1 — Python CLI prototype  ✅ done

Standalone `bsky` CLI in [`../cli/`](../cli/). Validates auth, posting, reading, replies, mentions, hashtags, and rich-text facets against a real account. Useful on its own (cron jobs, scripts, agent Bash invocations) even after the plugin lands.

Uses [`atproto`](https://atproto.blue/) (MarshalX). Creds live in gnome-keyring under `service=openclaw origin=bluesky`. Session cached as a session string, refreshed on 401.

### Phase 2 — Plugin SDK study  📚 next

OpenClaw is open source ([`github.com/openclaw/openclaw`](https://github.com/openclaw/openclaw)). Read:

- The `@openclaw/discord` plugin source — closest reference.
- The channel-adapter interface / `channelConfigs` schema.
- How `to:` addresses are parsed and routed for channels (e.g. `user:<id>`, `channel:<id>`, `thread:<id>`).
- Inbound event flow — how Discord pushes incoming messages back into the agent loop.

Output: a short design doc here describing what the Bluesky plugin needs to expose.

### Phase 3 — Outbound MVP plugin

`@8bitalex/openclaw-bluesky` (TypeScript, uses [`@atproto/api`](https://github.com/bluesky-social/atproto/tree/main/packages/api)). Outbound only:

- Auth via app password resolved from env / file / exec (matching Discord's three-source pattern).
- `message` tool with `channel: "bluesky", to: "user:<handle-or-did>"` → posts a skeet (DM if AT-Proto chat is supported by the account, otherwise public post addressed to the user — TBD by Phase 2).
- Rich-text facet generation reused from CLI prototype's logic.

### Phase 4 — Inbound

Poll notifications endpoint on an interval (cheaper than firehose for a single account). Surface mentions, replies, follows, likes, quote-posts, DMs as channel events.

Open question: does OpenClaw's channel framework support a poll-based inbound, or does it expect push? Answered in Phase 2.

### Phase 5 — Rich text & media

- Facets (URL/hashtag/mention) — already prototyped in CLI, port to TS.
- Embedded images (alt-text required by Bluesky community norms — enforce in tool schema).
- External link cards (OpenGraph fetch + `app.bsky.embed.external`).
- Quote posts.

### Phase 6 — Polish & release

- Tests against `atproto` mock or a real test PDS.
- Rate-limit handling — AT Proto returns `429` with `Retry-After`.
- Docs site or doc-in-readme — examples of common agent workflows.
- CI: lint, build, test, publish to npm on tag.
- Submit to OpenClaw plugin index upstream so it appears in `npm search @openclaw`.

## Design notes

### Auth: app passwords, not OAuth

Bluesky has OAuth in the protocol now, but app passwords are stable, well-supported, and what the official Python/JS SDKs default to. OAuth is a Phase 7+ concern.

### Identity: handles vs DIDs

Plugin should accept either in `to:`. Resolve handles → DIDs at send time and cache. DID is the durable identifier; handles can change.

### Rate limits

AT Proto rate limits are per-PDS and fairly generous, but a chatty agent could hit them. Plugin should respect `Retry-After` and surface backpressure to the agent rather than silently dropping.

### Why TypeScript not Python

OpenClaw plugins are npm packages. Python would mean shelling out from the TS adapter, which adds latency, deployment complexity, and a worse error story. The official `@atproto/api` JS SDK is well-maintained.

The Python CLI stays useful as a standalone tool independent of OpenClaw.
