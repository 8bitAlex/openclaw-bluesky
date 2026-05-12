"""Rich-text facet extraction for Bluesky posts.

Facets are byte-offset annotations on post text. Bluesky uses UTF-8 byte
offsets, not character offsets — emoji and non-ASCII break naive char counts.
Detects URLs, hashtags, and mentions, then resolves mention handles to DIDs.

Owned URLs (raidcli.dev by default) get UTM params appended to their facet
href while the display text stays as the original short URL — Bluesky link
facets allow display text != link target.
"""
from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

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


def _owned_domains() -> set[str]:
    raw = os.environ.get("BSKY_UTM_DOMAINS", "raidcli.dev")
    return {d.strip().lower().removeprefix("www.") for d in raw.split(",") if d.strip()}


def _apply_utms(url: str, utms: dict[str, str]) -> str:
    """If `url`'s host is in owned domains, merge `utms` into its query (existing wins)."""
    if not utms:
        return url
    parts = urlsplit(url)
    host = (parts.hostname or "").lower().removeprefix("www.")
    if host not in _owned_domains():
        return url
    existing = dict(parse_qsl(parts.query, keep_blank_values=True))
    for k, v in utms.items():
        existing.setdefault(k, v)  # don't clobber author-supplied utm_*
    new_query = urlencode(existing, doseq=True)
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", new_query, parts.fragment))


def _bare_domain_re(domains: set[str]) -> re.Pattern | None:
    """Build a regex that matches bare owned domains (no scheme) as a 'word'.

    `raidcli.dev`, `raidcli.dev/path`, `raidcli.dev/path?query` — all match.
    Existing https://... URLs are caught by URL_RE first; we skip overlapping
    spans in extract_facets so we don't double-facet.
    """
    if not domains:
        return None
    parts = "|".join(re.escape(d) for d in sorted(domains, key=len, reverse=True))
    # Boundary: start-of-string or whitespace/punctuation, NOT preceded by // or @
    return re.compile(
        rf"(?:^|(?<=[\s(\[,]))(?P<host>{parts})(?P<path>/[^\s<>]*)?",
        re.IGNORECASE,
    )


def extract_facets(client: Any, text: str, utms: dict[str, str] | None = None) -> list[dict]:
    """Return list of facet dicts for the given post text.

    Mentions that fail to resolve are silently dropped (post still sends as
    plain text for that span). URLs and hashtags never need network calls.

    If `utms` is provided, link facets pointing at owned domains (see
    BSKY_UTM_DOMAINS env, default raidcli.dev) have their href rewritten
    with the UTM params. Display text and byte indices stay untouched —
    only the facet's link target changes.
    """
    facets: list[dict] = []
    utms = utms or {}

    covered: list[tuple[int, int]] = []  # char-offset spans already faceted

    for m in URL_RE.finditer(text):
        raw = m.group(0)
        trimmed = _trim_url(raw)
        if not trimmed:
            continue
        start = m.start()
        end = start + len(trimmed)
        covered.append((start, end))
        bs, be = _byte_span(text, start, end)
        href = _apply_utms(trimmed, utms)
        facets.append({
            "index": {"byteStart": bs, "byteEnd": be},
            "features": [{"$type": "app.bsky.richtext.facet#link", "uri": href}],
        })

    # Second pass: bare owned-domain mentions (e.g. "raidcli.dev") that didn't
    # already match an https:// URL. Always produce a facet for these — the
    # display text stays bare, the facet href gets https:// + UTMs.
    bare_re = _bare_domain_re(_owned_domains())
    if bare_re:
        for m in bare_re.finditer(text):
            start = m.start("host")
            end = m.end()
            if any(s <= start < e or s < end <= e for s, e in covered):
                continue
            span_text = text[start:end]
            trimmed_span = _trim_url(span_text)
            if not trimmed_span:
                continue
            end = start + len(trimmed_span)
            bs, be = _byte_span(text, start, end)
            href = _apply_utms(f"https://{trimmed_span}", utms)
            covered.append((start, end))
            facets.append({
                "index": {"byteStart": bs, "byteEnd": be},
                "features": [{"$type": "app.bsky.richtext.facet#link", "uri": href}],
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
