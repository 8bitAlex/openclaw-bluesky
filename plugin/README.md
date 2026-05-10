# @8bitalex/openclaw-bluesky

OpenClaw channel plugin for [Bluesky](https://bsky.app) / AT Protocol.

> **Status: scaffold.** The package layout, manifest, entry contract, and `ChannelPlugin` skeleton are in place. Outbound delivery and inbound notification polling are stubbed (`TODO(phase-3)`). See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the roadmap and [`../docs/PLUGIN_SDK.md`](../docs/PLUGIN_SDK.md) for the SDK research notes that this scaffold is built on.

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
- `config.listAccountIds` / `config.resolveAccount` / `config.isConfigured` work against the config shape above (env-source secrets only — file/exec are deferred to Phase 3 runtime helpers).
- `capabilities` advertise correct flags: DM + thread chat types, media, reply, threads, unsend.
- `agent-pool.ts` performs real AT Proto login via `@atproto/api`.
- `facets.ts` is a verified TypeScript port of the Python facet extractor (UTF-8-correct byte offsets).

## What's stubbed

- `outbound` — declares `deliveryMode: "direct"` only. The actual `agent.post(...)` call needs to be wired into the right delivery hook; the SDK's outbound shape is wider than I've fully traced. Phase 3.
- `gateway.startAccount` — no-op. Phase 3 will poll `app.bsky.notification.listNotifications`.
- File/exec secret resolution — throws "not yet implemented". Phase 3 plumbs it through the host's runtime secret resolver.
- Setup wizard, status adapter, doctor — Phase 4+.

## Contributing

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md). Issues for any phase are welcome — Phase 3 outbound is the highest-leverage place to help right now.
