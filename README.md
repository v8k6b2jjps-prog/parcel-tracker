# Parcel Tracker

A single‑page web app that tracks Israeli shipments by number + phone, with
batch tracking and automatic carrier detection. It runs as a static page and
routes carrier requests through a small Cloudflare Worker (to get around CORS).

**Live:** https://v8k6b2jjps-prog.github.io/parcel-tracker/

## Features

- **Paste a list or any text** — every `ED…`, `AE…`, `SN…`, `XLT…`, `RS…` (and `…IL`)
  tracking number is auto‑extracted with a regex and de‑duplicated.
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
| `SN…`  | GCX | no | ASP.NET postback (GET tokens → POST); hands off to YDM |
| `XLT…` | Exelot | no | Direct JSON API (`apiv2p.exelot.com`) |
| `RS…` / `…IL` / other S10 | Israel Post | no | MyPost JSON API 

Detection order: `ED` → HFD, `AE` → Chita, `SN` → GCX, anything else shaped
like `2 letters + digits (+trailing letters)` → Israel Post. `ED`, `AE` and
`SN` are pinned (proprietary, non‑postal formats); every postal prefix is
caught generically, so new `R…`/`C…`/`E…` variants route to Israel Post
automatically.

> Note: basic **seller self‑ship** Israel Post items (often `RS…` with no
> trailing letter) frequently have **no tracking data** on Israel Post's side —
> the lookup returns empty, which is expected, not an app error.

## How it works

```
Browser (GitHub Pages)  ──►  Cloudflare Worker  ──►  carrier API
     index.html                 ?url=<target>          HFD / Chita / Israel Post
                                 /gcx?num=<n>           GCX (server-side 2-step)
```

The page can't call the carrier APIs directly from the browser (CORS + custom
headers). For HFD / Chita / Israel Post the Worker forwards the request via
`?url=`, adds the right `Referer`/`Origin` and headers, and returns the response
with permissive CORS headers. The Worker only forwards to an allow‑listed set of
carrier hosts.

GCX is different: it's an ASP.NET WebForms postback, so it needs a server-side
session. The dedicated `/gcx?num=` endpoint does both steps in the Worker — GET
the page to harvest `__VIEWSTATE`/`__VIEWSTATEGENERATOR`/`__EVENTVALIDATION` plus
the `ASP.NET_SessionId` cookie, then POST the number — and returns the result
HTML.

> **GCX caveat:** GCX's origin (`info.gcx.co.il`) may not answer requests from
> Cloudflare's datacenter IPs. If GCX lookups time out (504) on the hosted site
> while HFD/Chita/Post work, use the local PowerShell app (`Parcel-Tracker.ps1`)
> or the local `.cmd` launcher instead — those run the same two-step from your
> own IP.

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
- GCX (`SN…`) is a China→Israel consolidator that hands the last mile to YDM; its
  timeline shows both the English and Hebrew event text.
- No backend, no database — just a static page + a Worker.
