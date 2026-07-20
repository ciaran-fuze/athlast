import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

async function refreshTokenIfNeeded(athlete: {
  id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (athlete.token_expires_at > now + 60) {
    return athlete.access_token;
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: athlete.refresh_token,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh Strava token");
  }

  const data = await res.json();

  await supabase
    .from("athletes")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: data.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", athlete.id);

  return data.access_token;
}

export async function POST(request: NextRequest) {
  let athlete_id: string;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    athlete_id = body.athlete_id;
  } else {
    const formData = await request.formData();
    athlete_id = formData.get("athlete_id") as string;
  }

  if (!athlete_id) {
    return NextResponse.json({ error: "Missing athlete_id" }, { status: 400 });
  }

  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("*")
    .eq("id", athlete_id)
    .single();

  if (athleteError || !athlete) {
    return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
  }

  const accessToken = await refreshTokenIfNeeded(athlete);

  // Find the most recent activity we already have, so we only fetch new ones
  const { data: latestActivity } = await supabase
    .from("activities")
    .select("start_date")
    .eq("athlete_id", athlete_id)
    .order("start_date", { ascending: false })
    .limit(1)
    .single();

  const afterEpoch = latestActivity
    ? Math.floor(new Date(latestActivity.start_date).getTime() / 1000)
    : undefined;

  let page = 1;
  const perPage = 100;
  let allActivities: Record<string, unknown>[] = [];

  while (true) {
    let url = `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`;
    if (afterEpoch) url += `&after=${afterEpoch}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 429) {
        return NextResponse.json(
          { error: "Strava rate limit exceeded. Try again later." },
          { status: 429 }
        );
      }
      const err = await res.text();
      return NextResponse.json(
        { error: "Failed to fetch activities from Strava", details: err },
        { status: res.status }
      );
    }

    const activities = await res.json();
    if (activities.length === 0) break;

    allActivities = allActivities.concat(activities);
    if (activities.length < perPage) break;
    page++;
  }

  // Upsert into Supabase
  const rows = allActivities.map((a: Record<string, unknown>) => ({
    strava_id: a.id as number,
    athlete_id: athlete.id,
    name: a.name as string,
    sport_type: a.sport_type as string,
    distance: a.distance as number,
    moving_time: a.moving_time as number,
    elapsed_time: a.elapsed_time as number,
    start_date: a.start_date as string,
    average_speed: a.average_speed as number,
    max_speed: a.max_speed as number,
    total_elevation_gain: a.total_elevation_gain as number,
    map_summary_polyline: (a.map as { summary_polyline?: string })?.summary_polyline ?? null,
  }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("activities")
      .upsert(rows, { onConflict: "strava_id" });

    if (error) {
      return NextResponse.json({ error: "Failed to save activities", details: error.message }, { status: 500 });
    }
  }

  if (contentType.includes("application/json")) {
    return NextResponse.json({ synced: rows.length });
  }

  return NextResponse.redirect(new URL("/", request.url));
}
