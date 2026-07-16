@AGENTS.md

# Athlast

Athlast is an endurance sport brand and app that captures race day for endurance athletes and their supporters and turns it into something permanent. Athletes connect Strava, supporters submit photos and messages during the race, and within 24 hours a full race memoir is generated.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Supabase (Postgres)
- **Hosting:** Vercel
- **APIs:** Strava API (activity data), Anthropic API (memoir generation)
- **Language:** TypeScript

## Current Sprint Goal

MVP foundation: Strava OAuth, activity sync, and basic data display.

## Data Model

### athletes
- `id` (uuid, PK)
- `strava_id` (bigint, unique) — Strava athlete ID
- `first_name`, `last_name` (text)
- `profile_picture` (text) — URL
- `access_token`, `refresh_token` (text) — Strava OAuth tokens
- `token_expires_at` (bigint) — Unix timestamp
- `created_at`, `updated_at` (timestamptz)

### activities
- `id` (uuid, PK)
- `strava_id` (bigint, unique) — Strava activity ID
- `athlete_id` (uuid, FK -> athletes)
- `name` (text)
- `sport_type` (text) — Run, Ride, etc.
- `distance` (real) — meters
- `moving_time` (integer) — seconds
- `elapsed_time` (integer) — seconds
- `start_date` (timestamptz)
- `average_speed` (real) — m/s
- `max_speed` (real) — m/s
- `total_elevation_gain` (real) — meters
- `map_summary_polyline` (text)
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

## What's Built

- **Supabase client** — `lib/supabase.ts` (service role, server-side only)
- **Schema** — `supabase/schema.sql` (athletes + activities tables, ready to run in dashboard)
- **Strava OAuth** — `GET /api/strava/auth` redirects to Strava, `GET /api/strava/callback` exchanges code and upserts athlete
- **Activity sync** — `POST /api/strava/sync` pulls all Run/Ride activities (paginated), refreshes tokens if expired, upserts to activities table
- **Homepage** — `app/page.tsx` lists all athletes and their 10 most recent activities (name, type, distance, time, pace, date) with a Sync button per athlete

## Open Questions

- How will supporters be linked to athletes/races?
- What triggers memoir generation — manual or automatic after race detection?
- Should we add a `races` table to group activities and supporter content?
- Auth strategy for athletes beyond Strava OAuth (e.g. Supabase Auth)?
