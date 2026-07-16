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

  // Fetch initial splits
  let initialSplits: Record<string, Split[]> = {};

  // Mock data for the live demo race
  if (slug === "dublin-half-2026-live" && raceAthletes) {
    const mockSplits: Split[] = [
      { Name: "Startline", Exists: true, TOD: "08:30:04", Gun: "00:00", Chip: "00:04", RO: 4832, RG: 2201, RA: 412, ROM: 13200, RGM: 6800, RAM: 1100 },
      { Name: "5K", Exists: true, TOD: "08:54:36", Gun: "24:36", Chip: "24:32", Sector: "24:28", Speed: "4:53 min/km", RO: 3912, RG: 1804, RA: 338, ROM: 13100, RGM: 6750, RAM: 1090 },
      { Name: "10K", Exists: true, TOD: "09:18:48", Gun: "48:48", Chip: "48:44", Sector: "24:12", Speed: "4:50 min/km", RO: 3640, RG: 1690, RA: 310, ROM: 12900, RGM: 6700, RAM: 1080 },
      { Name: "15K", Exists: false },
      { Name: "Finishline", Exists: false },
    ];
    for (const ra of raceAthletes) {
      initialSplits[ra.athlete_id] = mockSplits;
    }
  } else if (race.raceresult_event_id) {
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
