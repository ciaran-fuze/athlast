import { supabase } from "@/lib/supabase";
import { fetchFundraising } from "@/lib/fundraising";

export async function GET(request: Request) {
  const raceAthleteId = new URL(request.url).searchParams.get("race_athlete_id");
  if (!raceAthleteId) {
    return Response.json({ error: "race_athlete_id required" }, { status: 400 });
  }

  const { data: ra } = await supabase
    .from("race_athletes")
    .select("fundraising_url")
    .eq("id", raceAthleteId)
    .single();

  if (!ra?.fundraising_url) {
    return Response.json({ error: "No fundraising page" }, { status: 404 });
  }

  const fundraising = await fetchFundraising(ra.fundraising_url);
  return Response.json(
    { fundraising },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
