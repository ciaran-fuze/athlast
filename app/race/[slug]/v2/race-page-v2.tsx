"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Split } from "@/lib/raceresult";
import { rtrtToSplits } from "@/lib/rtrt-splits";
import type { FundraisingProgress } from "@/lib/fundraising";
import { CourseMap } from "./course-map";

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
  goal: "#C8871A",
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
  start_time?: string | null;
  elevation_profile?: {
    path: string;
    fill_path: string;
    labels: string[];
    context?: string;
    route?: [number, number][];
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
  rtrt_athlete_id?: string | null;
  fundraising_url?: string | null;
  goal_time?: string | null;
  athletes: Athlete;
}

interface Message {
  id: string;
  race_id: string;
  athlete_id: string;
  sender_name: string;
  sender_avatar_url?: string | null;
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

/** Convert a Dublin local date + time of day to epoch ms (handles the clocks-change weekend). */
function dublinTimeToMs(date: string, tod: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi, sec] = tod.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, sec || 0);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Dublin",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asDublin = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return guess - (asDublin - guess);
}

function formatDublinClock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Dublin",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function isFinishSplit(name: string): boolean {
  return /^finish(line)?$/i.test(name);
}

// Dublin Marathon cheer-zone mats: RTRT labels them by place, so map them to distance.
// They move the runner's position but are left out of the splits table.
const CHEER_ZONE_KM: Record<string, number> = {
  "FURZE ROAD": 8.0467,
  "CHERRYFIELD R'ABOUT": 23.1746,
  "CHERRYFIELD R’ABOUT": 23.1746,
  "TERENURE X-ROADS": 28.9682,
  "ROEBUCK ROAD": 34.6009,
  "FOSTERS AVENUE": 36.2102,
  "NORTHUMBERLAND RD": 40.2336,
};

function isCheerZone(name: string): boolean {
  return name.toUpperCase() in CHEER_ZONE_KM;
}

// Handles Race Result names (Startline, 5K, Finishline) and RTRT names (START, HALFWAY, 11M, FINISH)
function splitNameToKm(name: string, raceDistanceKm: number): number | null {
  if (isCheerZone(name)) return CHEER_ZONE_KM[name.toUpperCase()];
  if (/^start(line)?$/i.test(name)) return 0;
  if (isFinishSplit(name)) return raceDistanceKm;
  if (/^half(way)?$/i.test(name)) return raceDistanceKm / 2;
  const kmMatch = name.match(/^(\d+(?:\.\d+)?)\s*K$/i);
  if (kmMatch) return parseFloat(kmMatch[1]);
  const mileMatch = name.match(/^(\d+(?:\.\d+)?)\s*M$/i);
  if (mileMatch) return parseFloat(mileMatch[1]) * 1.609344;
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

/** Upload a photo or video straight to storage via a signed URL; returns its public URL. */
async function uploadMedia(file: File): Promise<string | null> {
  try {
    const res = await fetch("/api/race/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name }),
    });
    if (!res.ok) return null;
    const { signedUrl, url } = await res.json();
    const put = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    return put.ok ? url : null;
  } catch {
    return null;
  }
}

function isVideo(url: string): boolean {
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
}

// --- Section Label ---

// Placeholder shown when nobody has sent anything yet
function EmptyCta({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
        padding: "1.4rem 1rem",
        marginTop: "0.25rem",
        background: "transparent",
        border: `1.5px dashed ${brand.grid}`,
        borderRadius: "14px",
        cursor: "pointer",
        color: brand.dark,
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: brand.dark,
          color: "#F3ECDD",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <span style={{ fontFamily: brand.font.body, fontSize: "0.9rem", fontWeight: 500 }}>{label}</span>
    </button>
  );
}

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
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
      {action}
    </div>
  );
}

// --- Big Countdown (before state) ---

// Faint, blurred Dublin skyline behind the before-race countdown
function SkylineBackdrop() {
  return (
    <img
      src="/dublin-skyline.png"
      alt=""
      aria-hidden
      style={{
        position: "absolute",
        left: "50%",
        bottom: 0,
        width: "115%",
        maxWidth: 560,
        transform: "translateX(-50%)",
        opacity: 0.13,
        filter: "blur(1.5px)",
        pointerEvents: "none",
        zIndex: -1,
      }}
    />
  );
}

function BigCountdown({
  raceDate,
  startTime,
  athleteName,
  tight,
}: {
  raceDate: string;
  startTime?: string | null;
  athleteName: string;
  /** Less top space when the header is taller (bib shown) */
  tight?: boolean;
}) {
  // Start ticking on the client only, so server and client HTML match
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const raceStart = startTime
    ? new Date(startTime).getTime()
    : new Date(`${raceDate}T17:00:00+01:00`).getTime();
  const diff = now === null ? null : Math.max(0, raceStart - now);

  // Gun has gone but tracking hasn't seen them cross the start mat yet
  if (diff === 0) {
    return (
      <div style={{ position: "relative", isolation: "isolate", overflow: "hidden", textAlign: "center", padding: tight ? "0.75rem 0 3rem" : "2.5rem 0 3rem", margin: "0 -1.25rem" }}>
        <SkylineBackdrop />
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: brand.go,
            margin: "0 auto 0.9rem",
            animation: "progressPulse 2s ease-in-out infinite",
          }}
        />
        <div
          style={{
            fontFamily: brand.font.display,
            fontSize: "1.6rem",
            fontWeight: 600,
            color: brand.dark,
            lineHeight: 1.2,
          }}
        >
          Waiting for {athleteName || "the athlete"} to cross the start line
        </div>
      </div>
    );
  }

  const days = diff === null ? null : Math.floor(diff / 86400000);
  const units: { value: number | null; label: string }[] = [
    ...(days ? [{ value: days, label: "DAYS" }] : []),
    { value: diff === null ? null : Math.floor((diff % 86400000) / 3600000), label: "HRS" },
    { value: diff === null ? null : Math.floor((diff % 3600000) / 60000), label: "MIN" },
    { value: diff === null ? null : Math.floor((diff % 60000) / 1000), label: "SEC" },
  ];

  const numStyle: React.CSSProperties = {
    fontFamily: brand.font.display,
    fontSize: units.length > 3 ? "2.8rem" : "3.4rem",
    fontWeight: 600,
    color: brand.dark,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    minWidth: units.length > 3 ? "3.2rem" : "4rem",
    textAlign: "center",
  };

  const sepStyle: React.CSSProperties = {
    fontFamily: brand.font.display,
    fontSize: "2rem",
    color: brand.border,
    padding: "0 0.15rem",
    alignSelf: "flex-start",
    marginTop: "0.4rem",
  };

  return (
    <div style={{ position: "relative", isolation: "isolate", overflow: "hidden", textAlign: "center", padding: tight ? "0.75rem 0 3rem" : "2.5rem 0 3rem", margin: "0 -1.25rem" }}>
      <SkylineBackdrop />
      <div
        style={{
          fontFamily: brand.font.mono,
          fontSize: "0.65rem",
          letterSpacing: "0.16em",
          color: brand.muted,
          textTransform: "uppercase",
          marginBottom: "0.9rem",
        }}
      >
        Race starts in
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
        {units.map((u, i) => (
          <div key={u.label} style={{ display: "flex" }}>
            {i > 0 && <div style={sepStyle}>:</div>}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={numStyle}>{u.value === null ? "--" : String(u.value).padStart(2, "0")}</div>
              <div
                style={{
                  fontFamily: brand.font.mono,
                  fontSize: "0.6rem",
                  color: brand.muted,
                  letterSpacing: "0.08em",
                  marginTop: "0.35rem",
                }}
              >
                {u.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Status Pill ---

function StatusPill({
  status,
  startTime,
  estimatedKm,
}: {
  status: string;
  startTime?: string | null;
  estimatedKm: number | null;
}) {
  if (status === "live") {
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

  if (status === "finished") {
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
      STARTS {startTime ? formatDublinClock(startTime) : "9:00"}
    </span>
  );
}

// --- Supporter Avatar ---

const AVATAR_COLORS = ["#C8871A", "#1C7A4D", "#C24327", "#5B7083", "#8a8070", "#1a1a18"];

// Round selfie, or the sender's initial on a brand colour when they skipped it
function Avatar({ name, url, size = 22, ring }: { name: string; url?: string | null; size?: number; ring?: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  let h = 0;
  for (const c of name.trim().toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
  };
  if (url) {
    return <img src={url} alt="" style={{ ...base, objectFit: "cover", display: "block" }} />;
  }
  return (
    <span
      aria-hidden
      style={{
        ...base,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: AVATAR_COLORS[h % AVATAR_COLORS.length],
        color: "#F3ECDD",
        fontFamily: brand.font.display,
        fontSize: size * 0.5,
        lineHeight: 1,
      }}
    >
      {initial}
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

// --- Action Buttons ---

function ActionButtons({ onCamera, onGallery, onMessage }: { onCamera: () => void; onGallery: () => void; onMessage: () => void }) {
  const btnStyle: React.CSSProperties = {
    flex: 1,
    border: `1px solid ${brand.border}`,
    borderRadius: "11px",
    padding: "0.6rem 0.25rem",
    fontFamily: brand.font.body,
    fontSize: "0.7rem",
    fontWeight: 500,
    background: "transparent",
    color: brand.dark,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.3rem",
  };

  return (
    <>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button onClick={onCamera} style={btnStyle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={brand.dark} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Camera
        </button>
        <button onClick={onGallery} style={btnStyle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={brand.dark} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Gallery
        </button>
        <button onClick={onMessage} style={btnStyle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={brand.dark} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Message
        </button>
      </div>
    </>
  );
}

// --- Floating Add Button ---

function FloatingAddButton({ onCamera, onGallery, onMessage }: { onCamera: () => void; onGallery: () => void; onMessage: () => void }) {
  const [open, setOpen] = useState(false);

  const items: { label: string; onClick: () => void }[] = [
    { label: "Camera", onClick: onCamera },
    { label: "Gallery", onClick: onGallery },
    { label: "Message", onClick: onMessage },
  ];

  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 89, background: "rgba(26,26,24,0.25)" }}
        />
      )}
      <div
        style={{
          position: "fixed",
          right: "max(1rem, calc(50vw - 240px + 1rem))",
          // Kept clear of the bottom edge, where iOS Safari swallows taps to show its toolbar
          bottom: "calc(2.25rem + env(safe-area-inset-bottom))",
          zIndex: 90,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "0.5rem",
        }}
      >
        {open &&
          items.map((item, i) => (
            <button
              key={item.label}
              className="tap-press"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              style={{
                minHeight: 46,
                padding: "0 1.35rem",
                background: brand.dark,
                color: "#F3ECDD",
                border: "none",
                borderRadius: "23px",
                fontFamily: brand.font.body,
                fontSize: "0.95rem",
                fontWeight: 500,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(26,26,24,0.15)",
                animation: `fadeInUp 0.2s ease-out ${(items.length - 1 - i) * 0.04}s both`,
              }}
            >
              {item.label}
            </button>
          ))}
        <button
          aria-label={open ? "Close" : "Add support"}
          onClick={() => setOpen((o) => !o)}
          className="tap-press"
          style={{
            width: 62,
            height: 62,
            borderRadius: "50%",
            background: brand.dark,
            color: "#F3ECDD",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 6px 20px rgba(26,26,24,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ transform: open ? "rotate(45deg)" : "none", transition: "transform 0.2s ease-out" }}
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </>
  );
}


// --- Fundraising ---

function FundraisingCard({ data, athleteName }: { data: FundraisingProgress; athleteName: string }) {
  const hasProgress = data.raised !== null && data.target !== null && data.target > 0;
  const pct = hasProgress ? Math.round((data.raised! / data.target!) * 100) : 0;
  const money = (n: number) => `${data.currency}${n.toLocaleString("en-IE")}`;
  // "Grow Mental Health (Grow in Ireland)" -> "Grow Mental Health"
  const charity = data.charity?.replace(/\s*\(.*\)\s*$/, "");

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "0.65rem 0.75rem 0.7rem 0.9rem",
        background: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: "14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              fontFamily: brand.font.mono,
              fontSize: "0.55rem",
              letterSpacing: "0.08em",
              color: brand.muted,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {charity ? `Raising for ${charity}` : `${athleteName || "The athlete"} is fundraising`}
            </span>
          </div>
          {hasProgress && (
            <>
              <div
                style={{
                  fontFamily: brand.font.display,
                  fontSize: "2.1rem",
                  fontWeight: 600,
                  lineHeight: 1.05,
                  color: brand.dark,
                  fontVariantNumeric: "tabular-nums",
                  marginTop: "0.15rem",
                }}
              >
                {money(data.raised!)}
              </div>
              <div style={{ fontFamily: brand.font.body, fontSize: "0.9rem", color: brand.muted, whiteSpace: "nowrap" }}>
                raised of {money(data.target!)}
                <span style={{ fontFamily: brand.font.mono, fontSize: "0.85rem", fontWeight: 600, color: pct >= 100 ? brand.go : brand.dark }}> · {pct}%</span>
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem", flexShrink: 0 }}>
          <a
            href={data.donateUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "0.5rem 0.95rem",
              background: brand.dark,
              color: "#F3ECDD",
              borderRadius: "10px",
              fontFamily: brand.font.body,
              fontSize: "0.8rem",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Donate
          </a>
          {data.supporters !== null && (
            <span style={{ fontFamily: brand.font.mono, fontSize: "0.5rem", color: brand.muted, whiteSpace: "nowrap" }}>
              {data.supporters} supporters
            </span>
          )}
        </div>
      </div>
      {hasProgress && (
        <div style={{ height: 4, background: brand.border, borderRadius: 2, overflow: "hidden", marginTop: "0.5rem" }}>
          <div
            style={{
              width: `${Math.min(pct, 100)}%`,
              height: "100%",
              background: brand.go,
              borderRadius: 2,
              transition: "width 1s ease-out",
            }}
          />
        </div>
      )}
    </div>
  );
}

// --- Floating Messages ---

// Full-screen sheet for "see everything" views
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-label={title}
      style={{ position: "fixed", inset: 0, zIndex: 95, background: brand.bg, display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.9rem 1.25rem",
          borderBottom: `1px solid ${brand.border}`,
        }}
      >
        <div style={{ fontFamily: brand.font.mono, fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: brand.dark }}>
          {title}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: `1px solid ${brand.border}`,
            background: brand.card,
            color: brand.dark,
            fontSize: "1.1rem",
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>{children}</div>
    </div>
  );
}

// Every photo in an Instagram-style grid
function PhotoGallery({ photos, onPhotoClick }: { photos: Message[]; onPhotoClick: (msg: Message) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
      {photos.map((msg) => (
        <div key={msg.id} onClick={() => onPhotoClick(msg)} style={{ position: "relative", aspectRatio: "1 / 1", cursor: "pointer", background: brand.border }}>
          {isVideo(msg.photo_url!) ? (
            <video src={msg.photo_url!} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} muted playsInline autoPlay loop />
          ) : (
            <img src={msg.photo_url!} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          )}
          {!msg.is_athlete_post && (
            <span style={{ position: "absolute", left: 6, bottom: 6 }}>
              <Avatar name={msg.sender_name} url={msg.sender_avatar_url} size={20} ring="rgba(255,255,255,0.9)" />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// Every message laid out in full, newest first
function MessageList({ messages, onBubbleTap }: { messages: Message[]; onBubbleTap: (msg: Message) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "1rem 1.25rem 2rem" }}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          onClick={() => onBubbleTap(msg)}
          style={{
            background: brand.card,
            borderRadius: "14px",
            padding: "0.75rem 0.85rem",
            border: `1px solid ${brand.border}`,
            cursor: "pointer",
          }}
        >
          <p style={{ margin: 0, fontFamily: brand.font.body, fontSize: "0.9rem", lineHeight: 1.45, color: brand.dark, whiteSpace: "pre-wrap" }}>
            {msg.message}
          </p>
          <div style={{ marginTop: "0.45rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0, fontFamily: brand.font.body, fontSize: "0.75rem", fontWeight: 600, color: brand.dark }}>
              <Avatar name={msg.sender_name} url={msg.sender_avatar_url} size={24} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.sender_name}</span>
            </span>
            <span suppressHydrationWarning style={{ fontFamily: brand.font.mono, fontSize: "0.55rem", color: brand.muted, flexShrink: 0 }}>
              {timeAgo(msg.created_at)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function FloatingMessages({
  messages,
  athleteName,
  onSendMessage,
  onBubbleTap,
}: {
  messages: Message[];
  athleteName: string;
  onSendMessage: () => void;
  onBubbleTap: (msg: Message) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const userTouchRef = useRef(false);
  const scrollPos = useRef(0);
  const scrollDir = useRef(1);

  const BUBBLE_SPACE = 190;
  const PADDING = 30;
  const fieldWidth = PADDING + Math.max(messages.length * BUBBLE_SPACE, 350) + PADDING;

  // One or two messages sit on screen without scrolling
  const fits = messages.length <= 2;
  const fitWidth = messages.length === 1 ? "180px" : "min(180px, calc(50% - 21px))";
  const fitLeft = messages.length === 1 ? ["calc(50% - 90px)"] : ["14px", `calc(100% - 14px - ${fitWidth})`];

  const bubbleX = messages.map((_, i) => {
    const base = PADDING + (i / Math.max(messages.length - 1, 1)) * (fieldWidth - PADDING * 2 - 180) + 90;
    const jitter = ((i * 11 + 5) % 9 - 4) * 5;
    return base + jitter;
  });

  const bubbleY: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    let h = (i + 1) * 2654435761;
    h = ((h >> 16) ^ h) & 0xffff;
    let y = 8 + (h % 160);
    if (i > 0 && Math.abs(y - bubbleY[i - 1]) < 70) {
      y = (bubbleY[i - 1] + 100) % 160 + 8;
    }
    bubbleY.push(y);
  }

  // Slow continuous auto-scroll with sub-pixel accumulator
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const speed = 0.5;

    function tick() {
      const maxScroll = el ? el.scrollWidth - el.clientWidth : 0;
      // Only drift when there's a real row to move through; glide back and forth rather than snapping to the start
      if (!userTouchRef.current && el && maxScroll > 150) {
        scrollPos.current += speed * scrollDir.current;
        if (scrollPos.current >= maxScroll) {
          scrollPos.current = maxScroll;
          scrollDir.current = -1;
        } else if (scrollPos.current <= 0) {
          scrollPos.current = 0;
          scrollDir.current = 1;
        }
        el.scrollLeft = scrollPos.current;
      } else if (el) {
        scrollPos.current = el.scrollLeft;
      }
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [messages.length]);

  // When a new message lands at the front, jump back so it's front and centre
  const frontId = messages[0]?.id;
  useEffect(() => {
    scrollPos.current = 0;
    scrollDir.current = 1;
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [frontId]);

  // Pause auto-scroll on touch, resume on release
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onDown() { userTouchRef.current = true; }
    function onUp() { userTouchRef.current = false; }
    el.addEventListener("touchstart", onDown, { passive: true });
    el.addEventListener("touchend", onUp, { passive: true });
    el.addEventListener("mousedown", onDown);
    el.addEventListener("mouseup", onUp);
    el.addEventListener("mouseleave", onUp);
    return () => {
      el.removeEventListener("touchstart", onDown);
      el.removeEventListener("touchend", onUp);
      el.removeEventListener("mousedown", onDown);
      el.removeEventListener("mouseup", onUp);
      el.removeEventListener("mouseleave", onUp);
    };
  }, []);

  if (messages.length === 0) {
    return (
      <EmptyCta
        onClick={onSendMessage}
        label={`Be the first to send ${athleteName} a message`}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
            <path d="M4 5h16v11H9l-5 4V5Z" />
          </svg>
        }
      />
    );
  }

  return (
    <div style={{ position: "relative", margin: "0 -1.25rem", height: 260 }}>
      {/* Right fade hint */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 40,
          background: `linear-gradient(to right, transparent, ${brand.bg})`,
          zIndex: 2,
          pointerEvents: "none",
        }}
      />
      {/* Message count */}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: "1.25rem",
          fontFamily: brand.font.mono,
          fontSize: "0.55rem",
          color: brand.muted,
          zIndex: 3,
          letterSpacing: "0.05em",
        }}
      >
        {messages.length} {messages.length === 1 ? "message" : "messages"}
      </div>
      <div
        ref={scrollRef}
        className="floating-scroll"
        style={{
          position: "absolute",
          inset: 0,
          overflowX: "scroll",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        <div
          style={{
            position: "relative",
            width: fits ? "100%" : fieldWidth,
            height: "100%",
          }}
        >
        {messages.map((msg, i) => {
          const floatDur = 3.5 + (i % 3);
          const floatDel = (i * 0.7) % 2.5;
          const rotate = ((i * 7 + 3) % 7) - 3;

          return (
            <div
              key={msg.id}
              onClick={() => onBubbleTap(msg)}
              style={{
                position: "absolute",
                left: fits ? fitLeft[i] : bubbleX[i],
                top: fits ? [20, 95][i] : bubbleY[i],
                width: fits ? fitWidth : 180,
                transform: `rotate(${rotate}deg)`,
                transformOrigin: "center center",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  background: brand.card,
                  borderRadius: "14px",
                  padding: "0.75rem 0.85rem",
                  boxShadow:
                    "4px 4px 12px rgba(26,26,24,0.06), -2px -2px 8px rgba(255,255,255,0.7)",
                  border: `1px solid ${brand.border}`,
                  animation: `float ${floatDur}s ease-in-out ${floatDel}s infinite`,
                }}
              >
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
                    marginTop: "0.35rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      minWidth: 0,
                      fontFamily: brand.font.body,
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      color: brand.dark,
                    }}
                  >
                    <Avatar name={msg.sender_name} url={msg.sender_avatar_url} size={24} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.sender_name}</span>
                  </span>
                  <span
                    suppressHydrationWarning
                    style={{
                      fontFamily: brand.font.mono,
                      fontSize: "0.55rem",
                      color: brand.muted,
                    }}
                  >
                    {timeAgo(msg.created_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// --- Photo Grid ---

function PhotoGrid({
  photos: supporterPhotos,
  pinned,
  athleteName,
  athleteAvatarUrl,
  onShowAll,
  onPhotoClick,
  onAddPhoto,
}: {
  photos: Message[];
  athleteName: string;
  athleteAvatarUrl?: string | null;
  onShowAll: () => void;
  pinned?: Message | null;
  onPhotoClick: (msg: Message) => void;
  onAddPhoto: () => void;
}) {
  const photos = pinned ? [pinned, ...supporterPhotos] : supporterPhotos;
  if (photos.length === 0) {
    return (
      <EmptyCta
        onClick={onAddPhoto}
        label={`Be the first to send ${athleteName} a photo`}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="m21 16-5-5-8 8" />
          </svg>
        }
      />
    );
  }

  // Two rows (7 photos + add tile); beyond that a "+N" tile reveals the rest
  const MAX_COLLAPSED = 7;
  const overflow = Math.max(0, photos.length - MAX_COLLAPSED + 1);
  const visible = overflow > 0 ? photos.slice(0, MAX_COLLAPSED - 1) : photos;

  const tileStyle: React.CSSProperties = {
    position: "relative",
    aspectRatio: "1 / 1",
    borderRadius: "10px",
    overflow: "hidden",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "0.4rem",
        marginTop: "0.25rem",
      }}
    >
      {visible.map((msg, i) => (
        <div
          key={msg.id}
          onClick={() => onPhotoClick(msg)}
          style={{
            ...tileStyle,
            boxShadow: "0 1px 4px rgba(26,26,24,0.1)",
            animation: `fadeInUp 0.4s ease-out ${i * 0.04}s both`,
          }}
        >
          {isVideo(msg.photo_url!) ? (
            <video src={msg.photo_url!} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} muted playsInline autoPlay loop />
          ) : (
            <img src={msg.photo_url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          )}
          <span
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "0.6rem 0.35rem 0.25rem",
              background: "linear-gradient(transparent, rgba(0,0,0,0.55))",
              fontFamily: brand.font.body,
              fontSize: "0.6rem",
              fontWeight: 600,
              color: "#fff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              {msg.id === pinned?.id ? (
                <Avatar name={athleteName || msg.sender_name} url={athleteAvatarUrl} size={16} ring="rgba(255,255,255,0.9)" />
              ) : (
                <Avatar name={msg.sender_name} url={msg.sender_avatar_url} size={16} ring="rgba(255,255,255,0.9)" />
              )}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {msg.id === pinned?.id ? "Race kit" : msg.sender_name}
              </span>
            </span>
          </span>
        </div>
      ))}
      {overflow > 0 && (
        <button
          onClick={onShowAll}
          aria-label={`See all ${photos.length} photos`}
          style={{ ...tileStyle, padding: 0, border: "none", background: brand.dark }}
        >
          {/* Peek at the next photo so it reads as "more in here" */}
          {isVideo(photos[MAX_COLLAPSED - 1].photo_url!) ? (
            <video src={photos[MAX_COLLAPSED - 1].photo_url!} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <img src={photos[MAX_COLLAPSED - 1].photo_url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          )}
          <span style={{ position: "absolute", inset: 0, background: "rgba(26,26,24,0.55)" }} />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinejoin="round"
            aria-hidden
            style={{ position: "absolute", top: 7, right: 7 }}
          >
            <rect x="8" y="8" width="13" height="13" rx="2" />
            <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
          </svg>
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: brand.font.display,
              fontSize: "1.5rem",
              fontWeight: 600,
              color: "#fff",
            }}
          >
            +{overflow}
          </span>
        </button>
      )}
      <button
        onClick={onAddPhoto}
        style={{
          ...tileStyle,
          background: brand.dark,
          border: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.25rem",
          color: brand.accent,
          fontFamily: brand.font.body,
          fontSize: "0.6rem",
          fontWeight: 600,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span style={{ color: "#fff" }}>Add photo</span>
      </button>
    </div>
  );
}


// --- Athlete Post Card ---

function AthletePostCard({ msg, onPhotoClick }: { msg: Message; onPhotoClick: (msg: Message) => void }) {
  return (
    <div
      style={{
        border: `1.5px solid ${brand.dark}`,
        borderRadius: "14px",
        overflow: "hidden",
        marginBottom: "0.5rem",
      }}
    >
      {msg.photo_url && (
        <div
          style={{ position: "relative", height: 260, overflow: "hidden", cursor: "pointer", background: brand.dark }}
          onClick={() => onPhotoClick(msg)}
        >
          {/* Blurred copy fills the frame so tall or wide photos show whole without bars */}
          <img
            src={msg.photo_url}
            alt=""
            aria-hidden
            style={{ position: "absolute", inset: "-20px", width: "calc(100% + 40px)", height: "calc(100% + 40px)", objectFit: "cover", filter: "blur(18px) brightness(0.85)" }}
          />
          <img
            src={msg.photo_url}
            alt=""
            style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </div>
      )}
      <div style={{ padding: "0.65rem 0.8rem" }}>
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

// --- Course Tracker (linear, with goal ghost) ---

const FLAT_COURSE = { path: "M0,37 L300,37", fill_path: "" };

function formatGap(s: number): string {
  const abs = Math.abs(Math.round(s));
  return `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

function formatElapsed(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// Race clock for athletes without a goal; ticks every second on the client only
function ElapsedTimer({ elapsedAt }: { elapsedAt: (nowMs: number) => number | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const sec = now === null ? null : elapsedAt(now);
  return (
    <div style={{ textAlign: "center", margin: "0.25rem 0 0.5rem" }}>
      <div
        style={{
          fontFamily: brand.font.mono,
          fontSize: "0.75rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: brand.muted,
          fontWeight: 600,
        }}
      >
        Elapsed
      </div>
      <div
        style={{
          fontFamily: brand.font.display,
          fontSize: "2.2rem",
          fontWeight: 600,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
          color: brand.dark,
        }}
      >
        {sec === null ? "--:--:--" : formatElapsed(sec)}
      </div>
    </div>
  );
}

function EstimatedFinish({ time }: { time: string }) {
  return (
    <div style={{ textAlign: "center", margin: "0.25rem 0 0.5rem" }}>
      <div
        style={{
          fontFamily: brand.font.mono,
          fontSize: "0.75rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: brand.muted,
          fontWeight: 600,
        }}
      >
        Est. finish
      </div>
      <div
        style={{
          fontFamily: brand.font.display,
          fontSize: "2.2rem",
          fontWeight: 600,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
          color: brand.dark,
        }}
      >
        {time}
      </div>
    </div>
  );
}

const WINDOW_KM = 2;

// Mini race bib: orange number band with safety-pin holes
function BibTag({ bib }: { bib: number }) {
  const pin = (pos: React.CSSProperties) => (
    <span style={{ position: "absolute", display: "block", width: 3, height: 3, minWidth: 3, borderRadius: "50%", background: "rgba(26,26,24,0.55)", ...pos }} />
  );
  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        marginTop: "0.25rem",
        padding: "1px 9px",
        background: "#f5a623",
        borderRadius: 2,
        fontFamily: brand.font.mono,
        fontWeight: 700,
        fontSize: "0.7rem",
        letterSpacing: "0.04em",
        lineHeight: 1.35,
        color: brand.dark,
      }}
    >
      {pin({ top: 2, left: 2 })}
      {pin({ top: 2, right: 2 })}
      {pin({ bottom: 2, left: 2 })}
      {pin({ bottom: 2, right: 2 })}
      {bib}
    </div>
  );
}

const trackerButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  border: `1px solid ${brand.border}`,
  background: brand.card,
  color: brand.dark,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

function CourseTracker({
  profile,
  distanceKm,
  runnerKm,
  athleteName,
  ghost,
  elapsedAt,
  onOpenMap,
  onOpenKit,
  estimatedFinish,
}: {
  profile: Race["elevation_profile"];
  distanceKm: number;
  runnerKm: number;
  athleteName: string;
  ghost: { offsetKm: number; deltaSec: number; goalTime: string } | null;
  elapsedAt?: ((nowMs: number) => number | null) | null;
  onOpenMap?: () => void;
  onOpenKit?: () => void;
  /** "3:47" — shown instead of the elapsed clock for runners without a goal */
  estimatedFinish?: string | null;
}) {
  const course = profile ?? FLAT_COURSE;
  const height = profile ? 74 : 30;

  const points = course.path
    .replace(/[MLQ]/g, "")
    .trim()
    .split(/\s+L\s*|\s+/)
    .map((p) => p.split(",").map(Number))
    .filter((p) => p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]));

  // Profile x runs 0–300 across the whole course
  const unitsPerKm = 300 / distanceKm;
  function yAtKm(km: number): number {
    const x = km * unitsPerKm;
    if (points.length < 2) return 37;
    if (x <= points[0][0]) return points[0][1];
    for (let i = 0; i < points.length - 1; i++) {
      if (x >= points[i][0] && x <= points[i + 1][0]) {
        const t = (x - points[i][0]) / (points[i + 1][0] - points[i][0] || 1);
        return points[i][1] + t * (points[i + 1][1] - points[i][1]);
      }
    }
    return points[points.length - 1][1];
  }

  // Zoomed window that follows the runner, kept inside the course
  const windowKm = Math.min(WINDOW_KM, distanceKm);
  const startKm = Math.min(Math.max(runnerKm - windowKm / 2, 0), distanceKm - windowKm);
  const endKm = startKm + windowKm;
  const pctAt = (km: number) => ((km - startKm) / windowKm) * 100;

  // Fit the vertical scale to the elevation inside the window
  const ys = [yAtKm(startKm), yAtKm(endKm), ...points.filter((p) => p[0] >= startKm * unitsPerKm && p[0] <= endKm * unitsPerKm).map((p) => p[1])];
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(Math.max(...ys) - Math.min(...ys), 14) * 1.6;
  const yMin = mid - span / 2;
  const topPctAt = (km: number) => ((yAtKm(km) - yMin) / span) * 100;

  const kmTicks: number[] = [];
  for (let k = Math.ceil(startKm * 2) / 2; k <= endKm + 1e-6; k += 0.5) kmTicks.push(k);

  // Goal sits at its true distance; if it's off the window, pin it to the edge with a badge
  const goalKm = ghost ? runnerKm + ghost.offsetKm : null;
  const goalOff = goalKm !== null && (goalKm < startKm || goalKm > endKm);
  const goalShownKm = goalKm === null ? 0 : Math.min(Math.max(goalKm, startKm), endKm);

  const dotLabel: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    fontFamily: brand.font.mono,
    fontSize: "0.5rem",
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
  };

  const showRunner = runnerKm > 0;
  const ghostAhead = ghost !== null && ghost.deltaSec < 0;

  return (
    <div style={{ marginTop: "0.25rem", position: "relative", paddingTop: (onOpenMap || onOpenKit) && !ghost && !elapsedAt && !estimatedFinish ? 36 : 0 }}>
      {(onOpenMap || onOpenKit) && (
        <div style={{ position: "absolute", top: 0, right: 0, zIndex: 2, display: "flex", gap: "0.4rem" }}>
          {onOpenKit && (
            <button onClick={onOpenKit} aria-label={`${athleteName}'s race day kit`} style={trackerButtonStyle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
                <path d="M9 3v2a3 3 0 0 0 6 0V3h2.5v4L20 10v11H4V10l2.5-3V3H9Z" />
              </svg>
            </button>
          )}
          {onOpenMap && (
            <button onClick={onOpenMap} aria-label="Open course map" style={trackerButtonStyle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
                <path d="M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5L9 4Z" />
                <path d="M9 4v13.5M15 6.5V20" />
              </svg>
            </button>
          )}
        </div>
      )}
      {!ghost && estimatedFinish && <EstimatedFinish time={estimatedFinish} />}
      {!ghost && !estimatedFinish && elapsedAt && <ElapsedTimer elapsedAt={elapsedAt} />}
      {ghost && (
        <div style={{ textAlign: "center", margin: "0.25rem 0 0.5rem" }}>
          <div
            style={{
              fontFamily: brand.font.mono,
              fontSize: "0.75rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: brand.goal,
              fontWeight: 600,
            }}
          >
            Goal · {ghost.goalTime}
          </div>
          <div
            style={{
              fontFamily: brand.font.display,
              fontSize: "2.2rem",
              fontWeight: 600,
              lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums",
              color: ghostAhead ? brand.behind : brand.go,
            }}
          >
            {ghostAhead ? "−" : "+"}
            {formatGap(ghost.deltaSec)}
          </div>
        </div>
      )}
      <div style={{ position: "relative", height, margin: "0.6rem 0 0" }}>
        <svg
          viewBox={`${(startKm * unitsPerKm).toFixed(2)} ${yMin.toFixed(2)} ${(windowKm * unitsPerKm).toFixed(2)} ${span.toFixed(2)}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%", display: "block", overflow: "hidden" }}
        >
          {course.fill_path && <path d={course.fill_path} fill="rgba(28,24,19,0.07)" />}
          <path
            d={course.path}
            fill="none"
            stroke={brand.dark}
            strokeWidth="1.5"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Goal — where goal pace would be right now */}
        {ghost && showRunner && (
          <div
            style={{
              position: "absolute",
              left: `${pctAt(goalShownKm).toFixed(2)}%`,
              top: `${topPctAt(goalShownKm).toFixed(2)}%`,
              width: 13,
              height: 13,
              borderRadius: "50%",
              background: brand.goal,
              border: `3px solid ${brand.card}`,
              boxShadow: `0 0 0 1px ${brand.goal}`,
              transform: "translate(-50%, -50%)",
              transition: "left 2s ease-out, top 2s ease-out",
            }}
          >
            <span className="dot-pulse" style={{ position: "absolute", inset: -3, borderRadius: "50%", background: brand.goal }} />
            <span
              style={{
                ...dotLabel,
                top: 16,
                color: goalOff ? brand.card : brand.goal,
                background: goalOff ? brand.goal : "transparent",
                padding: goalOff ? "1px 5px" : 0,
                borderRadius: 999,
                fontWeight: 600,
                fontSize: "0.55rem",
                // Off-window badge hovers above the pinned dot, clear of the course line
                ...(goalOff ? { top: "auto", bottom: 16, left: goalKm! > endKm ? "auto" : 0, right: goalKm! > endKm ? 0 : "auto", transform: "none" } : {}),
              }}
            >
              {goalOff ? `Goal ${ghost.offsetKm > 0 ? "+" : "−"}${Math.abs(ghost.offsetKm).toFixed(1)}km` : "Goal"}
            </span>
          </div>
        )}

        {showRunner && (
          <div
            style={{
              position: "absolute",
              left: `${pctAt(runnerKm).toFixed(2)}%`,
              top: `${topPctAt(runnerKm).toFixed(2)}%`,
              width: 13,
              height: 13,
              borderRadius: "50%",
              background: brand.dark,
              border: `3px solid ${brand.card}`,
              boxShadow: `0 0 0 1px ${brand.dark}`,
              transform: "translate(-50%, -50%)",
              transition: "left 2s ease-out, top 2s ease-out",
              zIndex: 1,
            }}
          >
            <span className="dot-pulse" style={{ position: "absolute", inset: -3, borderRadius: "50%", background: brand.dark, animationDelay: "0.6s" }} />
            <span style={{ ...dotLabel, bottom: 14, color: brand.dark }}>{athleteName}</span>
          </div>
        )}
      </div>

      {/* Km markers scroll with the window */}
      <div style={{ position: "relative", height: 22, borderTop: `1px solid ${brand.border}` }}>
        {kmTicks.map((k) => (
          <div
            key={k}
            style={{
              position: "absolute",
              left: `${pctAt(k).toFixed(2)}%`,
              top: 0,
              transform: pctAt(k) > 95 ? "translateX(-100%)" : pctAt(k) < 5 ? "none" : "translateX(-50%)",
              alignItems: pctAt(k) > 95 ? "flex-end" : pctAt(k) < 5 ? "flex-start" : "center",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span style={{ width: 1, height: 5, background: brand.muted }} />
            <span style={{ fontFamily: brand.font.mono, fontSize: "0.5rem", color: brand.muted, marginTop: 2 }}>
              {Number.isInteger(k) ? k : k.toFixed(1)}km
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Finish Result ---

function TinyFireworks() {
  const bursts = [
    { left: "12%", top: "30%", delay: 0 },
    { left: "88%", top: "18%", delay: 0.9 },
    { left: "50%", top: "-4%", delay: 1.7 },
    { left: "78%", top: "62%", delay: 2.4 },
    { left: "22%", top: "70%", delay: 3.1 },
  ];
  const colors = [brand.accent, brand.go, brand.behind, "#d9a441"];

  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {bursts.map((b, bi) =>
        Array.from({ length: 10 }).map((_, pi) => {
          const angle = (pi / 10) * Math.PI * 2;
          const dist = 18 + ((pi * 7 + bi * 3) % 12);
          return (
            <span
              key={`${bi}-${pi}`}
              className="tiny-firework"
              style={{
                position: "absolute",
                left: b.left,
                top: b.top,
                width: 3,
                height: 3,
                borderRadius: "50%",
                background: colors[(pi + bi) % colors.length],
                // @ts-expect-error CSS custom properties
                "--fx": `${(Math.cos(angle) * dist).toFixed(1)}px`,
                "--fy": `${(Math.sin(angle) * dist).toFixed(1)}px`,
                animation: `tinyFirework 3.8s ease-out ${b.delay}s infinite`,
              }}
            />
          );
        })
      )}
    </div>
  );
}

function FinishResult({
  finishTime,
  athleteName,
}: {
  finishTime: string;
  athleteName: string;
}) {
  return (
    <div style={{ position: "relative", textAlign: "center", padding: "0.75rem 0 0.25rem" }}>
      <TinyFireworks />
      <div
        style={{
          fontFamily: brand.font.display,
          fontSize: "1.1rem",
          color: brand.dark,
          marginBottom: "0.2rem",
        }}
      >
        {athleteName} finished in
      </div>
      <div
        style={{
          fontFamily: brand.font.display,
          fontSize: "2.6rem",
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
          fontFamily: brand.font.body,
          fontSize: "0.85rem",
          margin: "0.6rem 0.5rem 0",
          lineHeight: 1.4,
          color: brand.muted,
        }}
      >
        He doesn&apos;t have his phone yet, send him support.
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
  demoElapsedSeconds: fixedDemoSeconds,
  demoLoop,
  initialFundraising,
}: {
  race: Race;
  raceAthletes: RaceAthlete[];
  initialSplits: Record<string, Split[]>;
  initialMessages: Message[];
  demoElapsedSeconds?: number;
  demoLoop?: { fromSec: number; toSec: number; speed: number };
  initialFundraising?: FundraisingProgress | null;
}) {
  const [splits, setSplits] = useState(initialSplits);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedAthlete] = useState(raceAthletes[0]?.athlete_id ?? "");

  // Input & modal state
  const [inputMode, setInputMode] = useState<"selfie" | "gallery" | "message" | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [lightboxMsg, setLightboxMsg] = useState<Message | null>(null);
  const [showSplits, setShowSplits] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function handleFileCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so same file can be re-selected
    if (!file) return;
    // Object URL, not a data URL: videos can be tens of MB
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
    setInputMode("gallery"); // open modal with file pre-loaded
  }

  // Splash for new messages
  const [splashMsg, setSplashMsg] = useState<Message | null>(null);
  const [splashReady, setSplashReady] = useState(false);
  const seenIdsRef = useRef(new Set(initialMessages.map((m) => m.id)));
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

  // Detect arrivals by id (a count check misses them once the feed is capped at 50)
  useEffect(() => {
    const arriving = messages.filter((m) => !seenIdsRef.current.has(m.id));
    if (arriving.length === 0) return;
    arriving.forEach((m) => seenIdsRef.current.add(m.id));
    splashQueueRef.current.push(...[...arriving].reverse()); // oldest first
    processQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Polling
  const pollSplits = useCallback(async () => {
    for (const ra of raceAthletes) {
      if (!ra.raceresult_pid) {
        if (!ra.rtrt_athlete_id) continue;
        try {
          const res = await fetch(`/api/race/tracking?race_athlete_id=${ra.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.tracking?.splits?.length) {
              setSplits((prev) => ({ ...prev, [ra.athlete_id]: rtrtToSplits(data.tracking.splits) }));
            }
          }
        } catch {}
        continue;
      }
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

  // Fundraising progress: refresh every 5 minutes while the page is open
  const [fundraising, setFundraising] = useState(initialFundraising ?? null);
  const fundraisingRaId = initialFundraising ? raceAthletes[0]?.id : null;
  useEffect(() => {
    if (!fundraisingRaId) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/race/fundraising?race_athlete_id=${fundraisingRaId}`);
        if (res.ok) setFundraising((await res.json()).fundraising);
      } catch {}
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [fundraisingRaId]);

  const [showMap, setShowMap] = useState(false);
  const [sheet, setSheet] = useState<"photos" | "messages" | null>(null);

  // Client clock for projecting RTRT runners between timing mats
  const demoSpeed = demoLoop?.speed ?? 1;
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const t = setInterval(tick, demoSpeed > 1 ? 1000 : 5000);
    return () => clearInterval(t);
  }, [demoSpeed]);

  // Looping demo: replay the race on the wall clock so everyone sees the same moment
  const demoElapsedSeconds =
    fixedDemoSeconds ??
    (demoLoop
      ? demoLoop.fromSec +
        (nowMs === null ? 0 : ((nowMs / 1000) * demoLoop.speed) % (demoLoop.toSec - demoLoop.fromSec))
      : undefined);
  const isDemo = demoElapsedSeconds !== undefined;

  // Derived data
  const athlete = raceAthletes.find((ra) => ra.athlete_id === selectedAthlete);
  const goalTime = athlete?.goal_time ?? null;
  const firstName = athlete?.athletes.first_name ?? "";
  const isRtrt = !!athlete?.rtrt_athlete_id && !demoElapsedSeconds;
  const allSplits = splits[selectedAthlete] ?? [];

  // Demo clock: replay real splits as if the athlete is `demoElapsedSeconds` into the race
  const athleteSplits = demoElapsedSeconds
    ? allSplits.map((s) => ({ ...s, Exists: s.Exists && !!s.Chip && parseTimeToSeconds(s.Chip) <= demoElapsedSeconds }))
    : allSplits;
  const demoKm = (() => {
    if (!demoElapsedSeconds) return null;
    const timed = allSplits
      .map((s) => ({ km: splitNameToKm(s.Name, race.distance_km), t: s.Chip ? parseTimeToSeconds(s.Chip) : null }))
      .filter((p): p is { km: number; t: number } => p.km !== null && p.t !== null);
    for (let i = 0; i < timed.length - 1; i++) {
      const a = timed[i], b = timed[i + 1];
      if (demoElapsedSeconds >= a.t && demoElapsedSeconds <= b.t) {
        return a.km + ((demoElapsedSeconds - a.t) / (b.t - a.t || 1)) * (b.km - a.km);
      }
    }
    return null;
  })();
  const completedSplits = athleteSplits.filter((s) => s.Exists);

  // RTRT only reports mats already crossed: project forward from the last one at their average pace
  const liveKm = (() => {
    if (!isRtrt || nowMs === null) return null;
    const last = completedSplits[completedSplits.length - 1];
    if (!last?.TOD || !last.Chip || isFinishSplit(last.Name)) return null;
    const lastKm = splitNameToKm(last.Name, race.distance_km);
    if (lastKm === null) return null;
    const goalSec = goalTime ? parseTimeToSeconds(goalTime) : 0;
    const pacePerKm =
      lastKm > 0 ? parseTimeToSeconds(last.Chip) / lastKm : goalSec ? goalSec / race.distance_km : 360;
    const sinceLast = (nowMs - dublinTimeToMs(race.race_date, last.TOD)) / 1000;
    if (sinceLast <= 0) return lastKm;
    return Math.min(race.distance_km * 0.995, lastKm + sinceLast / pacePerKm);
  })();

  // Tracked athletes go live when they cross the start mat and finish when they cross the line
  const status = (() => {
    if (!isRtrt || race.status === "finished") return race.status;
    if (completedSplits.some((sp) => isFinishSplit(sp.Name))) return "finished";
    if (completedSplits.length > 0) return "live";
    return "upcoming";
  })();

  const startMs = race.start_time ? new Date(race.start_time).getTime() : null;
  const shouldPoll =
    status === "live" ||
    (isRtrt && status === "upcoming" && startMs !== null && nowMs !== null && nowMs >= startMs - 10 * 60000);

  useEffect(() => {
    if (!shouldPoll) return;
    const first = isRtrt ? setTimeout(pollSplits, 0) : undefined;
    const interval = setInterval(() => {
      if (!isDemo) pollSplits();
      pollMessages();
    }, 30000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [shouldPoll, isRtrt, pollSplits, pollMessages, isDemo]);

  const estimatedKm = (() => {
    if (demoKm !== null) return Math.round(demoKm * 10) / 10;
    if (liveKm !== null) return Math.round(liveKm * 10) / 10;
    if (completedSplits.length < 2) return null;
    const last = completedSplits[completedSplits.length - 1];
    const lastKm = splitNameToKm(last.Name, race.distance_km);
    if (lastKm === null) return lastKm;
    if (isFinishSplit(last.Name)) return race.distance_km;
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

  const finishTime = (() => {
    const finishSplit = athleteSplits.find(
      (s) => s.Exists && isFinishSplit(s.Name)
    );
    return finishSplit?.Chip ?? null;
  })();

  // Goal ghost: compare the last timing split against even goal pace, then
  // carry that gap forward so the ghost sits relative to the runner's dot.
  const ghost = (() => {
    if (!goalTime || status !== "live" || completedSplits.length < 2) return null;
    const goalSec = parseTimeToSeconds(goalTime);
    const last = completedSplits[completedSplits.length - 1];
    const lastKm = splitNameToKm(last.Name, race.distance_km);
    if (!goalSec || lastKm === null || !last.Chip) return null;
    const t = parseTimeToSeconds(last.Chip);
    const ghostKm = Math.min(race.distance_km, (t / goalSec) * race.distance_km);
    const offsetKm = ghostKm - lastKm; // positive = goal is ahead of the runner
    const deltaSec = Math.round((goalSec * lastKm) / race.distance_km - t); // positive = ahead of the ghost
    const parts = goalTime.split(":");
    const goalLabel = parts.length === 3 && parts[2] === "00" ? `${parts[0]}:${parts[1]}` : goalTime;
    return { offsetKm, deltaSec, goalTime: goalLabel };
  })();

  // Race clock: demo clock, or time since the runner crossed the start mat
  const startTod = completedSplits.find((sp) => splitNameToKm(sp.Name, race.distance_km) === 0)?.TOD;
  const elapsedAt = fixedDemoSeconds
    ? () => fixedDemoSeconds
    : demoLoop
      ? (ms: number) => demoLoop.fromSec + (((ms / 1000) * demoLoop.speed) % (demoLoop.toSec - demoLoop.fromSec))
      : isRtrt && startTod
        ? (ms: number) => (ms - dublinTimeToMs(race.race_date, startTod)) / 1000
        : null;

  // No goal: project a finish from average pace to the last mat (6:00/km until the first mat after the start)
  const estimatedFinish = (() => {
    if (goalTime || !isRtrt || status !== "live") return null;
    const last = [...completedSplits].reverse().find((sp) => sp.Chip && (splitNameToKm(sp.Name, race.distance_km) ?? 0) > 0);
    const pacePerKm = last ? parseTimeToSeconds(last.Chip!) / splitNameToKm(last.Name, race.distance_km)! : 360;
    const mins = Math.round((pacePerKm * race.distance_km) / 60);
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
  })();

  // Average pace to the last mat crossed
  const avgPace = (() => {
    const last = [...completedSplits].reverse().find((sp) => sp.Chip && (splitNameToKm(sp.Name, race.distance_km) ?? 0) > 0);
    if (!last) return null;
    const secPerKm = Math.round(parseTimeToSeconds(last.Chip!) / splitNameToKm(last.Name, race.distance_km)!);
    return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, "0")}`;
  })();

  // Newest first everywhere: after the race the congratulations lead, drifting back to the pre-race messages
  const byNewest = (a: Message, b: Message) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  const athletePosts = messages.filter((m) => m.is_athlete_post);
  // The athlete's pre-race kit photo is pinned first on the live page
  const raceKitPost = athletePosts.filter((m) => m.photo_url).sort(byNewest)[0] ?? null;
  const supporterMessages = messages
    .filter((m) => !m.is_athlete_post && m.message && !m.photo_url && m.id !== splashMsg?.id)
    .sort(byNewest);
  const supporterPhotos = messages
    .filter((m) => !m.is_athlete_post && m.photo_url && m.id !== splashMsg?.id)
    .sort(byNewest);

  const openGallery = () => galleryInputRef.current?.click();
  const openCamera = () => cameraInputRef.current?.click();
  const openMessage = () => setInputMode("message");

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
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .floating-scroll::-webkit-scrollbar { display: none; }
        @keyframes tinyFirework {
          0% { transform: translate(0, 0) scale(1); opacity: 0; }
          4% { opacity: 1; }
          40% { transform: translate(var(--fx), var(--fy)) scale(0.4); opacity: 0; }
          100% { transform: translate(var(--fx), var(--fy)) scale(0.4); opacity: 0; }
        }
        .tap-press { touch-action: manipulation; -webkit-tap-highlight-color: transparent; transition: transform 0.08s ease-out; }
        .tap-press:active { transform: scale(0.93); }
        @keyframes nameShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
        .name-shake { animation: nameShake 0.35s ease-in-out; }
        @keyframes dotPulse {
          0% { transform: scale(1); opacity: 0.45; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        .dot-pulse { animation: dotPulse 1.8s ease-out infinite; pointer-events: none; }
        @media (prefers-reduced-motion: reduce) {
          .tiny-firework { display: none; }
          .dot-pulse { animation: none; opacity: 0; }
        }
      `}</style>

      {/* ─── Header ─── */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "1rem 1.25rem 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              fontFamily: brand.font.body,
              fontSize: "0.75rem",
              color: brand.muted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {race.name}
          </div>
          <span style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            <StatusPill status={status} startTime={race.start_time} estimatedKm={estimatedKm} />
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.5rem",
            marginTop: "0.2rem",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: brand.font.display,
                fontSize: "1.35rem",
                fontWeight: 600,
                letterSpacing: "-0.015em",
                lineHeight: 1.1,
                color: brand.dark,
              }}
            >
              {athlete
                ? `${athlete.athletes.first_name} ${athlete.athletes.last_name}`
                : race.name}
            </div>
            {athlete?.bib_number ? <BibTag bib={athlete.bib_number} /> : null}
          </div>
          {status !== "upcoming" && completedSplits.length > 0 && (
            <button
              onClick={() => setShowSplits(true)}
              style={{
                marginLeft: "auto",
                marginTop: "0.3rem",
                padding: "0.2rem 0.6rem",
                background: "transparent",
                border: `1px solid ${brand.border}`,
                borderRadius: "20px",
                fontFamily: brand.font.mono,
                fontSize: "0.6rem",
                letterSpacing: "0.08em",
                color: brand.dark,
                cursor: "pointer",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              Splits
            </button>
          )}
        </div>
      </div>

      {/* ─── Content ─── */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 1.25rem 7.5rem" }}>

        {/* ===================== BEFORE ===================== */}
        {status === "upcoming" && (
          <>
            <BigCountdown raceDate={race.race_date} startTime={race.start_time} athleteName={firstName} tight={!!athlete?.bib_number} />

            {/* Athlete's own posts */}
            {athletePosts.length > 0 && (
              <>
                <SectionLabel>
                  From {firstName || "the athlete"}
                </SectionLabel>
                {athletePosts.map((post) => (
                  <AthletePostCard key={post.id} msg={post} onPhotoClick={setLightboxMsg} />
                ))}
              </>
            )}
          </>
        )}

        {/* ===================== DURING ===================== */}
        {status === "live" && (
          <>
            <SectionLabel>On the course</SectionLabel>
            <CourseTracker
              profile={race.elevation_profile}
              distanceKm={race.distance_km}
              runnerKm={(runnerPct / 100) * race.distance_km}
              athleteName={firstName}
              ghost={ghost}
              elapsedAt={elapsedAt}
              estimatedFinish={estimatedFinish}
              onOpenMap={race.elevation_profile?.route ? () => setShowMap(true) : undefined}
              onOpenKit={
                raceKitPost
                  ? () => setLightboxMsg({ ...raceKitPost, sender_name: `${firstName}'s Race Day Kit`, message: null })
                  : undefined
              }
            />
          </>
        )}

        {showMap && status === "live" && race.elevation_profile?.route && (
          <CourseMap
            route={race.elevation_profile.route}
            distanceKm={race.distance_km}
            runnerKm={(runnerPct / 100) * race.distance_km}
            goalKm={ghost ? (runnerPct / 100) * race.distance_km + ghost.offsetKm : null}
            athleteName={firstName}
            onClose={() => setShowMap(false)}
          />
        )}

        {/* ===================== AFTER ===================== */}
        {status === "finished" && (
          finishTime ? (
            <FinishResult finishTime={finishTime} athleteName={firstName} />
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "1rem 0",
                fontFamily: brand.font.body,
                fontSize: "0.9rem",
                color: brand.muted,
              }}
            >
              Awaiting official results...
            </div>
          )
        )}

        {fundraising && <FundraisingCard data={fundraising} athleteName={firstName} />}

        {/* ===================== SUPPORT (all states) ===================== */}
        <SectionLabel>Photo wall</SectionLabel>
        <PhotoGrid
          photos={supporterPhotos}
          athleteName={firstName}
          athleteAvatarUrl={athlete?.athletes.profile_picture}
          onShowAll={() => setSheet("photos")}
          pinned={status === "live" ? raceKitPost : null}
          onPhotoClick={(msg) => setLightboxMsg(msg)}
          onAddPhoto={openGallery}
        />

        <SectionLabel
          action={
            supporterMessages.length > 0 && (
              <button
                onClick={() => setSheet("messages")}
                aria-label="See all messages"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  border: `1px solid ${brand.border}`,
                  background: brand.card,
                  color: brand.dark,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="8" y1="6" x2="20" y2="6" />
                  <line x1="8" y1="12" x2="20" y2="12" />
                  <line x1="8" y1="18" x2="20" y2="18" />
                  <circle cx="4" cy="6" r="0.6" fill="currentColor" />
                  <circle cx="4" cy="12" r="0.6" fill="currentColor" />
                  <circle cx="4" cy="18" r="0.6" fill="currentColor" />
                </svg>
              </button>
            )
          }
        >
          Messages of support
        </SectionLabel>
        <FloatingMessages
          messages={supporterMessages}
          athleteName={firstName}
          onSendMessage={openMessage}
          onBubbleTap={(msg) => setLightboxMsg(msg)}
        />

        {sheet === "photos" && (
          <Sheet title={`Photo wall · ${supporterPhotos.length + (status === "live" && raceKitPost ? 1 : 0)}`} onClose={() => setSheet(null)}>
            <PhotoGallery
              photos={status === "live" && raceKitPost ? [raceKitPost, ...supporterPhotos] : supporterPhotos}
              onPhotoClick={(msg) => setLightboxMsg(msg)}
            />
          </Sheet>
        )}
        {sheet === "messages" && (
          <Sheet title={`Messages · ${supporterMessages.length}`} onClose={() => setSheet(null)}>
            <MessageList messages={supporterMessages} onBubbleTap={(msg) => setLightboxMsg(msg)} />
          </Sheet>
        )}

        <ActionButtons
          onCamera={openCamera}
          onGallery={openGallery}
          onMessage={openMessage}
        />
      </div>

      {!inputMode && !lightboxMsg && !showSplits && !splashMsg && !sheet && !showMap && (
        <FloatingAddButton
          onCamera={openCamera}
          onGallery={openGallery}
          onMessage={openMessage}
        />
      )}

      {/* Hidden file inputs — triggered directly, no modal flash */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileCapture}
        style={{ display: "none" }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        onChange={handleFileCapture}
        style={{ display: "none" }}
      />

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
              isVideo(splashMsg.photo_url) ? (
                <video
                  src={splashMsg.photo_url}
                  onLoadedData={() => setSplashReady(true)}
                  style={{
                    width: "100%",
                    borderRadius: "14px",
                    marginBottom: "1rem",
                    display: "block",
                  }}
                  muted
                  playsInline
                  autoPlay
                />
              ) : (
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
              )
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
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                fontFamily: brand.font.body,
                fontSize: "0.9rem",
                fontWeight: 600,
                color: brand.muted,
              }}
            >
              <Avatar name={splashMsg.sender_name} url={splashMsg.sender_avatar_url} size={32} />
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
            {avgPace && (
              <div style={{ textAlign: "center", margin: "-0.4rem 0 1rem" }}>
                <div style={{ fontFamily: brand.font.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: brand.muted }}>
                  Avg pace
                </div>
                <div style={{ fontFamily: brand.font.display, fontSize: "1.9rem", fontWeight: 600, lineHeight: 1.1, color: brand.dark, fontVariantNumeric: "tabular-nums" }}>
                  {avgPace}
                  <span style={{ fontFamily: brand.font.mono, fontSize: "0.75rem", fontWeight: 400, color: brand.muted }}> /km</span>
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {athleteSplits.filter((split) => !isCheerZone(split.Name)).map((split) => (
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
                    {split.Exists && split.Chip && (
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
                    {split.Exists && split.Speed && (
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

      {/* Input modal — message only, or file pre-loaded from selfie/gallery */}
      {(inputMode === "message" || inputMode === "gallery") && (
        <div
          onClick={() => { setInputMode(null); setPendingFile(null); setPendingPreview(null); }}
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
              {pendingFile ? "Add a caption" : status === "finished" ? "Send congratulations" : "Send a message"}
            </h3>
            <MessageInput
              raceId={race.id}
              athleteId={selectedAthlete}
              athleteName={athlete?.athletes.first_name ?? ""}
              athleteKm={estimatedKm}
              onSent={(sent) => {
                if (sent) setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [sent, ...prev]));
                pollMessages();
                setInputMode(null);
                setPendingFile(null);
                setPendingPreview(null);
              }}
              initialFile={pendingFile}
              initialPreview={pendingPreview}
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
              {isVideo(lightboxMsg.photo_url) ? (
                <video
                  src={lightboxMsg.photo_url}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "75vh",
                    borderRadius: "12px",
                    display: "block",
                  }}
                  controls
                  playsInline
                  autoPlay
                />
              ) : (
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
              )}
              <div style={{ marginTop: "1rem", textAlign: "center" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontFamily: brand.font.body,
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: "#fff",
                  }}
                >
                  {!lightboxMsg.is_athlete_post && (
                    <Avatar name={lightboxMsg.sender_name} url={lightboxMsg.sender_avatar_url} size={30} />
                  )}
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
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontFamily: brand.font.body,
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  color: brand.muted,
                }}
              >
                <Avatar name={lightboxMsg.sender_name} url={lightboxMsg.sender_avatar_url} size={30} />
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

// iPhones preview the front camera mirrored but save it un-mirrored; flip it back to match what they saw
function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// Shrink a selfie to a small square before upload
async function squareThumb(file: File, size = 256, mirror = false): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const side = Math.min(bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    if (mirror) {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], "selfie.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function MessageInput({
  raceId,
  athleteId,
  athleteName,
  athleteKm,
  onSent,
  initialFile,
  initialPreview,
}: {
  raceId: string;
  athleteId: string;
  athleteName: string;
  athleteKm: number | null;
  onSent: (sent: Message | null) => void;
  initialFile?: File | null;
  initialPreview?: string | null;
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
  const [photo, setPhoto] = useState<File | null>(initialFile ?? null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialPreview ?? null);
  const [sending, setSending] = useState(false);
  const [nameMissing, setNameMissing] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // Optional selfie, remembered on this phone like the name
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("athlast_avatar");
    return null;
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      // Make it obvious why nothing was sent
      setHasName(false);
      setNameMissing(true);
      requestAnimationFrame(() => nameRef.current?.focus());
      return;
    }
    if (!message.trim() && !photo) return;
    setSending(true);

    const senderName = name.trim();
    if (typeof window !== "undefined") {
      localStorage.setItem("athlast_name", senderName);
    }
    setHasName(true);

    let senderAvatar = avatarUrl;
    if (avatarFile) {
      const formData = new FormData();
      formData.append("file", avatarFile);
      const res = await fetch("/api/race/upload", { method: "POST", body: formData });
      if (res.ok) {
        senderAvatar = (await res.json()).url;
        setAvatarUrl(senderAvatar);
        setAvatarFile(null);
        localStorage.setItem("athlast_avatar", senderAvatar!);
      }
    }

    let photoUrl: string | null = null;
    if (photo) {
      photoUrl = await uploadMedia(photo);
      if (!photoUrl) {
        setSending(false);
        alert(`That ${photo.type.startsWith("video/") ? "video" : "photo"} didn't upload. Check your signal and try again.`);
        return;
      }
    }

    const res = await fetch("/api/race/cheer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        race_id: raceId,
        athlete_id: athleteId,
        sender_name: senderName,
        sender_avatar_url: senderAvatar,
        message: message.trim() || null,
        photo_url: photoUrl,
        athlete_km_at_send: athleteKm,
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      setMessage("");
      setPhoto(null);
      setPhotoPreview(null);
      onSent(data?.message ?? null);
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
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <button
                type="button"
                onClick={() => selfieRef.current?.click()}
                aria-label={avatarPreview || avatarUrl ? "Retake selfie" : "Add a selfie"}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "50%",
                  flexShrink: 0,
                  padding: 0,
                  overflow: "hidden",
                  border: avatarPreview || avatarUrl ? "none" : `1.5px dashed ${brand.muted}`,
                  background: brand.bg,
                  color: brand.muted,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                {avatarPreview || avatarUrl ? (
                  <img src={(avatarPreview || avatarUrl)!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
                    <path d="M4 8h3l2-3h6l2 3h3v11H4V8Z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                )}
              </button>
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <input
                  ref={nameRef}
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (e.target.value.trim()) setNameMissing(false);
                  }}
                  className={nameMissing ? "name-shake" : undefined}
                  style={{
                    padding: "0.5rem 0.75rem",
                    border: `1.5px solid ${nameMissing ? brand.behind : brand.border}`,
                    borderRadius: "8px",
                    fontSize: "16px",
                    fontFamily: brand.font.body,
                    outline: "none",
                    background: brand.bg,
                    color: brand.dark,
                  }}
                />
              </div>
            </div>
            <div style={{ fontFamily: brand.font.body, fontSize: "0.7rem", color: brand.muted, paddingLeft: "0.25rem" }}>
              {avatarPreview || avatarUrl ? "Looking good. Tap to retake." : "Tap the circle to add a selfie (optional)"}
            </div>
            <input
              ref={selfieRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                // Crop (and un-mirror on iPhone) up front so the preview is exactly what gets posted
                const thumb = await squareThumb(f, 256, isIos());
                setAvatarFile(thumb);
                setAvatarPreview(URL.createObjectURL(thumb));
              }}
              style={{ display: "none" }}
            />
          </>
        )}
        {nameMissing && (
          <div style={{ fontFamily: brand.font.body, fontSize: "0.8rem", color: brand.behind, paddingLeft: "0.25rem", marginTop: "-0.15rem" }}>
            {`Add your name so ${athleteName || "they"} knows who it’s from`}
          </div>
        )}
        {photoPreview && (
          <div style={{ position: "relative", display: "inline-block" }}>
            {photo?.type.startsWith("video/") ? (
              <video
                src={photoPreview}
                style={{
                  maxWidth: "100%",
                  maxHeight: 120,
                  borderRadius: "8px",
                  display: "block",
                }}
                muted
                playsInline
                autoPlay
                loop
              />
            ) : (
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
            )}
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
          placeholder={photo ? "Add a caption (optional)..." : `Send ${athleteName || "the athlete"} some support...`}
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
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", verticalAlign: "middle" }}>
              Sending as <Avatar name={name} url={avatarPreview || avatarUrl} size={16} /> {name}
            </span>{" "}
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
