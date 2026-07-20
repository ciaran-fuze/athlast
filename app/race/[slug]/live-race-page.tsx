"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Split } from "@/lib/raceresult";

// Brand tokens
const brand = {
  bg: "#F5F0E8",
  dark: "#1a1a18",
  accent: "#c8b99a",
  muted: "#8a8070",
  border: "#e0d9cc",
  grid: "#d8d2c5",
  font: {
    display: "var(--font-display), Georgia, serif",
    mono: "var(--font-mono), monospace",
    body: "var(--font-body), sans-serif",
  },
};

interface Race {
  id: string;
  slug: string;
  name: string;
  race_date: string;
  location: string;
  distance_km: number;
  status: string;
}

interface Athlete {
  id: string;
  first_name: string;
  last_name: string;
  profile_picture: string;
}

interface RaceAthlete {
  id: string;
  race_id: string;
  athlete_id: string;
  bib_number: number;
  raceresult_pid: number;
  athletes: Athlete;
}

interface Message {
  id: string;
  race_id: string;
  athlete_id: string;
  sender_name: string;
  message: string | null;
  photo_url: string | null;
  athlete_km_at_send: number | null;
  created_at: string;
}

export function LiveRacePage({
  race,
  raceAthletes,
  initialSplits,
  initialMessages,
}: {
  race: Race;
  raceAthletes: RaceAthlete[];
  initialSplits: Record<string, Split[]>;
  initialMessages: Message[];
}) {
  const [splits, setSplits] = useState(initialSplits);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedAthlete, setSelectedAthlete] = useState(
    raceAthletes[0]?.athlete_id ?? ""
  );
  const [splitsOpen, setSplitsOpen] = useState(false);

  const pollSplits = useCallback(async () => {
    for (const ra of raceAthletes) {
      if (!ra.raceresult_pid) continue;
      try {
        const res = await fetch(
          `/api/race/splits?race_id=${race.id}&athlete_id=${ra.athlete_id}`
        );
        if (res.ok) {
          const data = await res.json();
          setSplits((prev) => ({ ...prev, [ra.athlete_id]: data.splits }));
        }
      } catch {
        // Silently fail
      }
    }
  }, [race.id, raceAthletes]);

  const pollMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/race/cheer?race_id=${race.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch {
      // Silently fail
    }
  }, [race.id]);

  useEffect(() => {
    if (race.status !== "live") return;
    const interval = setInterval(() => {
      pollSplits();
      pollMessages();
    }, 30000);
    return () => clearInterval(interval);
  }, [race.status, pollSplits, pollMessages]);

  const athlete = raceAthletes.find(
    (ra) => ra.athlete_id === selectedAthlete
  );
  const athleteSplits = splits[selectedAthlete] ?? [];
  const completedSplits = athleteSplits.filter((s) => s.Exists);
  const lastSplit = completedSplits[completedSplits.length - 1];
  const lastCompletedIndex = completedSplits.length - 1;

  // Estimated current position
  const [estimatedKm, setEstimatedKm] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick every 5s so estimate updates live
  useEffect(() => {
    if (race.status !== "live") return;
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [race.status]);

  useEffect(() => {
    const est = estimateCurrentKm(athleteSplits, race.distance_km, now);
    setEstimatedKm(est);
  }, [athleteSplits, race.distance_km, now]);

  // Progress: use estimated km for a smoother position between splits
  const progressPct =
    estimatedKm !== null
      ? Math.round((estimatedKm / race.distance_km) * 100)
      : athleteSplits.length > 0
        ? Math.round((completedSplits.length / athleteSplits.length) * 100)
        : 0;

  // Track fill: extend slightly past last completed dot based on estimate,
  // but never past the next uncompleted dot
  const trackPct = (() => {
    if (athleteSplits.length <= 1) return 0;
    if (lastCompletedIndex < 0) return 0;
    const basePct = (lastCompletedIndex / (athleteSplits.length - 1)) * 100;
    if (estimatedKm === null || lastCompletedIndex >= athleteSplits.length - 1) {
      return basePct;
    }
    // How far between last completed and next dot?
    const lastKm = splitNameToKm(athleteSplits[lastCompletedIndex].Name, race.distance_km) ?? 0;
    const nextKm = splitNameToKm(athleteSplits[lastCompletedIndex + 1].Name, race.distance_km);
    if (nextKm === null || nextKm <= lastKm) return basePct;
    const ratio = Math.min((estimatedKm - lastKm) / (nextKm - lastKm), 1);
    if (ratio <= 0) return basePct;
    const dotGap = (1 / (athleteSplits.length - 1)) * 100;
    return basePct + ratio * dotGap;
  })();

  return (
    <div style={{ minHeight: "100vh", background: brand.bg }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.6); opacity: 0.4; }
        }
        @keyframes bubbleIn {
          0% { opacity: 0; transform: scale(0.85) translateY(16px); }
          60% { opacity: 1; transform: scale(1.02) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes bubbleOut {
          0% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.9) translateY(-12px); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes runnerBob {
          0%, 100% { transform: translateY(0) scaleY(1); }
          30% { transform: translateY(-6px) scaleY(1.02); }
          60% { transform: translateY(-2px) scaleY(0.98); }
        }
        @keyframes sheetUp {
          0% { transform: translateY(100%); }
          100% { transform: translateY(0); }
        }
        @keyframes explodeIn {
          0% { opacity: 0; transform: scale(0) rotate(-12deg); }
          30% { opacity: 1; transform: scale(1.2) rotate(3deg); }
          50% { transform: scale(0.92) rotate(-1.5deg); }
          70% { transform: scale(1.08) rotate(1deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes ring {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes splashBackdrop {
          0% { backdrop-filter: blur(0px); background: rgba(26,26,24,0); }
          30% { backdrop-filter: blur(12px); background: rgba(26,26,24,0.4); }
          85% { backdrop-filter: blur(12px); background: rgba(26,26,24,0.4); }
          100% { backdrop-filter: blur(0px); background: rgba(26,26,24,0); }
        }
        @keyframes splashCard {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
          15% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
          25% { transform: translate(-50%, -50%) scale(0.95); }
          35% { transform: translate(-50%, -50%) scale(1.02); }
          40% { transform: translate(-50%, -50%) scale(1); }
          80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.6) translateY(40px); }
        }
        @keyframes splashRing1 {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
        }
        @keyframes splashRing2 {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 0.4; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
        }
      `}</style>

      {/* Hero — race + athlete + progress all in one */}
      <div
        style={{
          background: brand.dark,
          color: "#fff",
          padding: "2.5rem 1rem 2rem",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <img
            src="/logo.png"
            alt="Athlast."
            style={{
              height: 28,
              marginBottom: "1.5rem",
              filter: "invert(1)",
            }}
          />

          {/* Race info row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "0.5rem",
            }}
          >
            <StatusBadge status={race.status} />
            <span
              style={{
                fontFamily: brand.font.mono,
                fontSize: "0.65rem",
                color: brand.accent,
                letterSpacing: "0.03em",
              }}
            >
              {race.name} / {race.distance_km}km / {race.location}
            </span>
          </div>

          {/* Athlete selector (if multiple) */}
          {raceAthletes.length > 1 && (
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                margin: "1rem 0",
                overflowX: "auto",
              }}
            >
              {raceAthletes.map((ra) => {
                const active = selectedAthlete === ra.athlete_id;
                return (
                  <button
                    key={ra.athlete_id}
                    onClick={() => setSelectedAthlete(ra.athlete_id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.4rem 0.85rem",
                      background: active ? "rgba(255,255,255,0.15)" : "transparent",
                      color: "#fff",
                      border: `1px solid ${active ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: "999px",
                      cursor: "pointer",
                      fontFamily: brand.font.body,
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ra.athletes.profile_picture && (
                      <img
                        src={ra.athletes.profile_picture}
                        alt=""
                        style={{ width: 20, height: 20, borderRadius: "50%" }}
                      />
                    )}
                    {ra.athletes.first_name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Athlete name + photo */}
          {athlete && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                margin: "1.25rem 0 1rem",
              }}
            >
              {athlete.athletes.profile_picture ? (
                <img
                  src={athlete.athletes.profile_picture}
                  alt=""
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "2px solid rgba(255,255,255,0.15)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: brand.accent,
                    fontFamily: brand.font.display,
                    fontSize: "1.25rem",
                  }}
                >
                  {athlete.athletes.first_name?.[0]}
                  {athlete.athletes.last_name?.[0]}
                </div>
              )}
              <div>
                <h1
                  style={{
                    margin: 0,
                    fontFamily: brand.font.display,
                    fontSize: "1.75rem",
                    fontWeight: 400,
                    lineHeight: 1.1,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {athlete.athletes.first_name} {athlete.athletes.last_name}
                </h1>
                <div
                  style={{
                    fontFamily: brand.font.mono,
                    fontSize: "0.65rem",
                    color: brand.accent,
                    marginTop: "0.25rem",
                    display: "flex",
                    gap: "0.75rem",
                  }}
                >
                  {athlete.bib_number && <span>BIB #{athlete.bib_number}</span>}
                  {estimatedKm !== null && race.status === "live" ? (
                    <span>Est. ~{estimatedKm.toFixed(1)}km</span>
                  ) : lastSplit ? (
                    <span>
                      Last seen: {lastSplit.Name}
                      {lastSplit.Chip && <> — {lastSplit.Chip}</>}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* Progress bar inline in hero */}
          {athleteSplits.length > 0 && (
            <div style={{ marginTop: "0.5rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.6rem",
                  fontFamily: brand.font.mono,
                  fontSize: "0.6rem",
                  color: "rgba(255,255,255,0.5)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <span>Race progress</span>
                <span style={{ color: brand.accent, fontWeight: 500 }}>
                  {estimatedKm !== null
                    ? `~${estimatedKm.toFixed(1)}km / ${race.distance_km}km`
                    : `${progressPct}%`}
                </span>
              </div>
              <div style={{ padding: "0 8px" }}>
                {/* Everything shares this flex container's coordinate space */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    position: "relative",
                  }}
                >
                  {/* Track background */}
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: 0,
                      right: 0,
                      height: 3,
                      background: "rgba(255,255,255,0.1)",
                      borderRadius: 2,
                      transform: "translateY(-50%)",
                    }}
                  />
                  {/* Track fill */}
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: 0,
                      height: 3,
                      background: brand.accent,
                      borderRadius: 2,
                      transform: "translateY(-50%)",
                      width: `${trackPct}%`,
                      transition: "width 2s ease-out",
                    }}
                  />
                  {/* Estimated position pulsing marker */}
                  {race.status === "live" && estimatedKm !== null && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: `${trackPct}%`,
                        width: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 5,
                        pointerEvents: "none",
                        transition: "left 2s ease-out",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: brand.accent,
                          opacity: 0.3,
                          animation: "pulse 2s ease-in-out infinite",
                        }}
                      />
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          background: brand.accent,
                          border: `2px solid ${brand.dark}`,
                          position: "relative",
                          zIndex: 2,
                        }}
                      />
                    </div>
                  )}
                  {athleteSplits.map((split, i) => {
                    const isCompleted = split.Exists;
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          width: 0,
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            width: isCompleted ? 10 : 8,
                            height: isCompleted ? 10 : 8,
                            borderRadius: "50%",
                            background: isCompleted ? brand.accent : "rgba(255,255,255,0.15)",
                            border: isCompleted ? "none" : "1.5px solid rgba(255,255,255,0.2)",
                            transition: "all 0.3s ease",
                            position: "relative",
                            zIndex: 1,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "0.4rem",
                  padding: "0 8px",
                }}
              >
                {athleteSplits.map((split, i) => (
                  <div
                    key={i}
                    style={{
                      fontFamily: brand.font.mono,
                      fontSize: "0.5rem",
                      color: split.Exists
                        ? "rgba(255,255,255,0.7)"
                        : "rgba(255,255,255,0.25)",
                      fontWeight: split.Exists ? 500 : 400,
                      textAlign: "center",
                      width: 0,
                      display: "flex",
                      justifyContent: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {split.Name === "Startline"
                      ? "Start"
                      : split.Name === "Finishline"
                        ? "Finish"
                        : split.Name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content — extra bottom padding for sticky input bar */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem 4rem" }}>

        {/* Floating message field */}
        <MessageField
          messages={messages}
          raceAthletes={raceAthletes}
          splits={splits}
          athleteSplits={athleteSplits}
          raceDistanceKm={race.distance_km}
          isLive={race.status === "live"}
          athleteFirstName={athlete?.athletes.first_name ?? "the athlete"}
        />

        {/* Message input — part of the support section */}
        <StickyMessageBar
          raceId={race.id}
          athleteId={selectedAthlete}
          athleteName={athlete?.athletes.first_name ?? ""}
          athleteKm={estimatedKm}
          onSent={pollMessages}
        />

        {/* Race data — collapsible */}
        {athleteSplits.length > 0 && (
          <div
            style={{
              background: "#fff",
              border: `1px solid ${brand.border}`,
              borderRadius: "12px",
              overflow: "hidden",
              marginTop: "1.5rem",
            }}
          >
            <button
              onClick={() => setSplitsOpen(!splitsOpen)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1rem 1.25rem",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: brand.font.mono,
                fontWeight: 500,
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: brand.muted,
              }}
            >
              <span>Split times</span>
              <span
                style={{
                  transform: splitsOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                  fontSize: "0.8rem",
                }}
              >
                ▾
              </span>
            </button>
            {splitsOpen && (
              <div>
                {athleteSplits.map((split, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "0.75rem 1.25rem",
                      borderTop: `1px solid ${brand.grid}`,
                      opacity: split.Exists ? 1 : 0.3,
                      gap: "0.75rem",
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        background: split.Exists ? brand.dark : brand.grid,
                        color: split.Exists ? brand.accent : brand.muted,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: brand.font.mono,
                        fontSize: "0.65rem",
                        fontWeight: 500,
                        flexShrink: 0,
                      }}
                    >
                      {split.Exists ? "✓" : i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: brand.font.body,
                          fontWeight: 500,
                          fontSize: "0.85rem",
                          color: brand.dark,
                        }}
                      >
                        {split.Name}
                      </div>
                      {split.Exists && (
                        <div
                          style={{
                            fontFamily: brand.font.mono,
                            fontSize: "0.7rem",
                            color: brand.muted,
                            marginTop: "0.1rem",
                          }}
                        >
                          {split.Chip ?? split.Gun ?? ""}
                          {split.Sector && <> · {split.Sector}</>}
                        </div>
                      )}
                    </div>
                    {split.Exists && split.Speed && (
                      <div
                        style={{
                          fontFamily: brand.font.mono,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          color: brand.dark,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {split.Speed}
                      </div>
                    )}
                    {split.Exists && split.RO && split.ROM && (
                      <div
                        style={{
                          fontFamily: brand.font.mono,
                          fontSize: "0.65rem",
                          color: brand.muted,
                          whiteSpace: "nowrap",
                        }}
                      >
                        #{split.RO}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

/* ─── Estimated Position ─── */

function chipToSeconds(chip: string): number {
  const parts = chip.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function todToDate(tod: string, referenceDate: string): number {
  // TOD is "HH:MM:SS", referenceDate is used for the date part
  const datePart = referenceDate.slice(0, 10);
  return new Date(`${datePart}T${tod}`).getTime();
}

function estimateCurrentKm(
  athleteSplits: Split[],
  raceDistanceKm: number,
  nowMs: number
): number | null {
  const completed = athleteSplits.filter((s) => s.Exists);
  if (completed.length < 2) return null;

  const lastCompleted = completed[completed.length - 1];
  const lastKm = splitNameToKm(lastCompleted.Name, raceDistanceKm);
  if (lastKm === null) return null;

  // If the last split is the finish line, they're done
  if (lastCompleted.Name === "Finishline" || lastCompleted.Name === "Finish") {
    return raceDistanceKm;
  }

  // Find the next uncompleted split
  const lastCompletedIdx = athleteSplits.indexOf(lastCompleted);
  const nextSplit = athleteSplits[lastCompletedIdx + 1];
  if (!nextSplit) return lastKm;
  const nextKm = splitNameToKm(nextSplit.Name, raceDistanceKm);
  if (nextKm === null) return lastKm;

  // Calculate average pace from the last sector or overall
  // Use the last two completed splits for a recent pace estimate
  const prev = completed[completed.length - 2];
  const prevKm = splitNameToKm(prev.Name, raceDistanceKm);
  if (prevKm === null || !prev.Chip || !lastCompleted.Chip) return lastKm;

  const prevChipSec = chipToSeconds(prev.Chip);
  const lastChipSec = chipToSeconds(lastCompleted.Chip);
  const sectorTimeSec = lastChipSec - prevChipSec;
  const sectorDistKm = lastKm - prevKm;
  if (sectorDistKm <= 0 || sectorTimeSec <= 0) return lastKm;
  const paceSecPerKm = sectorTimeSec / sectorDistKm;

  // How long since they passed the last split?
  // Use TOD if available, otherwise fall back to chip time extrapolation
  let elapsedSinceLastSplit: number;
  if (lastCompleted.TOD) {
    // Use TOD — needs a reference date. Use today as approximation.
    const todMs = todToDate(lastCompleted.TOD, new Date().toISOString());
    elapsedSinceLastSplit = (nowMs - todMs) / 1000;
  } else {
    // Can't estimate without TOD in real-time
    return lastKm;
  }

  if (elapsedSinceLastSplit < 0) return lastKm;

  const extraKm = elapsedSinceLastSplit / paceSecPerKm;
  const estimated = lastKm + extraKm;

  // Clamp to not overshoot next split
  return Math.min(estimated, nextKm);
}

/* ─── Race helpers ─── */

function splitNameToKm(name: string, raceDistanceKm: number): number | null {
  if (name === "Startline" || name === "Start") return 0;
  if (name === "Finishline" || name === "Finish") return raceDistanceKm;
  const kmMatch = name.match(/^(\d+(?:\.\d+)?)\s*K$/i);
  if (kmMatch) return parseFloat(kmMatch[1]);
  const miMatch = name.match(/^(\d+(?:\.\d+)?)\s*mi$/i);
  if (miMatch) return parseFloat(miMatch[1]) * 1.60934;
  if (name.toLowerCase() === "half") return 21.1;
  return null;
}

/* ─── Message Timeline ─── */

// Two rows — top (5-55px) and bottom (125-175px), well above the timeline at 290px
function getBubbleY(i: number): number {
  const isTop = i % 2 === 0;
  const base = isTop ? 5 : 125;
  const jitter = ((i * 7 + 3) % 5) * 12;
  return base + jitter;
}

function getBubbleRotate(i: number): number {
  return ((i * 5 + 2) % 7) - 3; // -3 to +3
}

function MessageField({
  messages,
  raceAthletes,
  splits,
  athleteSplits,
  raceDistanceKm,
  isLive,
  athleteFirstName,
}: {
  messages: Message[];
  raceAthletes: RaceAthlete[];
  splits: Record<string, Split[]>;
  athleteSplits: Split[];
  raceDistanceKm: number;
  isLive: boolean;
  athleteFirstName: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(messages.length);
  const [popupMsg, setPopupMsg] = useState<Message | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [splashMsg, setSplashMsg] = useState<Message | null>(null);
  const splashQueueRef = useRef<Message[]>([]);
  const splashActiveRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScrollingRef = useRef(false);

  const uniqueSupporters = new Set(messages.map((m) => m.sender_name)).size;
  const recentCutoff = Date.now() - 10 * 60 * 1000;
  const recentSupporters = new Set(
    messages
      .filter((m) => new Date(m.created_at).getTime() > recentCutoff)
      .map((m) => m.sender_name)
  ).size;

  const chronological = [...messages].reverse();


  // Simple layout: spread all messages evenly left-to-right, 200px apart
  const BUBBLE_SPACE = 200;
  const PADDING = 40;
  const fieldWidth = PADDING + Math.max(chronological.length * BUBBLE_SPACE, 400) + PADDING;

  // X position: evenly spaced with jitter
  const bubbleX: number[] = chronological.map((_, i) => {
    const base = PADDING + (i / Math.max(chronological.length - 1, 1)) * (fieldWidth - PADDING * 2 - 200) + 100;
    const jitter = ((i * 11 + 5) % 9 - 4) * 6;
    return base + jitter;
  });

  // Y positions: hash-scatter, nudge if too close to neighbour
  const bubbleYPos: number[] = [];
  for (let i = 0; i < chronological.length; i++) {
    let h = (i + 1) * 2654435761;
    h = ((h >> 16) ^ h) & 0xFFFF;
    let y = 10 + (h % 200);
    // If within 80px of previous bubble, push apart
    if (i > 0 && Math.abs(y - bubbleYPos[i - 1]) < 80) {
      y = (bubbleYPos[i - 1] + 120) % 200 + 10;
    }
    bubbleYPos.push(y);
  }


  // Process splash queue — show one at a time, 3s each
  function processQueue() {
    if (splashActiveRef.current) return;
    const next = splashQueueRef.current.shift();
    if (!next) return;
    splashActiveRef.current = true;
    setSplashMsg(next);
    setTimeout(() => {
      setSplashMsg(null);
      splashActiveRef.current = false;
      // Process next in queue
      processQueue();
    }, 3000);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNew = messages.length > prevCountRef.current;

    if (isNew) {
      const prevIds = new Set(
        chronological.slice(0, prevCountRef.current).map((m) => m.id)
      );
      const arriving = messages.filter((m) => !prevIds.has(m.id));
      setNewIds((prev) => {
        const next = new Set(prev);
        arriving.forEach((m) => next.add(m.id));
        return next;
      });

      // Queue all new messages for splash
      splashQueueRef.current.push(...arriving);
      processQueue();

      // Clear new IDs after all splashes finish (3s per message + buffer)
      setTimeout(() => setNewIds(new Set()), arriving.length * 3000 + 500);
    }

    requestAnimationFrame(() => {
      el.scrollTo({
        left: el.scrollWidth,
        behavior: isNew ? "smooth" : "instant",
      });
    });
    prevCountRef.current = messages.length;
  }, [messages.length]);

  // Auto-scroll back to current (right edge) after 5s of no interaction
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function resetIdleTimer() {
      userScrollingRef.current = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        userScrollingRef.current = false;
        el?.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
      }, 5000);
    }

    el.addEventListener("touchstart", resetIdleTimer, { passive: true });
    el.addEventListener("mousedown", resetIdleTimer);

    return () => {
      el.removeEventListener("touchstart", resetIdleTimer);
      el.removeEventListener("mousedown", resetIdleTimer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  if (messages.length === 0) {
    return (
      <div
        style={{
          padding: "3rem 1.5rem",
          textAlign: "center",
          background: "#fff",
          border: `1px solid ${brand.border}`,
          borderRadius: "16px",
        }}
      >
        <div
          style={{
            fontFamily: brand.font.display,
            fontSize: "1.25rem",
            fontWeight: 400,
            color: brand.dark,
            marginBottom: "0.5rem",
          }}
        >
          No messages yet
        </div>
        <div
          style={{
            fontFamily: brand.font.body,
            fontSize: "0.85rem",
            color: brand.muted,
          }}
        >
          Be the first to show your support.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "1rem" }}>
        <h2
          style={{
            margin: "0 0 0.5rem",
            fontFamily: brand.font.display,
            fontSize: "1.15rem",
            fontWeight: 400,
          }}
        >
          From {athleteFirstName}&rsquo;s supporters
        </h2>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontFamily: brand.font.mono,
            fontSize: "0.65rem",
            color: brand.muted,
          }}
        >
          {recentSupporters > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                background: "#dcfce7",
                color: "#166534",
                padding: "0.15rem 0.5rem",
                borderRadius: "999px",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#166534",
                  display: "inline-block",
                }}
              />
              {recentSupporters} active now
            </span>
          )}
          <span
            style={{
              background: brand.grid,
              padding: "0.15rem 0.5rem",
              borderRadius: "999px",
            }}
          >
            {uniqueSupporters} supporter{uniqueSupporters !== 1 ? "s" : ""} · {messages.length} message{messages.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Swipe hint */}
      {chronological.length > 3 && (
        <div
          style={{
            fontFamily: brand.font.mono,
            fontSize: "0.55rem",
            color: brand.muted,
            marginBottom: "0.25rem",
            letterSpacing: "0.03em",
          }}
        >
          ← swipe to go back in the race
        </div>
      )}

      {/* Scrollable field with timeline */}
      <style>{`
        .message-field::-webkit-scrollbar { display: none; }
      `}</style>
      <div
        ref={fieldRef}
        style={{ position: "relative" }}
      >
        <div
          ref={scrollRef}
          className="message-field"
          style={{
            overflowX: "auto",
            overflowY: "hidden",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            position: "relative",
            height: 380,
          }}
        >
          <div
            style={{
              position: "relative",
              width: fieldWidth,
              height: "100%",
            }}
          >
            {/* Terrain — single wavy line with subtle fill below */}
            <svg
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: fieldWidth,
                height: 40,
              }}
              viewBox={`0 0 ${fieldWidth} 40`}
              preserveAspectRatio="none"
              fill="none"
            >
              <path
                d={`M 0 28 Q ${fieldWidth * 0.08} 18, ${fieldWidth * 0.16} 24 Q ${fieldWidth * 0.25} 30, ${fieldWidth * 0.35} 20 Q ${fieldWidth * 0.45} 12, ${fieldWidth * 0.55} 22 Q ${fieldWidth * 0.65} 30, ${fieldWidth * 0.75} 18 Q ${fieldWidth * 0.85} 10, ${fieldWidth * 0.95} 22 L ${fieldWidth} 22 L ${fieldWidth} 40 L 0 40 Z`}
                fill={brand.grid}
                opacity="0.4"
              />
              <path
                d={`M 0 28 Q ${fieldWidth * 0.08} 18, ${fieldWidth * 0.16} 24 Q ${fieldWidth * 0.25} 30, ${fieldWidth * 0.35} 20 Q ${fieldWidth * 0.45} 12, ${fieldWidth * 0.55} 22 Q ${fieldWidth * 0.65} 30, ${fieldWidth * 0.75} 18 Q ${fieldWidth * 0.85} 10, ${fieldWidth * 0.95} 22 L ${fieldWidth} 22`}
                stroke={brand.border}
                strokeWidth="1"
                fill="none"
              />
            </svg>

            {/* Clouds scattered across the sky */}
            {Array.from({ length: Math.max(10, Math.ceil(fieldWidth / 250)) }).map((_, ci) => {
              const cx = ((ci * 251 + 80) % fieldWidth);
              const cy = 5 + ((ci * 37 + 11) % 35);
              const s = 0.8 + ((ci * 7) % 5) * 0.2;
              return (
                <svg
                  key={`cloud-${ci}`}
                  style={{
                    position: "absolute",
                    left: cx,
                    top: cy,
                    width: 56 * s,
                    height: 24 * s,
                    opacity: 0.45,
                  }}
                  viewBox="0 0 48 20"
                  fill={brand.grid}
                >
                  <ellipse cx="16" cy="14" rx="10" ry="6" />
                  <ellipse cx="28" cy="12" rx="12" ry="8" />
                  <ellipse cx="38" cy="14" rx="8" ry="5" />
                </svg>
              );
            })}


            {/* Birds scattered in the sky */}
            {Array.from({ length: Math.max(8, Math.ceil(fieldWidth / 250)) }).map((_, bi) => {
              const bx = ((bi * 307 + 120) % fieldWidth);
              const by = 3 + ((bi * 41 + 7) % 45);
              const s = 1 + ((bi * 3) % 3) * 0.3;
              return (
                <svg
                  key={`bird-${bi}`}
                  style={{
                    position: "absolute",
                    left: bx,
                    top: by,
                    width: 20 * s,
                    height: 12 * s,
                    opacity: 0.5,
                  }}
                  viewBox="0 0 14 8"
                  fill="none"
                  stroke={brand.grid}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M0 6 Q3.5 1 7 4 Q10.5 1 14 6" />
                </svg>
              );
            })}

            {/* Runner silhouette at far right */}
            <img
              src="/runner-silhouette.svg"
              alt=""
              style={{
                position: "absolute",
                bottom: 14,
                right: 24,
                height: 56,
                opacity: 0.35,
                animation: "runnerBob 0.8s ease-in-out infinite",
                zIndex: 2,
              }}
            />

            {/* Start line */}
            <div
              style={{
                position: "absolute",
                left: PADDING - 10,
                top: 20,
                bottom: 40,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.3rem",
                zIndex: 2,
              }}
            >
              <span
                style={{
                  fontFamily: brand.font.mono,
                  fontSize: "0.5rem",
                  fontWeight: 600,
                  color: brand.muted,
                  letterSpacing: "0.08em",
                }}
              >
                START
              </span>
              <div
                style={{
                  flex: 1,
                  width: 1.5,
                  backgroundImage: `repeating-linear-gradient(to bottom, ${brand.border} 0px, ${brand.border} 4px, transparent 4px, transparent 8px)`,
                }}
              />
            </div>

            {/* Floating message bubbles */}
            {chronological.map((msg, i) => {
              const bubbleY = bubbleYPos[i];
              const rotate = getBubbleRotate(i);
              const floatDur = 3.5 + (i % 3);
              const floatDel = (i * 0.7) % 2.5;
              const isPhoto = !!msg.photo_url;
              const isNew = newIds.has(msg.id);
              const km = msg.athlete_km_at_send;
              const stamp = km !== null && km !== undefined ? `${km.toFixed(1)}KM` : null;

              return (
                <div
                  key={msg.id}
                  onClick={() => setPopupMsg(msg)}
                  style={{
                    position: "absolute",
                    left: bubbleX[i],
                    top: bubbleY,
                    width: isPhoto ? 150 : 180,
                    transform: `rotate(${rotate}deg)`,
                    transformOrigin: "center center",
                    background: "#fff",
                    border: `1px solid ${brand.border}`,
                    borderRadius: "16px",
                    padding: isPhoto ? "0.4rem" : "0.75rem 0.85rem",
                    boxShadow: isNew
                      ? "0 8px 32px rgba(26,26,24,0.15)"
                      : "0 2px 12px rgba(26,26,24,0.05)",
                    cursor: "pointer",
                    animation: isNew
                      ? "explodeIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards"
                      : `float ${floatDur}s ease-in-out ${floatDel}s infinite`,
                    zIndex: isNew ? 5 : 1,
                  }}
                >
                  {isNew && (
                    <div
                      style={{
                        position: "absolute",
                        inset: -4,
                        borderRadius: "20px",
                        border: `2px solid ${brand.accent}`,
                        animation: "ring 0.8s ease-out forwards",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  {isPhoto && (
                    <img
                      src={msg.photo_url!}
                      alt=""
                      style={{
                        width: "100%",
                        borderRadius: "12px",
                        display: "block",
                        maxHeight: 100,
                        objectFit: "cover",
                        marginBottom: msg.message ? "0.4rem" : "0.3rem",
                      }}
                    />
                  )}
                  {msg.message && (
                    <p
                      style={{
                        margin: 0,
                        fontFamily: brand.font.body,
                        fontSize: "0.85rem",
                        lineHeight: 1.4,
                        color: brand.dark,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {msg.message}
                    </p>
                  )}
                  <div
                    style={{
                      marginTop: "0.4rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: brand.font.body,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: brand.dark,
                      }}
                    >
                      {msg.sender_name}
                    </span>
                    {stamp && (
                      <span
                        style={{
                          fontFamily: brand.font.mono,
                          fontSize: "0.55rem",
                          fontWeight: 500,
                          color: brand.dark,
                          background: brand.grid,
                          padding: "0.1rem 0.35rem",
                          borderRadius: "4px",
                          letterSpacing: "0.03em",
                        }}
                      >
                        {stamp}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Splash — scoped to field, blurs just the messages area */}
        {splashMsg && (() => {
          const sKm = splashMsg.athlete_km_at_send;
          const sStamp = sKm !== null && sKm !== undefined
            ? `${sKm.toFixed(1)}KM`
            : null;
          return (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                pointerEvents: "none",
                animation: "splashBackdrop 3s ease-out forwards",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              {/* Rings */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "45%",
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  border: `3px solid ${brand.accent}`,
                  animation: "splashRing1 0.8s ease-out forwards",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "45%",
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  border: `2px solid ${brand.accent}`,
                  animation: "splashRing2 1s ease-out 0.1s forwards",
                }}
              />
              {/* Card */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "45%",
                  transform: "translate(-50%, -50%)",
                  width: "80%",
                  maxWidth: 320,
                  background: "#fff",
                  borderRadius: "20px",
                  padding: "1.25rem",
                  boxShadow: "0 16px 48px rgba(26,26,24,0.2)",
                  animation: "splashCard 3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                }}
              >
                {splashMsg.photo_url && (
                  <img
                    src={splashMsg.photo_url}
                    alt=""
                    style={{
                      width: "100%",
                      borderRadius: "12px",
                      marginBottom: "0.75rem",
                      display: "block",
                      maxHeight: 200,
                      objectFit: "contain",
                    }}
                  />
                )}
                {splashMsg.message && (
                  <p
                    style={{
                      margin: 0,
                      fontFamily: brand.font.display,
                      fontSize: "1.1rem",
                      fontWeight: 400,
                      fontStyle: "italic",
                      lineHeight: 1.5,
                      color: brand.dark,
                      textAlign: "center",
                    }}
                  >
                    &ldquo;{splashMsg.message}&rdquo;
                  </p>
                )}
                <div
                  style={{
                    marginTop: "0.6rem",
                    textAlign: "center",
                    fontFamily: brand.font.body,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: brand.dark,
                  }}
                >
                  {splashMsg.sender_name}
                  {sStamp && (
                    <span
                      style={{
                        fontFamily: brand.font.mono,
                        fontSize: "0.6rem",
                        fontWeight: 500,
                        color: brand.accent,
                        marginLeft: "0.4rem",
                      }}
                    >
                      {sStamp}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Popup — tap a bubble to read fully */}
      {popupMsg && (() => {
        const pKm = popupMsg.athlete_km_at_send;
        const pStamp = pKm !== null && pKm !== undefined
          ? `${pKm.toFixed(1)}KM`
          : null;
        return (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(26,26,24,0.5)",
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1.5rem",
            }}
            onClick={() => setPopupMsg(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#fff",
                borderRadius: "20px",
                padding: "1.5rem",
                maxWidth: 380,
                width: "100%",
                boxShadow: "0 12px 40px rgba(26,26,24,0.15)",
                animation: "bubbleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
              }}
            >
              {popupMsg.photo_url && (
                <img
                  src={popupMsg.photo_url}
                  alt="Supporter photo"
                  style={{
                    width: "100%",
                    borderRadius: "12px",
                    marginBottom: "1rem",
                    display: "block",
                    maxHeight: 400,
                    objectFit: "contain",
                  }}
                />
              )}
              {popupMsg.message && (
                <p
                  style={{
                    margin: 0,
                    fontFamily: brand.font.display,
                    fontSize: "1.15rem",
                    fontWeight: 400,
                    fontStyle: "italic",
                    lineHeight: 1.5,
                    color: brand.dark,
                  }}
                >
                  &ldquo;{popupMsg.message}&rdquo;
                </p>
              )}
              <div
                style={{
                  marginTop: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: brand.font.body,
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: brand.dark,
                    }}
                  >
                    {popupMsg.sender_name}
                  </span>
                  <span
                    style={{
                      fontFamily: brand.font.mono,
                      fontSize: "0.65rem",
                      color: brand.muted,
                      marginLeft: "0.4rem",
                    }}
                  >
                    {timeAgo(popupMsg.created_at)}
                  </span>
                </div>
                {pStamp && (
                  <span
                    style={{
                      fontFamily: brand.font.mono,
                      fontSize: "0.65rem",
                      fontWeight: 500,
                      color: brand.accent,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {pStamp}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── Helpers ─── */

function timeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    upcoming: { bg: "rgba(200,185,154,0.2)", text: brand.accent },
    live: { bg: "#dcfce7", text: "#166534" },
    finished: { bg: "rgba(255,255,255,0.1)", text: brand.accent },
  };
  const c = styles[status] ?? styles.upcoming;
  return (
    <span
      style={{
        padding: "0.2rem 0.6rem",
        borderRadius: "999px",
        fontFamily: brand.font.mono,
        fontSize: "0.6rem",
        fontWeight: 500,
        background: c.bg,
        color: c.text,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {status === "live" ? "● Live" : status}
    </span>
  );
}

function StickyMessageBar({
  raceId,
  athleteId,
  athleteName,
  athleteKm,
  onSent,
}: {
  raceId: string;
  athleteId: string;
  athleteName: string;
  athleteKm: number | null;
  onSent: () => void;
}) {
  const [name, setName] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("athlast_name") || "";
    return "";
  });
  const [hasName, setHasName] = useState(() => {
    if (typeof window !== "undefined") return !!localStorage.getItem("athlast_name");
    return false;
  });
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasName && !name.trim()) return;
    if (!message.trim()) return;
    setSending(true);

    const senderName = name.trim();
    // Remember name for next time
    if (typeof window !== "undefined") {
      localStorage.setItem("athlast_name", senderName);
    }
    setHasName(true);

    const res = await fetch("/api/race/cheer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        race_id: raceId,
        athlete_id: athleteId,
        sender_name: senderName,
        message: message.trim(),
        photo_url: null,
        athlete_km_at_send: athleteKm,
      }),
    });

    if (res.ok) {
      setMessage("");
      onSent();
    }
    setSending(false);
  }

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "1rem",
        background: "#fff",
        border: `1px solid ${brand.border}`,
        borderRadius: "16px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: 640,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem",
        }}
      >
        {/* Name input — only shows until first send */}
        {!hasName && (
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              padding: "0.5rem 0.75rem",
              border: `1px solid ${brand.border}`,
              borderRadius: "8px",
              fontSize: "16px",
              fontFamily: brand.font.body,
              outline: "none",
              background: "#fff",
              color: brand.dark,
            }}
          />
        )}
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-end" }}>
          <input
            type="text"
            placeholder={`Send ${athleteName || "the athlete"} some support...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{
              flex: 1,
              padding: "0.6rem 0.75rem",
              border: `1px solid ${brand.border}`,
              borderRadius: "20px",
              fontSize: "16px",
              fontFamily: brand.font.body,
              outline: "none",
              background: "#fff",
              color: brand.dark,
            }}
          />
          <button
            type="submit"
            disabled={sending}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: sending ? brand.grid : brand.dark,
              color: "#fff",
              border: "none",
              cursor: sending ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        {hasName && (
          <div
            style={{
              fontFamily: brand.font.mono,
              fontSize: "0.55rem",
              color: brand.muted,
              paddingLeft: "0.25rem",
            }}
          >
            Sending as {name}{" "}
            <span
              onClick={() => { setHasName(false); }}
              style={{ textDecoration: "underline", cursor: "pointer" }}
            >
              change
            </span>
          </div>
        )}
      </form>
    </div>
  );
}
