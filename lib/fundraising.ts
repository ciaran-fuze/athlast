import { supabase } from "@/lib/supabase";

export interface FundraisingProgress {
  url: string;
  donateUrl: string;
  raised: number | null;
  target: number | null;
  currency: string;
  supporters: number | null;
  charity: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: FundraisingProgress }>();

function parseMoney(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^\d.]/g, ""));
  return isNaN(n) ? null : n;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

// EventMaster / Give2you page, e.g. https://eventmaster.ie/fundraising/pages/PB13268114
function parseEventmaster(url: string, html: string): FundraisingProgress {
  const amounts = html.match(/class="progress-title">\s*<h5>\s*<span>([^<]*)<\/span>\s*<span>([^<]*)<\/span>/);
  const supporters = html.match(/Supporters \((\d+)\)/);
  const charity = html.match(/fundraising for\s*<a[^>]*href="[^"]*\/charity\/[^"]*"[^>]*>([^<]+)<\/a>/);
  const donate = html.match(/href="([^"]*\/donate\.html)"/);
  return {
    url,
    donateUrl: donate ? new URL(donate[1], url).toString() : url,
    raised: parseMoney(amounts?.[1]),
    target: parseMoney(amounts?.[2]),
    currency: amounts?.[1]?.trim().charAt(0) || "€",
    supporters: supporters ? Number(supporters[1]) : null,
    charity: charity ? decode(charity[1]) : null,
  };
}

/** Read progress from a public fundraising page. Falls back to just a donate link if it can't be read. */
export async function fetchFundraising(url: string): Promise<FundraisingProgress> {
  const fallback: FundraisingProgress = {
    url,
    donateUrl: url,
    raised: null,
    target: null,
    currency: "€",
    supporters: null,
    charity: null,
  };

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  try {
    if (!/(^|\.)eventmaster\.ie$/.test(new URL(url).hostname)) return fallback;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return hit?.data ?? fallback;
    const data = parseEventmaster(url, await res.text());
    cache.set(url, { at: Date.now(), data });
    return data;
  } catch {
    return hit?.data ?? fallback;
  }
}

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

/** Keep a reading of progress over time (at most one per 5 min per athlete), so race-day donations can be measured. */
export async function recordFundraisingSnapshot(raceAthleteId: string, data: FundraisingProgress): Promise<void> {
  if (data.raised === null) return;
  try {
    const { data: last } = await supabase
      .from("fundraising_snapshots")
      .select("captured_at")
      .eq("race_athlete_id", raceAthleteId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && Date.now() - new Date(last.captured_at).getTime() < SNAPSHOT_INTERVAL_MS) return;
    await supabase.from("fundraising_snapshots").insert({
      race_athlete_id: raceAthleteId,
      raised: data.raised,
      target: data.target,
      supporters: data.supporters,
    });
  } catch {
    // Never let tracking break the page
  }
}
