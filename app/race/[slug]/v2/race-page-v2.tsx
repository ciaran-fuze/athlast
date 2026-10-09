"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Split } from "@/lib/raceresult";

const brand = {
  bg: "#F5F0E8",
  card: "#FBF7EF",
  dark: "#1a1a18",
  accent: "#c8b99a",
  muted: "#8a8070",
  border: "#e0d9cc",
  grid: "#d8d2c5",
  go: "#1C7A4D",
  goSoft: "#DEECDF",
  behind: "#C24327",
  behindSoft: "#F4E2D9",
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
  elevation_profile?: {
    path: string;
    fill_path: string;
    labels: string[];
    context?: string;
  } | null;
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
  goal_time?: string | null;
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
  is_athlete_post?: boolean;
  created_at: string;
}

// --- Helpers ---

function parseTimeToSeconds(t: string): number {
  const parts = t.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function splitNameToKm(name: string, raceDistanceKm: number): number | null {
  if (name === "Startline" || name === "Start") return 0;
  if (name === "Finishline" || name === "Finish") return raceDistanceKm;
  const kmMatch = name.match(/^(\d+(?:\.\d+)?)\s*K$/i);
  if (kmMatch) return parseFloat(kmMatch[1]);
  return null;
}

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

function formatTimeShort(dateString: string): string {
  const d = new Date(dateString);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- Section Label ---

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: brand.font.mono,
        fontSize: "0.65rem",
        letterSpacing: "0.1em",
        color: brand.muted,
        margin: "1.25rem 0 0.5rem",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        textTransform: "uppercase",
      }}
    >
      {children}
      <span style={{ flex: 1, height: 1, background: brand.border }} />
    </div>
  );
}

// --- Big Countdown (before state) ---

function BigCountdown({ raceDate }: { raceDate: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const raceStart = new Date(`${raceDate}T17:00:00+01:00`).getTime();
  const diff = Math.max(0, raceStart - now);

  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  const unitStyle: React.CSSProperties = {
    fontFamily: brand.font.mono,
    fontSize: "0.6rem",
    color: brand.muted,
    letterSpacing: "0.08em",
    marginTop: "0.2rem",
  };

  const numStyle: React.CSSProperties = {
    fontFamily: brand.font.display,
    fontSize: "2.8rem",
    fontWeight: 600,
    color: brand.dark,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    minWidth: "3.5rem",
    textAlign: "center",
  };

  const sepStyle: React.CSSProperties = {
    fontFamily: brand.font.display,
    fontSize: "2rem",
    color: brand.border,
    padding: "0 0.3rem",
    alignSelf: "flex-start",
    marginTop: "0.2rem",
  };

  const days = Math.floor(diff / 86400000);
  const toGoParts: string[] = [];
  if (days > 0) toGoParts.push(`${days} day${days !== 1 ? "s" : ""}`);
  if (hours % 24 > 0 || days === 0) toGoParts.push(`${days > 0 ? hours % 24 : hours} hour${(days > 0 ? hours % 24 : hours) !== 1 ? "s" : ""}`);
  if (mins > 0) toGoParts.push(`${mins} min${mins !== 1 ? "s" : ""}`);
  const toGoText = toGoParts.slice(0, 2).join(", ") + " to go";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={numStyle}>{String(hours).padStart(2, "0")}</div>
          <div style={unitStyle}>HRS</div>
        </div>
        <div style={sepStyle}>:</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={numStyle}>{String(mins).padStart(2, "0")}</div>
          <div style={unitStyle}>MIN</div>
        </div>
        <div style={sepStyle}>:</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={numStyle}>{String(secs).padStart(2, "0")}</div>
          <div style={unitStyle}>SEC</div>
        </div>
      </div>
      <div
        style={{
          textAlign: "center",
          marginTop: "0.6rem",
          fontFamily: brand.font.body,
          fontSize: "0.85rem",
          color: brand.muted,
        }}
      >
        {toGoText}
      </div>
    </div>
  );
}

// --- Status Pill ---

function StatusPill({ race, estimatedKm }: { race: Race; estimatedKm: number | null }) {
  if (race.status === "live") {
    return (
      <span
        style={{
          fontFamily: brand.font.mono,
          fontSize: "0.6rem",
          letterSpacing: "0.08em",
          padding: "0.2rem 0.6rem",
          borderRadius: "20px",
          color: brand.go,
          background: brand.goSoft,
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: brand.go,
            display: "inline-block",
            animation: "progressPulse 2s ease-in-out infinite",
          }}
        />
        LIVE{estimatedKm !== null ? ` · ${estimatedKm % 1 === 0 ? estimatedKm : estimatedKm.toFixed(1)} KM` : ""}
      </span>
    );
  }

  if (race.status === "finished") {
    return (
      <span
        style={{
          fontFamily: brand.font.mono,
          fontSize: "0.6rem",
          letterSpacing: "0.08em",
          padding: "0.2rem 0.6rem",
          borderRadius: "20px",
          color: brand.muted,
          background: "rgba(0,0,0,0.05)",
          textTransform: "uppercase",
        }}
      >
        FINISHED
      </span>
    );
  }

  // upcoming
  return (
    <span
      style={{
        fontFamily: brand.font.mono,
        fontSize: "0.6rem",
        letterSpacing: "0.08em",
        padding: "0.2rem 0.6rem",
        borderRadius: "20px",
        color: brand.muted,
        background: "rgba(0,0,0,0.05)",
        textTransform: "uppercase",
      }}
    >
      STARTS 9:00
    </span>
  );
}

// --- Goal Badge ---

function GoalBadge({ goalTime }: { goalTime: string }) {
  const parts = goalTime.split(":");
  const display = parts.length === 3 && parts[2] === "00"
    ? `${parts[0]}:${parts[1]}`
    : goalTime;

  return (
    <span
      style={{
        fontFamily: brand.font.mono,
        fontSize: "0.65rem",
        color: brand.dark,
        border: `1px solid ${brand.border}`,
        borderRadius: "8px",
        padding: "0.2rem 0.5rem",
        marginLeft: "auto",
      }}
    >
      GOAL&nbsp;{display}
    </span>
  );
}

// --- Supporter Card ---

function SupporterCard({ msg }: { msg: Message }) {
  return (
    <div
      style={{
        marginTop: "0.5rem",
        padding: "0.65rem 0.8rem",
        borderRadius: "12px",
        background: "rgba(0,0,0,0.035)",
      }}
    >
      <div
        style={{
          fontFamily: brand.font.body,
          fontSize: "0.85rem",
          lineHeight: 1.3,
          color: brand.dark,
        }}
      >
        {msg.message}
      </div>
      <div
        style={{
          fontFamily: brand.font.body,
          fontSize: "0.7rem",
          color: brand.muted,
          marginTop: "0.25rem",
        }}
      >
        {msg.sender_name}
        {msg.created_at && (
          <span> &middot; {timeAgo(msg.created_at)}</span>
        )}
      </div>
    </div>
  );
}

// --- Photo Masonry Grid ---

function PhotoMasonry({
  photos,
  onPhotoClick,
  onAddPhoto,
}: {
  photos: Message[];
  onPhotoClick: (msg: Message) => void;
  onAddPhoto: () => void;
}) {
  if (photos.length === 0) return null;

  const col1: Message[] = [];
  const col2: Message[] = [];
  photos.forEach((msg, i) => (i % 2 === 0 ? col1 : col2).push(msg));

  const renderPhoto = (msg: Message, i: number) => (
    <div
      key={msg.id}
      style={{
        marginBottom: "0.75rem",
        cursor: "pointer",
        animation: `fadeInUp 0.4s ease-out ${i * 0.06}s both`,
      }}
    >
      <div
        onClick={() => onPhotoClick(msg)}
        style={{
          position: "relative",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(26,26,24,0.08), 0 8px 24px rgba(26,26,24,0.1)",
        }}
      >
        <img src={msg.photo_url!} alt="" style={{ width: "100%", display: "block" }} />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "0.5rem 0.6rem",
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <span
            style={{
              fontFamily: brand.font.body,
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "#fff",
            }}
          >
            From {msg.sender_name}
          </span>
          {msg.message && (
            <p
              style={{
                margin: "0.15rem 0 0",
                fontFamily: brand.font.body,
                fontSize: "0.8rem",
                lineHeight: 1.3,
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {msg.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const fillerTile = (
    <div key="filler" style={{ flex: 1 }}>
      <button
        onClick={onAddPhoto}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          minHeight: 100,
          background: brand.dark,
          border: "none",
          borderRadius: "12px",
          cursor: "pointer",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(26,26,24,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: -40,
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            transform: "rotate(-25deg)",
            transformOrigin: "center center",
            pointerEvents: "none",
            opacity: 0.06,
          }}
        >
          {Array.from({ length: 10 }).map((_, row) => (
            <div
              key={row}
              style={{
                display: "flex",
                gap: "24px",
                marginLeft: row % 2 === 0 ? 0 : -40,
                whiteSpace: "nowrap",
              }}
            >
              {Array.from({ length: 6 }).map((_, col) => (
                <span
                  key={col}
                  style={{
                    fontFamily: brand.font.display,
                    fontSize: "1rem",
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  Athlast.
                </span>
              ))}
            </div>
          ))}
        </div>
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke={brand.accent}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: "block", margin: "0 auto 0.5rem" }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <div
            style={{
              fontFamily: brand.font.body,
              fontSize: "0.9rem",
              fontWeight: 600,
              color: "#fff",
            }}
          >
            Add a photo
          </div>
        </div>
      </button>
    </div>
  );

  const shorterCol = col1.length > col2.length ? "left" : "right";

  return (
    <div style={{ position: "relative", marginTop: "0.75rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "stretch" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {col1.map((msg, i) => renderPhoto(msg, i * 2))}
          {shorterCol === "left" && fillerTile}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {col2.map((msg, i) => renderPhoto(msg, i * 2 + 1))}
          {shorterCol === "right" && fillerTile}
        </div>
      </div>
    </div>
  );
}

// --- Athlete Post Card ---

function AthletePostCard({ msg }: { msg: Message }) {
  return (
    <div
      style={{
        border: `1.5px solid ${brand.dark}`,
        borderRadius: "14px",
        overflow: "hidden",
      }}
    >
      {msg.photo_url && (
        <div style={{ position: "relative" }}>
          <img
            src={msg.photo_url}
            alt=""
            style={{ width: "100%", display: "block", borderRadius: "14px 14px 0 0" }}
          />
          <span
            style={{
              position: "absolute",
              bottom: "0.5rem",
              left: "0.5rem",
              fontFamily: brand.font.mono,
              fontSize: "0.55rem",
              color: "rgba(255,255,255,0.85)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {formatTimeShort(msg.created_at)}
          </span>
        </div>
      )}
      <div style={{ padding: "0.65rem 0.8rem" }}>
        <div
          style={{
            fontFamily: brand.font.mono,
            fontSize: "0.55rem",
            letterSpacing: "0.1em",
            color: brand.dark,
            marginBottom: "0.25rem",
            textTransform: "uppercase",
          }}
        >
          HIS OWN WORDS
        </div>
        <div
          style={{
            fontFamily: brand.font.body,
            fontSize: "0.9rem",
            lineHeight: 1.3,
            color: brand.dark,
          }}
        >
          {msg.message}
        </div>
      </div>
    </div>
  );
}

// --- Goal Gauge ---

function GoalGauge({
  goalTime,
  projectedSeconds,
}: {
  goalTime: string;
  projectedSeconds: number;
}) {
  const goalSeconds = parseTimeToSeconds(goalTime);
  const delta = Math.round(goalSeconds - projectedSeconds); // positive = ahead
  const isAhead = delta >= 0;
  const absDelta = Math.abs(delta);

  const statusText = isAhead ? "ON TRACK" : "BEHIND";
  const statusColor = isAhead ? brand.go : brand.behind;

  const maxDelta = 120;
  const pct = Math.min(90, Math.max(10, 50 + (delta / maxDelta) * 40));

  return (
    <div style={{ margin: "0.75rem 0 0.25rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: brand.font.mono,
            fontSize: "0.7rem",
            letterSpacing: "0.1em",
            color: statusColor,
            textTransform: "uppercase",
          }}
        >
          {statusText}
        </span>
        <span
          style={{
            fontFamily: brand.font.mono,
            fontSize: "0.65rem",
            color: brand.muted,
          }}
        >
          GOAL {goalTime}
        </span>
      </div>

      <div
        style={{
          fontFamily: brand.font.display,
          fontSize: "2.5rem",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          margin: "0.1rem 0",
          fontVariantNumeric: "tabular-nums",
          color: brand.dark,
        }}
      >
        {formatSeconds(projectedSeconds)}
      </div>

      <div
        style={{
          fontFamily: brand.font.body,
          fontSize: "0.85rem",
          marginBottom: "0.75rem",
          color: brand.dark,
        }}
      >
        {"He's "}
        <span style={{ color: statusColor, fontWeight: 600 }}>
          {absDelta >= 60
            ? `${Math.floor(absDelta / 60)}m ${absDelta % 60}s`
            : `${absDelta}s`}{" "}
          {isAhead ? "ahead" : "behind"}
        </span>
        {" of his goal pace."}
      </div>

      {/* Ahead/behind meter */}
      <div style={{ position: "relative", height: 30, margin: "0 0.25rem" }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 2,
            background: brand.dark,
            transform: "translateX(-50%)",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: -14,
            transform: "translateX(-50%)",
            fontFamily: brand.font.mono,
            fontSize: "0.5rem",
            color: brand.muted,
          }}
        >
          GOAL
        </span>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 22,
            height: 2,
            background: brand.border,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 22,
            left: `${pct}%`,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: statusColor,
            border: `3px solid ${brand.card}`,
            boxShadow: `0 0 0 1px ${statusColor}`,
            transform: "translate(-50%, -50%)",
            transition: "left 1s ease-out",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 28,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "space-between",
            fontFamily: brand.font.mono,
            fontSize: "0.5rem",
            color: brand.muted,
          }}
        >
          <span>behind</span>
          <span>ahead</span>
        </div>
      </div>
    </div>
  );
}

// --- Elevation Profile ---

function ElevationProfile({
  profile,
  progressPct,
}: {
  profile: NonNullable<Race["elevation_profile"]>;
  progressPct: number;
}) {
  const dotX = (progressPct / 100) * 300;

  const points = profile.path
    .replace(/[MLQ]/g, "")
    .trim()
    .split(/\s+L\s*|\s+/)
    .map((p) => p.split(",").map(Number))
    .filter((p) => p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]));

  let dotY = 50;
  if (points.length >= 2) {
    for (let i = 0; i < points.length - 1; i++) {
      if (dotX >= points[i][0] && dotX <= points[i + 1][0]) {
        const t =
          (dotX - points[i][0]) / (points[i + 1][0] - points[i][0] || 1);
        dotY = points[i][1] + t * (points[i + 1][1] - points[i][1]);
        break;
      }
    }
    if (dotX >= points[points.length - 1][0]) {
      dotY = points[points.length - 1][1];
    }
  }

  const dotTopPct = (dotY / 74) * 100;

  return (
    <div style={{ marginTop: "0.25rem" }}>
      <div style={{ position: "relative", height: 74 }}>
        <svg
          viewBox="0 0 300 74"
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
        >
          <path d={profile.fill_path} fill="rgba(28,24,19,0.07)" />
          <path
            d={profile.path}
            fill="none"
            stroke={brand.dark}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        {progressPct > 0 && progressPct < 100 && (
          <div
            style={{
              position: "absolute",
              left: `${progressPct}%`,
              top: `${dotTopPct}%`,
              width: 13,
              height: 13,
              borderRadius: "50%",
              background: brand.dark,
              border: `3px solid ${brand.card}`,
              boxShadow: `0 0 0 1px ${brand.dark}`,
              transform: "translate(-50%, -50%)",
              transition: "left 2s ease-out, top 2s ease-out",
            }}
          />
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: brand.font.mono,
          fontSize: "0.5rem",
          color: brand.muted,
          marginTop: "0.15rem",
        }}
      >
        {profile.labels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      {profile.context && (
        <div
          style={{
            fontFamily: brand.font.body,
            fontSize: "0.8rem",
            color: brand.muted,
            marginTop: "0.5rem",
            lineHeight: 1.4,
            fontStyle: "italic",
          }}
        >
          {profile.context}
        </div>
      )}
    </div>
  );
}

// --- Finish Result ---

function FinishResult({
  finishTime,
  goalTime,
}: {
  finishTime: string;
  goalTime?: string | null;
}) {
  const finishSec = parseTimeToSeconds(finishTime);
  const goalSec = goalTime ? parseTimeToSeconds(goalTime) : null;

  let goalLabel = "";
  let goalDetail = "";
  if (goalSec !== null) {
    const delta = goalSec - finishSec;
    if (delta > 0) {
      goalLabel = "GOAL SMASHED";
      goalDetail = `Official chip time · ${delta} seconds under his goal`;
    } else if (delta === 0) {
      goalLabel = "GOAL HIT";
      goalDetail = "Official chip time · right on target";
    } else {
      goalLabel = "FINISHED";
      goalDetail = `Official chip time · ${Math.abs(delta)} seconds over his goal`;
    }
  } else {
    goalLabel = "FINISHED";
    goalDetail = "Official chip time";
  }

  return (
    <div style={{ textAlign: "center", padding: "1rem 0 0.5rem" }}>
      <div
        style={{
          fontFamily: brand.font.mono,
          fontSize: "0.65rem",
          letterSpacing: "0.16em",
          color: brand.go,
          marginBottom: "0.4rem",
          textTransform: "uppercase",
        }}
      >
        {goalLabel}
      </div>
      <div
        style={{
          fontFamily: brand.font.display,
          fontSize: "3.5rem",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: brand.go,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {finishTime}
      </div>
      <div
        style={{
          fontFamily: brand.font.mono,
          fontSize: "0.7rem",
          color: brand.muted,
          marginTop: "0.5rem",
        }}
      >
        {goalDetail}
      </div>
      <div
        style={{
          fontFamily: brand.font.body,
          fontSize: "0.9rem",
          margin: "1rem 0.5rem 0.25rem",
          lineHeight: 1.4,
          color: brand.dark,
        }}
      >
        He did it — and he doesn&apos;t have his phone yet. Be the first to tell him.
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function RacePageV2({
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
  const [selectedAthlete] = useState(raceAthletes[0]?.athlete_id ?? "");

  // Input & modal state
  const [inputMode, setInputMode] = useState<"photo" | "message" | null>(null);
  const [lightboxMsg, setLightboxMsg] = useState<Message | null>(null);
  const [showSplits, setShowSplits] = useState(false);

  // Splash for new messages
  const [splashMsg, setSplashMsg] = useState<Message | null>(null);
  const [splashReady, setSplashReady] = useState(false);
  const prevCountRef = useRef(messages.length);
  const splashQueueRef = useRef<Message[]>([]);
  const splashActiveRef = useRef(false);

  function processQueue() {
    if (splashActiveRef.current) return;
    const next = splashQueueRef.current.shift();
    if (!next) return;
    splashActiveRef.current = true;
    setSplashReady(!next.photo_url);
    setSplashMsg(next);
    setTimeout(() => {
      setSplashMsg(null);
      splashActiveRef.current = false;
      processQueue();
    }, 4000);
  }

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const arriving = messages.slice(0, messages.length - prevCountRef.current);
      splashQueueRef.current.push(...arriving);
      processQueue();
    }
    prevCountRef.current = messages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Polling
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
      } catch {}
    }
  }, [race.id, raceAthletes]);

  const pollMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/race/cheer?race_id=${race.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch {}
  }, [race.id]);

  useEffect(() => {
    if (race.status !== "live") return;
    const interval = setInterval(() => {
      pollSplits();
      pollMessages();
    }, 30000);
    return () => clearInterval(interval);
  }, [race.status, pollSplits, pollMessages]);

  // Derived data
  const athlete = raceAthletes.find((ra) => ra.athlete_id === selectedAthlete);
  const athleteSplits = splits[selectedAthlete] ?? [];
  const completedSplits = athleteSplits.filter((s) => s.Exists);

  const estimatedKm = (() => {
    if (completedSplits.length < 2) return null;
    const last = completedSplits[completedSplits.length - 1];
    const lastKm = splitNameToKm(last.Name, race.distance_km);
    if (lastKm === null) return lastKm;
    if (last.Name === "Finishline" || last.Name === "Finish") return race.distance_km;
    const lastIdx = athleteSplits.indexOf(last);
    const next = athleteSplits[lastIdx + 1];
    const nextKm = next ? splitNameToKm(next.Name, race.distance_km) : race.distance_km;
    return nextKm ?? lastKm;
  })();

  const runnerPct =
    estimatedKm !== null
      ? Math.min((estimatedKm / race.distance_km) * 100, 100)
      : completedSplits.length > 0
        ? (completedSplits.length / athleteSplits.length) * 100
        : 0;

  const projectedFinishSeconds = (() => {
    if (completedSplits.length < 2) return null;
    const first = completedSplits[0];
    const last = completedSplits[completedSplits.length - 1];
    const firstKm = splitNameToKm(first.Name, race.distance_km) ?? 0;
    const lastKm = splitNameToKm(last.Name, race.distance_km);
    if (lastKm === null || lastKm <= firstKm) return null;

    const firstTime = first.Chip ? parseTimeToSeconds(first.Chip) : 0;
    const lastTime = last.Chip ? parseTimeToSeconds(last.Chip) : 0;
    const elapsed = lastTime - firstTime;
    const covered = lastKm - firstKm;
    if (covered <= 0) return null;

    const pacePerKm = elapsed / covered;
    return firstTime + pacePerKm * (race.distance_km - firstKm);
  })();

  const finishTime = (() => {
    const finishSplit = athleteSplits.find(
      (s) => s.Exists && (s.Name === "Finishline" || s.Name === "Finish")
    );
    return finishSplit?.Chip ?? null;
  })();

  // Sort messages
  const athletePosts = messages.filter((m) => m.is_athlete_post);
  const supporterMessages = messages.filter((m) => !m.is_athlete_post && m.message && !m.photo_url && m.id !== splashMsg?.id);
  const supporterPhotos = messages.filter((m) => !m.is_athlete_post && m.photo_url && m.id !== splashMsg?.id);

  const isFinished = race.status === "finished";
  const sortedSupporterMessages = isFinished
    ? [...supporterMessages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : supporterMessages;

  const goalTime = athlete?.goal_time ?? null;

  return (
    <div style={{ minHeight: "100vh", background: brand.bg }}>
      <style>{`
        @keyframes progressPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes splashIn {
          0% { opacity: 0; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes splashOverlayIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes splashCardIn {
          0% { opacity: 0; transform: scale(0.85) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes firework {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--fx), var(--fy)) scale(0); opacity: 0; }
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ─── Header ─── */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "2rem 1.25rem 0" }}>
        <div
          style={{
            fontFamily: brand.font.body,
            fontSize: "0.8rem",
            color: brand.muted,
            margin: "0 0 0.15rem",
          }}
        >
          {race.name}
        </div>
        <div
          style={{
            fontFamily: brand.font.display,
            fontSize: "1.5rem",
            fontWeight: 600,
            letterSpacing: "-0.015em",
            lineHeight: 1.04,
            color: brand.dark,
          }}
        >
          {athlete
            ? `${athlete.athletes.first_name} ${athlete.athletes.last_name}`
            : race.name}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "0.4rem",
          }}
        >
          <StatusPill race={race} estimatedKm={estimatedKm} />
          {goalTime && <GoalBadge goalTime={goalTime} />}
        </div>
      </div>

      {/* ─── Content ─── */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 1.25rem 2rem" }}>

        {/* ===================== BEFORE ===================== */}
        {race.status === "upcoming" && (
          <>
            {/* Race starts in */}
            <div style={{ marginTop: "1.25rem" }}>
              <div
                style={{
                  fontFamily: brand.font.body,
                  fontSize: "0.9rem",
                  color: brand.muted,
                  marginBottom: "0.4rem",
                }}
              >
                Race starts in
              </div>
              <BigCountdown raceDate={race.race_date} />
            </div>

            {/* Goal */}
            {goalTime && (
              <div style={{ marginTop: "1.25rem" }}>
                <div
                  style={{
                    fontFamily: brand.font.body,
                    fontSize: "0.9rem",
                    color: brand.muted,
                    marginBottom: "0.25rem",
                  }}
                >
                  {athlete?.athletes.first_name ?? "His"}&apos;s goal
                </div>
                <div
                  style={{
                    fontFamily: brand.font.display,
                    fontSize: "2.8rem",
                    fontWeight: 600,
                    color: brand.dark,
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {goalTime}
                </div>
              </div>
            )}

            {/* Athlete's own posts */}
            {athletePosts.length > 0 && (
              <>
                <SectionLabel>
                  From {athlete?.athletes.first_name ?? "the athlete"}
                </SectionLabel>
                {athletePosts.map((post) => (
                  <AthletePostCard key={post.id} msg={post} />
                ))}
              </>
            )}

            {/* Photos */}
            <PhotoMasonry
              photos={supporterPhotos}
              onPhotoClick={(msg) => setLightboxMsg(msg)}
              onAddPhoto={() => setInputMode("photo")}
            />

            {/* Messages */}
            <SectionLabel>Messages of support</SectionLabel>
            {sortedSupporterMessages.length === 0 ? (
              <div
                style={{
                  fontFamily: brand.font.body,
                  fontSize: "0.85rem",
                  color: brand.muted,
                  fontStyle: "italic",
                  padding: "0.5rem 0",
                }}
              >
                No messages yet — be the first!
              </div>
            ) : (
              sortedSupporterMessages.map((msg) => (
                <SupporterCard key={msg.id} msg={msg} />
              ))
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                onClick={() => setInputMode("photo")}
                style={{
                  flex: 1,
                  border: "none",
                  borderRadius: "11px",
                  padding: "0.7rem",
                  fontFamily: brand.font.body,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  background: brand.dark,
                  color: "#F3ECDD",
                  cursor: "pointer",
                }}
              >
                Add a photo
              </button>
              <button
                onClick={() => setInputMode("message")}
                style={{
                  flex: 1,
                  border: `1px solid ${brand.border}`,
                  borderRadius: "11px",
                  padding: "0.7rem",
                  fontFamily: brand.font.body,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  background: "transparent",
                  color: brand.dark,
                  cursor: "pointer",
                }}
              >
                Message
              </button>
            </div>
          </>
        )}

        {/* ===================== DURING ===================== */}
        {race.status === "live" && (
          <>
            {/* Goal gauge */}
            {goalTime && projectedFinishSeconds !== null && (
              <GoalGauge
                goalTime={goalTime}
                projectedSeconds={projectedFinishSeconds}
              />
            )}

            {/* Elevation profile */}
            {race.elevation_profile && (
              <>
                <SectionLabel>On the course</SectionLabel>
                <ElevationProfile
                  profile={race.elevation_profile}
                  progressPct={runnerPct}
                />
              </>
            )}

            <PhotoMasonry
              photos={supporterPhotos}
              onPhotoClick={(msg) => setLightboxMsg(msg)}
              onAddPhoto={() => setInputMode("photo")}
            />

            <SectionLabel>Messages of support</SectionLabel>
            {sortedSupporterMessages.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1rem 0" }}>
                <button
                  onClick={() => setInputMode("message")}
                  style={{
                    padding: "0.7rem 1.3rem",
                    background: brand.dark,
                    color: "#F3ECDD",
                    border: "none",
                    borderRadius: "11px",
                    fontFamily: brand.font.body,
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Send a message
                </button>
              </div>
            ) : (
              sortedSupporterMessages.map((msg) => (
                <SupporterCard key={msg.id} msg={msg} />
              ))
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                onClick={() => setInputMode("photo")}
                style={{
                  flex: 1,
                  border: "none",
                  borderRadius: "11px",
                  padding: "0.7rem",
                  fontFamily: brand.font.body,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  background: brand.dark,
                  color: "#F3ECDD",
                  cursor: "pointer",
                }}
              >
                Add a photo
              </button>
              <button
                onClick={() => setInputMode("message")}
                style={{
                  flex: 1,
                  border: `1px solid ${brand.border}`,
                  borderRadius: "11px",
                  padding: "0.7rem",
                  fontFamily: brand.font.body,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  background: "transparent",
                  color: brand.dark,
                  cursor: "pointer",
                }}
              >
                Message
              </button>
            </div>

            {/* Splits button */}
            {completedSplits.length > 0 && (
              <button
                onClick={() => setShowSplits(true)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "0.75rem",
                  padding: "0.5rem",
                  background: "transparent",
                  border: `1px solid ${brand.border}`,
                  borderRadius: "10px",
                  fontFamily: brand.font.mono,
                  fontSize: "0.65rem",
                  fontWeight: 600,
                  color: brand.muted,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                View splits
              </button>
            )}
          </>
        )}

        {/* ===================== AFTER ===================== */}
        {race.status === "finished" && (
          <>
            {/* Result */}
            {finishTime ? (
              <FinishResult finishTime={finishTime} goalTime={goalTime} />
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "1.5rem 0",
                  fontFamily: brand.font.body,
                  fontSize: "0.9rem",
                  color: brand.muted,
                }}
              >
                Awaiting official results...
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button
                onClick={() => setInputMode("photo")}
                style={{
                  flex: 1,
                  border: "none",
                  borderRadius: "11px",
                  padding: "0.7rem",
                  fontFamily: brand.font.body,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  background: brand.dark,
                  color: "#F3ECDD",
                  cursor: "pointer",
                }}
              >
                Add a photo
              </button>
              <button
                onClick={() => setInputMode("message")}
                style={{
                  flex: 1,
                  border: `1px solid ${brand.border}`,
                  borderRadius: "11px",
                  padding: "0.7rem",
                  fontFamily: brand.font.body,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  background: "transparent",
                  color: brand.dark,
                  cursor: "pointer",
                }}
              >
                Congratulate
              </button>
            </div>

            <PhotoMasonry
              photos={supporterPhotos}
              onPhotoClick={(msg) => setLightboxMsg(msg)}
              onAddPhoto={() => setInputMode("photo")}
            />

            <SectionLabel>Messages of support</SectionLabel>
            {sortedSupporterMessages.length === 0 ? (
              <div
                style={{
                  fontFamily: brand.font.body,
                  fontSize: "0.85rem",
                  color: brand.muted,
                  fontStyle: "italic",
                  padding: "0.5rem 0",
                }}
              >
                No messages yet — be the first to congratulate!
              </div>
            ) : (
              sortedSupporterMessages.map((msg, i) => (
                <div
                  key={msg.id}
                  style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.06}s both` }}
                >
                  <SupporterCard msg={msg} />
                </div>
              ))
            )}

            {/* Splits */}
            {completedSplits.length > 0 && (
              <button
                onClick={() => setShowSplits(true)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "1rem",
                  padding: "0.5rem",
                  background: "transparent",
                  border: `1px solid ${brand.border}`,
                  borderRadius: "10px",
                  fontFamily: brand.font.mono,
                  fontSize: "0.65rem",
                  fontWeight: 600,
                  color: brand.muted,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                View splits
              </button>
            )}
          </>
        )}
      </div>

      {/* ─── Modals ─── */}

      {/* New message splash */}
      {splashMsg && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            opacity: splashReady ? 1 : 0,
            animation: splashReady ? "splashOverlayIn 0.3s ease-out" : "none",
            pointerEvents: splashReady ? "auto" : "none",
          }}
        >
          {Array.from({ length: 24 }).map((_, pi) => {
            const angle = (pi / 24) * 360;
            const dist = 100 + ((pi * 17) % 140);
            const fx = Math.cos((angle * Math.PI) / 180) * dist;
            const fy = Math.sin((angle * Math.PI) / 180) * dist;
            const colors = ["#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];
            const color = colors[pi % colors.length];
            const size = 6 + (pi % 4) * 3;
            return (
              <div
                key={pi}
                style={{
                  position: "fixed",
                  left: "50%",
                  top: "50%",
                  width: size,
                  height: size,
                  borderRadius: "50%",
                  background: color,
                  pointerEvents: "none",
                  zIndex: 101,
                  // @ts-expect-error CSS custom properties
                  "--fx": `${fx}px`,
                  "--fy": `${fy}px`,
                  animation: `firework 1s ease-out ${0.2 + pi * 0.025}s forwards`,
                }}
              />
            );
          })}
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 380,
              background: brand.bg,
              borderRadius: "24px",
              padding: "1.5rem",
              boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
              textAlign: "center",
              animation: splashReady ? "splashCardIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
            }}
          >
            {splashMsg.photo_url && (
              <img
                src={splashMsg.photo_url}
                alt=""
                onLoad={() => setSplashReady(true)}
                style={{
                  width: "100%",
                  borderRadius: "14px",
                  marginBottom: "1rem",
                  display: "block",
                }}
              />
            )}
            {splashMsg.message && (
              <p
                style={{
                  margin: "0 0 0.75rem",
                  fontFamily: brand.font.body,
                  fontSize: "1.2rem",
                  fontWeight: 600,
                  lineHeight: 1.4,
                  color: brand.dark,
                }}
              >
                {splashMsg.message}
              </p>
            )}
            <span
              style={{
                fontFamily: brand.font.body,
                fontSize: "0.9rem",
                fontWeight: 600,
                color: brand.muted,
              }}
            >
              {splashMsg.sender_name}
            </span>
          </div>
        </div>
      )}

      {/* Splits modal */}
      {showSplits && (
        <div
          onClick={() => setShowSplits(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            animation: "splashIn 0.3s ease-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              background: brand.bg,
              borderRadius: "24px",
              padding: "1.5rem",
              boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
              animation: "splashCardIn 0.4s ease-out",
            }}
          >
            <h3
              style={{
                margin: "0 0 1rem",
                fontFamily: brand.font.display,
                fontSize: "1.2rem",
                fontWeight: 400,
                color: brand.dark,
                textAlign: "center",
              }}
            >
              Splits
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {athleteSplits.map((split) => (
                <div
                  key={split.Name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.6rem 0.75rem",
                    background: split.Exists ? "#fff" : "transparent",
                    borderRadius: "10px",
                    opacity: split.Exists ? 1 : 0.4,
                  }}
                >
                  <span
                    style={{
                      fontFamily: brand.font.body,
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: brand.dark,
                    }}
                  >
                    {split.Name}
                  </span>
                  <div style={{ textAlign: "right" }}>
                    {split.Chip && (
                      <span
                        style={{
                          fontFamily: brand.font.mono,
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          color: brand.dark,
                        }}
                      >
                        {split.Chip}
                      </span>
                    )}
                    {split.Speed && (
                      <span
                        style={{
                          fontFamily: brand.font.mono,
                          fontSize: "0.7rem",
                          color: brand.muted,
                          marginLeft: "0.5rem",
                        }}
                      >
                        {split.Speed}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input modal */}
      {inputMode && (
        <div
          onClick={() => setInputMode(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            animation: "splashIn 0.3s ease-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              background: brand.bg,
              borderRadius: "24px",
              padding: "1.5rem",
              boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
            }}
          >
            <h3
              style={{
                margin: "0 0 1rem",
                fontFamily: brand.font.display,
                fontSize: "1.2rem",
                fontWeight: 400,
                color: brand.dark,
                textAlign: "center",
              }}
            >
              {inputMode === "photo" ? "Share a photo" : race.status === "finished" ? "Send congratulations" : "Send a message"}
            </h3>
            <MessageInput
              raceId={race.id}
              athleteId={selectedAthlete}
              athleteName={athlete?.athletes.first_name ?? ""}
              athleteKm={estimatedKm}
              onSent={() => {
                pollMessages();
                setInputMode(null);
              }}
              autoFocusPhoto={inputMode === "photo"}
            />
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxMsg && (
        <div
          onClick={() => setLightboxMsg(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem 1rem",
            animation: "splashIn 0.3s ease-out",
          }}
        >
          {lightboxMsg.photo_url ? (
            <>
              <img
                src={lightboxMsg.photo_url}
                alt=""
                style={{
                  maxWidth: "100%",
                  maxHeight: "75vh",
                  borderRadius: "12px",
                  display: "block",
                }}
              />
              <div style={{ marginTop: "1rem", textAlign: "center" }}>
                <span
                  style={{
                    fontFamily: brand.font.body,
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: "#fff",
                  }}
                >
                  {lightboxMsg.sender_name}
                </span>
                {lightboxMsg.message && (
                  <p
                    style={{
                      margin: "0.4rem 0 0",
                      fontFamily: brand.font.body,
                      fontSize: "0.9rem",
                      color: "rgba(255,255,255,0.75)",
                      lineHeight: 1.5,
                      maxWidth: 400,
                    }}
                  >
                    {lightboxMsg.message}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 360,
                padding: "2rem 2rem 1.5rem",
                background: brand.bg,
                borderRadius: "28px",
                boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
                textAlign: "center",
                animation: "splashIn 0.3s ease-out",
              }}
            >
              <p
                style={{
                  margin: "0 0 1rem",
                  fontFamily: brand.font.body,
                  fontSize: "1.4rem",
                  fontWeight: 600,
                  lineHeight: 1.4,
                  color: brand.dark,
                }}
              >
                {lightboxMsg.message}
              </p>
              <span
                style={{
                  fontFamily: brand.font.body,
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  color: brand.muted,
                }}
              >
                {lightboxMsg.sender_name}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Message Input ---

function MessageInput({
  raceId,
  athleteId,
  athleteName,
  athleteKm,
  onSent,
  autoFocusPhoto,
}: {
  raceId: string;
  athleteId: string;
  athleteName: string;
  athleteKm: number | null;
  onSent: () => void;
  autoFocusPhoto?: boolean;
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
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhoto(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPhotoPreview(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasName && !name.trim()) return;
    if (!message.trim() && !photo) return;
    setSending(true);

    const senderName = name.trim();
    if (typeof window !== "undefined") {
      localStorage.setItem("athlast_name", senderName);
    }
    setHasName(true);

    let photoUrl: string | null = null;
    if (photo) {
      const formData = new FormData();
      formData.append("file", photo);
      const uploadRes = await fetch("/api/race/upload", {
        method: "POST",
        body: formData,
      });
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        photoUrl = data.url;
      }
    }

    const res = await fetch("/api/race/cheer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        race_id: raceId,
        athlete_id: athleteId,
        sender_name: senderName,
        message: message.trim() || null,
        photo_url: photoUrl,
        athlete_km_at_send: athleteKm,
      }),
    });

    if (res.ok) {
      setMessage("");
      setPhoto(null);
      setPhotoPreview(null);
      onSent();
    }
    setSending(false);
  }

  return (
    <div
      style={{
        padding: "1rem",
        background: "#fff",
        border: `1px solid ${brand.border}`,
        borderRadius: "16px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
      >
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
              background: brand.bg,
              color: brand.dark,
            }}
          />
        )}
        {photoPreview && (
          <div style={{ position: "relative", display: "inline-block" }}>
            <img
              src={photoPreview}
              alt="Preview"
              style={{
                maxWidth: "100%",
                maxHeight: 120,
                borderRadius: "8px",
                display: "block",
              }}
            />
            <button
              type="button"
              onClick={() => {
                setPhoto(null);
                setPhotoPreview(null);
              }}
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.6)",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              x
            </button>
          </div>
        )}
        <textarea
          placeholder={`Send ${athleteName || "the athlete"} some support...`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: "0.6rem 0.75rem",
            border: `1px solid ${brand.border}`,
            borderRadius: "12px",
            fontSize: "16px",
            fontFamily: brand.font.body,
            outline: "none",
            background: brand.bg,
            color: brand.dark,
            resize: "none",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <label
            style={{
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              borderRadius: "50%",
              border: `1px solid ${brand.border}`,
            }}
          >
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
              style={{ display: "none" }}
            />
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={brand.muted}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </label>
          <button
            type="submit"
            disabled={sending}
            style={{
              flex: 1,
              padding: "0.7rem",
              borderRadius: "12px",
              background: sending ? brand.grid : brand.dark,
              color: "#fff",
              border: "none",
              cursor: sending ? "not-allowed" : "pointer",
              fontFamily: brand.font.body,
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
          >
            {sending ? "Sending..." : "Send"}
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
              onClick={() => setHasName(false)}
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
