# @8bitalex/openclaw-bluesky

OpenClaw channel plugin for [Bluesky](https://bsky.app) / AT Protocol.

> **Status: end-to-end working.** Posts (with rich-text facets), threaded replies, image/quote/external embeds, and notification polling are wired through the SDK's `ChannelOutboundAdapter` / `ChannelGatewayAdapter` hooks. Verified against a live OpenClaw host: link-installed via `openclaw plugins install --link`, doctor reports 0 errors, and the outbound path posted a real skeet end-to-end (config → exec-source secret → agent-pool login → atproto post). 64 unit tests pass. See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the roadmap and [`../docs/PLUGIN_SDK.md`](../docs/PLUGIN_SDK.md) for the SDK research this is built on.

## Layout

```
plugin/
├── package.json              # npm package + openclaw plugin metadata
├── tsconfig.json             # ESM, ES2022, strict
├── openclaw.plugin.json      # plugin manifest (channels, env vars, schema)
├── vitest.config.ts          # test runner config
├── src/
│   ├── index.ts              # main entry — defineBundledChannelEntry(...)
│   ├── setup-entry.ts        # account-setup entry
│   ├── channel-plugin.ts     # the ChannelPlugin object — all adapters live here
│   ├── setup-plugin.ts       # setup-side plugin object
│   ├── account.ts            # BlueskyAccount type + secret-ref shape
│   ├── secrets.ts            # env/file/exec resolution (host or standalone)
│   ├── agent-pool.ts         # lazy AtpAgent cache, dedupes concurrent logins
│   ├── facets.ts             # rich-text facet extraction (UTF-8 byte offsets)
│   ├── outbound.ts           # sendText/sendMedia, embed assembly, target parse
│   ├── gateway.ts            # notification poller (mention/reply/quote)
│   ├── media.ts              # image blob upload + app.bsky.embed.images
│   ├── embeds.ts             # OpenGraph parser + app.bsky.embed.external
│   ├── retry.ts              # 429-aware withRetry with backoff + jitter
│   ├── setup.ts              # setup adapter (channels add bluesky)
│   └── status.ts             # probeAccount + doctor warnings
└── test/                     # vitest — 64 tests across 7 files
```

## Building

```bash
npm install
npm run build       # tsc -> dist/
npm run typecheck   # without emit
npm test            # vitest (64 tests)
```

`peerDependencies.openclaw` is required for the SDK types and runtime helpers. The standalone fallback in `secrets.ts` lets the plugin still work if the host runtime isn't present — useful in unit tests.

## Configuration

The host's OpenClaw config gains a `channels.bluesky` block. Single-account (most common) puts the credentials at the top level — same shape as `@openclaw/discord`:

```jsonc
{
  "channels": {
    "bluesky": {
      "enabled": true,
      "handle": "you.bsky.social",
      "appPassword": {
        "source": "exec",
        "id": "secret-tool lookup service openclaw origin bluesky type app-password handle you.bsky.social"
      },
      "service": "https://bsky.social"
    }
  }
}
```

The setup wizard (`openclaw channels add bluesky --userId ... --password ...`) writes this block for you. App passwords come from <https://bsky.app/settings/app-passwords>. The three secret sources (`env`, `file`, `exec`) mirror Discord's pattern.

Multi-account override under `channels.bluesky.accounts.<id>`:

```jsonc
"channels": {
  "bluesky": {
    "accounts": {
      "work": { "handle": "work.bsky.social", "appPassword": "..." },
      "alt":  { "handle": "alt.bsky.social",  "appPassword": "..." }
    }
  }
}
```

## What works

### Outbound

- **`sendText` / `sendFormattedText`** — posts a skeet with rich-text facets (URLs, hashtags, mentions resolved to DIDs). Truncates to 300 chars. Threads via `replyToId`.
- **`sendMedia`** — uploads images to Bluesky's blob store and embeds them as `app.bsky.embed.images`. Up to 4 images per post, 1 MB each, JPEG/PNG/WebP/GIF. Accepts URLs, file paths, or pre-loaded buffers; alt text supported.
- **Quote posts** (`app.bsky.embed.record`) — pass `quoteOf: at://...` in the internal `SendCtx` to embed another post.
- **External link cards** (`app.bsky.embed.external`) — pass `externalLink: <url>` to fetch OpenGraph metadata (title, description, image) and embed a card. Image upload + thumbnail attached when available, gracefully degrades when not.
- **`recordWithMedia`** — when both `quoteOf` and image inputs are present, combines them via `app.bsky.embed.recordWithMedia` (the only Bluesky path for image+quote).
- **`resolveTarget`** — accepts bare handles, `@handle`, `user:handle`, `did:plc:...`, and `at://` post URIs.
- **Rate-limit handling** — every AT-Proto API call (`login`, `post`, `getPosts`, `uploadBlob`, `getProfile`, `listNotifications`, `updateSeen`) is wrapped in a retry helper that honors `Retry-After`, retries 429/5xx with capped exponential backoff + ±12.5% jitter, and lets non-retryable errors (auth, validation) propagate immediately.

### Inbound

- **`gateway.startAccount`** — polls `app.bsky.notification.listNotifications` every 30s, surfaces mentions/replies/quotes via `ctx.channelRuntime?.reply`, advances `seenAt`.
- **`gateway.stopAccount`** — clears interval, evicts cached AtpAgent.

### Companion X/Twitter workflow

Use this plugin for Bluesky / AT Protocol channel delivery. Use [TweetClaw](https://github.com/Xquik-dev/tweetclaw) when an agent also needs X/Twitter-specific work:

```bash
openclaw plugins install @xquik/tweetclaw
```

- Use `message` with `channel: "bluesky"` for Bluesky posts, replies, quote posts, media posts, and notification polling.
- Use TweetClaw's `explore` tool to choose the X/Twitter endpoint for tweet search, reply search, follower export, user lookup, media workflows, monitors, webhooks, DMs, or giveaway draws.
- Use TweetClaw's `tweetclaw` tool only after approval for visible X/Twitter actions such as post tweets, post tweet replies, likes, retweets, follows, DMs, media uploads, monitor creation, webhook changes, or giveaway draws.

### Lifecycle / config

- `config.listAccountIds` / `resolveAccount` / `isConfigured` / `describeAccount`.
- `setup.applyAccountConfig` — `openclaw channels add bluesky --userId you.bsky.social --password xxxx-xxxx-xxxx-xxxx [--name <accountId>] [--url <pds>]` writes the config block (top-level for default, nested for named).
- `status.probeAccount` — exercises auth by calling `getProfile(self)`; reports handle, DID, follower/following/post counts.
- `doctor.collectPreviewWarnings` — flags missing/malformed handles and literal passwords that don't match the Bluesky app-password shape (`xxxx-xxxx-xxxx-xxxx`).
- `capabilities` advertises: DM + thread chat types, media, reply, threads, unsend, reactions.
- `agent-pool` — lazy login + session reuse, dedupes concurrent `getAgent` calls.
- `facets` — TypeScript port of the Python facet extractor, byte-equivalent output verified by tests.
- Secret resolution — uses the host's `openclaw/plugin-sdk/runtime-secret-resolution` resolver when available (env/file/exec), with a native local fallback (`child_process.execFile`, `fs/promises`) when running outside the host.

## What's deferred

- **DM-style chat** — Bluesky's `chat.bsky.*` lexicon. Phase 8+.
- **Video uploads** — `app.bsky.embed.video` with transcoding job polling.
- **Custom feeds / list management** — beyond agent posting use cases.
- **OAuth** — app passwords are sufficient for now; OAuth is post-1.0.

## Contributing

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md). Issues for any deferred feature are welcome — DM lexicon and video uploads are the highest-leverage next pieces.
