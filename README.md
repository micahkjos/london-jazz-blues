# After Dark

A one-page, scrolling timeline of the jazz and blues gigs happening across London this week.

- Gigs run in the order they happen, grouped by day.
- The background crossfades to the artist's or the venue's photo as each gig scrolls into view.
- Each gig shows the artist, the time and the venue, with a **Go to website** button that links to the venue's own listing.
- A gig fades out and is removed from the page once its start time passes, using London time in the visitor's browser. No reload is needed.

## How it works

`public/` is a static site served by `server.js`, which uses plain Node and has no dependencies. `public/data/events.json` holds the listings. `scripts/build_data.py` builds that file from scraped venue listings. It downloads every photo into `public/images/` so the site never depends on a venue allowing hotlinks.

```bash
python3 -I scripts/build_data.py path/to/scraped/   # one or more dirs of *.json listings
npm start                                          # http://localhost:3000
```

The listings were scraped from the venues' own websites: Ronnie Scott's, the 606 Club, Vortex, Cafe OTO, Pizza Express Live, Spice of Life, The Blues Kitchen and The Jazz Cafe.
