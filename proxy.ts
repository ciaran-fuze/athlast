import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Per-athlete share domains: <racer>-<event>.vercel.app serves the race page at its root.
// The main athlast-*.vercel.app domains (production + previews) are left alone.
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const match = host.match(/^([a-z0-9-]+)\.vercel\.app$/);
  if (!match || match[1].startsWith("athlast")) return;

  return NextResponse.rewrite(new URL(`/${match[1]}`, request.url));
}

export const config = {
  matcher: "/",
};
