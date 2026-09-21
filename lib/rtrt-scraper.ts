import { chromium, type Browser, type Page, type Frame } from "playwright";

export interface RtrtSplit {
  name: string;
  time: string | null;
  pace: string | null;
}

export interface RtrtAthleteData {
  name: string | null;
  bib: string | null;
  splits: RtrtSplit[];
  finishTime: string | null;
  avgPace: string | null;
  overallPlace: number | null;
  overallTotal: number | null;
  status: "not_started" | "racing" | "finished";
  lastUpdate: string;
}

/**
 * Scrape an athlete's tracking data from RTRT.
 */
export async function scrapeRtrtAthlete(
  eventCode: string,
  athleteId: string
): Promise<RtrtAthleteData | null> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    const url = `https://track.rtrt.me/e/${eventCode}#/tracker/${athleteId}/focus`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Click through RTRT prompts in the inner iframe
    await dismissPrompts(page);

    // Wait for data to render
    await page.waitForTimeout(8000);

    // Find the app frame and extract data
    const data = await extractFromFrames(page);

    await browser.close();
    return data;
  } catch (error) {
    console.error("RTRT scraper error:", error);
    if (browser) await browser.close();
    return null;
  }
}

async function dismissPrompts(page: Page) {
  await page.waitForTimeout(4000);

  for (const frame of page.frames()) {
    try {
      const continueBtn = frame.getByText(/continue in browser/i).first();
      if (await continueBtn.isVisible({ timeout: 2000 })) {
        await continueBtn.click();
        await page.waitForTimeout(2000);
      }
    } catch {}

    try {
      const spectatorBtn = frame.getByText("I'm a Spectator").first();
      if (await spectatorBtn.isVisible({ timeout: 2000 })) {
        await spectatorBtn.click();
        await page.waitForTimeout(3000);
      }
    } catch {}
  }
}

async function extractFromFrames(page: Page): Promise<RtrtAthleteData | null> {
  for (const frame of page.frames()) {
    if (!frame.url().includes("app.rtrt.me")) continue;

    const text = await frame.evaluate(() => document.body.innerText).catch(() => "");
    if (!text || text.length < 50) continue;

    return extractAthleteData(frame, text);
  }
  return null;
}

function extractAthleteData(frame: Frame, text: string): RtrtAthleteData {
  // Name — "Philip Masterson" pattern
  let name: string | null = null;
  const nameMatch = text.match(
    /(?:^|\n)([A-Z][a-z]+ [A-Z][a-zA-Z'-]+)\s*\nCat:/m
  );
  if (nameMatch) name = nameMatch[1];

  // Bib
  let bib: string | null = null;
  const bibMatch = text.match(/No\.(\d+)/);
  if (bibMatch) bib = bibMatch[1];

  // Splits — "SPLIT_NAME \t HH:MM:SS \t HH:MM:SS \t MM:SS"
  const splits: RtrtSplit[] = [];
  const splitPattern =
    /^(START|FINISH|HALFWAY|5K|10K|15K|20K|25K|30K|35K|40K|\d+(?:\.\d+)?(?:K|M|MI))\s+(\d{1,2}:\d{2}:\d{2})\s+\d{2}:\d{2}:\d{2}\s+(\d{2}:\d{2}|---)/gim;
  let match;
  while ((match = splitPattern.exec(text)) !== null) {
    splits.push({
      name: match[1].toUpperCase(),
      time: match[2],
      pace: match[3] === "---" ? null : match[3],
    });
  }

  // Finish time
  const finishMatch = text.match(/Finish Time\s+(\d{1,2}:\d{2}:\d{2})/);
  const finishTime = finishMatch ? finishMatch[1] : null;

  // Average pace
  const avgPaceMatch = text.match(/(\d{2}:\d{2})\s*min\/(?:mile|km)/);
  const avgPace = avgPaceMatch ? avgPaceMatch[1] : null;

  // Placement
  const placeMatch = text.match(
    /(\d+)(?:st|nd|rd|th) Place out of ([\d,]+)\s*\n\s*Overall/
  );
  const overallPlace = placeMatch ? parseInt(placeMatch[1]) : null;
  const overallTotal = placeMatch
    ? parseInt(placeMatch[2].replace(",", ""))
    : null;

  // Status
  let status: "not_started" | "racing" | "finished" = "not_started";
  if (finishTime || text.includes("completed")) {
    status = "finished";
  } else if (splits.length > 0) {
    status = "racing";
  }

  return {
    name,
    bib,
    splits,
    finishTime,
    avgPace,
    overallPlace,
    overallTotal,
    status,
    lastUpdate: new Date().toISOString(),
  };
}

// CLI test
if (process.argv[1]?.includes("rtrt-scraper")) {
  const eventCode = process.argv[2] || "TDL-DUBLINHALF-2026";
  const athleteId = process.argv[3] || "RMBRVZJE";

  console.log(`Scraping RTRT: event=${eventCode} athlete=${athleteId}`);
  scrapeRtrtAthlete(eventCode, athleteId).then((data) => {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  });
}
