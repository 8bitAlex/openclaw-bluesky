# @8bitalex/openclaw-bluesky

OpenClaw channel plugin for [Bluesky](https://bsky.app) / AT Protocol.

> **Status: Phase 3 — outbound + gateway implemented, untested against a live host.** Posting (with rich-text facets), reply threading, and notification polling are wired through the `ChannelOutboundAdapter` and `ChannelGatewayAdapter` send hooks. Typecheck and build are clean; structural smoke test passes. Live host integration is the next-session task. See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the roadmap and [`../docs/PLUGIN_SDK.md`](../docs/PLUGIN_SDK.md) for the SDK research this is built on.

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

## What's stubbed / deferred

- **Media uploads** (`sendMedia`, `sendFormattedMedia`) — needs Bluesky blob upload. Phase 5.
- **Setup wizard** — config currently authored by hand. Phase 4.
- **DM-style chat** — Bluesky's `chat.bsky.*` lexicon. Phase 5+.
- **`status` / `doctor` adapters** — Phase 4 polish.
- **Live host integration** — typecheck + structural smoke test pass, but no end-to-end test against an OpenClaw host install yet. That's the next-session validation step.

## Contributing

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md). Issues for any phase are welcome — Phase 3 outbound is the highest-leverage place to help right now.
