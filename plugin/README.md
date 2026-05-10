# @8bitalex/openclaw-bluesky

OpenClaw channel plugin for [Bluesky](https://bsky.app) / AT Protocol.

> **Status: end-to-end working.** Posts (with rich-text facets), threaded replies, image uploads, and notification polling are wired through the `ChannelOutboundAdapter` / `ChannelGatewayAdapter` hooks. Verified against a live OpenClaw host: link-installed via `openclaw plugins install --link`, doctor reports 0 errors, and the outbound path posted a real skeet end-to-end (config → exec-source secret → agent-pool login → atproto post). 23 unit tests pass. See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the roadmap and [`../docs/PLUGIN_SDK.md`](../docs/PLUGIN_SDK.md) for the SDK research this is built on.

## Layout

```
plugin/
├── package.json              # npm package + openclaw plugin metadata
├── tsconfig.json             # ESM, ES2022, strict
├── openclaw.plugin.json      # plugin manifest (channels, env vars, schema)
└── src/
    ├── index.ts              # main entry — defineBundledChannelEntry(...)
    ├── setup-entry.ts        # account-setup entry
    ├── channel-plugin.ts     # the ChannelPlugin object
    ├── setup-plugin.ts       # setup-side plugin object
    ├── account.ts            # BlueskyAccount type + secret-ref shape
    ├── agent-pool.ts         # lazy AtpAgent cache keyed by accountId
    └── facets.ts             # rich-text facet extraction (TS port of cli/_facets.py)
```

## Building

```bash
npm install
npm run build       # tsc -> dist/
npm run typecheck   # without emit
```

`peerDependencies.openclaw` is required for the SDK types and runtime helpers.

## Configuration

The host's OpenClaw config gains a `channels.bluesky` block:

```jsonc
{
  "channels": {
    "bluesky": {
      "accounts": {
        "primary": {
          "handle": "you.bsky.social",
          "appPassword": {
            "source": "exec",
            "id": "secret-tool lookup service openclaw origin bluesky type app-password handle you.bsky.social"
          },
          "service": "https://bsky.social"
        }
      }
    }
  }
}
```

App passwords come from <https://bsky.app/settings/app-passwords>. The three secret sources (`env`, `file`, `exec`) are mirrored from Discord's pattern.

## What works today

- Plugin loads via `defineBundledChannelEntry`.
- `config.listAccountIds` / `config.resolveAccount` / `config.isConfigured` / `config.describeAccount`.
- `capabilities` advertise: DM + thread chat types, reply, threads, unsend, reactions.
- **`outbound.sendText`** — posts a skeet with rich-text facets (URLs, hashtags, mentions). Truncates to 300 chars. Threads via `replyToId`.
- **`outbound.sendFormattedText`** — wraps `sendText` and returns the result array.
- **`outbound.resolveTarget`** — accepts bare handles, `@handle`, `user:handle`, `did:plc:...`, and `at://` post URIs.
- **`gateway.startAccount`** — polls `app.bsky.notification.listNotifications` every 30s, surfaces mentions/replies/quotes via `ctx.channelRuntime?.reply`, advances `seenAt`.
- **`gateway.stopAccount`** — clears interval, evicts cached AtpAgent.
- **Secret resolution** — uses the host's `openclaw/plugin-sdk/runtime-secret-resolution` resolver when available (env, file, exec). Falls back to env-only when running outside the host (tests, standalone).
- `agent-pool.ts` — lazy login + session reuse, dedupes concurrent `getAgent` calls.
- `facets.ts` — TypeScript port of the Python facet extractor, byte-equivalent output verified.

- **`outbound.sendMedia`** — uploads images to Bluesky's blob store and embeds them as `app.bsky.embed.images`. Up to 4 images per post, 1 MB each, JPEG/PNG/WebP/GIF. Accepts URLs, file paths, or pre-loaded buffers; alt text supported.
- **Tests** — vitest suite (`npm test`) covers facet extraction, target resolution, and media validation. 23 tests in `plugin/test/`.
- **Live host install verified** — `openclaw plugins install --link plugin/` registers the plugin, doctor reports 0 errors, end-to-end post via `outbound.sendText` succeeds against the real Bluesky API.

- **`setup` adapter** — `openclaw channels add bluesky --userId you.bsky.social --password xxxx-xxxx-xxxx-xxxx [--name <accountId>] [--url <pds>]` writes the config block correctly (top-level for default, nested under `accounts.<id>` for named). Validates handle dot-form and password presence.
- **`status.probeAccount`** — exercises auth by calling `getProfile(self)`; reports handle, DID, follower/following/post counts in summaries.
- **`doctor.collectPreviewWarnings`** — flags missing/malformed handles and literal passwords that don't match the Bluesky app-password shape (`xxxx-xxxx-xxxx-xxxx`).
- **Quote posts** (`app.bsky.embed.record`) — pass `quoteOf: at://...` in the internal `SendCtx` to embed another post.
- **External link cards** (`app.bsky.embed.external`) — pass `externalLink: <url>` to fetch OpenGraph metadata (title, description, image) and embed a link card. Image upload + thumbnail attached when available, gracefully degrades when not.
- **Rate-limit handling** — every AT-Proto API call (`login`, `post`, `getPosts`, `uploadBlob`, `getProfile`, `listNotifications`, `updateSeen`) is wrapped in a retry helper that honors `Retry-After`, retries 429/5xx with capped exponential backoff + jitter, and lets non-retryable errors (auth, validation) propagate immediately.

## What's deferred

- **DM-style chat** — Bluesky's `chat.bsky.*` lexicon. Phase 7+.
- **Video uploads / external link cards / quote posts** — incremental polish.
- **Custom feeds / list management** — beyond agent posting use cases.

## Contributing

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md). Issues for any phase are welcome — Phase 3 outbound is the highest-leverage place to help right now.
