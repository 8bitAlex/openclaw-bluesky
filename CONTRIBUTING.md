# Contributing

Thanks for your interest. This project is in its early phase — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the roadmap and where help is wanted.

## Working areas

- **`cli/`** — Python CLI. `atproto` SDK. Open to features (delete, repost, search, list-feeds, custom-feeds, video upload).
- **`plugin/`** — TypeScript OpenClaw plugin. Not started; needs the channel-adapter shape figured out from upstream OpenClaw source first.
- **`docs/`** — design notes, plugin research, protocol references.

## Ground rules

- One concern per PR. Easier to review, easier to revert.
- No secrets in commits. Local creds belong in your OS keyring (Linux: gnome-keyring via `secret-tool`; macOS: Keychain). The CLI's `install.sh` shows the pattern.
- Match the existing style. Python: ruff defaults. TypeScript: whatever the plugin scaffolding lands on.
- Open an issue first for anything bigger than a bug fix or small feature, so we can agree on shape before you spend time.

## Reporting bugs

Include: OS, Python (or Node) version, the command that failed, the full traceback. If it's a posting bug, include the post text — facets are byte-offset-sensitive and emoji is a common edge case.
