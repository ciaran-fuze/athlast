"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";
import "leaflet/dist/leaflet.css";

const colors = {
  bg: "#F5F0E8",
  card: "#FBF7EF",
  dark: "#1a1a18",
  muted: "#8a8070",
  border: "#e0d9cc",
  goal: "#C8871A",
  todo: "#a8916a",
};

// Route points are evenly spaced along the course, so km maps straight onto an index
function pointAtKm(route: [number, number][], km: number, distanceKm: number): [number, number] {
  const f = Math.min(Math.max(km / distanceKm, 0), 1) * (route.length - 1);
  const i = Math.min(Math.floor(f), route.length - 2);
  const t = f - i;
  return [route[i][0] + t * (route[i + 1][0] - route[i][0]), route[i][1] + t * (route[i + 1][1] - route[i][1])];
}

function splitRoute(route: [number, number][], km: number, distanceKm: number) {
  const f = Math.min(Math.max(km / distanceKm, 0), 1) * (route.length - 1);
  const i = Math.floor(f);
  const here = pointAtKm(route, km, distanceKm);
  return { done: [...route.slice(0, i + 1), here], todo: [here, ...route.slice(i + 1)] };
}

function dotHtml(color: string, label: string, labelColor: string, labelBelow: boolean) {
  return `<div style="position:relative;width:15px;height:15px;border-radius:50%;background:${color};border:3px solid ${colors.card};box-shadow:0 0 0 1px ${color}">
    <span class="dot-pulse" style="position:absolute;inset:-3px;border-radius:50%;background:${color}"></span>
    <span style="position:absolute;left:50%;transform:translateX(-50%);${labelBelow ? "top:17px" : "bottom:16px"};font-family:var(--font-mono),monospace;font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;white-space:nowrap;color:${labelColor};text-shadow:0 0 3px ${colors.card},0 0 3px ${colors.card}">${label}</span>
  </div>`;
}

export function CourseMap({
  route,
  distanceKm,
  runnerKm,
  goalKm,
  athleteName,
  onClose,
}: {
  route: [number, number][];
  distanceKm: number;
  runnerKm: number;
  goalKm: number | null;
  athleteName: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<{ done: Polyline; todo: Polyline; runner: Marker; goal: Marker | null } | null>(null);
  const latest = useRef({ runnerKm, goalKm });
  useEffect(() => {
    latest.current = { runnerKm, goalKm };
  }, [runnerKm, goalKm]);

  // Build the map once
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.25 });
      map.attributionControl.setPrefix(false);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      map.fitBounds(L.latLngBounds(route), { padding: [28, 28] });

      const { runnerKm: rKm, goalKm: gKm } = latest.current;
      const parts = splitRoute(route, rKm, distanceKm);
      // Light casing under the whole route so it stands out from the streets
      L.polyline(route, { color: colors.card, weight: 9, opacity: 0.9, lineCap: "round", lineJoin: "round", interactive: false }).addTo(map);
      const todo = L.polyline(parts.todo, { color: colors.todo, weight: 5, lineCap: "round", lineJoin: "round" }).addTo(map);
      const done = L.polyline(parts.done, { color: colors.dark, weight: 4, lineCap: "round", lineJoin: "round" }).addTo(map);
      L.circleMarker(route[0], { radius: 4, color: colors.dark, weight: 2, fillColor: colors.card, fillOpacity: 1 })
        .bindTooltip("Start / Finish", { permanent: false })
        .addTo(map);
      const icon = (color: string, label: string, labelColor: string, below: boolean) =>
        L.divIcon({ html: dotHtml(color, label, labelColor, below), className: "", iconSize: [21, 21], iconAnchor: [10.5, 10.5] });
      const goal =
        gKm !== null
          ? L.marker(pointAtKm(route, gKm, distanceKm), { icon: icon(colors.goal, "Goal", colors.goal, true), interactive: false }).addTo(map)
          : null;
      const runner = L.marker(pointAtKm(route, rKm, distanceKm), {
        icon: icon(colors.dark, athleteName, colors.dark, false),
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(map);

      mapRef.current = map;
      layersRef.current = { done, todo, runner, goal };
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, [route, distanceKm, athleteName]);

  // Keep the dots moving while the map is open
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    const parts = splitRoute(route, runnerKm, distanceKm);
    layers.done.setLatLngs(parts.done);
    layers.todo.setLatLngs(parts.todo);
    layers.runner.setLatLng(pointAtKm(route, runnerKm, distanceKm));
    if (layers.goal && goalKm !== null) layers.goal.setLatLng(pointAtKm(route, goalKm, distanceKm));
  }, [route, distanceKm, runnerKm, goalKm]);

  return (
    <div
      role="dialog"
      aria-label="Course map"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: colors.bg, display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.9rem 1.25rem",
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: colors.muted }}>
          Course · <span style={{ color: colors.dark }}>{runnerKm.toFixed(1)}</span> / {distanceKm} km
        </div>
        <button
          onClick={onClose}
          aria-label="Close map"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: `1px solid ${colors.border}`,
            background: colors.card,
            color: colors.dark,
            fontSize: "1.1rem",
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>
      {/* Mute the street map into the cream palette */}
      <style>{`.athlast-map .leaflet-tile-pane { filter: grayscale(1) sepia(0.18) brightness(1.04) contrast(0.88); }`}</style>
      <div ref={containerRef} className="athlast-map" style={{ flex: 1, background: colors.bg }} />
    </div>
  );
}
