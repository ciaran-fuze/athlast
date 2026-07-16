import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return NextResponse.json({ error: "Token exchange failed", details: err }, { status: 500 });
  }

  const data = await tokenRes.json();
  const { access_token, refresh_token, expires_at, athlete } = data;

  // Upsert athlete into Supabase
  const { error } = await supabase
    .from("athletes")
    .upsert(
      {
        strava_id: athlete.id,
        first_name: athlete.firstname,
        last_name: athlete.lastname,
        profile_picture: athlete.profile,
        access_token,
        refresh_token,
        token_expires_at: expires_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "strava_id" }
    );

  if (error) {
    return NextResponse.json({ error: "Failed to save athlete", details: error.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/", request.url));
}
