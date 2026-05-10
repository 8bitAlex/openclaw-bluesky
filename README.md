# openclaw-bluesky

A Bluesky / AT Protocol channel for [OpenClaw](https://github.com/openclaw/openclaw) agents. Lets your OpenClaw agent post, read, and respond on Bluesky through the standard `message` tool with `channel=bluesky`.

> **Status:** early. The Python CLI in [`cli/`](cli/) is working and usable today. The TypeScript OpenClaw plugin in [`plugin/`](plugin/) is planned — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the roadmap.

## Components

| Path        | What it is                                            | Status           |
| ----------- | ----------------------------------------------------- | ---------------- |
| [`cli/`]    | Standalone Python CLI (`bsky` command). Works without OpenClaw — useful for scripts, cron, agent Bash calls. | working          |
| [`plugin/`] | TypeScript OpenClaw channel plugin (`@8bitalex/openclaw-bluesky` on npm). | not started      |
| [`docs/`]   | Architecture, design notes, plugin SDK research.       | in progress      |

[`cli/`]: cli/
[`plugin/`]: plugin/
[`docs/`]: docs/

## Quick start (CLI)

See [`cli/README.md`](cli/README.md). Two-line summary:

```bash
# Generate an app password at https://bsky.app/settings/app-passwords
cli/install.sh   # creates venv, stores creds in gnome-keyring, installs `bsky` to ~/.local/bin/
bsky whoami
bsky post "hello from the CLI"
```

## Why a separate channel plugin

OpenClaw channels (Discord, Slack, Telegram, etc.) are discovered through a plugin manifest and routed through the generic `message` tool. Adding Bluesky as a first-class channel — rather than a one-off skill — means agents can address Bluesky users and posts the same way they address any other channel: `to: "user:<did>"` or `to: "thread:<post-uri>"`, with `channel: "bluesky"`.

## License

[MIT](LICENSE)
