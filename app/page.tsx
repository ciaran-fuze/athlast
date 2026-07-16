import { supabase } from "@/lib/supabase";
import { polylineToSvgPath } from "@/lib/polyline";

function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(2) + " km";
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatPace(avgSpeed: number, sportType: string): string {
  if (!avgSpeed || avgSpeed === 0) return "-";
  if (sportType.includes("Ride")) {
    return (avgSpeed * 3.6).toFixed(1) + " km/h";
  }
  // Running pace: min/km
  const paceSeconds = 1000 / avgSpeed;
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.floor(paceSeconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data: athletes } = await supabase
    .from("athletes")
    .select("*")
    .order("created_at", { ascending: false });

  let activitiesByAthlete: Record<string, Array<Record<string, unknown>>> = {};

  if (athletes && athletes.length > 0) {
    for (const athlete of athletes) {
      const { data } = await supabase
        .from("activities")
        .select("*")
        .eq("athlete_id", athlete.id)
        .order("start_date", { ascending: false })
        .limit(10);
      activitiesByAthlete[athlete.id] = data ?? [];
    }
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Athlast</h1>
      <p>
        <a href="/api/strava/auth">Connect with Strava</a>
      </p>

      {!athletes || athletes.length === 0 ? (
        <p>No athletes connected yet. Click above to connect Strava.</p>
      ) : (
        athletes.map((athlete) => (
          <div key={athlete.id} style={{ marginTop: "2rem" }}>
            <h2>
              {athlete.first_name} {athlete.last_name}
            </h2>
            <p style={{ fontSize: "0.875rem", color: "#666" }}>
              Strava ID: {athlete.strava_id}
            </p>
            <form
              action={`/api/strava/sync`}
              method="POST"
              style={{ marginBottom: "1rem" }}
            >
              <input type="hidden" name="athlete_id" value={athlete.id} />
              <button
                type="submit"
                style={{
                  padding: "0.5rem 1rem",
                  background: "#fc4c02",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Sync Activities
              </button>
            </form>

            {activitiesByAthlete[athlete.id]?.length > 0 ? (
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  fontSize: "0.875rem",
                }}
              >
                <thead>
                  <tr>
                    {["Route", "Name", "Type", "Distance", "Time", "Pace", "Date"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #ccc",
                            padding: "0.5rem",
                          }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {activitiesByAthlete[athlete.id].map((act) => (
                    <tr key={act.id as string}>
                      <td style={{ padding: "0.5rem" }}>
                        {act.map_summary_polyline ? (
                          <svg
                            width="60"
                            height="40"
                            viewBox="0 0 60 40"
                            style={{ display: "block" }}
                          >
                            <path
                              d={polylineToSvgPath(
                                act.map_summary_polyline as string,
                                60,
                                40
                              )}
                              fill="none"
                              stroke="#fc4c02"
                              strokeWidth="1.5"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <span style={{ color: "#ccc" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {act.name as string}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {act.sport_type as string}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {formatDistance(act.distance as number)}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {formatTime(act.moving_time as number)}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {formatPace(
                          act.average_speed as number,
                          act.sport_type as string
                        )}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {new Date(act.start_date as string).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No activities yet. Click Sync to pull from Strava.</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
