"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Split } from "@/lib/raceresult";

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
  const [selectedAthlete, setSelectedAthlete] = useState(
    raceAthletes[0]?.athlete_id ?? ""
  );

  // Reactions state
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [myReactions, setMyReactions] = useState<Record<string, boolean>>({});
  const [deviceId] = useState(() => {
    if (typeof window === "undefined") return "";
    let id = localStorage.getItem("athlast_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("athlast_device_id", id);
    }
    return id;
  });

  const fetchReactions = useCallback(async () => {
    const ids = messages.filter((m) => m.id).map((m) => m.id);
    if (ids.length === 0) return;
    try {
      const res = await fetch(
        `/api/race/reactions?message_ids=${ids.join(",")}&device_id=${deviceId}`
      );
      if (res.ok) {
        const data = await res.json();
        setReactionCounts(data.counts);
        setMyReactions(data.reacted);
      }
    } catch {}
  }, [messages, deviceId]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  async function toggleReaction(messageId: string) {
    // Optimistic update
    const wasReacted = myReactions[messageId];
    setMyReactions((prev) => ({ ...prev, [messageId]: !wasReacted }));
    setReactionCounts((prev) => ({
      ...prev,
      [messageId]: (prev[messageId] ?? 0) + (wasReacted ? -1 : 1),
    }));

    try {
      await fetch("/api/race/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId, device_id: deviceId }),
      });
    } catch {
      // Revert on failure
      setMyReactions((prev) => ({ ...prev, [messageId]: wasReacted }));
      setReactionCounts((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] ?? 0) + (wasReacted ? 1 : -1),
      }));
    }
  }

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

  const athlete = raceAthletes.find(
    (ra) => ra.athlete_id === selectedAthlete
  );
  const athleteSplits = splits[selectedAthlete] ?? [];
  const completedSplits = athleteSplits.filter((s) => s.Exists);
  const lastSplit = completedSplits[completedSplits.length - 1];

  // Estimated km — simplified, clamp to next split
  const estimatedKm = (() => {
    if (completedSplits.length < 2) return null;
    const last = completedSplits[completedSplits.length - 1];
    const lastKm = splitNameToKm(last.Name, race.distance_km);
    if (lastKm === null) return lastKm;
    if (last.Name === "Finishline") return race.distance_km;
    // Clamp to next checkpoint for demo
    const lastIdx = athleteSplits.indexOf(last);
    const next = athleteSplits[lastIdx + 1];
    const nextKm = next ? splitNameToKm(next.Name, race.distance_km) : race.distance_km;
    return nextKm ?? lastKm;
  })();

  // Runner position as percentage of race
  const runnerPct = estimatedKm !== null
    ? Math.min((estimatedKm / race.distance_km) * 100, 100)
    : completedSplits.length > 0
      ? (completedSplits.length / athleteSplits.length) * 100
      : 0;

  // Lightbox
  const [lightboxMsg, setLightboxMsg] = useState<Message | null>(null);


  // Splash image loaded
  const [splashReady, setSplashReady] = useState(false);

  // Input mode: null = closed, "photo" = photo picker, "message" = text input
  const [inputMode, setInputMode] = useState<"photo" | "message" | null>(null);

  // Message cycler
  // New message splash
  const [splashMsg, setSplashMsg] = useState<Message | null>(null);
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
  }, [messages.length]);

  // Filter text messages (defined after splashMsg)
  const filteredTextMessages = messages.filter((m) => !m.photo_url && m.message && m.id !== splashMsg?.id);

  return (
    <div style={{ minHeight: "100vh", background: brand.bg }}>
      <style>{`
        @keyframes runnerBob {
          0%, 100% { transform: translateY(0) scaleY(1); }
          30% { transform: translateY(-4px) scaleY(1.01); }
          60% { transform: translateY(-1px) scaleY(0.99); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
        @keyframes drift {
          0% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(-6px) translateX(3px); }
          100% { transform: translateY(0) translateX(0); }
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
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
        @keyframes splashOut {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.9) translateY(-8px); }
        }
        @keyframes btnBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes progressPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 4px #22c55e; }
          50% { opacity: 0.7; box-shadow: 0 0 10px #22c55e, 0 0 20px rgba(34,197,94,0.3); }
        }
        @keyframes bubbleFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes bubbleDrift {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .bubble-track:hover, .bubble-track:active {
          animation-play-state: paused !important;
        }
        @keyframes heartPop {
          0% { transform: scale(1); }
          30% { transform: scale(1.4); }
          60% { transform: scale(0.9); }
          100% { transform: scale(1.2); }
        }
      `}</style>

      {/* ─── Landscape Hero ─── */}
      <div
        style={{
          position: "relative",
          background: "linear-gradient(180deg, #c9dce8 0%, #dce8f0 40%, #e8f0f4 70%, #eef2eb 100%)",
          padding: "2rem 1rem 0",
          overflow: "hidden",
          minHeight: 280,
        }}
      >
        {/* Logo */}
        <div style={{ maxWidth: 640, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <img
            src="/logo.png"
            alt="Athlast."
            style={{ height: 24, marginBottom: "1rem", opacity: 0.7 }}
          />

          {/* Race name — big and bold */}
          <h2
            style={{
              margin: "0 0 0.25rem",
              fontFamily: brand.font.display,
              fontSize: "1.3rem",
              fontWeight: 400,
              color: brand.dark,
              lineHeight: 1.2,
            }}
          >
            {race.name}
          </h2>

          {/* Status row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              marginBottom: "0.75rem",
            }}
          >
            {race.status === "live" && (
              <span
                style={{
                  padding: "0.2rem 0.6rem",
                  borderRadius: "999px",
                  fontFamily: brand.font.mono,
                  fontSize: "0.65rem",
                  fontWeight: 500,
                  background: "#dcfce7",
                  color: "#166534",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                ● Live
              </span>
            )}
            <span
              style={{
                fontFamily: brand.font.mono,
                fontSize: "0.65rem",
                color: brand.muted,
              }}
            >
              {race.distance_km}km
            </span>
          </div>

          {/* Athlete name + photo */}
          {athlete && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "0.5rem",
              }}
            >
              {athlete.athletes.profile_picture && (
                <img
                  src={athlete.athletes.profile_picture}
                  alt=""
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "2px solid rgba(255,255,255,0.6)",
                  }}
                />
              )}
              <div>
                <h1
                  style={{
                    margin: 0,
                    fontFamily: brand.font.display,
                    fontSize: "2rem",
                    fontWeight: 400,
                    lineHeight: 1.1,
                    color: brand.dark,
                  }}
                >
                  {athlete.athletes.first_name} {athlete.athletes.last_name}
                </h1>
                {athlete.bib_number && (
                  <span
                    style={{
                      fontFamily: brand.font.mono,
                      fontSize: "0.65rem",
                      color: brand.muted,
                    }}
                  >
                    BIB #{athlete.bib_number}
                  </span>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Landscape scene — hills + runner */}
        <div
          style={{
            position: "relative",
            height: 120,
            maxWidth: 640,
            margin: "1rem auto 0",
          }}
        >
          {/* Hills */}
          <svg
            style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: 70 }}
            viewBox="0 0 640 70"
            preserveAspectRatio="none"
            fill="none"
          >
            <path
              d="M 0 50 Q 60 28, 130 42 Q 200 58, 280 32 Q 360 14, 440 40 Q 520 58, 580 30 Q 620 18, 640 38 L 640 70 L 0 70 Z"
              fill={brand.grid}
              opacity="0.5"
            />
            <path
              d="M 0 50 Q 60 28, 130 42 Q 200 58, 280 32 Q 360 14, 440 40 Q 520 58, 580 30 Q 620 18, 640 38"
              stroke={brand.border}
              strokeWidth="1"
              fill="none"
            />
          </svg>

          {/* Runner positioned by progress — label bounces with it */}
          <div
            style={{
              position: "absolute",
              bottom: 28,
              left: `${Math.max(8, Math.min(runnerPct, 88))}%`,
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              transition: "left 2s ease-out",
              zIndex: 2,
              animation: "runnerBob 0.8s ease-in-out infinite",
            }}
          >
            {estimatedKm !== null && (
              <span
                style={{
                  fontFamily: brand.font.mono,
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: brand.dark,
                  background: "rgba(255,255,255,0.85)",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "6px",
                  marginBottom: "0.3rem",
                  whiteSpace: "nowrap",
                  boxShadow: "0 2px 8px rgba(26,26,24,0.08)",
                }}
              >
                {estimatedKm % 1 === 0 ? estimatedKm : estimatedKm.toFixed(1)}km in
              </span>
            )}
            <img
              src="/runner-silhouette.svg"
              alt=""
              style={{
                height: 52,
                opacity: 0.5,
              }}
            />
          </div>

          {/* Clouds */}
          {[0.08, 0.3, 0.55, 0.78].map((pct, i) => (
            <svg
              key={`cloud-${i}`}
              style={{
                position: "absolute",
                left: `${pct * 100}%`,
                top: 4 + ((i * 11) % 14),
                width: 40 + ((i * 7) % 16),
                height: 18,
                opacity: 0.4,
              }}
              viewBox="0 0 48 20"
              fill={brand.grid}
            >
              <ellipse cx="16" cy="14" rx="10" ry="6" />
              <ellipse cx="28" cy="12" rx="12" ry="8" />
              <ellipse cx="38" cy="14" rx="8" ry="5" />
            </svg>
          ))}

          {/* Birds */}
          {[0.18, 0.45, 0.72].map((pct, i) => (
            <svg
              key={`bird-${i}`}
              style={{
                position: "absolute",
                left: `${pct * 100}%`,
                top: 8 + ((i * 17) % 16),
                width: 18,
                height: 10,
                opacity: 0.35,
              }}
              viewBox="0 0 14 8"
              fill="none"
              stroke={brand.grid}
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M0 6 Q3.5 1 7 4 Q10.5 1 14 6" />
            </svg>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0.5rem 1rem 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
          <span style={{ fontFamily: brand.font.mono, fontSize: "0.8rem", fontWeight: 600, color: brand.dark }}>0km</span>
          <span style={{ fontFamily: brand.font.mono, fontSize: "0.8rem", fontWeight: 600, color: brand.dark }}>{race.distance_km}km</span>
        </div>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 8,
            borderRadius: 4,
            background: brand.border,
          }}
        >
          <div
            style={{
              width: `${runnerPct}%`,
              height: "100%",
              borderRadius: 4,
              background: "linear-gradient(90deg, #22c55e, #4ade80, #22c55e)",
              backgroundSize: "200% 100%",
              animation: "shimmer 2s linear infinite",
              transition: "width 2s ease-out",
            }}
          />
          {runnerPct > 0 && runnerPct < 100 && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: `${runnerPct}%`,
                transform: "translate(-50%, -50%)",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "#22c55e",
                border: "2px solid #fff",
                animation: "progressPulse 2s ease-in-out infinite",
              }}
            />
          )}
        </div>
      </div>

      {/* ─── Content ─── */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.25rem 1rem 4rem" }}>


        {/* Photos — two column flex */}
        {(() => {
          const photoMessages = messages.filter((m) => m.photo_url && m.id !== splashMsg?.id);
          if (photoMessages.length === 0) return null;

          // Split into two columns, alternating
          const col1: Message[] = [];
          const col2: Message[] = [];
          photoMessages.forEach((msg, i) => (i % 2 === 0 ? col1 : col2).push(msg));

          const renderPhoto = (msg: Message, i: number) => (
            <div
              key={msg.id}
              style={{
                marginBottom: "0.75rem",
                cursor: "pointer",
                animation: `fadeInUp 0.4s ease-out ${i * 0.06}s both, bubbleFloat ${4 + (i % 3)}s ease-in-out ${(i * 0.8) % 3}s infinite`,
              }}
            >
              <div
                onClick={() => setLightboxMsg(msg)}
                style={{
                  position: "relative",
                  borderRadius: "12px",
                  overflow: "hidden",
                  boxShadow: "0 2px 8px rgba(26,26,24,0.08), 0 8px 24px rgba(26,26,24,0.1)",
                  transition: "transform 0.25s ease, box-shadow 0.25s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.03) translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(26,26,24,0.1), 0 16px 40px rgba(26,26,24,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(26,26,24,0.08), 0 8px 24px rgba(26,26,24,0.1)";
                }}
              >
                <img src={msg.photo_url!} alt="" style={{ width: "100%", display: "block" }} />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0, left: 0, right: 0,
                    padding: "0.5rem 0.6rem",
                    background: "rgba(0,0,0,0.35)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >
                  <span style={{ fontFamily: brand.font.body, fontSize: "0.85rem", fontWeight: 600, color: "#fff" }}>
                    From {msg.sender_name}
                  </span>
                  {msg.message && (
                    <p style={{ margin: "0.15rem 0 0", fontFamily: brand.font.body, fontSize: "0.8rem", lineHeight: 1.3, color: "rgba(255,255,255,0.85)" }}>
                      {msg.message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );

          // Filler goes in the shorter column
          const fillerTile = (
            <div
              key="filler"
              style={{
                flex: 1,
                animation: "bubbleFloat 4.5s ease-in-out 0.3s infinite",
              }}
            >
              <button
                onClick={() => setInputMode("photo")}
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  background: brand.dark,
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                  overflow: "hidden",
                  boxShadow: "0 4px 20px rgba(26,26,24,0.25)",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.03)";
                  e.currentTarget.style.boxShadow = "0 6px 28px rgba(26,26,24,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "0 4px 20px rgba(26,26,24,0.25)";
                }}
              >
                {/* Diagonal watermark */}
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
                    <div key={row} style={{ display: "flex", gap: "24px", marginLeft: row % 2 === 0 ? 0 : -40, whiteSpace: "nowrap" }}>
                      {Array.from({ length: 6 }).map((_, col) => (
                        <span key={col} style={{ fontFamily: brand.font.display, fontSize: "1rem", color: "#fff", flexShrink: 0 }}>
                          Athlast.
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={brand.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto 0.5rem" }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <div style={{ fontFamily: brand.font.body, fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>
                    Add another photo
                  </div>
                </div>
              </button>
            </div>
          );

          // Add filler to the shorter column
          const shorterCol = col1.length > col2.length ? "left" : "right";

          return (
            <div style={{ position: "relative", marginTop: "1.5rem" }}>
            {/* Add photo — top right */}
            <div
              style={{
                position: "absolute",
                top: 12,
                right: 4,
                zIndex: 5,
                animation: "bubbleFloat 4s ease-in-out 0.5s infinite",
              }}
            >
              <button
                onClick={() => setInputMode("photo")}
                style={{
                  padding: "0.55rem 1.1rem",
                  background: brand.dark,
                  color: "#fff",
                  border: "none",
                  borderRadius: "999px",
                  fontFamily: brand.font.body,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 4px 20px rgba(26,26,24,0.25)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.1)";
                  e.currentTarget.style.boxShadow = "0 6px 28px rgba(26,26,24,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "0 4px 20px rgba(26,26,24,0.25)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add photo
              </button>
            </div>
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
        })()}

        {/* Message bubbles — scattered floating field */}
        {(() => {
          if (filteredTextMessages.length === 0) return (
            <div style={{ margin: "1.5rem -1rem 0", height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ animation: "bubbleFloat 4s ease-in-out infinite" }}>
                <button
                  onClick={() => setInputMode("message")}
                  style={{
                    padding: "0.6rem 1.3rem",
                    background: brand.dark,
                    color: "#fff",
                    borderRadius: "999px",
                    border: "none",
                    boxShadow: "0 4px 20px rgba(26,26,24,0.25)",
                    cursor: "pointer",
                    fontFamily: brand.font.body,
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Send a message
                </button>
              </div>
            </div>
          );

          const BUBBLE_SPACE = 190;
          const PADDING = 30;
          const fieldWidth = PADDING + Math.max(filteredTextMessages.length * BUBBLE_SPACE, 400) + PADDING;

          // X: evenly spaced with jitter
          const bubbleX = filteredTextMessages.map((_, i) => {
            const base = PADDING + (i / Math.max(filteredTextMessages.length - 1, 1)) * (fieldWidth - PADDING * 2 - 180) + 90;
            const jitter = ((i * 11 + 5) % 9 - 4) * 6;
            return base + jitter;
          });

          // Y: pre-scattered positions that don't repeat obviously
          const ySlots = [15, 140, 70, 190, 45, 160, 100, 20, 130, 60, 180, 35, 150, 85, 10, 120];
          const bubbleY = filteredTextMessages.map((_, i) => ySlots[i % ySlots.length]);

          // Sizes: vary width
          const widths = [175, 210, 155, 195, 185];
          const rotations = [-2.5, 2, -1, 3, -1.5, 0.5, -3, 1.5];

          // Font size based on message length — short = loud
          function bubbleFontSize(msg: string) {
            const len = msg.length;
            if (len <= 15) return "1.3rem";
            if (len <= 30) return "1.1rem";
            if (len <= 60) return "0.95rem";
            return "0.85rem";
          }
          function bubbleFontWeight(msg: string) {
            return msg.length <= 30 ? 700 : 500;
          }

          // Duplicate for seamless loop
          const doubled = [...filteredTextMessages, ...filteredTextMessages];
          const halfWidth = fieldWidth;
          const totalWidth = halfWidth * 2;
          const driftDuration = Math.max(filteredTextMessages.length * 5, 25);

          // Recalculate positions for doubled set
          const allX = doubled.map((_, i) => {
            const idx = i % filteredTextMessages.length;
            const half = i < filteredTextMessages.length ? 0 : halfWidth;
            return bubbleX[idx] + half;
          });
          const allY = doubled.map((_, i) => bubbleY[i % filteredTextMessages.length]);

          return (
            <div
              style={{
                position: "relative",
                margin: "1.5rem -1rem 0",
                overflow: "hidden",
              }}
            >
              {/* Send message button */}
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 20,
                  zIndex: 10,
                  animation: "bubbleFloat 4s ease-in-out 0.5s infinite",
                }}
              >
                <button
                  onClick={() => setInputMode("message")}
                  style={{
                    padding: "0.55rem 1.1rem",
                    background: brand.dark,
                    color: "#fff",
                    border: "none",
                    borderRadius: "999px",
                    fontFamily: brand.font.body,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 4px 20px rgba(26,26,24,0.25)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.1)";
                    e.currentTarget.style.boxShadow = "0 6px 28px rgba(26,26,24,0.35)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "0 4px 20px rgba(26,26,24,0.25)";
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Send message
                </button>
              </div>
              {/* Crowd silhouette */}
              <img
                src="/crowd.svg"
                alt=""
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: "100%",
                  height: 90,
                  objectFit: "cover",
                  objectPosition: "top",
                  opacity: 0.35,
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              />
              <div
                className="bubble-track"
                style={{
                  position: "relative",
                  width: totalWidth,
                  height: 280,
                  animation: `bubbleDrift ${driftDuration}s linear infinite`,
                }}
              >
                {doubled.map((msg, i) => {
                  const idx = i % filteredTextMessages.length;
                  const w = widths[idx % widths.length];
                  const rot = rotations[idx % rotations.length];
                  const floatDur = 3.5 + (idx % 3);
                  const floatDel = (idx * 0.7) % 2.5;

                  const fontSize = bubbleFontSize(msg.message ?? "");
                  const fontWeight = bubbleFontWeight(msg.message ?? "");

                  return (
                    <div
                      key={`${msg.id}-${i}`}
                      style={{
                        position: "absolute",
                        left: allX[i],
                        top: allY[i],
                        width: w,
                        transform: `rotate(${rot}deg)`,
                        transformOrigin: "center center",
                      }}
                    >
                    <div
                      onClick={() => setLightboxMsg({ ...msg, photo_url: null } as Message)}
                      style={{
                        background: brand.bg,
                        borderRadius: "24px",
                        padding: "1.1rem 1.2rem",
                        boxShadow: "6px 6px 16px rgba(166,160,148,0.35), -6px -6px 16px rgba(255,255,255,0.8)",
                        border: "none",
                        cursor: "pointer",
                        animation: `bubbleFloat ${floatDur}s ease-in-out ${floatDel}s infinite`,
                        transition: "box-shadow 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = "8px 8px 24px rgba(166,160,148,0.4), -8px -8px 24px rgba(255,255,255,0.9)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = "6px 6px 16px rgba(166,160,148,0.35), -6px -6px 16px rgba(255,255,255,0.8)";
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontFamily: brand.font.body,
                          fontSize: "0.9rem",
                          fontWeight: 500,
                          lineHeight: 1.4,
                          color: brand.dark,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical" as const,
                        }}
                      >
                        {msg.message}
                      </p>
                      <span
                        style={{
                          fontFamily: brand.font.body,
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          color: brand.muted,
                          marginTop: "0.5rem",
                          display: "inline-block",
                        }}
                      >
                        {msg.sender_name}
                      </span>
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* New message splash — full screen takeover */}
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
          {/* Fireworks */}
          {Array.from({ length: 24 }).map((_, pi) => {
            const angle = (pi / 24) * 360;
            const dist = 100 + (pi * 17) % 140;
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
                  animation: `firework 1s ease-out ${0.2 + (pi * 0.025)}s forwards`,
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
              {inputMode === "photo" ? "Share a photo" : "Send a message"}
            </h3>
            <MessageInput
              raceId={race.id}
              athleteId={selectedAthlete}
              athleteName={athlete?.athletes.first_name ?? ""}
              athleteKm={estimatedKm}
              onSent={() => { pollMessages(); setInputMode(null); }}
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
                background: "linear-gradient(170deg, #ffffff 0%, #f8f6f2 100%)",
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

/* ─── Message Input ─── */

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
              onClick={() => { setPhoto(null); setPhotoPreview(null); }}
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
              ×
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-end" }}>
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={brand.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </label>
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
              background: brand.bg,
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
