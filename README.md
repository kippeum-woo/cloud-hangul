# 구름한글 (Cloud Hangul)

Play: https://cloud-hangul.pages.dev/

## Cloudflare deployment

Cloudflare Pages serves the game and forwards same-origin API and WebSocket
requests to the existing Worker and SQLite-backed Durable Object. Both deploy
from GitHub main. See [CLOUDFLARE.md](CLOUDFLARE.md).
`npm run dev` runs Cloudflare locally; `npm start` retains the Node version.
`npm run test:cloudflare` tests SQLite persistence, concurrent claims,
publication, asset delivery and WebSockets in the Cloudflare local runtime.
The Cloudflare version uses hibernating WebSockets instead of Node SSE.
Shared rules live in `server/core/`; file persistence is a Node-only adapter.

Spin a 3D globe, pick a supported city, and write in its live local sky with
fluffy Korean cloud letters. Everyone who opens the same city shares one sky
and one supply of letters.

## Flow

globe → select a catalog city → its current local sky → open **Letters**,
drag letters up and let them combine → **Release into the sky** → share a link
to the message.

## Pieces

| File | What it does |
|---|---|
| `src/hangul.js` | Composition rules: initials, double initials, all 21 vowels, vowel joins (ㅗ+ㅏ→ㅘ), finals and compound finals |
| `src/composer.js` | Draft blocks built from server reservations; undo/remove/reset report exactly which reservations to release or re-claim |
| `src/cities.js` | The one city catalog (globe markers, search, browse, sky loading, server ids): 50 US state cities, every listed country's capital, some major cities |
| `src/astro.js`, `src/sky.js` | Sun/moon position, sunrise/sunset, polar day/night, phase and sky palette |
| `src/clock.js` | City wall clock from the IANA timezone (DST included) |
| `src/weather.js` | Open-Meteo parsing, WMO mapping, labeled simulation |
| `src/messages.js` | Sky coordinates, 24-hour fade and expiry, spacing placement, word count |
| `server/supply.js` | Shared per-city letter supply: stock, reservations, activity tiers, refills |
| `server/identity.js` | Server-issued anonymous identity cookie |
| `server/store.js` | Shared messages per city (JSON on disk), word-count feed |
| `server/start.js` | HTTP API, server-sent events, weather proxy, static files |
| `client/` | Globe (three.js), atmospheric sky canvas, tray, drag/snap writing, dev panel |

Add cities by appending a row in `src/cities.js`. Never change an existing
id: messages and supply are stored by city id. `npm test` checks every city
has a valid timezone and a working sky endpoint.

## Shared letter supply

The server owns each city's letters; browsers only hold reservations.

- A city is created once, on first visit, with 10 complete decks: 10 of each
  of the 35 letters (350 pieces).
- Picking a letter up reserves one piece on the server. Two people can never
  both get the last one. Removing it, undo, **Start over**, switching city, or
  dropping it back on the tray releases it. Reservations expire after 10
  minutes unless renewed; the client renews them whenever the draft changes
  and when the tab becomes visible. Publishing consumes them. Deleting or
  expiring a message does not refund its letters.
- Reserve, release and publish carry request ids, so retrying after a network
  error never claims or posts twice. Node handles each request in one
  synchronous step, so these operations are atomic with respect to each other.
- Refills are once per city on a fixed 6-minute schedule of server time. They
  are replayed lazily before any read or write, so time with nobody watching
  counts, and state survives restarts in `DATA_DIR/supply.json`.
- Each refill uses the activity tier **at that refill time**. Tiers count
  unique visitors who interacted with the city (opening its sky, reserving,
  releasing, publishing, deleting) in the previous 30 minutes. The current
  tier is never applied to earlier intervals.

| Active visitors | Decks per refill | Cap per letter |
|---|---|---|
| 0–10 | 1 | 10 |
| 11–30 | 2 | 20 |
| 31–60 | 3 | 30 |
| 61+ | 4 | 40 |

Tune these in `SUPPLY` at the top of `server/supply.js`. Reserved pieces count
toward the cap. When the cap drops, existing pieces stay; refills pause for
letters above the new cap until use brings them below it. A higher cap only
fills through later refills.

The player UI shows availability only (quiet inactive cards when a letter is
out). It never shows shortages or refill timers. `?dev=1` has a developer-only
supply readout.

**Live updates without polling.** Inventory, message and word-count changes
are pushed over server-sent events. A refill is applied when the city next
sees any event (someone opens it or picks up a letter), so an idle tray
updates then, not at the exact 6-minute mark. Pressing an inactive letter asks
the server again, which applies any refill that is due.

### Identity and its limits

There is no sign-in yet. The server issues each browser a random anonymous id
in an HttpOnly cookie (`server/identity.js`). Tabs and refreshes share it, so
they never multiply the visitor count. Limits of anonymous deduplication: one
person with two browsers, a private window or cleared cookies counts as
several visitors (and loses delete rights over earlier messages); people
sharing one browser profile count as one. When accounts exist, resolve the
account in `identify()` first so visitors and ownership follow the account
across devices.

## Word counts on the globe

Each marker shows the number of words in that city's live messages, and busier
skies get a modestly larger, brighter marker (three bounded steps). Clusters
show the sum. This is a **simple whitespace count** (`wordCount` in
`src/messages.js`), not linguistic Korean word analysis: a message's text puts
a space between rows and between syllables placed more than a gap apart, so
“보고 싶어” counts 2. Drafts never count. The server sends each message's
expiry time with its count, so the globe drops it at exactly 24 hours.

## Data and timing

- Message, reservation and refill timestamps are UTC epoch milliseconds from
  the server clock.
- Weather is fetched when a city opens, when the tab becomes visible after 10
  minutes, and when the network returns. Between fetches the sky follows the
  48-hour hourly forecast it already has. A failed fetch shows a labeled
  simulated sky; the city stays usable.
- The browser caches only its draft layout and the tray open/closed choice.

```bash
npm ci && npm test
env HOST=127.0.0.1 PORT=3000 node server/start.js   # open /?dev=1 for the demo panel
```

Land shapes come from Natural Earth (public domain) via `world-atlas`;
`npm run land -- <path to land-50m.json>` rebuilds `client/land.json`.
