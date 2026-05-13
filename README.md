# openclaw-bluesky

A Bluesky / AT Protocol channel for [OpenClaw](https://github.com/openclaw/openclaw) agents. Lets your OpenClaw agent post, read, and respond on Bluesky through the standard `message` tool with `channel=bluesky`.

> **Status:** plugin is end-to-end working — verified against a live OpenClaw host (link-installed, 0 doctor errors, real skeet posted via `outbound.sendText`). Pre-1.0; Phase 8 (npm publish + upstream listing) is the remaining work. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the roadmap.

## Components

| Path | What it is | Status |
| --- | --- | --- |
| [`cli/`](cli/) | Standalone Python CLI (`bsky` command). Works without OpenClaw — useful for scripts, cron, agent Bash calls. | working |
| [`plugin/`](plugin/) | TypeScript OpenClaw channel plugin (`@8bitalex/openclaw-bluesky`). | working, unpublished |
| [`docs/`](docs/) | Architecture, design notes, plugin SDK research. | up to date |
| [`raid.yaml`](raid.yaml) | Dev workflow commands runnable via [raid](https://raidcli.dev). | — |

## Plugin features

Posting (with rich-text facets — URLs, hashtags, mentions resolved to DIDs), threaded replies, image embeds (up to 4 per post), quote posts, external link cards (with OpenGraph fetch + thumbnail), `recordWithMedia` for image+quote combos, notification polling for mentions/replies/quotes, AT-Proto-aware retry with `Retry-After` honoring, secret resolution via env/file/exec (the host's resolver when available, native local fallback otherwise). Setup wizard, status probe, and doctor warnings are wired into the host's CLI.

## Quick start

### Standalone CLI

```bash
git clone https://github.com/8bitAlex/openclaw-bluesky.git
cd openclaw-bluesky
./cli/install.sh             # creates venv, prompts for handle + app password, stores in keyring
bsky whoami
bsky post "hello from the CLI"
```

App passwords come from <https://bsky.app/settings/app-passwords>. See [`cli/README.md`](cli/README.md) for full subcommands.

### OpenClaw plugin (link-install)

```bash
cd plugin && npm install && npm run build
openclaw plugins install --link .
openclaw channels add bluesky \
  --userId you.bsky.social \
  --password xxxx-xxxx-xxxx-xxxx
openclaw doctor              # should report 0 errors
# restart the gateway to load the plugin
```

The plugin then handles `message`-tool calls with `channel: "bluesky"` — see [`plugin/README.md`](plugin/README.md).

### Dev tasks via raid

```bash
raid ci               # typecheck + build + test
raid install-plugin   # build then link-install into local OpenClaw
raid doctor           # openclaw doctor, filtered to bluesky-relevant lines
```

Full command list in [`raid.yaml`](raid.yaml).

## Why a separate channel plugin

OpenClaw channels (Discord, Slack, Telegram, etc.) are discovered through a plugin manifest and routed through the generic `message` tool. Adding Bluesky as a first-class channel — rather than a one-off skill — means agents can address Bluesky users and posts the same way they address any other channel: `to: "user:<handle-or-did>"` or `to: "at://..."` for thread replies, with `channel: "bluesky"`.

## Companion workflow: TweetClaw for X/Twitter

Use this plugin for Bluesky / AT Protocol posts, replies, mentions, and notification polling. Use [TweetClaw](https://github.com/Xquik-dev/tweetclaw) when the same social workflow needs X/Twitter-specific actions or data.

Install the companion OpenClaw plugin:

```bash
openclaw plugins install @xquik/tweetclaw
```

Recommended split:

- Use `message` with `channel: "bluesky"` for Bluesky posts, replies, quote posts, media posts, and inbound notification handling.
- Use TweetClaw's `explore` tool to find the right X/Twitter endpoint for tweet search, reply search, follower export, user lookup, media workflows, monitors, webhooks, DMs, or giveaway draws.
- Use TweetClaw's `tweetclaw` tool only after approval for visible X/Twitter actions such as post tweets, post tweet replies, likes, retweets, follows, DMs, media uploads, monitor creation, webhook changes, or giveaway draws.

Example prompt:

> Publish this update to Bluesky through `channel: "bluesky"`, then use TweetClaw to search tweet replies about the same topic and draft an X post for review.

## License

[MIT](LICENSE)
