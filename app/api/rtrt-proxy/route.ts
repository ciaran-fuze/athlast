import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const event = request.nextUrl.searchParams.get("event") || "";
  const loadpage = request.nextUrl.searchParams.get("loadpage") || "/dashboard";

  // Fetch the actual RTRT app page
  const url = `https://app.rtrt.me/${event}?oe=1&loadpage=${encodeURIComponent(loadpage)}&event=${event}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Referer": `https://app.rtrt.me/${event}`,
    },
  });
  let html = await res.text();

  // Remove app link meta tags
  html = html.replace(/<meta\s+property="al:(ios|android)[^"]*"[^>]*>/gi, "");
  html = html.replace(/<meta\s+name="apple-itunes-app"[^>]*>/gi, "");
  html = html.replace(/<!--IOS Deep link-->|<!--Android Deep Link-->|<!--Default URL-->/gi, "");
  html = html.replace(/<meta\s+property="al:web[^"]*"[^>]*>/gi, "");

  // Inject auto-dismiss script before </body>
  const script = `
<script>
(function() {
  var dismissed = 0;
  function clickThrough() {
    var els = document.querySelectorAll('button, a, div, span, li, td');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').toLowerCase().trim();
      // Skip elements with lots of children (containers)
      if (els[i].children.length > 3) continue;
      if (t === 'continue in browser' || t === 'continue on web' || t === 'use browser' || t === 'web') {
        els[i].click();
        dismissed++;
        return;
      }
      if (dismissed >= 1 && (t === 'spectator' || t === 'a spectator' || t === "i'm a spectator" || t === 'spectating')) {
        els[i].click();
        dismissed++;
        return;
      }
    }
  }

  var observer = new MutationObserver(clickThrough);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Also poll
  var attempts = 0;
  var poll = setInterval(function() {
    attempts++;
    clickThrough();
    if (dismissed >= 2 || attempts > 80) {
      clearInterval(poll);
      observer.disconnect();
    }
  }, 250);
})();
</script>`;

  html = html.replace("</body>", script + "</body>");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
