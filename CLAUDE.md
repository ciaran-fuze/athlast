@AGENTS.md

# Athlast

Athlast is an endurance sport brand and app that captures race day for endurance athletes and their supporters and turns it into something permanent. Athletes connect Strava, supporters submit photos and messages during the race, and within 24 hours a full race memoir is generated.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Supabase (Postgres + Storage)
- **Hosting:** Vercel — https://athlast-nine.vercel.app
- **APIs:** Strava API (activity data), Race Result API (live race splits), Anthropic API (memoir generation)
- **Language:** TypeScript

## Current Sprint Goal

Race page MVP for Dublin Half Marathon (September 2026): live splits via Race Result, supporter messages + photos, post-race Strava activity matching.

## Data Model

### athletes
- `id` (uuid, PK)
- `strava_id` (bigint, unique) — Strava athlete ID
- `first_name`, `last_name` (text)
- `profile_picture` (text) — URL from Strava, used as Athlast profile
- `access_token`, `refresh_token` (text) — Strava OAuth tokens
- `token_expires_at` (bigint) — Unix timestamp
- `created_at`, `updated_at` (timestamptz)

### activities
- `id` (uuid, PK)
- `strava_id` (bigint, unique) — Strava activity ID
- `athlete_id` (uuid, FK -> athletes)
- `name`, `sport_type` (text)
- `distance` (real, meters), `moving_time`, `elapsed_time` (integer, seconds)
- `start_date` (timestamptz)
- `average_speed`, `max_speed` (real, m/s), `total_elevation_gain` (real, meters)
- `map_summary_polyline` (text)
- `created_at` (timestamptz)

### races
- `id` (uuid, PK), `slug` (text, unique)
- `name`, `location` (text), `race_date` (date), `distance_km` (real)
- `raceresult_event_id` (integer), `raceresult_server` (text), `raceresult_key` (text)
- `status` (upcoming | live | finished)
- `created_at` (timestamptz)

### race_athletes
- `id` (uuid, PK)
- `race_id` (FK -> races), `athlete_id` (FK -> athletes)
- `bib_number` (integer), `raceresult_pid` (integer)

### supporter_messages
- `id` (uuid, PK)
- `race_id` (FK -> races), `athlete_id` (FK -> athletes)
- `sender_name` (text), `message` (text), `photo_url` (text)
- `created_at` (timestamptz)

## Branding

### Typography
- **Display:** DM Serif Display (`--font-display`) — athlete names, race titles, finish times, hero headings, wordmark. Italic for emotional emphasis ("finished.", "everlasting.")
- **Mono:** DM Mono (`--font-mono`) — all data: splits, pace, distance, bib numbers, dates, labels, URLs, metadata
- **Body/UI:** DM Sans (`--font-body`) — descriptions, messages, buttons, navigation, supporting copy

### Colour Palette
- Background: `#F5F0E8` — warm cream, primary page background
- Dark: `#1a1a18` — near black, hero sections, CTA blocks, text
- Accent warm: `#c8b99a` — muted gold, italic emphasis on dark backgrounds
- Muted text: `#8a8070` — labels, metadata, secondary information
- Subtle border: `#e0d9cc` — dividers, card borders
- Grid/gap: `#d8d2c5` — background between split cells and photo grids

### Design Principles
Premium, minimal, human — feels like a brand not a software product.

## Key Decisions

- Using Supabase service role key server-side for direct DB access (no RLS for now).
- Strava tokens stored in the athletes table for simplicity.
- Activities table keyed by `strava_id` for upsert idempotency.
- Race Result API for live tracking — no need to build custom GPS tracking. One integration per timing provider covers many races.
- Race Result endpoints: config at `/{eventId}/results/config`, participant splits at `/{eventId}/details0/view?pid={pid}&key={key}`.
- Strava profile picture bootstraps the Athlast athlete profile.
- Activity sync is manual, not automatic — future: match Strava activity to race by date + distance.

## What's Built

- **Supabase client** — `lib/supabase.ts` (service role, server-side only)
- **Schema** — `supabase/schema.sql` + `supabase/002_races.sql`
- **Strava OAuth** — `GET /api/strava/auth` → `GET /api/strava/callback`
- **Activity sync** — `POST /api/strava/sync` (paginated, token refresh)
- **Race Result integration** — `lib/raceresult.ts` (config + participant splits)
- **Race page** — `app/race/[slug]` with live progress tracker, splits table, supporter messages, photo upload
- **Photo upload** — `POST /api/race/upload` → Supabase Storage (`supporter-photos` bucket)
- **Supporter messages** — `GET/POST /api/race/cheer`
- **Live splits polling** — `GET /api/race/splits` (polls Race Result every 30s during live races)
- **Homepage** — `app/page.tsx` lists athletes + 10 recent activities with mini route maps
- **Polyline renderer** — `lib/polyline.ts` decodes Strava polylines to SVG paths
- **Brand system** — DM font family, warm cream palette, logo in hero
- **Deployed** — Vercel at https://athlast-nine.vercel.app, GitHub at ciaran-fuze/athlast
- **Live demo race** — `/race/dublin-half-2026-live` with mock mid-race splits (pulsing tracker at 10K)
- **Finished demo race** — `/race/dublin-half-2026` with real Race Result data from May 2026

## Next Up

- Smart activity matching: after a race, match Strava activity to race page by date + distance + sport type
- Dublin Half Marathon race page for September (real event, real data)
- Memoir generation with Anthropic API
- Mobile app for Lanzarote Ironman (May 2027)

## Open Questions

- Auth strategy for athletes beyond Strava OAuth (e.g. Supabase Auth)?
- How do supporters discover the race page? (shareable link vs QR code vs search)
- Memoir format — web page, PDF poster, or both?
- Should Race Result config/key be cached in DB or fetched fresh each time?
