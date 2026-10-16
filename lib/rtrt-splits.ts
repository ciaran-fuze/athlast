import type { Split } from "@/lib/raceresult";
import type { RtrtSplit } from "@/lib/rtrt-scraper";

// RTRT pace is reported per mile (e.g. "06:36"); convert to the min/km string the page shows.
function milePaceToKm(pace: string | null): string | undefined {
  if (!pace) return undefined;
  const [m, s] = pace.split(":").map(Number);
  if (isNaN(m) || isNaN(s)) return undefined;
  const perKm = (m * 60 + s) / 1.609344;
  return `${Math.floor(perKm / 60)}:${String(Math.round(perKm % 60)).padStart(2, "0")} min/km`;
}

/** Map an RTRT tracking snapshot onto the Race Result Split shape the race page uses. */
export function rtrtToSplits(splits: RtrtSplit[]): Split[] {
  return splits.map((s) => ({
    Name: s.name,
    Exists: !!s.time,
    Chip: s.time ?? undefined,
    Speed: milePaceToKm(s.pace),
  }));
}
