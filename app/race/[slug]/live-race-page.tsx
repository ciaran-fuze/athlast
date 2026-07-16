"use client";

import { useState, useEffect, useCallback } from "react";
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
  const progressPct =
    athleteSplits.length > 0
      ? Math.round((completedSplits.length / athleteSplits.length) * 100)
      : 0;
  // Track fill should align with dots: last completed dot index / (total dots - 1)
  const lastCompletedIndex = completedSplits.length - 1;
  const trackPct =
    athleteSplits.length > 1
      ? (lastCompletedIndex / (athleteSplits.length - 1)) * 100
      : 0;

  return (
    <div style={{ minHeight: "100vh", background: brand.bg }}>
      {/* Hero */}
      <div
        style={{
          background: brand.dark,
          color: "#fff",
          padding: "3rem 1rem 2.5rem",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <img
            src="/logo.png"
            alt="Athlast."
            style={{
              height: 32,
              marginBottom: "1.5rem",
              filter: "invert(1)",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <StatusBadge status={race.status} />
            <span
              style={{
                fontFamily: brand.font.mono,
                fontSize: "0.7rem",
                color: brand.accent,
                letterSpacing: "0.03em",
              }}
            >
              {race.location} / {race.race_date}
            </span>
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: brand.font.display,
              fontSize: "2rem",
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
            }}
          >
            {race.name}
          </h1>
          <span
            style={{
              fontFamily: brand.font.mono,
              fontSize: "0.75rem",
              color: brand.accent,
              marginTop: "0.5rem",
              display: "inline-block",
            }}
          >
            {race.distance_km}km
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem 4rem" }}>
        {/* Athlete selector */}
        {raceAthletes.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginBottom: "1.5rem",
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
                    padding: "0.5rem 1rem",
                    background: active ? brand.dark : "transparent",
                    color: active ? "#fff" : brand.dark,
                    border: `1px solid ${active ? brand.dark : brand.border}`,
                    borderRadius: "999px",
                    cursor: "pointer",
                    fontFamily: brand.font.body,
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {ra.athletes.profile_picture && (
                    <img
                      src={ra.athletes.profile_picture}
                      alt=""
                      style={{ width: 22, height: 22, borderRadius: "50%" }}
                    />
                  )}
                  {ra.athletes.first_name}
                </button>
              );
            })}
          </div>
        )}

        {/* Athlete card */}
        {athlete && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              padding: "1.25rem",
              background: "#fff",
              border: `1px solid ${brand.border}`,
              borderRadius: "12px",
              marginBottom: "1rem",
            }}
          >
            {athlete.athletes.profile_picture ? (
              <img
                src={athlete.athletes.profile_picture}
                alt=""
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: brand.dark,
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
              <h2
                style={{
                  margin: 0,
                  fontFamily: brand.font.display,
                  fontSize: "1.35rem",
                  fontWeight: 400,
                }}
              >
                {athlete.athletes.first_name} {athlete.athletes.last_name}
              </h2>
              {athlete.bib_number && (
                <span
                  style={{
                    fontFamily: brand.font.mono,
                    fontSize: "0.7rem",
                    color: brand.muted,
                    marginTop: "0.15rem",
                    display: "inline-block",
                  }}
                >
                  BIB #{athlete.bib_number}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Latest update */}
        {lastSplit && (
          <div
            style={{
              padding: "1rem 1.25rem",
              background: brand.dark,
              borderRadius: "12px",
              marginBottom: "1rem",
              color: "#fff",
            }}
          >
            <div
              style={{
                fontFamily: brand.font.mono,
                fontSize: "0.6rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: brand.accent,
                marginBottom: "0.35rem",
              }}
            >
              Latest update
            </div>
            <div
              style={{
                fontFamily: brand.font.display,
                fontSize: "1.1rem",
              }}
            >
              Passed {lastSplit.Name}
              {lastSplit.Chip && (
                <span style={{ color: brand.accent }}> in {lastSplit.Chip}</span>
              )}
            </div>
            {(lastSplit.Speed || (lastSplit.RO && lastSplit.ROM)) && (
              <div
                style={{
                  display: "flex",
                  gap: "1.5rem",
                  marginTop: "0.5rem",
                  fontFamily: brand.font.mono,
                  fontSize: "0.7rem",
                  color: brand.accent,
                }}
              >
                {lastSplit.Speed && <span>{lastSplit.Speed}</span>}
                {lastSplit.RO && lastSplit.ROM && (
                  <span>
                    Position {lastSplit.RO}/{lastSplit.ROM}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Progress tracker */}
        {athleteSplits.length > 0 && (
          <div
            style={{
              padding: "1.25rem 1.5rem 1rem",
              background: "#fff",
              border: `1px solid ${brand.border}`,
              borderRadius: "12px",
              marginBottom: "1.5rem",
            }}
          >
            <style>{`
              @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.6); opacity: 0.4; }
              }
            `}</style>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "1.25rem",
                fontFamily: brand.font.mono,
                fontSize: "0.7rem",
                color: brand.muted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              <span>Race progress</span>
              <span style={{ color: brand.dark, fontWeight: 500 }}>
                {progressPct}%
              </span>
            </div>

            {/* Track with checkpoints */}
            <div style={{ position: "relative", padding: "0 10px" }}>
              {/* Track background */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 10,
                  right: 10,
                  height: 4,
                  background: brand.grid,
                  borderRadius: 2,
                  transform: "translateY(-50%)",
                }}
              />
              {/* Track fill */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 10,
                  height: 4,
                  background: brand.dark,
                  borderRadius: 2,
                  transform: "translateY(-50%)",
                  width: `${trackPct}%`,
                  transition: "width 0.8s ease-out",
                }}
              />

              {/* Checkpoint dots */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  position: "relative",
                }}
              >
                {athleteSplits.map((split, i) => {
                  const isCompleted = split.Exists;
                  const isLatest =
                    isCompleted &&
                    (i === athleteSplits.length - 1 ||
                      !athleteSplits[i + 1]?.Exists);
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
                      {/* Pulse ring on current position */}
                      {isLatest && race.status === "live" && (
                        <div
                          style={{
                            position: "absolute",
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: brand.dark,
                            opacity: 0.3,
                            animation: "pulse 2s ease-in-out infinite",
                            top: 0,
                            left: "50%",
                            transform: "translateX(-50%)",
                            pointerEvents: "none",
                          }}
                        />
                      )}
                      <div
                        style={{
                          width: isLatest ? 18 : isCompleted ? 12 : 10,
                          height: isLatest ? 18 : isCompleted ? 12 : 10,
                          borderRadius: "50%",
                          background: isCompleted ? brand.dark : "#fff",
                          border: isCompleted
                            ? "none"
                            : `2px solid ${brand.grid}`,
                          transition: "all 0.3s ease",
                          position: "relative",
                          zIndex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isLatest && (
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: brand.accent,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Labels — same layout as dots */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "0.5rem",
                padding: "0 10px",
              }}
            >
              {athleteSplits.map((split, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: brand.font.mono,
                    fontSize: "0.55rem",
                    color: split.Exists ? brand.dark : brand.muted,
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

        {/* Splits */}
        {athleteSplits.length > 0 && (
          <div
            style={{
              background: "#fff",
              border: `1px solid ${brand.border}`,
              borderRadius: "12px",
              overflow: "hidden",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                padding: "1rem 1.25rem 0.6rem",
                fontFamily: brand.font.mono,
                fontWeight: 500,
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: brand.muted,
              }}
            >
              Split times
            </div>
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

        {/* Support section */}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${brand.border}`,
            borderRadius: "12px",
            padding: "1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          <h2
            style={{
              margin: "0 0 1rem",
              fontFamily: brand.font.display,
              fontSize: "1.15rem",
              fontWeight: 400,
            }}
          >
            Show your support
          </h2>
          <SupportForm
            raceId={race.id}
            athleteId={selectedAthlete}
            onSent={pollMessages}
          />
        </div>

        {/* Messages feed */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "0.75rem",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: brand.font.display,
                fontSize: "1.15rem",
                fontWeight: 400,
              }}
            >
              Messages
            </h2>
            {messages.length > 0 && (
              <span
                style={{
                  fontFamily: brand.font.mono,
                  fontSize: "0.65rem",
                  color: brand.muted,
                }}
              >
                {messages.length}
              </span>
            )}
          </div>
          {messages.length === 0 ? (
            <div
              style={{
                padding: "2.5rem 1rem",
                textAlign: "center",
                color: brand.muted,
                fontFamily: brand.font.body,
                fontSize: "0.85rem",
                background: "#fff",
                border: `1px solid ${brand.border}`,
                borderRadius: "12px",
              }}
            >
              No messages yet. Be the first to show support.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {messages.map((msg) => {
                const msgAthlete = raceAthletes.find(
                  (ra) => ra.athlete_id === msg.athlete_id
                );
                return (
                  <div
                    key={msg.id}
                    style={{
                      padding: "1rem 1.25rem",
                      background: "#fff",
                      border: `1px solid ${brand.border}`,
                      borderRadius: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.3rem",
                      }}
                    >
                      <div>
                        <strong
                          style={{
                            fontFamily: brand.font.body,
                            fontSize: "0.85rem",
                            fontWeight: 600,
                          }}
                        >
                          {msg.sender_name}
                        </strong>
                        {msgAthlete && (
                          <span
                            style={{
                              fontFamily: brand.font.mono,
                              color: brand.muted,
                              fontSize: "0.65rem",
                              marginLeft: "0.5rem",
                            }}
                          >
                            to {msgAthlete.athletes.first_name}
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontFamily: brand.font.mono,
                          color: brand.muted,
                          fontSize: "0.6rem",
                        }}
                      >
                        {timeAgo(msg.created_at)}
                      </span>
                    </div>
                    {msg.message && (
                      <p
                        style={{
                          margin: "0.25rem 0 0",
                          fontFamily: brand.font.body,
                          fontSize: "0.875rem",
                          lineHeight: 1.5,
                          color: brand.dark,
                        }}
                      >
                        {msg.message}
                      </p>
                    )}
                    {msg.photo_url && (
                      <img
                        src={msg.photo_url}
                        alt="Supporter photo"
                        style={{
                          maxWidth: "100%",
                          borderRadius: "8px",
                          marginTop: "0.5rem",
                          display: "block",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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

function SupportForm({
  raceId,
  athleteId,
  onSent,
}: {
  raceId: string;
  athleteId: string;
  onSent: () => void;
}) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

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

  function removePhoto() {
    setPhoto(null);
    setPhotoPreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!message.trim() && !photo) return;
    setSending(true);

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
        sender_name: name.trim(),
        message: message.trim() || null,
        photo_url: photoUrl,
      }),
    });

    if (res.ok) {
      setMessage("");
      setPhoto(null);
      setPhotoPreview(null);
      setSent(true);
      setTimeout(() => setSent(false), 2000);
      onSent();
    }
    setSending(false);
  }

  const inputStyle = {
    padding: "0.6rem 0.75rem",
    border: `1px solid ${brand.border}`,
    borderRadius: "8px",
    width: "100%",
    boxSizing: "border-box" as const,
    marginBottom: "0.5rem",
    fontSize: "16px",
    fontFamily: brand.font.body,
    outline: "none",
    background: brand.bg,
    color: brand.dark,
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={inputStyle}
      />
      <textarea
        placeholder="Write a message of support..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        style={{
          ...inputStyle,
          resize: "vertical",
          marginBottom: "0.75rem",
        }}
      />

      {photoPreview && (
        <div
          style={{
            position: "relative",
            marginBottom: "0.75rem",
            display: "inline-block",
          }}
        >
          <img
            src={photoPreview}
            alt="Preview"
            style={{
              maxWidth: "100%",
              maxHeight: 200,
              borderRadius: "8px",
              display: "block",
            }}
          />
          <button
            type="button"
            onClick={removePhoto}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.6)",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontSize: "1rem",
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

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <label
          style={{
            padding: "0.6rem 0.75rem",
            background: brand.bg,
            border: `1px solid ${brand.border}`,
            borderRadius: "8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
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
            padding: "0.6rem 2rem",
            background: sending ? brand.grid : brand.dark,
            color: sending ? brand.muted : "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: sending ? "not-allowed" : "pointer",
            fontFamily: brand.font.body,
            fontSize: "0.85rem",
            fontWeight: 500,
            letterSpacing: "0.01em",
          }}
        >
          {sending ? "Sending..." : sent ? "Sent" : "Send message"}
        </button>
      </div>
    </form>
  );
}
