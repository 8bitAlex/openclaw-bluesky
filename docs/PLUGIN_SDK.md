# OpenClaw plugin SDK — channel plugin notes

Findings from reading upstream source at [`github.com/openclaw/openclaw`](https://github.com/openclaw/openclaw) and the published `openclaw` npm package (`v2026.5.7` at time of writing). Captured here so the Bluesky plugin can be built against verified contracts rather than guesses.

## Public import path

```ts
import {
  defineBundledChannelEntry,
  defineBundledChannelSetupEntry,
  type BundledChannelEntryContract,
  type BundledChannelSetupEntryContract,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/channel-entry-contract";
```

The `openclaw` package exposes `./plugin-sdk` (the main barrel) plus ~80 specialised sub-paths under `./plugin-sdk/...`. **The entry helpers (`defineBundledChannelEntry` / `defineBundledChannelSetupEntry`) are exported from `./plugin-sdk/channel-entry-contract`, NOT from the main `./plugin-sdk` barrel** — importing them from the barrel will compile but fail at the symbol resolution. Other useful subpaths: `./plugin-sdk/runtime-secret-resolution` (env/file/exec resolver), `./plugin-sdk/channel-runtime-context`, `./plugin-sdk/channel-setup`. Type definitions live under `dist/plugin-sdk/src/...` inside the package.

## Package layout

A channel plugin is an npm package containing three things at the package root:

```
my-channel/
├── package.json              # declares "openclaw" plugin metadata
├── openclaw.plugin.json      # manifest (channels, env vars, schema)
├── src/                      # TypeScript source
│   ├── index.ts              # main entry — defineBundledChannelEntry(...)
│   ├── setup-entry.ts        # account-setup entry — defineBundledChannelSetupEntry(...)
│   ├── channel-plugin.ts     # the ChannelPlugin object
│   ├── setup-plugin.ts       # the setup-side ChannelPlugin object (lighter)
│   └── runtime.ts            # runtime hooks if any
├── dist/                     # compiled JS — actual runtime entry points
└── README.md
```

`package.json` carries the plugin manifest's runtime pointers under an `openclaw` field (see `@openclaw/discord/package.json` for a full example):

```jsonc
"openclaw": {
  "extensions":        ["./src/index.ts"],         // dev/source entry
  "setupEntry":        "./src/setup-entry.ts",     // dev/source setup
  "runtimeExtensions": ["./dist/index.js"],        // built JS — what host actually loads
  "runtimeSetupEntry": "./dist/setup-entry.js",
  "channel":  { /* mirrored channel meta */ },
  "install":  { "npmSpec": "@scope/name", ... },
  "compat":   { "pluginApi": ">=2026.5.7" }
}
```

`peerDependencies.openclaw: ">=X"` (with `peerDependenciesMeta.openclaw.optional: true`) is the convention.

## Entry contract

`defineBundledChannelEntry()` returns a `BundledChannelEntryContract`. Its required options:

```ts
{
  id: string;
  name: string;
  description: string;
  importMetaUrl: string;            // pass `import.meta.url`
  plugin: { specifier: string; exportName?: string };  // points to channel-plugin.ts module
  // Optional:
  secrets?:  { specifier: string; exportName?: string };
  runtime?:  { specifier: string; exportName?: string };
  configSchema?: ChannelConfigSchema | (() => ChannelConfigSchema);
  registerCliMetadata?: (api) => void;
  registerFull?:        (api) => void;
}
```

The host calls the entry's lazy `loadChannelPlugin()` to load the actual `ChannelPlugin` from `plugin.specifier` at runtime. Inside `register(api)` (or `registerFull`), the plugin calls `api.registerChannel(channelPlugin)` to wire itself into the host.

## ChannelPlugin shape (verified)

From `dist/plugin-sdk/src/channels/plugins/types.plugin.d.ts`:

```ts
type ChannelPlugin<ResolvedAccount = any> = {
  id: ChannelId;                         // required
  meta: ChannelMeta;                     // required (label, blurb, docsPath, ...)
  capabilities: ChannelCapabilities;     // required (chatTypes, media?, threads?, ...)
  config: ChannelConfigAdapter<ResolvedAccount>;  // required

  // Optional, ~25 adapters — pull in only those you need:
  configSchema?:  ChannelConfigSchema;
  setup?:         ChannelSetupAdapter;
  outbound?:      ChannelOutboundAdapter;
  gateway?:       ChannelGatewayAdapter<ResolvedAccount>;
  messaging?:     ChannelMessagingAdapter;
  threading?:     ChannelThreadingAdapter;
  mentions?:      ChannelMentionAdapter;
  secrets?:       ChannelSecretsAdapter;
  status?:        ChannelStatusAdapter;
  doctor?:        ChannelDoctorAdapter;
  // ...auth, lifecycle, commands, agentTools, etc.
};
```

### Required adapters

- **`config.listAccountIds(cfg)`** — list configured account IDs from the host config.
- **`config.resolveAccount(cfg, accountId?)`** — return a `ResolvedAccount` (your channel's typed account object) from raw config.
- (Optional but practically required) **`config.isConfigured(account, cfg)`** — does the account have working creds?
- (Optional but practically required) **`config.describeAccount(...)`** → `ChannelAccountSnapshot` for the host UI.

### Capabilities (`ChannelCapabilities`)

```ts
{
  chatTypes: Array<ChatType | "thread">;   // e.g., ["dm", "group", "thread"]
  media?: boolean;
  reactions?: boolean;
  edit?: boolean;
  unsend?: boolean;
  reply?: boolean;
  threads?: boolean;
  // ...
}
```

For Bluesky: `["dm", "thread"]`, `media: true`, `reactions: true` (likes), `unsend: true` (deletePost), `reply: true`, `threads: true`.

### Outbound (`ChannelOutboundAdapter`)

`deliveryMode: "direct" | "gateway" | "hybrid"` — Bluesky is `"direct"` (HTTPS API, no persistent connection needed).

The actual send callbacks live at the **bottom** of the `ChannelOutboundAdapter` shape (`outbound.types.d.ts` lines 154–161) — they are easy to miss because the type opens with ~150 lines of optional lifecycle hooks (`beforeDeliverPayload`, `renderPresentation`, etc.) before the dispatch hooks themselves. The send hooks:

```ts
sendPayload?:        (ctx: ChannelOutboundPayloadContext)   => Promise<OutboundDeliveryResult>;
sendFormattedText?:  (ctx: ChannelOutboundFormattedContext) => Promise<OutboundDeliveryResult[]>;
sendFormattedMedia?: (ctx: ...)                              => Promise<OutboundDeliveryResult>;
sendText?:           (ctx: ChannelOutboundContext)           => Promise<OutboundDeliveryResult>;
sendMedia?:          (ctx: ChannelOutboundContext)           => Promise<OutboundDeliveryResult>;
sendPoll?:           (ctx: ChannelPollContext)               => Promise<ChannelPollResult>;
```

For a `direct`-mode channel, implementing `sendText` (and optionally `sendFormattedText` for chunked outputs and `sendMedia` for image embeds) is sufficient. `OutboundDeliveryResult` requires `channel` and `messageId`; everything else is optional metadata.

### Gateway (`ChannelGatewayAdapter`)

Per-account lifecycle: `startAccount(ctx)` and `stopAccount(ctx)`. `ctx` includes `cfg`, `accountId`, `account`, `runtime`, `abortSignal`, `log`, and (for external plugins) an optional `channelRuntime` surface with helpers like `reply()` to dispatch inbound messages back into the agent loop. For Bluesky the gateway is the notification poller (`app.bsky.notification.listNotifications`) — Jetstream firehose is a future option but overkill for a single-account use case.

## Manifest (`openclaw.plugin.json`)

Top-level structure (paraphrased from Discord, full schema discoverable from upstream):

```jsonc
{
  "id": "bluesky",
  "channels": ["bluesky"],
  "channelEnvVars": {
    "bluesky": ["BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD"]
  },
  "channelConfigs": {
    "bluesky": {
      "schema": { /* JSON Schema Draft 7 */ }
    }
  },
  "activation": { "onStartup": false }
}
```

Discord's full manifest is 3,400+ lines — most of it is the JSON Schema for its config. Bluesky's will be smaller (handle + app-password is most of the surface area).

## Secrets resolution: env / file / exec

Secret-bearing fields in `channelConfigs.<id>.schema` accept either a literal string or a three-source ref:

```jsonc
{
  "appPassword": {
    "anyOf": [
      { "type": "string" },
      {
        "oneOf": [
          { "source": "env",  "provider": "openclaw", "id": "BLUESKY_APP_PASSWORD" },
          { "source": "file", "provider": "openclaw", "id": "/path/to/secret" },
          { "source": "exec", "provider": "openclaw", "id": "secret-tool lookup ..." }
        ]
      }
    ]
  }
}
```

The exec source is what makes gnome-keyring / macOS Keychain resolution clean — the user can point it at `secret-tool lookup service openclaw origin bluesky type app-password handle <H>` and the runtime invokes it on load.

## Build / packaging

- ESM (`"type": "module"`).
- TS source in `src/`, compiled JS in `dist/`. Discord uses `tsc` (no bundler — the plugin runs in the host's Node context with shared deps).
- `files` allowlist in `package.json` should be `["dist/**", "openclaw.plugin.json"]`.

## Gotchas discovered during implementation

- **Entry helpers are at a sub-path, not the barrel.** `defineBundledChannelEntry` lives at `openclaw/plugin-sdk/channel-entry-contract`. Importing from `openclaw/plugin-sdk` (the main barrel) fails at runtime even though TypeScript's structural typing makes it look fine.
- **`ChannelPlugin` type is not in the public exports.** External plugins build the plugin object structurally and rely on the host's `loadChannelPlugin()` for validation. Don't try to annotate your plugin object with `ChannelPlugin<T>` from a public path — there isn't one.
- **Top-level `configSchema` is required by the manifest validator** — even an empty `{ "type": "object", "additionalProperties": false, "properties": {} }` works. Without it, `openclaw plugins install` fails with `Config validation failed: plugins: plugin: plugin manifest requires configSchema`.
- **The runtime secret resolver exports the batch form, not the singular.** `openclaw/plugin-sdk/runtime-secret-resolution` exports `resolveSecretRefValues(refs[], opts) → Map`. The d.ts also declares `resolveSecretRefString(ref, opts) → string`, but it isn't actually re-exported. Use the batch form and pull your single value out of the returned Map.
- **Exported types from the entry helpers need explicit annotation.** `tsc` emits `error TS2742: The inferred type of 'default' cannot be named without a reference to ...types.plugin'` unless you annotate the entry export with `BundledChannelEntryContract` / `BundledChannelSetupEntryContract`. The types are non-portable because they reference internal paths.

## File index

| What | Where |
| --- | --- |
| `defineBundledChannelEntry` | `openclaw/plugin-sdk/channel-entry-contract` (built: `dist/plugin-sdk/channel-entry-contract.js`) |
| `resolveSecretRefValues` | `openclaw/plugin-sdk/runtime-secret-resolution` |
| `ChannelPlugin` type | `dist/plugin-sdk/src/channels/plugins/types.plugin.d.ts` |
| Adapter types | `dist/plugin-sdk/src/channels/plugins/types.adapters.d.ts` |
| Outbound types | `dist/plugin-sdk/src/channels/plugins/outbound.types.d.ts` |
| Core types (Meta, Capabilities) | `dist/plugin-sdk/src/channels/plugins/types.core.d.ts` |
| Config schema types | `dist/plugin-sdk/src/channels/plugins/types.config.d.ts` |
| Discord plugin (working reference) | `node_modules/@openclaw/discord/` |
| Official docs | <https://docs.openclaw.ai/tools/plugin> |
