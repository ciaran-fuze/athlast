import { supabase } from "@/lib/supabase";
import { scrapeRtrtAthlete } from "@/lib/rtrt-scraper";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raceAthleteId = searchParams.get("race_athlete_id");

  if (!raceAthleteId) {
    return Response.json({ error: "race_athlete_id required" }, { status: 400 });
  }

  // Get the latest cached snapshot
  const { data: latest } = await supabase
    .from("tracking_snapshots")
    .select("*")
    .eq("race_athlete_id", raceAthleteId)
    .order("scraped_at", { ascending: false })
    .limit(1)
    .single();

  // Return cached data if fresh (< 30 seconds old)
  if (latest) {
    const age = Date.now() - new Date(latest.scraped_at).getTime();
    if (age < 30000) {
      return Response.json({ tracking: latest, cached: true });
    }
  }

  // Get RTRT identifiers for this race_athlete
  const { data: ra } = await supabase
    .from("race_athletes")
    .select("rtrt_event_code, rtrt_athlete_id")
    .eq("id", raceAthleteId)
    .single();

  if (!ra?.rtrt_event_code || !ra?.rtrt_athlete_id) {
    // No RTRT config — return cached data if any
    if (latest) return Response.json({ tracking: latest, cached: true });
    return Response.json({ error: "No tracking configured" }, { status: 404 });
  }

  // Scrape fresh data
  const scraped = await scrapeRtrtAthlete(ra.rtrt_event_code, ra.rtrt_athlete_id);

  if (!scraped) {
    // Scrape failed — return cached data if any
    if (latest) return Response.json({ tracking: latest, cached: true });
    return Response.json({ error: "Scrape failed" }, { status: 502 });
  }

  // Store in Supabase
  const { data: snapshot } = await supabase
    .from("tracking_snapshots")
    .insert({
      race_athlete_id: raceAthleteId,
      splits: scraped.splits,
      finish_time: scraped.finishTime,
      avg_pace: scraped.avgPace,
      overall_place: scraped.overallPlace,
      overall_total: scraped.overallTotal,
      status: scraped.status,
    })
    .select()
    .single();

  return Response.json({ tracking: snapshot ?? scraped, cached: false });
}
