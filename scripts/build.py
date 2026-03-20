from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin

import feedparser
import requests
from bs4 import BeautifulSoup

RSS_URL = "https://dennikn.sk/rss"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "docs" / "data" / "articles.json"
USER_AGENT = "Mozilla/5.0 (compatible; DennikNAudioBot/1.0; +https://github.com/)"
MAX_FEED_ITEMS = 120
REQUEST_TIMEOUT = 30

MP3_RE = re.compile(r"https?://[^\s\"'<>]+\.mp3(?:\?[^\s\"'<>]*)?", re.IGNORECASE)
DENNIKN_ARTICLE_RE = re.compile(r"^https://dennikn\.sk/\d+/", re.IGNORECASE)


@dataclass
class ArticleRecord:
    title: str
    url: str
    mp3_url: str
    published: str | None


session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})


def fetch_text(url: str) -> str:
    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.text


def parse_published(value: str | None) -> str | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def extract_main_mp3(html: str, page_url: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")

    # Prefer the explicit article audio source.
    for source in soup.select("audio source[src]"):
        src = source.get("src", "").strip()
        if src and src.lower().endswith(".mp3") and "predplatne.mp3" not in src.lower():
            return urljoin(page_url, src)

    # Then audio[src].
    for audio in soup.select("audio[src]"):
        src = audio.get("src", "").strip()
        if src and src.lower().endswith(".mp3") and "predplatne.mp3" not in src.lower():
            return urljoin(page_url, src)

    # Then raw HTML regex as a fallback.
    for match in MP3_RE.findall(html):
        if "predplatne.mp3" in match.lower():
            continue
        return match

    return None


def iter_feed_entries() -> Iterable[feedparser.FeedParserDict]:
    feed = feedparser.parse(fetch_text(RSS_URL))
    for entry in feed.entries[:MAX_FEED_ITEMS]:
        link = (entry.get("link") or "").strip()
        if not link:
            continue
        if not DENNIKN_ARTICLE_RE.search(link):
            continue
        yield entry


def build_records() -> list[ArticleRecord]:
    records: list[ArticleRecord] = []
    seen_urls: set[str] = set()
    seen_mp3s: set[str] = set()

    for entry in iter_feed_entries():
        url = (entry.get("link") or "").strip()
        title = (entry.get("title") or url).strip()
        if url in seen_urls:
            continue

        try:
            html = fetch_text(url)
            mp3_url = extract_main_mp3(html, url)
        except Exception as exc:
            print(f"Skipping {url}: {exc}")
            continue

        if not mp3_url:
            continue
        if mp3_url in seen_mp3s:
            continue

        record = ArticleRecord(
            title=title,
            url=url,
            mp3_url=mp3_url,
            published=parse_published(entry.get("published") or entry.get("updated")),
        )
        records.append(record)
        seen_urls.add(url)
        seen_mp3s.add(mp3_url)

    records.sort(key=lambda item: item.published or "", reverse=True)
    return records


def write_output(records: list[ArticleRecord]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": RSS_URL,
        "count": len(records),
        "articles": [asdict(record) for record in records],
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    items = build_records()
    write_output(items)
    print(f"Wrote {len(items)} records to {OUTPUT_PATH}")
