"""For each act, search YouTube and keep the first result whose title or channel names it."""
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

def search(line):
    artist, query, key = line.rstrip("\n").split("\t")
    out = subprocess.run(["yt-dlp", "--flat-playlist", "--no-warnings", "-j", f"ytsearch5:{query}"],
                         capture_output=True, text=True, timeout=120).stdout
    rows = [json.loads(l) for l in out.splitlines() if l.strip()]
    hits = [r for r in rows if key.lower() in f"{r.get('title','')} {r.get('channel') or ''}".lower()
            and 30 < (r.get("duration") or 0) < 3 * 3600]
    r = hits[0] if hits else None
    return {"artist": artist, "ok": bool(r), "id": r and r["id"], "title": r and r["title"],
            "channel": r and r.get("channel"), "dur": r and r.get("duration"),
            "cands": [f"{x.get('title')} [{x.get('channel')}]" for x in rows][:5]}

lines = open(sys.argv[1]).readlines()
with ThreadPoolExecutor(8) as ex:
    res = list(ex.map(search, lines))
with open(sys.argv[2], "w") as f:
    for r in res: f.write(json.dumps(r, ensure_ascii=False) + "\n")
for r in res:
    print("OK " if r["ok"] else "-- ", r["artist"][:38].ljust(38), "|", f'{r["title"]} [{r["channel"]}]' if r["ok"] else r["cands"])
