# Changelog

All notable changes to this project will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project loosely follows [Semantic Versioning](https://semver.org/) once it ships a `1.0.0`.

## [Unreleased]

### Added

- **Plugin (`@8bitalex/openclaw-bluesky`)** — TypeScript OpenClaw channel plugin that registers as `channel: "bluesky"` and lets agents post, reply, and receive notifications via the standard `message` tool.
  - `outbound.sendText` / `sendFormattedText` / `sendMedia` with rich-text facets (URLs, hashtags, mentions resolved to DIDs).
  - `outbound.resolveTarget` accepting bare handles, `@handle`, `user:handle`, `did:plc:...`, and `at://` post URIs.
  - `gateway.startAccount` / `stopAccount` notification poller (mention/reply/quote) feeding `ctx.channelRuntime.reply`.
  - `setup.applyAccountConfig` for `openclaw channels add bluesky`.
  - `status.probeAccount` / `buildChannelSummary` exposing handle, DID, follower/following/post counts.
  - `doctor.collectPreviewWarnings` flagging malformed handles and literal app passwords.
  - Image embeds via blob upload (4 per post, 1 MB each, JPEG/PNG/WebP/GIF, alt text).
  - Secret resolution via env / file / exec, using the host's `runtime-secret-resolution` when available with a native local fallback.
  - 42 vitest tests covering facets, target resolution, media validation, setup, and doctor warnings.
- **Standalone Python CLI (`cli/bsky`)** — `whoami`, `post` (with `--dry-run`), `timeline`, `notifs`, `reply`, `like`, `delete`, `raw` subcommands. UTF-8-correct rich-text facets matching the plugin's output. Creds in gnome-keyring under `service=openclaw origin=bluesky`.
- **GitHub Actions CI** — matrix builds plugin (Node 20/22) and CLI (Python 3.10/3.12) on push and PR.
- **Docs** — `README.md`, `docs/ARCHITECTURE.md`, `docs/PLUGIN_SDK.md`, `cli/README.md`, `plugin/README.md`, `CONTRIBUTING.md`.
