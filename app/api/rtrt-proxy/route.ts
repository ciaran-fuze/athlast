import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const event = request.nextUrl.searchParams.get("event") || "";
  const loadpage = request.nextUrl.searchParams.get("loadpage") || "/dashboard";

  // Serve a wrapper page that embeds RTRT but intercepts redirects
  // and auto-dismisses the app download prompt
  const html = `<!DOCTYPE html>
<html style="height:100%;margin:0;overflow:hidden">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{height:100%;margin:0;overflow:hidden;background:#fff}
  #rt-app,#rtframe{width:100%;height:100%;border:none}
</style>
</head>
<body>
<div id="rt-app"></div>
<script>
// Storage helper for RTRT
Storage.prototype.setObject = function(key, value) {
  this.setItem(key, JSON.stringify(value));
};
Storage.prototype.getObject = function(key, ret) {
  return this.getItem(key) ? JSON.parse(this.getItem(key)) : (!ret ? {} : []);
};

// Pre-set the stash to mark app prompt as dismissed
try {
  var stash = localStorage.getObject('stash') || {};
  stash.appPromptDismissed = true;
  stash.hideAppBanner = true;
  stash.seenAppPromo = true;
  stash.app_prompt_seen = 1;
  stash.dismissedAppDownload = true;
  stash.webAppMode = true;
  localStorage.setObject('stash', stash);
} catch(e) {}

// Create iframe to app.rtrt.me
var root = 'https://app.rtrt.me/${event}?oe=1';
var source = root + '&loadpage=${encodeURIComponent(loadpage)}&event=${event}';

var iframe = document.createElement('iframe');
iframe.id = 'rtframe';
iframe.name = 'rtframe';
iframe.style.cssText = 'width:100%;height:100%;border:none';
iframe.allow = 'geolocation';
iframe.setAttribute('allowfullscreen', 'true');
document.getElementById('rt-app').appendChild(iframe);
iframe.src = source;

// Handle messages from RTRT iframe
window.addEventListener('message', function(e) {
  if (!e.data) return;
  if (typeof e.data === 'string') {
    // Block redirects — don't let RTRT navigate us away
    if (e.data.indexOf('redir') === 0) return;
    if (e.data.indexOf('open') === 0) return;

    // Handle localStorage requests from the iframe
    if (e.data.indexOf('getlocalstore') === 0) {
      var data = {task: 'getlocalstore', data: localStorage.getObject('stash')};
      iframe.contentWindow.postMessage(data, '*');
      return;
    }

    // Handle scroll
    if (e.data.indexOf('scrollTo') === 0) return;

    // Handle hash changes — don't change parent hash
    if (e.data.indexOf('hash') === 0) return;

    // Handle height
    if (e.data.indexOf('height') === 0) {
      var h = parseInt(e.data.replace(/^height=/, ''), 10);
      if (h > 0) iframe.style.height = h + 'px';
      return;
    }
  } else if (typeof e.data === 'object') {
    // Handle localStorage set operations
    if (e.data.task === 'setObject') {
      try {
        var obj = localStorage.getObject('stash') || {};
        obj[e.data.data.key] = JSON.parse(e.data.data.value);
        localStorage.setObject('stash', obj);
      } catch(ex) {}
    }
    if (e.data.task === 'setVar') {
      try {
        var obj2 = localStorage.getObject('stash') || {};
        obj2[e.data.data.key] = e.data.data.value;
        localStorage.setObject('stash', obj2);
      } catch(ex) {}
    }
  }
});

// Poll to auto-dismiss app prompt inside iframe via CSS injection
// Since we can't access cross-origin DOM, we try posting a dismiss message
setInterval(function() {
  try {
    iframe.contentWindow.postMessage({task: 'setVar', data: {key: 'appPromptDismissed', value: 'true'}}, '*');
    iframe.contentWindow.postMessage({task: 'setVar', data: {key: 'seenAppPromo', value: '1'}}, '*');
    iframe.contentWindow.postMessage({task: 'setObject', data: {key: 'app_promo', value: JSON.stringify({seen: true, dismissed: true})}}, '*');
  } catch(ex) {}
}, 500);
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
