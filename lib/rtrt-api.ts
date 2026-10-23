import type { RtrtAthleteData, RtrtSplit } from "@/lib/rtrt-scraper";

// App credentials from RTRT's own web tracker (track.rtrt.me), set in env
const APP_ID = process.env.RTRT_APP_ID;
const TOKEN = process.env.RTRT_TOKEN;

// Same points the browser scraper picked up, so timing mats like COMMS stay out
const SPLIT_NAME =
  /^(START|FINISH|HALFWAY|HALF|5K|10K|15K|20K|25K|30K|35K|40K|\d+(?:\.\d+)?(?:K|M|MI)|Furze Road|Cherryfield R['’]about|Terenure X-Roads|Roebuck Road|Fosters Avenue|Northumberland Rd)$/i;

interface ApiSplit {
  label?: string;
  point?: string;
  time?: string;
  timeOfDay?: string;
  milePace?: string;
  milePaceAvg?: string;
  isFinish?: string;
  name?: string;
  bib?: string;
  results?: { course?: { p?: string; t?: string } };
}

/** "01:25:11.777" → "01:25:12" */
function roundTime(t: string | undefined): string | null {
  if (!t) return null;
  const m = t.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!m) return null;
  let total = Number(m[1]) * 3600 + Number(m[2]) * 60 + Math.round(Number(m[3]));
  const h = Math.floor(total / 3600);
  total %= 3600;
  return `${String(h).padStart(2, "0")}:${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Fetch an athlete's tracking data straight from RTRT's JSON feed.
 * Returns null on any failure so the caller can fall back to the browser scraper.
 */
export async function fetchRtrtAthlete(
  eventCode: string,
  athleteId: string
): Promise<RtrtAthleteData | null> {
  if (!APP_ID || !TOKEN) return null;
  try {
    const body = new URLSearchParams({
      appid: APP_ID,
      token: TOKEN,
      max: "2000",
      loc: "1",
      places: "2",
      etimes: "1",
      units: "standard",
      source: "webtracker",
    });
    const res = await fetch(
      `https://api.rtrt.me/events/${encodeURIComponent(eventCode)}/profiles/${encodeURIComponent(athleteId)}/splits`,
      { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();

    if (data.error) {
      // Not across the start mat yet
      if (data.error.type === "no_results") {
        return {
          name: null,
          bib: null,
          splits: [],
          finishTime: null,
          avgPace: null,
          overallPlace: null,
          overallTotal: null,
          status: "not_started",
          lastUpdate: new Date().toISOString(),
        };
      }
      console.error("RTRT api error:", data.error);
      return null;
    }

    const list: ApiSplit[] = Array.isArray(data.list) ? data.list : [];
    if (!list.length) return null;

    const splits: RtrtSplit[] = list
      .filter((s) => SPLIT_NAME.test(s.label || s.point || ""))
      .map((s) => ({
        name: (s.label || s.point || "").toUpperCase(),
        time: roundTime(s.time),
        tod: s.timeOfDay || null,
        pace: s.milePace || null,
      }));

    const last = list[list.length - 1];
    const finish = list.find((s) => s.isFinish === "1");
    const finishTime = finish ? roundTime(finish.time)?.replace(/^0(?=\d:)/, "") ?? null : null;
    const place = last.results?.course;

    return {
      name: last.name || null,
      bib: last.bib || null,
      splits,
      finishTime,
      avgPace: last.milePaceAvg || null,
      overallPlace: place?.p ? parseInt(place.p) : null,
      overallTotal: place?.t ? parseInt(place.t) : null,
      status: finish ? "finished" : "racing",
      lastUpdate: new Date().toISOString(),
    };
  } catch (error) {
    console.error("RTRT api fetch error:", error);
    return null;
  }
}
