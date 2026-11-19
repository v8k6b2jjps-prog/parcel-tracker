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
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36"
    );

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