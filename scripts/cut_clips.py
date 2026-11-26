"""Cut a 5-second clip from each act's chosen video into london-jazz-blues/public/clips/<slug>.mp4."""
import json, re, subprocess, sys, unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

FF = "/Applications/Jellyfin.app/Contents/MacOS"
OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
TMP = Path(sys.argv[3]); TMP.mkdir(parents=True, exist_ok=True)
SKIP = {"Motown Memoirs", "Megan Cleasby", "Buena Vista Live — Sunday Lunch", "Sunday Jazz Jam"}

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]

def cut(r):
    if not r["ok"] or r["artist"] in SKIP: return r["artist"], None
    dur = r["dur"] or 120
    start = int(min(max(dur * 0.3, 20), dur - 10))
    raw = TMP / f"{r['id']}.mp4"
    dest = OUT / f"{slug(r['artist'])}.mp4"
    if not dest.exists():
        subprocess.run(["yt-dlp", "-q", "--no-warnings", "--ffmpeg-location", FF,
                        "-f", "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]/b",
                        "--download-sections", f"*{start}-{start+6}", "--force-keyframes-at-cuts",
                        "-o", str(raw), f"https://www.youtube.com/watch?v={r['id']}"],
                       capture_output=True, timeout=300)
        if not raw.exists(): return r["artist"], None
        subprocess.run([f"{FF}/ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-t", "5",
                        "-vf", "scale=-2:720", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
                        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(dest)],
                       capture_output=True, timeout=300)
        raw.unlink(missing_ok=True)
    return r["artist"], (f"clips/{dest.name}" if dest.exists() else None)

rows = [json.loads(l) for f in sys.argv[1].split(",") for l in open(f)]
best = {}
for r in rows: best[r["artist"]] = r  # later files (retries) win
with ThreadPoolExecutor(6) as ex:
    res = dict(ex.map(cut, best.values()))
Path(sys.argv[4]).write_text(json.dumps({**{a: v for a, v in res.items() if v},
    "_sources": {a: f"https://www.youtube.com/watch?v={best[a]['id']}" for a, v in res.items() if v}}, indent=1, ensure_ascii=False))
print(sum(1 for v in res.values() if v), "clips;", "missing:", [a for a, v in res.items() if not v])
