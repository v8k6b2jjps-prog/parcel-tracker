# Parcel Tracker

A single‑page web app that tracks Israeli shipments by number + phone, with
batch tracking and automatic carrier detection. It runs as a static page and
routes carrier requests through a small Cloudflare Worker (to get around CORS).

**Live:** https://v8k6b2jjps-prog.github.io/parcel-tracker/

## Features

- **Paste a list or any text** — every `ED…`, `AE…`, `RS…` (and `…IL`) tracking
  number is auto‑extracted with a regex and de‑duplicated.
- **Batch tracking** — tracks the whole list in one click.
- **Auto carrier detection** from the number prefix (see table below).
- **Results / Console tabs** — a short summary table and the full Hebrew
  timelines.
- **Paste / Load file / Copy** buttons.
- Hebrew is decoded correctly (UTF‑8 with a Windows‑1255 fallback).

## Carriers

| Prefix | Carrier | Needs phone | How it's tracked |
|--------|---------|-------------|------------------|
| `ED…`  | HFD | yes | RunCom 2‑step (XML token → HTML timeline) |
| `AE…`  | Chita (ציטה) | yes | RunCom 2‑step, self‑hosted |
| `RS…` / `…IL` / other S10 | Israel Post | no | MyPost JSON API |

Detection order: `ED` → HFD, `AE` → Chita, anything else shaped like
`2 letters + digits (+trailing letters)` → Israel Post. Only `ED` and `AE`
are pinned (they're proprietary, non‑postal formats); every postal prefix is
caught generically, so new `R…`/`C…`/`E…` variants route to Israel Post
automatically.

> Note: basic **seller self‑ship** Israel Post items (often `RS…` with no
> trailing letter) frequently have **no tracking data** on Israel Post's side —
> the lookup returns empty, which is expected, not an app error.

## How it works

```
Browser (GitHub Pages)  ──►  Cloudflare Worker  ──►  carrier API
     index.html                 ?url=<target>          HFD / Chita / Israel Post
```

The page can't call the carrier APIs directly from the browser (CORS + custom
headers). The Worker forwards the request, adds the right `Referer`/`Origin`
and headers, and returns the response with permissive CORS headers. The Worker
only forwards to an allow‑listed set of carrier hosts.

## Setup

### 1. The page
Put `index.html` at the root of a repo and enable **Settings → Pages →
Deploy from a branch → `main` / root**. Your site is then at
`https://<user>.github.io/<repo>/`.

### 2. The Cloudflare Worker (CORS proxy)
Create a free Worker, paste `worker.js`, and deploy. Then set the proxy URL at
the top of `index.html`:

```js
const PROXY_BASE = "https://<your-worker>.workers.dev/?url=";
```

(Optionally lock the Worker to your site by replacing
`Access-Control-Allow-Origin: "*"` with your Pages origin,
e.g. `https://v8k6b2jjps-prog.github.io`.)

## Notes

- The Israel Post `Ocp-Apim-Subscription-Key` is the site's public frontend key.
- HFD and Chita share the same RunCom system; Israel Post uses its MyPost JSON API.
- No backend, no database — just a static page + a Worker.
