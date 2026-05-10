# Changelog

All notable changes to this project will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project loosely follows [Semantic Versioning](https://semver.org/) once it ships a `1.0.0`.

## [Unreleased]

### Added

- **Plugin (`@8bitalex/openclaw-bluesky`)** — TypeScript OpenClaw channel plugin that registers as `channel: "bluesky"` and lets agents post, reply, and receive notifications via the standard `message` tool.
  - **Outbound** — `sendText`, `sendFormattedText`, `sendMedia` with rich-text facets (URLs, hashtags, mentions resolved to DIDs); 300-char truncation; reply threading via `replyToId`.
  - **Image embeds** — blob upload + `app.bsky.embed.images` (4 per post, 1 MB each, JPEG/PNG/WebP/GIF, alt text). Accepts URLs, file paths, or pre-loaded buffers.
  - **Quote posts** — `app.bsky.embed.record` referencing the parent CID.
  - **External link cards** — `app.bsky.embed.external` with OpenGraph fetch (title, description, image) and optional thumbnail blob upload; gracefully degrades on fetch/upload failure.
  - **`recordWithMedia`** — combines image + quote into `app.bsky.embed.recordWithMedia` (the only Bluesky-supported path for that combo).
  - **`resolveTarget`** — accepts bare handles, `@handle`, `user:handle`, `did:plc:...`, and `at://` post URIs.
  - **Rate-limit handling** — every AT-Proto API call is wrapped in a retry helper that honors `Retry-After` (seconds or HTTP-date), retries 429/500/502/503/504 with capped exponential backoff + ±12.5% jitter, and propagates non-retryable errors (auth, validation) immediately.
  - **Inbound** — `gateway.startAccount` / `stopAccount` polls `app.bsky.notification.listNotifications` every 30s, filters to mention/reply/quote, dispatches via `ctx.channelRuntime.reply`, advances `seenAt`.
  - **Setup wizard** — `setup.applyAccountConfig` for `openclaw channels add bluesky --userId ... --password ...`.
  - **Status probe** — `status.probeAccount` calls `getProfile(self)` and surfaces handle, DID, follower/following/post counts.
  - **Doctor warnings** — `doctor.collectPreviewWarnings` flags malformed handles and literal app passwords not matching the `xxxx-xxxx-xxxx-xxxx` shape.
  - **Secret resolution** — env/file/exec sources, using the host's `runtime-secret-resolution` when available with a native local fallback (`child_process.execFile`, `fs/promises`).
  - **64 vitest tests** across `facets`, `outbound`, `media`, `setup`, `status`, `retry`, `embeds`.
- **Standalone Python CLI (`cli/bsky`)** — `whoami`, `post` (with `--dry-run`), `timeline`, `notifs`, `reply`, `like`, `delete`, `raw` subcommands. UTF-8-correct rich-text facets matching the plugin's output. Creds in gnome-keyring under `service=openclaw origin=bluesky`.
- **GitHub Actions CI** — matrix builds plugin (Node 20/22) and CLI (Python 3.10/3.12) on push and PR.
- **`raid.yaml`** — dev workflow commands runnable via [raid](https://raidcli.dev): `build`, `typecheck`, `test`, `clean`, `ci`, `install-plugin`, `doctor`, `cli-deps`, `cli-smoke`, `cli-install`.
- **Docs** — `README.md`, `docs/ARCHITECTURE.md`, `docs/PLUGIN_SDK.md`, `cli/README.md`, `plugin/README.md`, `CONTRIBUTING.md`.
