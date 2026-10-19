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

## Guided setup and yard suggestions

`/onboard` (also `/onboarding`) is the first-run path. Setup remains the editor after that.

- **Location and sources.** Drop a pin or use this browser's location. The sample pin is the Texas 2022 NAIP scene shipped in `public/imagery`. A second pin (Austin) sits inside a published TxGIO StratMap county service. Address search stays off until `YARD_GEOCODER=mapbox_permanent` and a server-only `YARD_MAPBOX_TOKEN`. The basemap is chosen per pin: TxGIO StratMap where a public county service covers it, USDA NAIP otherwise. Google, Mapbox, and Esri imagery are not used. See `docs/imagery-licensing.md`.
- **Listing facts.** With `YARD_SEARCH_API_KEY` and `YARD_AI_API_KEY`, an AI step reads a search-API response for dock-high doors, drive-in doors, square footage, and clear height. Each fact is shown as `Found: 20 dock-high doors (source)` and can seed the door count, which you can edit. Without either key the step is skipped. The demo button shows fictional Lakeshore facts and does not call a listing site. Snippets, listing photos, and copied prose are not stored.
- **Your photo or plan.** Upload a site plan image, a drone photo, or a dock-wall photo. With an AI key, vision proposes doors (and spots on overhead images and plans). Without a key, the image is a reference underlay and you place doors yourself. A PDF is stored as your reference and is not mined for text.
- **Doors and spots.** The map is [MapLibre](https://maplibre.org/) plus [Terra Draw](https://github.com/JamesLMilner/terra-draw): select, wall, door, zone, snapping, undo, and redo. "Add doors along this wall" spaces a count at about 4 m. Those marks are low confidence until you accept the group. "Accept all remaining" skips low confidence. A grid you choose can be published immediately. Sources are merged into one draft with a confidence and a source label on each item. Nothing is published until you accept it. Finishing setup writes `ai.suggested` and either `ai.accepted` or `ai.dismissed` for each item. OpenStreetMap outlines are off unless `YARD_OSM_HINTS=on`, and they are not stored in the yard.
- **Feeds.** Manual, CSV import, email-in, and a webhook. WMS and TMS connectors stay coming soon. Email is accepted only from allowlisted sender domains, and each message becomes a draft until a person confirms it.
- **Gate.** The recommendation card is rules (closest powered door, holding spot, empty to the back row, a later appointment stays off a door). Check-in never waits on it. Tap Use to accept. Choose another, or ignore the card, and the suggestion is logged as dismissed.
- **Optimize.** Scan the yard, then Send to driver queue. That inserts a hostler task and `move.requested`. The trailer stays put until a driver finishes the task. Held trailers are not suggested.
- **Ask the yard.** Read only. Every answer lists the records it used and an as-of time. "Move X to Y" does not write; it offers a link to the normal optimize panel.

The simulator logs a recommendation on each scripted check-in and one optimize suggestion when a door finishes. It does not create hostler tasks by itself.

## What is still out of scope

Detention invoices, a full EDI 856 parser, a carrier portal, cameras, telematics, and SSO. `detention_terms` and `memberships` are in the schema. Dwell is a clock, not a bill. The hostler queue records the task; a driver screen that completes it is not in this slice.

## Architecture

```text
browser (Next.js App Router, PWA)
  → route handlers
    → yard operations (check-in, check-out, config, simulator)
      → append-only events + current visits
        → Postgres
```

Postgres is embedded ([PGlite](https://pglite.dev/)) when `DATABASE_URL` is empty, and any Postgres (including Supabase) when `DATABASE_URL` is set. The SQL is `supabase/migrations/0001_schema.sql` plus `0003_onboarding.sql` (site location, feed keys, arrival drafts). Row-level security is `supabase/migrations/0002_rls.sql` and is applied on Supabase only, because it calls `auth.uid()`.

The default basemap is self-hosted USDA NAIP, public domain, capture year 2022, one Texas quarter-quad, unless the pin is inside a catalogued TxGIO StratMap county service. Those county flights are public domain and finer than NAIP (about 6 inch, or 3 inch for the 2020 Capital Area and McLennan service). The browser requests `/imagery/naip/...` or `/api/imagery/txgio/...` on this origin. The tile proxy calls only `imagery.geographic.texas.gov`. Google, Mapbox, and Esri imagery are not used for tracing or as model input. The licensed Hexagon Texas Imagery Service is not used. A licensed tile URL is display-only, and only when `YARD_LICENSED_IMAGERY=on` and `YARD_LICENSED_TILE_URL` are both set. Details and caveats are in `docs/imagery-licensing.md`.

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
- Door assignment inside the simulator is still a direct state change (`door.assigned`). Sending an optimize move creates a `move_requests` row and does not assign the door.
- A check-in to a spot is a drop. A check-in to a door is live (the driver waits).
- A reefer on a dry door is allowed and flagged. It is not rejected.
- Photos are stored as bytea on `photos`, not in object storage.
- A signature field is a drawing stored as a PNG data URL on the visit. It is not a legally meaningful signature.
- The service worker caches the app shell for a reload with no network. Gate writes go to an IndexedDB outbox first and flush when the tablet is online. API calls are not cached.
- Frontline copy goes through `t()` in `lib/i18n.ts`. Only the English catalog is filled in. The site locale can be set to Spanish in the wizard, and it falls back to English until those keys exist.
- SCAC codes in the demo (`HRBR`, `PNCN`, `RDKT`, `MNPR`, `CNDR`) are invented.

## Open decisions for Allen

1. **Auth.** Supabase Auth is not wired. RLS policies are written for a membership row (`admin`, `office`, `gate`, `yard_driver`, `read_only`). Decide when a pilot needs accounts, and whether the gate tablet is a shared device login.
2. **Realtime on Supabase.** The demo uses server-sent events from the Next server. Supabase Realtime on `events` is the production option if the browser should subscribe directly. That wants a user JWT and the RLS policies, not the owner connection.
3. **Detention.** Dwell is visible. Free-time rules and an evidence export are not. `detention_terms` is empty. Confirm whether the first pilot is a receiver (dwell is a service story) or a shipper/3PL (dwell is a billing story).
4. **Door rules.** Should a reefer be blocked from a dry door, or only flagged? Should empty trailers prefer the back row automatically?
5. **Offline conflicts.** The gate queues check-ins and flushes them by client id (`ON CONFLICT DO NOTHING` plus a command id). Two tablets assigning the same spot while offline still need an office conflict screen. This slice rejects the second write or flags it; it does not yet open a review queue in the UI beyond "needs review" on the sync pill.
6. **Photos.** Bytea is fine for a demo. A pilot with a photo on every truck should move to Supabase Storage. The gate photo control from the spec is not on the check-in form yet.
7. **Language.** Strings are extracted. Spanish copy is not written. Confirm whether the first pilot needs `es` on the gate tablet.
8. **Employment.** The research note still stands: check the Valent agreement before a public pilot or a post that looks like a company product. This repo is set up as your personal project.

## Deploy to Vercel and Supabase

PGlite is for the laptop demo. Vercel has no durable disk, so production must set `DATABASE_URL`.

1. Create a Supabase project. In **Project Settings → Database**, copy the **Session pooler** connection string (URI). That is `DATABASE_URL`. Do not commit it.
2. In the Supabase **SQL Editor**, run `supabase/migrations/0001_schema.sql`, then `supabase/migrations/0002_rls.sql`, then `supabase/migrations/0003_onboarding.sql`.
3. Optional, only if you later turn on Supabase Auth: insert a `memberships` row for your `auth.users` id. The current app does not send a user JWT. The Next.js server uses `DATABASE_URL` and bypasses RLS. Do not expose that URL to the browser.
4. Create a Vercel project from this repo. Framework preset: Next.js. Set:
   - `DATABASE_URL` — the pooler URI from step 1
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL (optional until Auth or Realtime is wired)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (optional, same reason)
   - `SUPABASE_SERVICE_ROLE_KEY` — service role (optional, server-only, never `NEXT_PUBLIC_`)
   - Leave the imagery, geocoder, search, and AI variables at the defaults in `.env.example` unless you have reviewed a provider. `YARD_AI_API_KEY`, `YARD_SEARCH_API_KEY`, and `YARD_MAPBOX_TOKEN` are server-only. `YARD_IMAGERY_PROVIDER=auto` uses TxGIO StratMap on covered Texas counties and NAIP elsewhere.
5. Deploy. The first request seeds Lakeshore Provisions if `companies` is empty.
6. Open the deployment. Play the shift from **Simulator**.

Notes:

- Supabase free projects pause after about a week of inactivity. A public demo that must stay up needs the paid plan or an external keep-alive. See [Supabase pricing](https://supabase.com/pricing).
- Vercel Hobby is enough for a personal demo. Move to Pro before a paying site.
- `npm run build` must succeed locally before you rely on the Vercel build. This repo builds with `next build`.
- After a schema change, delete `.data` locally. On Supabase, write a new migration. Do not edit `0001` in place once it has been applied.

## UX spec (18 Oct 2026)

Implemented in this pass:

- Offline-first gate: IndexedDB outbox, client command ids, duplicate-safe `POST /api/sync`, flush on open, `online`, `visibilitychange`, and a 20s timer. Sync pill is grey for offline and red only for "needs review".
- Versioned config still drives doors, spots, statuses, and fields. New settings on the Rules step: device type (default iPad landscape), seal mismatch policy, who can clear a TEMP flag, temperature tolerance, low-fuel mark, free time, numbered spots, one gate or two, and locale.
- New arrival stamps the time before the form. Search of two or more characters pre-fills an expected arrival. Edits can only move that time earlier, with a reason.
- Blind seal entry. A mismatch shows both numbers with differing digits boxed and underlined, then Re-enter, Hold, or Accept with a required reason. Hold writes `seal.mismatch` and `hold.placed`, sets a HOLD flag, and suggests a holding spot. A gate role cannot check out a hold.
- Reefer mini-form: unit running, set point and display steppers, fuel marks E through F. Out of range raises TEMP, FUEL, or UNIT OFF with icon and text. Office or admin can clear TEMP with a reason (`reefer.cleared`). Gate cannot.
- Touch sizes 96 / 64 / 48. `npm run test:touch` checks frontline routes at 1180×820.
- Light high-contrast theme. Status and flag chips always pair an icon with a word.

Deferred from the same spec:

- Full Spanish catalog and a test that fails on missing `es` keys.
- Camera capture, client photo compression, and barcode scan.
- Dark theme toggle.
- Long-press move on the yard map, full-screen trailer detail, and two-tablet realtime conflict UI.
- One-tap door events (`load_start`, `load_end`) and free-time copy on every door tile.
- Kiosk mode, PIN users, per-carrier free time, and spot-assignment rule rows.
- Confirm-sheet reason chips for every override, and an offline draft older than 12 hours auto-discard.
- axe contrast run and a grayscale snapshot test. Chips are built so a grayscale review can still read the word and the icon.

Deferred from the 19 Oct guided-setup and suggestion specs:

- Separate pages for each onboarding step, portrait bottom sheet, and a 0.5 m nudge pad.
- Multi-select, renumber preview, and Microsoft building footprints.
- Rasterizing a site-plan PDF in the browser. The PDF is stored as a reference and is not mined for text. A page image can be the underlay.
- A live refresh of the TxGIO StratMap service list. The catalog is the public folder as of 19 Oct 2026. Dallas and Collin are not in that folder, so those pins use NAIP.
- The licensed Hexagon Texas Imagery Service. It is not public domain.
- `ai_suggestions` / `ai_feedback` tables and a weekly accept-rate screen. Suggestions are events (`ai.suggested`, `ai.accepted`, `ai.dismissed`, `ai.asked`) today.
- Risk snooze, temperature trend, and lost-trailer flags.
- A driver screen that completes the hostler task. Optimize only queues it.
- Batch "send selected", a 50-question ask eval, and an EDI parser beyond the field reader.
- Full Spanish catalog, camera and barcode, dark theme, long-press yard moves, kiosk, and PIN users remain deferred from slice 1.

## Tests

`npm test` covers:

- Event creation: UUID, UTC timestamps, required trailer and SCAC on operational events, frozen records, safe replay, and rejection of a changed body for the same id.
- Seal normalization and mismatch, including a blank outbound seal.
- ID matching by appointment, trailer + SCAC, load ID, and trailer-only with a SCAC mismatch.
- Reefer temperature and fuel limits, and Chicago offset (CDT and CST).
- The published default yard (20 doors) and a config that tries to hide the trailer number.
- A Postgres check that a mismatched check-in and a mismatched seal are stored, and that `UPDATE` and `DELETE` on `events` throw.
- A full simulated shift against Postgres: no-shows, door moves, the ID mismatch, the seal mismatch, and the reefer alert.
- Seal digit compare, hold versus accept, and which roles may clear a TEMP flag.
- Outbox flush: one row per client id, and a flush that stops halfway does not send the saved row again.
- `npm run test:touch` (Playwright) checks glove-sized targets on `/`, `/gate`, and `/doors` at 1180×820.
- Rules recommendations, optimize ranking (held trailers excluded), ask-the-yard citations, NAIP tile host, door-draft confidence, and email allowlist plus a draft that does not become an arrival until confirm.
- TxGIO StratMap selection inside a published county service, NAIP outside it, listing facts that keep a source URL and drop prose, a photo draft that stays unconfirmed, and a suggestion plus an accept or dismiss event for each merged item.
- A Postgres check that Send to driver queue writes `move.requested` and does not change the visit location, and that a non-allowlisted sender writes no draft.

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
