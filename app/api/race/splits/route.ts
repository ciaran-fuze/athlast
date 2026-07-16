import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchConfig, fetchParticipantSplits } from "@/lib/raceresult";

export async function GET(request: NextRequest) {
  const raceId = request.nextUrl.searchParams.get("race_id");
  const athleteId = request.nextUrl.searchParams.get("athlete_id");

  if (!raceId || !athleteId) {
    return NextResponse.json({ error: "Missing race_id or athlete_id" }, { status: 400 });
  }

  const { data: race } = await supabase
    .from("races")
    .select("*")
    .eq("id", raceId)
    .single();

  if (!race || !race.raceresult_event_id) {
    return NextResponse.json({ error: "Race not found or no Race Result event configured" }, { status: 404 });
  }

  const { data: raceAthlete } = await supabase
    .from("race_athletes")
    .select("*")
    .eq("race_id", raceId)
    .eq("athlete_id", athleteId)
    .single();

  if (!raceAthlete?.raceresult_pid) {
    return NextResponse.json({ error: "Athlete not linked to this race or missing PID" }, { status: 404 });
  }

  let key = race.raceresult_key;
  let server = race.raceresult_server || "my.raceresult.com";

  // Fetch config to get key and actual server if not cached
  if (!key) {
    const config = await fetchConfig(race.raceresult_event_id, server);
    key = config.key;
    if (config.server) server = config.server;

    // Cache the key and server
    await supabase
      .from("races")
      .update({ raceresult_key: key, raceresult_server: server })
      .eq("id", raceId);
  }

  const splits = await fetchParticipantSplits(
    race.raceresult_event_id,
    raceAthlete.raceresult_pid,
    key,
    server
  );

  return NextResponse.json({ splits });
}
