"""Rich-text facet extraction for Bluesky posts.

Facets are byte-offset annotations on post text. Bluesky uses UTF-8 byte
offsets, not character offsets — emoji and non-ASCII break naive char counts.
Detects URLs, hashtags, and mentions, then resolves mention handles to DIDs.
"""
from __future__ import annotations

import re
from typing import Any

# Trailing punctuation that should NOT be part of a URL even if regex grabs it.
URL_TRAIL = ".,;:!?)\"']"
URL_RE = re.compile(r"https?://[^\s<>]+", re.IGNORECASE)
# Hashtag: # followed by 1+ unicode word chars (letters/digits/_), no leading digit-only.
TAG_RE = re.compile(r"(?:^|\s)(#[^\s#]*[A-Za-z][^\s#]*)")
# Mention: AT-proto handles must contain a dot.
MENTION_RE = re.compile(r"(?:^|\s)(@[a-zA-Z0-9][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)+)")


def _byte_span(text: str, char_start: int, char_end: int) -> tuple[int, int]:
    """Convert character offsets to UTF-8 byte offsets."""
    bs = len(text[:char_start].encode("utf-8"))
    be = bs + len(text[char_start:char_end].encode("utf-8"))
    return bs, be


def _trim_url(url: str) -> str:
    while url and url[-1] in URL_TRAIL:
        url = url[:-1]
    # Balance trailing ) only if there's an unmatched (
    if url.endswith(")") and url.count("(") < url.count(")"):
        url = url[:-1]
    return url


def extract_facets(client: Any, text: str) -> list[dict]:
    """Return list of facet dicts for the given post text.

    Mentions that fail to resolve are silently dropped (post still sends as
    plain text for that span). URLs and hashtags never need network calls.
    """
    facets: list[dict] = []

    for m in URL_RE.finditer(text):
        raw = m.group(0)
        trimmed = _trim_url(raw)
        if not trimmed:
            continue
        start = m.start()
        end = start + len(trimmed)
        bs, be = _byte_span(text, start, end)
        facets.append({
            "index": {"byteStart": bs, "byteEnd": be},
            "features": [{"$type": "app.bsky.richtext.facet#link", "uri": trimmed}],
        })

    for m in TAG_RE.finditer(text):
        tag_with_hash = m.group(1)
        tag = tag_with_hash[1:]  # strip #
        # Skip purely numeric tags
        if tag.isdigit():
            continue
        start = m.start(1)
        end = start + len(tag_with_hash)
        bs, be = _byte_span(text, start, end)
        facets.append({
            "index": {"byteStart": bs, "byteEnd": be},
            "features": [{"$type": "app.bsky.richtext.facet#tag", "tag": tag}],
        })

    for m in MENTION_RE.finditer(text):
        handle_with_at = m.group(1)
        handle = handle_with_at[1:]
        try:
            did = client.resolve_handle(handle).did
        except Exception:
            continue
        start = m.start(1)
        end = start + len(handle_with_at)
        bs, be = _byte_span(text, start, end)
        facets.append({
            "index": {"byteStart": bs, "byteEnd": be},
            "features": [{"$type": "app.bsky.richtext.facet#mention", "did": did}],
        })

    return facets
