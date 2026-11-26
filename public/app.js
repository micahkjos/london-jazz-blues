// After Dark: builds the timeline from data/events.json, swaps the background
// to each gig's photo as it scrolls into view, and removes gigs once they start.

const TZ = "Europe/London";
const CHECK_EVERY_MS = 15000;

const fmtTime = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const fmtDay = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long" });
const fmtDate = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "long" });
const fmtShort = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // YYYY-MM-DD

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...kids.filter(Boolean));
  return node;
};

function timeLabel(start, doors) {
  const t = fmtTime.format(start).replace(":00", "").replace(" ", "").toLowerCase();
  return doors ? `doors ${t}` : t;
}

function dayLabel(start, now) {
  const k = dayKey(start);
  if (k === dayKey(now)) return "Tonight";
  if (k === dayKey(new Date(now.getTime() + 864e5))) return "Tomorrow";
  return fmtDay.format(start);
}

function countdown(start, now) {
  const mins = Math.round((start - now) / 60000);
  if (mins < 1) return "Starting now";
  if (mins < 60) return `Starts in ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `In ${h}h ${String(mins % 60).padStart(2, "0")}m`;
  return fmtDate.format(start); // the day label already says which day; give the date
}

/* ---------- background crossfade ---------- */

const layers = [$("#bgA"), $("#bgB")];
let front = 0;
let currentBg = null;
const preloaded = new Set();

function preload(src) {
  if (!src || preloaded.has(src)) return;
  preloaded.add(src);
  const img = new Image();
  img.src = src;
}

function setBackground(src) {
  if (!src || src === currentBg) return;
  currentBg = src;
  const back = 1 - front;
  const img = new Image();
  img.onload = img.onerror = () => {
    if (currentBg !== src) return; // scrolled past before it loaded
    layers[back].style.backgroundImage = `url("${src}")`;
    layers[back].classList.add("is-on");
    layers[front].classList.remove("is-on");
    front = back;
  };
  img.src = src;
}

/* ---------- background clip ---------- */

// Each gig with a clip loops 5 seconds of the act playing behind its panel.
// Browsers only autoplay muted video, so sound waits for the Sound button.
const video = $("#bgVideo");
const soundBtn = $("#soundBtn");
let soundOn = false;
let currentClip = null;

function setClip(src) {
  if (src === currentClip) return;
  currentClip = src;
  video.classList.remove("is-on");
  if (!src) {
    video.pause();
    return;
  }
  video.src = src;
  video.muted = !soundOn;
  video.oncanplay = () => {
    if (currentClip !== src) return;
    video.play().then(() => video.classList.add("is-on")).catch(() => {});
  };
  video.load();
}

soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  video.muted = !soundOn;
  if (soundOn && currentClip) video.play().catch(() => {});
  soundBtn.setAttribute("aria-pressed", String(soundOn));
  soundBtn.setAttribute("aria-label", soundOn ? "Mute" : "Unmute");
});

/* ---------- build ---------- */

function gigPanel(ev, now) {
  const start = new Date(ev.start);
  const section = el("section", {
    class: "panel gig",
    id: `gig-${ev.id}`,
    "data-bg": ev.image,
    "data-start": start.getTime(),
    "data-doors": ev.doors ? "1" : null,
    "data-clip": ev.clip || null,
    "aria-label": `${ev.artist} at ${ev.venue}`,
  });
  const card = el(
    "div",
    { class: "gig__card" },
    el(
      "div",
      { class: "gig__when" },
      el("span", { class: "gig__time", text: `${dayLabel(start, now)} · ${timeLabel(start, ev.doors)}` }),
      el("span", { class: "gig__countdown", text: countdown(start, now) })
    ),
    el("h3", { text: ev.artist }),
    el(
      "p",
      { class: "gig__where" },
      el("b", { text: ev.venue }),
      el("span", { text: ` — ${ev.area}${ev.address ? `, ${ev.address}` : ""}` })
    ),
    ev.blurb ? el("p", { class: "gig__blurb", text: ev.blurb }) : null,
    el(
      "div",
      { class: "gig__actions" },
      el("a", { class: "btn", href: ev.url, target: "_blank", rel: "noopener" }, "Go to website ", el("span", { "aria-hidden": "true", text: "→" })),
      el("span", { class: "tag", text: ev.genre }),
      ev.sold_out ? el("span", { class: "tag tag--sold", text: "Sold out" }) : null,
      ev.clip_source ? el("a", { class: "clip-credit", href: ev.clip_source, target: "_blank", rel: "noopener", text: "Clip: watch the full video ↗" }) : null
    )
  );
  section.append(card);
  return section;
}

function dayPanel(key, first, count) {
  const start = new Date(first.start);
  return el(
    "section",
    { class: "panel day", id: `day-${key}`, "data-bg": first.image, "data-day": key },
    el(
      "div",
      {},
      el("h2", { text: fmtDay.format(start) }),
      el("p", { class: "day__count", text: `${fmtDate.format(start)} · ${count} gig${count > 1 ? "s" : ""}` })
    )
  );
}

function build(data) {
  const now = new Date();
  const events = data.events
    .filter((e) => new Date(e.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const listings = $("#listings");
  const byDay = new Map();
  for (const ev of events) {
    const k = dayKey(new Date(ev.start));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(ev);
  }
  for (const [k, list] of byDay) {
    listings.append(dayPanel(k, list[0], list.length));
    for (const ev of list) listings.append(gigPanel(ev, now));
  }

  if (events.length) {
    const first = new Date(events[0].start);
    const last = new Date(events[events.length - 1].start);
    $("#heroRange").textContent = `${fmtShort.format(first)} – ${fmtShort.format(last)}`;
  } else {
    $("#heroRange").textContent = "This week";
  }

  $("#venueList").append(
    ...data.venues.map((v) =>
      el("li", {}, el("a", { href: v.url, target: "_blank", rel: "noopener", text: v.name }), el("span", { text: v.area }))
    )
  );
  $("#updated").textContent = `Listings gathered from venue websites on ${fmtDate.format(new Date(data.generated))}. Times are London time.`;

  buildRail();
  observe();
  refresh();
}

/* ---------- timeline rail ---------- */

let rail;
function buildRail() {
  rail?.remove();
  rail = el("nav", { class: "rail", "aria-label": "Timeline" });
  for (const p of document.querySelectorAll("#listings > .panel")) {
    const isDay = p.classList.contains("day");
    rail.append(el("a", { href: `#${p.id}`, class: isDay ? "is-day" : null, title: isDay ? $("h2", p).textContent : $("h3", p).textContent, "data-for": p.id }));
  }
  document.body.append(rail);
}

/* ---------- scroll tracking ---------- */

let io;
function observe() {
  io?.disconnect();
  io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const p = entry.target;
        setBackground(p.dataset.bg);
        setClip(p.dataset.clip || null);
        // warm the next two backgrounds so the fade never waits on the network
        let n = p.nextElementSibling;
        for (let i = 0; i < 2 && n; i++, n = n.nextElementSibling) preload(n.dataset.bg);
        const inListings = p.parentElement?.id === "listings";
        rail.classList.toggle("is-on", inListings);
        rail.querySelectorAll("a").forEach((a) => a.classList.toggle("is-active", a.dataset.for === p.id));
      }
    },
    { rootMargin: "-45% 0px -45% 0px" }
  );
  document.querySelectorAll(".panel").forEach((p) => io.observe(p));
}

/* ---------- live clock: countdowns and removal ---------- */

function refresh() {
  const now = new Date();
  const gigs = [...document.querySelectorAll(".gig:not(.is-gone)")];
  let changed = false;

  for (const g of gigs) {
    const start = new Date(Number(g.dataset.start));
    if (start <= now) {
      remove(g);
      changed = true;
      continue;
    }
    const cd = $(".gig__countdown", g);
    cd.textContent = countdown(start, now);
    cd.classList.toggle("is-soon", start - now < 3600e3);
    $(".gig__time", g).textContent = `${dayLabel(start, now)} · ${timeLabel(start, g.dataset.doors === "1")}`;
  }

  const next = document.querySelector(".gig:not(.is-gone)");
  if (next) {
    const start = new Date(Number(next.dataset.start));
    $("#nextUp").innerHTML = "";
    $("#nextUp").append("Next up: ", el("b", { text: $("h3", next).textContent }), ` · ${$(".gig__where b", next).textContent} · ${countdown(start, now).toLowerCase()}`);
  } else {
    $("#nextUp").textContent = "";
    $("#finaleTitle").textContent = "That's everything for this week.";
    $("#finaleText").textContent = "Every gig we listed has started. New listings go up on each venue's own site:";
  }
  if (changed) setTimeout(buildRail, 1700);
}

function remove(g) {
  g.classList.add("is-gone");
  setTimeout(() => {
    g.style.minHeight = `${g.offsetHeight}px`;
    requestAnimationFrame(() => g.classList.add("is-collapsing"));
    setTimeout(() => {
      g.remove();
      // a day with nothing left goes too; otherwise its count follows the removals
      document.querySelectorAll("#listings > .day").forEach((d) => {
        let n = 0;
        for (let s = d.nextElementSibling; s && !s.classList.contains("day"); s = s.nextElementSibling) n++;
        if (!n) d.remove();
        else $(".day__count", d).textContent = $(".day__count", d).textContent.replace(/\d+ gigs?/, `${n} gig${n > 1 ? "s" : ""}`);
      });
    }, 850);
  }, 900);
}

/* ---------- go ---------- */

setBackground($(".hero").dataset.bg);

fetch("data/events.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((data) => {
    build(data);
    setInterval(refresh, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
  })
  .catch((err) => {
    console.error(err);
    $("#listings").append(el("section", { class: "panel" }, el("p", { text: "The listings couldn't load. Try refreshing the page." })));
  });
