# bsky — standalone Bluesky CLI

A small Python CLI for posting to and reading from Bluesky, built on the [`atproto`](https://atproto.blue/) SDK. Works without OpenClaw — handy for scripts, cron jobs, or agent shell calls.

## Install (Linux)

Prereqs: Python 3.10+, `libsecret-tools` (`secret-tool` command).

```bash
git clone https://github.com/8bitAlex/openclaw-bluesky.git
cd openclaw-bluesky
./cli/install.sh
```

The installer creates a venv at `~/.local/share/openclaw-bluesky/`, prompts for your handle and an [app password](https://bsky.app/settings/app-passwords), stores them in gnome-keyring, and drops a `bsky` launcher into `~/.local/bin/`.

> macOS is on the roadmap (Keychain via `security`). Until then, run `cli/bsky.py` directly inside its venv and supply creds via env vars (PRs welcome).

## Usage

```
bsky whoami                       # show authenticated account
bsky post "hello world"           # post (auto-detects URLs, #tags, @mentions)
bsky post --dry-run "preview"     # show text + facets, do not post
bsky post -                       # read post text from stdin
bsky timeline [--limit N] [--uris]
bsky notifs   [--limit N]
bsky reply <post-uri> "text"
bsky like   <post-uri>
bsky delete <post-uri>
bsky raw                          # JSON dump of authed profile
```

## Rich text (facets)

URLs, hashtags, and mentions are auto-detected and converted to AT-Proto rich-text facets with correct UTF-8 byte offsets — meaning emoji and non-ASCII text don't break offsets, and links/tags/mentions are clickable in any client (not only the official Bluesky web app).

Mention handles must include a dot (AT-Proto requirement). Mentions that fail to resolve to a DID are silently dropped — the post still sends, just without that mention being clickable.

## Where things live

```
~/.local/share/openclaw-bluesky/
├── venv/             # virtualenv with atproto SDK
├── bsky.py           # the CLI
├── _facets.py        # facet extraction
└── session.txt       # cached session string (mode 600), refreshed on 401
```

Creds live in gnome-keyring, never on disk:

```
service  = openclaw
origin   = bluesky
type     = app-password | handle
handle   = your.handle
```

## Uninstall

```bash
rm ~/.local/bin/bsky
rm -rf ~/.local/share/openclaw-bluesky
secret-tool clear service openclaw origin bluesky type app-password
secret-tool clear service openclaw origin bluesky type handle
```

## CLI vs plugin features

The standalone CLI is intentionally minimal — text posting, replies, likes, deletes, timeline/notification reads. The richer surface (image embeds, quote posts, OpenGraph link cards, `recordWithMedia` combos, AT-Proto-aware retry, multi-account routing) lives in the OpenClaw plugin under [`../plugin/`](../plugin/), which agents can drive via the standard `message` tool. Both share the same facet-extraction logic for clickable URLs, hashtags, and mentions.

## CLI limitations

Not yet supported in the CLI: image/video uploads, external link cards, quote posts, custom feeds, list management, repost. See the project [roadmap](../docs/ARCHITECTURE.md). PRs welcome — the plugin's TypeScript implementation has byte-equivalent facet logic and reference patterns for blob uploads.
