import { supabase } from "@/lib/supabase";
import { fetchConfig, fetchParticipantSplits, Split } from "@/lib/raceresult";
import { rtrtToSplits } from "@/lib/rtrt-splits";
import { fetchFundraising, recordFundraisingSnapshot } from "@/lib/fundraising";
import { notFound } from "next/navigation";
import { RacePageV2 } from "./race-page-v2";

export const dynamic = "force-dynamic";

export default async function RacePageV2Route({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ speed?: string }>;
}) {
  const { slug } = await params;
  const { speed } = await searchParams;

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

  const initialSplits: Record<string, Split[]> = {};

  // Mock data for the live demo race
  if (slug === "dublin-half-2026-live" && raceAthletes) {
    const mockSplits: Split[] = [
      { Name: "Startline", Exists: true, TOD: "08:30:04", Gun: "00:00", Chip: "00:04", RO: 4832, RG: 2201, RA: 412, ROM: 13200, RGM: 6800, RAM: 1100 },
      { Name: "5K", Exists: true, TOD: "08:54:36", Gun: "24:36", Chip: "24:32", Sector: "24:28", Speed: "4:53 min/km", RO: 3912, RG: 1804, RA: 338, ROM: 13100, RGM: 6750, RAM: 1090 },
      { Name: "10K", Exists: true, TOD: "09:18:48", Gun: "48:48", Chip: "48:44", Sector: "24:12", Speed: "4:50 min/km", RO: 3640, RG: 1690, RA: 310, ROM: 12900, RGM: 6700, RAM: 1080 },
      { Name: "15K", Exists: true, TOD: "09:43:10", Chip: "1:13:06", Speed: "4:52 min/km" },
      { Name: "20K", Exists: true, TOD: "10:07:28", Chip: "1:37:24", Speed: "4:52 min/km" },
      { Name: "Finishline", Exists: true, TOD: "10:12:22", Chip: "1:42:18", Speed: "4:51 min/km" },
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
            // Splits not available yet
          }
        }
      }
    }
  }

  // Marathon demo: a full set of splits, replayed on the looping demo clock
  if (slug === "marathon-demo" && raceAthletes) {
    const chips = [["5K", "24:20"], ["10K", "48:45"], ["15K", "1:13:20"], ["20K", "1:38:05"], ["25K", "2:03:00"], ["30K", "2:28:10"], ["35K", "2:53:50"], ["40K", "3:19:40"], ["Finishline", "3:30:55"]];
    const mock: Split[] = [{ Name: "Startline", Exists: true, Chip: "00:00" }, ...chips.map(([Name, Chip]) => ({ Name, Exists: true, Chip }))];
    for (const ra of raceAthletes) initialSplits[ra.athlete_id] = mock;
  }

  // Finished demo: fall back to mock results if Race Result no longer serves the event
  if (slug === "dublin-half-2026" && raceAthletes) {
    const mockFinished: Split[] = [
      { Name: "Startline", Exists: true, TOD: "08:30:04", Chip: "00:04" },
      { Name: "5K", Exists: true, TOD: "08:54:36", Chip: "24:32", Speed: "4:53 min/km" },
      { Name: "10K", Exists: true, TOD: "09:18:48", Chip: "48:44", Speed: "4:50 min/km" },
      { Name: "15K", Exists: true, TOD: "09:43:10", Chip: "1:13:06", Speed: "4:52 min/km" },
      { Name: "Finishline", Exists: true, TOD: "10:12:22", Chip: "1:42:18", Speed: "4:51 min/km" },
    ];
    for (const ra of raceAthletes) {
      if (!initialSplits[ra.athlete_id]?.some((s) => s.Exists)) initialSplits[ra.athlete_id] = mockFinished;
    }
  }

  // RTRT-tracked athletes: use the latest cached snapshot (the client polls for fresh ones)
  for (const ra of raceAthletes ?? []) {
    if (initialSplits[ra.athlete_id]?.length || !ra.rtrt_athlete_id) continue;
    const { data: snapshot } = await supabase
      .from("tracking_snapshots")
      .select("splits")
      .eq("race_athlete_id", ra.id)
      .order("scraped_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapshot?.splits?.length) initialSplits[ra.athlete_id] = rtrtToSplits(snapshot.splits);
  }

  const fundraisingRa = raceAthletes?.[0];
  const fundraising = fundraisingRa?.fundraising_url ? await fetchFundraising(fundraisingRa.fundraising_url) : null;
  if (fundraising && fundraisingRa) await recordFundraisingSnapshot(fundraisingRa.id, fundraising);

  const { data: messages } = await supabase
    .from("supporter_messages")
    .select("*")
    .eq("race_id", race.id)
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <RacePageV2
      race={race}
      raceAthletes={raceAthletes ?? []}
      initialSplits={initialSplits}
      initialMessages={messages ?? []}
      initialFundraising={fundraising}
      demoElapsedSeconds={slug === "phil-dublin-half" ? 62 * 60 : undefined}
      demoLoop={
        slug === "dublin-half-2026-live"
          ? { fromSec: 25 * 60, toSec: 102 * 60, speed: Math.min(Math.max(Number(speed) || 1, 1), 60) }
          : slug === "marathon-demo"
            ? { fromSec: 25 * 60, toSec: 209 * 60, speed: Math.min(Math.max(Number(speed) || 1, 1), 60) }
            : undefined
      }
    />
  );
}
