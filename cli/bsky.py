#!/usr/bin/env python3
"""Local Bluesky CLI prototype for openclaw-bluesky.

Reads credentials from gnome-keyring under service=openclaw origin=bluesky.
Caches session string at ~/.local/share/openclaw/bluesky/session.txt to skip
re-login on every invocation.
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from atproto import Client, models

sys.path.insert(0, str(Path(__file__).parent))
from _facets import extract_facets  # noqa: E402

STATE_DIR = Path.home() / ".local/share/openclaw/bluesky"
SESSION_FILE = STATE_DIR / "session.txt"
POSTS_LOG = STATE_DIR / "posts.jsonl"


def _build_utms(medium: str, campaign: str | None, content: str | None) -> dict[str, str]:
    """Per-post UTM params. utm_content is a unique 8-char slug we log alongside
    the resulting post URI so PostHog clicks can be correlated back to the post.
    """
    source = os.environ.get("BSKY_UTM_SOURCE", "bluesky")
    return {
        "utm_source": source,
        "utm_medium": medium,
        "utm_campaign": campaign or os.environ.get("BSKY_UTM_CAMPAIGN", "organic"),
        "utm_content": content or secrets.token_urlsafe(6),
    }


def _log_post(post_uri: str, utms: dict[str, str], text: str, tagged_urls: list[str]) -> None:
    """Append a one-line JSON record so we can correlate Bluesky post URIs with
    utm_content slugs later (PostHog only sees the slug; we need this side-table
    to know which post drove which click).
    """
    POSTS_LOG.parent.mkdir(parents=True, exist_ok=True)
    rec = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "post_uri": post_uri,
        "utm": utms,
        "tagged_urls": tagged_urls,
        "text": text,
    }
    with POSTS_LOG.open("a") as f:
        f.write(json.dumps(rec) + "\n")


def keyring_lookup(**attrs: str) -> str:
    args = ["secret-tool", "lookup"]
    for k, v in attrs.items():
        args += [k, v]
    out = subprocess.run(args, capture_output=True, text=True, check=True)
    return out.stdout.strip()


def get_creds() -> tuple[str, str]:
    handle = keyring_lookup(service="openclaw", origin="bluesky", type="handle")
    app_pw = keyring_lookup(
        service="openclaw", origin="bluesky", type="app-password", handle=handle
    )
    return handle, app_pw


def get_client() -> Client:
    client = Client()
    if SESSION_FILE.exists():
        try:
            client.login(session_string=SESSION_FILE.read_text().strip())
            return client
        except Exception:
            SESSION_FILE.unlink(missing_ok=True)
    handle, app_pw = get_creds()
    client.login(handle, app_pw)
    SESSION_FILE.write_text(client.export_session_string())
    SESSION_FILE.chmod(0o600)
    return client


def fmt_time(iso: str) -> str:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone()
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return iso


def cmd_whoami(_args: argparse.Namespace) -> int:
    client = get_client()
    profile = client.get_profile(client.me.did)
    print(f"@{profile.handle}  ({profile.display_name or '—'})")
    print(f"  did:        {profile.did}")
    print(f"  followers:  {profile.followers_count}")
    print(f"  following:  {profile.follows_count}")
    print(f"  posts:      {profile.posts_count}")
    return 0


def _build_facets(client: Client, text: str, utms: dict[str, str] | None = None) -> list:
    raw = extract_facets(client, text, utms=utms)
    return [models.AppBskyRichtextFacet.Main(**f) for f in raw] if raw else None


def _tagged_urls(facets_raw: list[dict]) -> list[str]:
    """Return link-facet URIs that actually got UTMs applied (so the log
    only records URLs the rewrite touched, not every link in the post)."""
    out = []
    for f in facets_raw or []:
        for feat in f.get("features") or []:
            uri = feat.get("uri", "")
            if "utm_source=" in uri:
                out.append(uri)
    return out


def cmd_post(args: argparse.Namespace) -> int:
    client = get_client()
    text = args.text if args.text != "-" else sys.stdin.read().rstrip()
    if not text.strip():
        print("error: empty post", file=sys.stderr)
        return 1
    utms = None if args.no_utm else _build_utms("post", args.campaign, None)
    facets_raw = extract_facets(client, text, utms=utms)
    if args.dry_run:
        print("--- DRY RUN (would post) ---")
        print(text)
        print(f"--- utms --- {utms or '(disabled)'}")
        print("--- facets ---")
        for f in facets_raw:
            feat = f["features"][0]
            kind = feat["$type"].split("#")[-1]
            span = text.encode("utf-8")[f["index"]["byteStart"]:f["index"]["byteEnd"]].decode("utf-8")
            target = feat.get("uri") or feat.get("tag") or feat.get("did")
            print(f"  [{kind:7}] '{span}' -> {target}")
        if not facets_raw:
            print("  (none)")
        return 0
    facets = [models.AppBskyRichtextFacet.Main(**f) for f in facets_raw] if facets_raw else None
    res = client.send_post(text=text, facets=facets)
    print(f"posted: {res.uri}")
    print(f"  cid:  {res.cid}")
    web_id = res.uri.rsplit("/", 1)[-1]
    handle = client.me.handle if hasattr(client.me, "handle") else None
    if handle:
        print(f"  url:  https://bsky.app/profile/{handle}/post/{web_id}")
    if utms:
        tagged = _tagged_urls(facets_raw)
        if tagged:
            _log_post(res.uri, utms, text, tagged)
            print(f"  utm:  content={utms['utm_content']} medium={utms['utm_medium']} campaign={utms['utm_campaign']} (logged to posts.jsonl)")
    return 0


def cmd_delete(args: argparse.Namespace) -> int:
    client = get_client()
    client.delete_post(args.uri)
    print(f"deleted: {args.uri}")
    return 0


def cmd_timeline(args: argparse.Namespace) -> int:
    client = get_client()
    feed = client.get_timeline(limit=args.limit).feed
    for item in feed:
        post = item.post
        author = post.author
        text = (post.record.text or "").replace("\n", " ⏎ ")
        if len(text) > 200:
            text = text[:200] + "…"
        print(f"[{fmt_time(post.indexed_at)}] @{author.handle}: {text}")
        if args.uris:
            print(f"    {post.uri}")
    return 0


def cmd_notifs(args: argparse.Namespace) -> int:
    client = get_client()
    res = client.app.bsky.notification.list_notifications({"limit": args.limit})
    for n in res.notifications:
        marker = "•" if not n.is_read else " "
        text = ""
        if hasattr(n.record, "text") and n.record.text:
            text = n.record.text.replace("\n", " ⏎ ")
            if len(text) > 120:
                text = text[:120] + "…"
        print(
            f"{marker} [{fmt_time(n.indexed_at)}] {n.reason:<10} @{n.author.handle}"
            + (f": {text}" if text else "")
        )
    return 0


def cmd_reply(args: argparse.Namespace) -> int:
    client = get_client()
    parent = client.get_posts([args.uri]).posts[0]
    root_ref = parent.record.reply.root if getattr(parent.record, "reply", None) else {
        "uri": parent.uri,
        "cid": parent.cid,
    }
    if isinstance(root_ref, dict):
        root = {"uri": root_ref["uri"], "cid": root_ref["cid"]}
    else:
        root = {"uri": root_ref.uri, "cid": root_ref.cid}
    reply_to = {
        "root": root,
        "parent": {"uri": parent.uri, "cid": parent.cid},
    }
    utms = None if args.no_utm else _build_utms("reply", args.campaign, None)
    facets_raw = extract_facets(client, args.text, utms=utms)
    facets = [models.AppBskyRichtextFacet.Main(**f) for f in facets_raw] if facets_raw else None
    res = client.send_post(text=args.text, reply_to=reply_to, facets=facets)
    print(f"replied: {res.uri}")
    if utms:
        tagged = _tagged_urls(facets_raw)
        if tagged:
            _log_post(res.uri, utms, args.text, tagged)
            print(f"  utm:  content={utms['utm_content']} medium=reply campaign={utms['utm_campaign']} (logged to posts.jsonl)")
    return 0


def cmd_like(args: argparse.Namespace) -> int:
    client = get_client()
    post = client.get_posts([args.uri]).posts[0]
    res = client.like(uri=post.uri, cid=post.cid)
    print(f"liked: {res.uri}")
    return 0


def cmd_raw(args: argparse.Namespace) -> int:
    """Dump current authed session info as JSON. Useful for debugging."""
    client = get_client()
    profile = client.get_profile(client.me.did)
    print(json.dumps(profile.model_dump(), indent=2, default=str))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(prog="bsky", description="Bluesky CLI (openclaw-bluesky prototype)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("whoami").set_defaults(func=cmd_whoami)

    sp = sub.add_parser("post", help="create a post (use - for stdin)")
    sp.add_argument("text")
    sp.add_argument("--dry-run", action="store_true", help="print text + facets, do not post")
    sp.add_argument("--campaign", help="utm_campaign value (default: $BSKY_UTM_CAMPAIGN or 'organic')")
    sp.add_argument("--no-utm", action="store_true", help="post URLs raw, skip UTM rewrite + ledger entry")
    sp.set_defaults(func=cmd_post)

    sp = sub.add_parser("delete", help="delete a post by URI")
    sp.add_argument("uri")
    sp.set_defaults(func=cmd_delete)

    sp = sub.add_parser("timeline", help="read home timeline")
    sp.add_argument("--limit", type=int, default=20)
    sp.add_argument("--uris", action="store_true", help="show post URIs")
    sp.set_defaults(func=cmd_timeline)

    sp = sub.add_parser("notifs", help="list notifications")
    sp.add_argument("--limit", type=int, default=20)
    sp.set_defaults(func=cmd_notifs)

    sp = sub.add_parser("reply", help="reply to a post URI")
    sp.add_argument("uri")
    sp.add_argument("text")
    sp.add_argument("--campaign", help="utm_campaign value (default: $BSKY_UTM_CAMPAIGN or 'organic')")
    sp.add_argument("--no-utm", action="store_true", help="post URLs raw, skip UTM rewrite + ledger entry")
    sp.set_defaults(func=cmd_reply)

    sp = sub.add_parser("like", help="like a post URI")
    sp.add_argument("uri")
    sp.set_defaults(func=cmd_like)

    sub.add_parser("raw").set_defaults(func=cmd_raw)

    args = p.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
