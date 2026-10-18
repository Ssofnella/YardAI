# Yardline

Yardline is a yard management system for one small warehouse, about 20 dock doors. It is a personal project for Allen Foss. The first slice is a demo a site manager can click through: set up the yard without code, check trailers in and out on a tablet, watch the yard and the doors, and play a fictional shift in a few minutes.

The demo company is **Lakeshore Provisions**, a made-up food and beverage distributor in the America/Chicago timezone. Every carrier, driver, trailer, and load in the app is fictional.

## Run the demo

Requires Node.js 22.

```bash
npm install
npm run demo
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847).

That command starts Next.js and, on first launch, creates an embedded Postgres database in `.data/pglite` and loads the morning yard. No Supabase account, no API key, and no login. Copy `.env.example` to `.env.local` only if you want to point the app at your own Postgres.

Other commands:

```bash
npm test          # event model, seal and ID matching, and a full simulated shift
npm run typecheck
npm run lint
npm run build
npm start         # production server, still on port 3847
```

To start the morning over, use **Reset to morning** on the Simulator page, or delete `.data` and run `npm run demo` again.

## What this slice does

- **Setup.** The site manager sets the company and site name, timezone, door count and door type (dry, reefer, or both), yard zones and spots, trailer and door statuses, check-in fields, and the reefer alert limits. Publishing stores a new config version. Older versions can be restored. The yard board, door board, and gate form all read the live version.
- **Gate.** Tablet check-in captures trailer, tractor, carrier and SCAC, driver, seal, load type, load ID, empty or loaded, a reefer flag with set point, actual temperature, and fuel, an optional photo, custom fields from the wizard, and a spot or door. The clerk can match an expected arrival. Check-out records the seal and a timestamp. A seal that does not match, or an ID that does not match the appointment, is flagged. The check-in still completes.
- **Boards.** The yard map is the spot grid from the wizard. The door board is one card per door. Both show status and dwell, filter, and update while the simulator or another gate session is writing events.
- **Simulator.** One fictional shift: arrivals, live unloads, moves onto doors, door completions, check-outs, late trucks, no-shows, a hot reefer with low fuel, an ID mismatch, and a seal mismatch. Speed is simulated minutes per real second. At 4 min/s the 6:00–18:00 shift takes about three minutes.
- **Event log.** Every state change is an append-only row with a UUID, trailer, SCAC, load ID, appointment ID, location, UTC timestamp, and source (`manual` or `simulator`). The screen shows America/Chicago (or whatever timezone the wizard saved).

## What is out of scope

Yard-driver move queue, detention invoices, CSV import, reports, EDI, a carrier portal, cameras, telematics, and SSO. The tables `move_requests`, `detention_terms`, and `memberships` are in the schema so those can land later without a new tenant model. This slice does not calculate free time or build a task queue. Dwell is a clock, not a bill.

## Architecture

```text
browser (Next.js App Router, PWA)
  → route handlers
    → yard operations (check-in, check-out, config, simulator)
      → append-only events + current visits
        → Postgres
```

Postgres is embedded ([PGlite](https://pglite.dev/)) when `DATABASE_URL` is empty, and any Postgres (including Supabase) when `DATABASE_URL` is set. The SQL is `supabase/migrations/0001_schema.sql`. Row-level security is `supabase/migrations/0002_rls.sql` and is applied on Supabase only, because it calls `auth.uid()`.

The browser never opens Postgres. It polls `GET /api/state` and listens to `GET /api/stream` (server-sent events once a second). That stream is the local stand-in for Supabase Realtime. Both modes use the same events.

Current trailer state lives on `visits`. History lives on `events`. A trigger rejects updates and deletes on `events` unless the demo reset sets `yard.allow_maintenance` inside a transaction. Replaying the same event id is a no-op. Replaying it with a different body is an error.

### Matching and seals

Check-in matches an expected arrival in this order:

1. The appointment the clerk selected.
2. Trailer number + SCAC.
3. Load ID.
4. Trailer number alone, which flags a SCAC mismatch.

Comparison ignores case, spaces, and dashes. A mismatch is stored as an `id.mismatch` event and a flag on the visit. It does not block the gate.

Seals use the same normalization. A seal on the way in and a different or blank seal on the way out writes `seal.mismatch` and still checks the trailer out. Two blank seals are not a mismatch.

Reefer alerts use the limits in the published config (default: more than 5°F from set point, or fuel under 25%).

### Time

Timestamps are stored in UTC. Boards and the log format them in the site timezone. While a simulated shift is running, paused, or finished, dwell and new gate stamps use the simulator clock. Resetting the day returns the yard to the wall clock.

### Config

`site_configs.snapshot` is the yard: doors, zones, spots, statuses, check-in fields, load types, and reefer limits. `sites.current_config_id` points at the live version. Rollback moves the pointer. It does not delete later versions.

## Assumptions

- One company and one site are loaded for the demo. The schema is keyed by `company_id` and `site_id` for a later second site.
- There is no login in this slice. The Next.js server is the only database client and connects as the database owner, which bypasses row-level security.
- Door assignment inside the simulator is a direct state change (`door.assigned`), not a driver task. The move queue table is unused.
- A check-in to a spot is a drop. A check-in to a door is live (the driver waits).
- A reefer on a dry door is allowed and flagged. It is not rejected.
- Photos are stored as bytea on `photos`, not in object storage.
- A signature field is a drawing stored as a PNG data URL on the visit. It is not a legally meaningful signature.
- The service worker makes the app installable. It does not queue gate actions offline.
- Default vocabulary is English. Status labels can be renamed in the wizard; the app is not translated.
- SCAC codes in the demo (`HRBR`, `PNCN`, `RDKT`, `MNPR`, `CNDR`) are invented.

## Open decisions for Allen

1. **Auth.** Supabase Auth is not wired. RLS policies are written for a membership row (`admin`, `office`, `gate`, `yard_driver`, `read_only`). Decide when a pilot needs accounts, and whether the gate tablet is a shared device login.
2. **Realtime on Supabase.** The demo uses server-sent events from the Next server. Supabase Realtime on `events` is the production option if the browser should subscribe directly. That wants a user JWT and the RLS policies, not the owner connection.
3. **Detention.** Dwell is visible. Free-time rules and an evidence export are not. `detention_terms` is empty. Confirm whether the first pilot is a receiver (dwell is a service story) or a shipper/3PL (dwell is a billing story).
4. **Door rules.** Should a reefer be blocked from a dry door, or only flagged? Should empty trailers prefer the back row automatically?
5. **Offline.** Yards have dead zones. An IndexedDB outbox with idempotent event ids is the next step if a pilot tablet drops Wi-Fi. This slice only installs as a PWA.
6. **Photos.** Bytea is fine for a demo. A pilot with a photo on every truck should move to Supabase Storage.
7. **Language.** Spanish for the gate is a likely pilot need and is not built.
8. **Employment.** The research note still stands: check the Valent agreement before a public pilot or a post that looks like a company product. This repo is set up as your personal project.

## Deploy to Vercel and Supabase

PGlite is for the laptop demo. Vercel has no durable disk, so production must set `DATABASE_URL`.

1. Create a Supabase project. In **Project Settings → Database**, copy the **Session pooler** connection string (URI). That is `DATABASE_URL`. Do not commit it.
2. In the Supabase **SQL Editor**, run `supabase/migrations/0001_schema.sql`, then `supabase/migrations/0002_rls.sql`.
3. Optional, only if you later turn on Supabase Auth: insert a `memberships` row for your `auth.users` id. The current app does not send a user JWT. The Next.js server uses `DATABASE_URL` and bypasses RLS. Do not expose that URL to the browser.
4. Create a Vercel project from this repo. Framework preset: Next.js. Set:
   - `DATABASE_URL` — the pooler URI from step 1
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL (optional until Auth or Realtime is wired)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (optional, same reason)
   - `SUPABASE_SERVICE_ROLE_KEY` — service role (optional, server-only, never `NEXT_PUBLIC_`)
5. Deploy. The first request seeds Lakeshore Provisions if `companies` is empty.
6. Open the deployment. Play the shift from **Simulator**.

Notes:

- Supabase free projects pause after about a week of inactivity. A public demo that must stay up needs the paid plan or an external keep-alive. See [Supabase pricing](https://supabase.com/pricing).
- Vercel Hobby is enough for a personal demo. Move to Pro before a paying site.
- `npm run build` must succeed locally before you rely on the Vercel build. This repo builds with `next build`.
- After a schema change, delete `.data` locally. On Supabase, write a new migration. Do not edit `0001` in place once it has been applied.

## Tests

`npm test` covers:

- Event creation: UUID, UTC timestamps, required trailer and SCAC on operational events, frozen records, safe replay, and rejection of a changed body for the same id.
- Seal normalization and mismatch, including a blank outbound seal.
- ID matching by appointment, trailer + SCAC, load ID, and trailer-only with a SCAC mismatch.
- Reefer temperature and fuel limits, and Chicago offset (CDT and CST).
- The published default yard (20 doors) and a config that tries to hide the trailer number.
- A Postgres check that a mismatched check-in and a mismatched seal are stored, and that `UPDATE` and `DELETE` on `events` throw.
- A full simulated shift against Postgres: no-shows, door moves, the ID mismatch, the seal mismatch, and the reefer alert.

## Layout

```text
app/                  pages and route handlers
components/           yard, doors, gate, setup, simulator
lib/domain/           events, seals, matching, reefer, config, time
lib/yard/             operations that write events and visits
lib/simulator/        the fictional shift
lib/seed/             morning yard
supabase/migrations/  schema and row-level security
tests/                vitest
```
