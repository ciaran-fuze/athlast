import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const event = request.nextUrl.searchParams.get("event") || "";
  const loadpage = request.nextUrl.searchParams.get("loadpage") || "/dashboard";

  // Fetch the actual RTRT app page
  const url = `https://app.rtrt.me/${event}?oe=1&loadpage=${encodeURIComponent(loadpage)}&event=${event}`;
  const res = await fetch(url);
  let html = await res.text();

  // Inject a script that auto-dismisses the app download prompt
  // This runs in our domain context so we have full DOM access
  const injectedScript = `
<script>
// Auto-dismiss RTRT app download prompt
(function() {
  // Watch for new elements being added to the DOM
  var observer = new MutationObserver(function(mutations) {
    // Look for "Continue" or "browser" buttons/links
    var buttons = document.querySelectorAll('button, a, div[role="button"], span');
    for (var i = 0; i < buttons.length; i++) {
      var text = (buttons[i].textContent || '').toLowerCase().trim();
      if (text.indexOf('continue') >= 0 && text.indexOf('browser') >= 0) {
        buttons[i].click();
        return;
      }
      if (text === 'continue in browser' || text === 'continue on web' || text === 'use web version' || text === 'continue') {
        buttons[i].click();
        return;
      }
      // Auto-click "Spectator"
      if (text === 'spectator' || text === 'a spectator' || text.indexOf('spectator') >= 0) {
        buttons[i].click();
        return;
      }
    }

    // Also try to find and hide modal overlays that look like app prompts
    var overlays = document.querySelectorAll('[class*="modal"], [class*="overlay"], [class*="interstitial"], [class*="promo"], [class*="banner"], [class*="download"], [class*="getapp"], [class*="appget"], [class*="appdl"]');
    for (var j = 0; j < overlays.length; j++) {
      var el = overlays[j];
      var style = window.getComputedStyle(el);
      // If it's a fixed/absolute overlay, hide it
      if (style.position === 'fixed' || style.position === 'absolute') {
        if (parseInt(style.zIndex) > 50 || style.zIndex === 'auto') {
          // Check if it contains app store links or "download" text
          var content = el.innerHTML.toLowerCase();
          if (content.indexOf('app store') >= 0 || content.indexOf('google play') >= 0 || content.indexOf('download') >= 0 || content.indexOf('get the app') >= 0 || content.indexOf('open in app') >= 0 || content.indexOf('continue in browser') >= 0 || content.indexOf('mobile app') >= 0) {
            el.style.display = 'none';
            // Also remove any backdrop/overlay behind it
            var prev = el.previousElementSibling;
            if (prev && window.getComputedStyle(prev).position === 'fixed') {
              prev.style.display = 'none';
            }
          }
        }
      }
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  // Also run checks on an interval for the first 10 seconds
  var checks = 0;
  var interval = setInterval(function() {
    checks++;
    if (checks > 60) { clearInterval(interval); observer.disconnect(); return; }

    // Auto-click through all RTRT prompts
    var allEls = document.querySelectorAll('button, a, div, span');
    for (var i = 0; i < allEls.length; i++) {
      var t = (allEls[i].textContent || '').toLowerCase().trim();
      // Step 1: "Continue in browser"
      if (t === 'continue in browser' || t === 'continue on web' || t === 'use web' || t === 'continue on website' || t === 'continue') {
        allEls[i].click();
        return;
      }
      // Step 2: "Spectator" (are you participating or spectator)
      if (t === 'spectator' || t === 'a spectator' || t.indexOf('spectator') >= 0) {
        allEls[i].click();
        return;
      }
    }
  }, 250);

  // Remove iOS/Android app link meta tags to prevent smart banners
  var metas = document.querySelectorAll('meta[property^="al:ios"], meta[property^="al:android"], meta[name="apple-itunes-app"]');
  for (var k = 0; k < metas.length; k++) {
    metas[k].remove();
  }
})();
</script>`;

  // Remove app link meta tags from the HTML
  html = html.replace(/<meta\s+property="al:(ios|android)[^"]*"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="apple-itunes-app"[^>]*>/gi, '');

  // Inject our script right before </body>
  html = html.replace('</body>', injectedScript + '</body>');

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
