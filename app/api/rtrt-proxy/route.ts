import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const event = request.nextUrl.searchParams.get("event") || "";
  const loadpage = request.nextUrl.searchParams.get("loadpage") || "/dashboard";

  // Fetch the actual RTRT app page
  const url = `https://app.rtrt.me/${event}?oe=1&loadpage=${encodeURIComponent(loadpage)}&event=${event}`;
  const res = await fetch(url, {
    headers: {
      "Referer": `https://app.rtrt.me/${event}`,
    },
  });
  let html = await res.text();

  // Remove app link meta tags so no smart banners appear
  html = html.replace(/<meta\s+property="al:(ios|android)[^"]*"[^>]*>/gi, "");
  html = html.replace(/<meta\s+name="apple-itunes-app"[^>]*>/gi, "");
  html = html.replace(/<!--IOS Deep link-->|<!--Android Deep Link-->|<!--Default URL-->/gi, "");
  html = html.replace(/<meta\s+property="al:web[^"]*"[^>]*>/gi, "");

  // Inject script at TOP of head to spoof desktop browser before RTRT code runs
  const desktopSpoof = `
<script>
// Make RTRT think this is a desktop browser — skips "use mobile app" prompt
try {
  Object.defineProperty(navigator, 'userAgent', {
    get: function() { return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'; }
  });
} catch(e) {}
// Override mobile detection helpers RTRT might use
window.isMobile = false;
document.documentElement.classList.remove('isMobile');
</script>`;
  html = html.replace("<head>", "<head>" + desktopSpoof);

  // Inject auto-click for spectator prompt before </body>
  const autoClick = `
<script>
(function() {
  function clickSpectator() {
    var els = document.querySelectorAll('button, a, div, span, li, td');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').toLowerCase().trim();
      if (els[i].children.length > 3) continue;
      if (t === 'spectator' || t === 'a spectator' || t === "i'm a spectator" || t === 'spectating') {
        els[i].click();
        return true;
      }
      if (t === 'continue in browser' || t === 'continue on web') {
        els[i].click();
        return true;
      }
    }
    return false;
  }

  var observer = new MutationObserver(clickSpectator);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  var attempts = 0;
  var poll = setInterval(function() {
    attempts++;
    clickSpectator();
    if (attempts > 80) {
      clearInterval(poll);
      observer.disconnect();
    }
  }, 250);
})();
</script>`;
  html = html.replace("</body>", autoClick + "</body>");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
