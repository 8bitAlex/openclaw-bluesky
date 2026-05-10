# Contributing

Thanks for your interest. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the phased roadmap and current state, and [`docs/PLUGIN_SDK.md`](docs/PLUGIN_SDK.md) for notes on the OpenClaw channel plugin SDK that the TypeScript implementation is built against.

## Working areas

- **`plugin/`** — TypeScript OpenClaw channel plugin (`@8bitalex/openclaw-bluesky`). End-to-end working today — outbound (text, media, quote, external link cards, `recordWithMedia`), notification polling, setup wizard, status probe, doctor warnings, AT-Proto-aware retry. Highest-leverage open work: DM lexicon (`chat.bsky.*`) and video uploads (`app.bsky.embed.video`).
- **`cli/`** — standalone Python CLI on top of the [`atproto`](https://atproto.blue/) SDK. Open to features the plugin already has but the CLI doesn't: image uploads, link cards, quote posts, repost, search, custom feeds.
- **`docs/`** — design notes, plugin research, protocol references.

## Local dev

The repo has a [`raid.yaml`](raid.yaml) ([raid](https://raidcli.dev)) that surfaces common tasks:

```bash
raid ci               # typecheck + build + test (CI parity)
raid test             # vitest run
raid install-plugin   # build then link-install into local OpenClaw
raid doctor           # openclaw doctor, filtered to bluesky lines
```

Or call the underlying tools directly: `cd plugin && npm install && npm test`.

## Ground rules

- **One concern per PR.** Easier to review, easier to revert.
- **No secrets in commits.** Local creds belong in your OS keyring (Linux: gnome-keyring via `secret-tool`; macOS: Keychain). The CLI's `install.sh` shows the pattern.
- **Match existing style.** Python: ruff defaults. TypeScript: strict mode, ESM, two-space indent, no `any` unless explicitly justified at a host-API boundary.
- **Cover changes with tests.** The plugin uses vitest; pure functions (facets, retry, OG parsing, setup, doctor) have full test coverage and new ones should too.
- **Open an issue first** for anything bigger than a bug fix or small feature, so we can agree on shape before you spend time.

## Reporting bugs

Include: OS, Python (or Node) version, the command that failed, the full traceback. If it's a posting bug, include the post text — facets are byte-offset-sensitive and emoji is a common edge case. If it's a plugin bug, include the relevant `channels.bluesky` config block (with secrets redacted) and the output of `openclaw doctor`.
