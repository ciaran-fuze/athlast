import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const event = request.nextUrl.searchParams.get("event") || "";
  const loadpage = request.nextUrl.searchParams.get("loadpage") || "/dashboard";

  const url = `https://app.rtrt.me/${event}?oe=1&loadpage=${encodeURIComponent(loadpage)}&event=${event}`;
  const res = await fetch(url, {
    headers: { "Referer": `https://app.rtrt.me/${event}` },
  });
  let html = await res.text();

  // Remove app link meta tags
  html = html.replace(/<meta\s+property="al:(ios|android)[^"]*"[^>]*>/gi, "");
  html = html.replace(/<meta\s+name="apple-itunes-app"[^>]*>/gi, "");

  // Spoof desktop user-agent before RTRT code runs
  const script = `
<script>
try {
  Object.defineProperty(navigator, 'userAgent', {
    get: function() { return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'; }
  });
} catch(e) {}
window.isMobile = false;
</script>`;
  html = html.replace("<head>", "<head>" + script);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
