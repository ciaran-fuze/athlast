import { supabase } from "@/lib/supabase";
import { fetchConfig, fetchParticipantSplits, Split } from "@/lib/raceresult";
import { notFound } from "next/navigation";
import { LiveRacePage } from "./live-race-page";

export const dynamic = "force-dynamic";

export default async function RacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: race } = await supabase
    .from("races")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!race) notFound();

  const { data: raceAthletes } = await supabase
    .from("race_athletes")
    .select("*, athletes(*)")
    .eq("race_id", race.id);

  // Fetch initial splits if Race Result is configured
  let initialSplits: Record<string, Split[]> = {};

  if (race.raceresult_event_id) {
    let key = race.raceresult_key;
    let server = race.raceresult_server || "my.raceresult.com";

    if (!key) {
      try {
        const config = await fetchConfig(race.raceresult_event_id, server);
        key = config.key;
        if (config.server) server = config.server;
        await supabase
          .from("races")
          .update({ raceresult_key: key, raceresult_server: server })
          .eq("id", race.id);
      } catch {
        // Race Result not available yet
      }
    }

    if (key && raceAthletes) {
      for (const ra of raceAthletes) {
        if (ra.raceresult_pid) {
          try {
            initialSplits[ra.athlete_id] = await fetchParticipantSplits(
              race.raceresult_event_id,
              ra.raceresult_pid,
              key,
              server
            );
          } catch {
            // Splits not available yet for this athlete
          }
        }
      }
    }
  }

  // Fetch initial messages
  const { data: messages } = await supabase
    .from("supporter_messages")
    .select("*")
    .eq("race_id", race.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <LiveRacePage
      race={race}
      raceAthletes={raceAthletes ?? []}
      initialSplits={initialSplits}
      initialMessages={messages ?? []}
    />
  );
}
