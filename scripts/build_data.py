"""Merge scraped listings into public/data/events.json and pull each photo local.

Usage: python3 -I scripts/build_data.py RAW_DIR [RAW_DIR ...]
Each RAW_DIR/*.json is an array of gigs (artist, venue, area, address, start,
url, image, image_kind, genre, blurb, sold_out). Images are downloaded once,
resized to 1800px on the long side with macOS `sips`, and served from
public/images so the site never depends on a venue's hotlink rules.
"""

import hashlib
import json
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "public" / "images"
OUT = ROOT / "public" / "data" / "events.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36"

VENUES = [
    ("Ronnie Scott's", "Soho", "https://www.ronniescotts.co.uk/"),
    ("606 Club", "Chelsea", "https://www.606club.co.uk/events/"),
    ("Vortex Jazz Club", "Dalston", "https://www.vortexjazz.co.uk/events/"),
    ("Pizza Express Live", "Soho, Holborn, Chelsea & Leicester Square", "https://www.pizzaexpresslive.com/whats-on"),
    ("Spice of Life", "Soho", "https://www.spiceoflifesoho.com/"),
    ("The Blues Kitchen", "Shoreditch, Camden & Brixton", "https://theblueskitchen.com/"),
    ("The Jazz Cafe", "Camden", "https://thejazzcafe.com/"),
]


def fetch_image(url: str) -> str | None:
    name = hashlib.sha1(url.encode()).hexdigest()[:12] + ".jpg"
    dest = IMAGES / name
    if dest.exists():
        return f"images/{name}"
    tmp = dest.with_suffix(".download")
    try:
        if url.startswith("/"):  # a file already saved during scraping
            tmp.write_bytes(Path(url).read_bytes())
        else:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*"})
            with urllib.request.urlopen(req, timeout=30) as r:
                if not r.headers.get("Content-Type", "").startswith("image/"):
                    return None
                tmp.write_bytes(r.read())
        subprocess.run(
            ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "78", "-Z", "1800", str(tmp), "--out", str(dest)],
            check=True, capture_output=True,
        )
        return f"images/{name}"
    except Exception as e:  # a bad image drops to the venue fallback, not the gig
        print(f"  image failed: {url} ({e})", file=sys.stderr)
        return None
    finally:
        tmp.unlink(missing_ok=True)


def main(dirs: list[str]) -> None:
    IMAGES.mkdir(parents=True, exist_ok=True)
    gigs, seen = [], set()
    for d in dirs:
        for f in sorted(Path(d).glob("*.json")):
            for g in json.loads(f.read_text()):
                key = (g["venue"].lower(), g["start"], g["artist"].lower())
                if key in seen:
                    continue
                seen.add(key)
                gigs.append(g)

    now = datetime.now(timezone.utc)
    gigs = [g for g in gigs if datetime.fromisoformat(g["start"]) > now]
    gigs.sort(key=lambda g: g["start"])

    venue_fallback = {}
    events = []
    for g in gigs:
        local = fetch_image(g["image"]) if g.get("image") else None
        if local and g.get("image_kind") == "venue":
            venue_fallback.setdefault(g["venue"], local)
        events.append({**g, "image": local})
    # 5-second performance clips cut by scripts/cut_clips.py, keyed by act
    clips_file = ROOT / "scripts" / "clips.json"
    clips = json.loads(clips_file.read_text()) if clips_file.exists() else {}
    sources = clips.pop("_sources", {})
    for e in events:
        e["image"] = e["image"] or venue_fallback.get(e["venue"]) or "images/scene.jpg"
        act = re.sub(r" \((Matinee|Evening)\)$", "", e["artist"])
        if act in clips:
            e["clip"], e["clip_source"] = clips[act], sources.get(act)
        e["id"] = hashlib.sha1(f'{e["venue"]}{e["start"]}{e["artist"]}'.encode()).hexdigest()[:8]

    media_file = ROOT / "scripts" / "media.json"
    data = {
        "generated": now.isoformat(),
        "venues": [{"name": n, "area": a, "url": u} for n, a, u in VENUES],
        "media": json.loads(media_file.read_text()) if media_file.exists() else None,
        "events": events,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    print(f"{len(events)} gigs -> {OUT}")


if __name__ == "__main__":
    main(sys.argv[1:])
