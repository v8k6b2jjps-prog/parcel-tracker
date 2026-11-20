const ALLOWED_HOSTS = new Set([
  "api.hfd.co.il",
  "run.hfd.co.il",
  "chita-il.com",
  "apimftprd.israelpost.co.il",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Ocp-Apim-Subscription-Key, X-Requested-With, Accept",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36";

// GCX (gcx.co.il) is an ASP.NET postback: the page can't do it cross-origin
// (needs a server-side session + VIEWSTATE), so the Worker does both steps.
async function handleGcx(reqUrl) {
  const num = reqUrl.searchParams.get("num") || "";
  const GURL = "https://info.gcx.co.il/gcx_event/Default.aspx";

  // Step 1 — GET the page to harvest tokens and the ASP.NET session cookie.
  const r1 = await fetch(GURL, {
    method: "GET",
    headers: { "User-Agent": UA, "Accept": "text/html,*/*" },
    signal: AbortSignal.timeout(15000),
  });
  const html1 = await r1.text();

  let cookieHeader = "";
  if (typeof r1.headers.getSetCookie === "function") {
    cookieHeader = r1.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  } else {
    const sc = r1.headers.get("Set-Cookie");
    if (sc) {
      cookieHeader = sc
        .split(/,(?=[^;]+=)/)
        .map((c) => c.split(";")[0].trim())
        .filter((x) => x.includes("="))
        .join("; ");
    }
  }

  const decode = (s) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  const pick = (name) => {
    const m = html1.match(
      new RegExp('name="' + name + '"[^>]*?value="([^"]*)"')
    );
    return m ? decode(m[1]) : "";
  };

  const viewstate = pick("__VIEWSTATE");
  if (!viewstate) {
    // GET returned something, but not the expected ASP.NET form — origin block, redirect, or page change.
    return new Response(
      "GCX step 1 returned no __VIEWSTATE (origin may block this proxy). First bytes: " +
        html1.slice(0, 200),
      { status: 502, headers: CORS_HEADERS }
    );
  }

  // Step 2 — POST the number with the harvested tokens + session cookie.
  const body = new URLSearchParams();
  body.set("__EVENTTARGET", "");
  body.set("__EVENTARGUMENT", "");
  body.set("__VIEWSTATE", viewstate);
  body.set("__VIEWSTATEGENERATOR", pick("__VIEWSTATEGENERATOR"));
  body.set("__EVENTVALIDATION", pick("__EVENTVALIDATION"));
  body.set("tbHAWB_NUM", num);
  body.set("BtnTrack", "TRACK / עקוב");

  const postHeaders = {
    "User-Agent": UA,
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "text/html,*/*",
    "Referer": GURL,
    "Origin": "https://info.gcx.co.il",
  };
  if (cookieHeader) postHeaders["Cookie"] = cookieHeader;

  const r2 = await fetch(GURL, {
    method: "POST",
    headers: postHeaders,
    body: body.toString(),
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  const buf = await r2.arrayBuffer();

  const respHeaders = new Headers(CORS_HEADERS);
  respHeaders.set("Content-Type", "text/html; charset=utf-8");
  return new Response(buf, { status: r2.status, headers: respHeaders });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    const reqUrl = new URL(request.url);

    // Dedicated GCX endpoint (stateful ASP.NET flow handled server-side).
    if (reqUrl.pathname === "/gcx") {
      try {
        return await handleGcx(reqUrl);
      } catch (err) {
        const m = err && err.message ? err.message : String(err);
        const isTimeout = err && (err.name === "TimeoutError" || /timeout|aborted/i.test(m));
        return new Response(
          "GCX: " + (isTimeout ? "origin did not respond in time (" + m + ")" : m),
          { status: isTimeout ? 504 : 502, headers: CORS_HEADERS }
        );
      }
    }

    const rawTarget = reqUrl.searchParams.get("url");
    if (!rawTarget) {
      return new Response("Missing ?url= parameter", {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    let targetUri;
    try {
      targetUri = new URL(rawTarget);
    } catch {
      return new Response("Invalid target URL", {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    if (targetUri.protocol !== "https:" && targetUri.protocol !== "http:") {
      return new Response("Protocol not allowed", {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    if (!ALLOWED_HOSTS.has(targetUri.hostname)) {
      return new Response("Host not allowed", {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    const headers = new Headers();
    headers.set("User-Agent", UA);

    for (const hName of ["Accept", "Ocp-Apim-Subscription-Key", "X-Requested-With"]) {
      const val = request.headers.get(hName);
      if (val) headers.set(hName, val);
    }

    if (targetUri.hostname.endsWith("hfd.co.il")) {
      headers.set("Referer", "https://run.hfd.co.il/run_public/pub_random_form.htm");
    } else if (targetUri.hostname === "chita-il.com") {
      headers.set("Referer", "https://chita-il.com/run_public1/");
    } else if (targetUri.hostname.endsWith("israelpost.co.il")) {
      headers.set("Origin", "https://doar.israelpost.co.il");
    }

    try {
      const upstream = await fetch(targetUri.toString(), {
        method: "GET",
        headers,
        redirect: "follow",
      });

      const respHeaders = new Headers(CORS_HEADERS);
      const contentType = upstream.headers.get("Content-Type");
      if (contentType) respHeaders.set("Content-Type", contentType);

      return new Response(upstream.body, {
        status: upstream.status,
        headers: respHeaders,
      });
    } catch (err) {
      return new Response(err && err.message ? err.message : "Upstream fetch error", {
        status: 502,
        headers: CORS_HEADERS,
      });
    }
  },
};
