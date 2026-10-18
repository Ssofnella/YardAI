import { defaultSnapshot, validateSnapshot, type SiteConfigSnapshot } from "@/lib/domain/config";
import { asJson } from "@/lib/db/json";
import { addMinutes, shiftStartUtc } from "@/lib/domain/time";
import { CARRIERS, DEMO_COMPANY_ID, DEMO_SITE_ID } from "@/lib/demo/ids";
import type { Database } from "@/lib/db/types";
import { createAppointment, performCheckIn, publishConfig } from "@/lib/yard/operations";
import { placementByName } from "@/lib/yard/locations";
import { DAY_SCRIPT, OVERNIGHT } from "@/lib/simulator/script";

export async function seedIfEmpty(db: Database): Promise<void> {
  const rows = await db.query<{ id: string }>(`select id from companies limit 1`);
  if (rows.length > 0) return;
  await seedDemo(db);
}

export async function seedDemo(db: Database): Promise<void> {
  const snapshot = defaultSnapshot();
  await db.transaction(async (tx) => {
    await tx.query(`insert into companies (id, name) values ($1, $2)`, [
      DEMO_COMPANY_ID,
      snapshot.companyName,
    ]);
    await tx.query(
      `insert into sites (id, company_id, name, timezone) values ($1, $2, $3, $4)`,
      [DEMO_SITE_ID, DEMO_COMPANY_ID, snapshot.siteName, snapshot.timezone],
    );
    for (const carrier of CARRIERS) {
      await tx.query(
        `insert into carriers (id, company_id, name, scac) values ($1, $2, $3, $4)`,
        [crypto.randomUUID(), DEMO_COMPANY_ID, carrier.name, carrier.scac],
      );
    }
  });
  await publishConfig(db, snapshot, "Initial yard", "simulator");
  await seedOperational(db);
}

export async function resetOperational(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(`select set_config('yard.allow_maintenance', 'on', true)`);
    await tx.query(
      `delete from events where event_type not in ('config.published', 'config.rolled_back')`,
    );
    await tx.query(`delete from visits`);
    await tx.query(`delete from appointments`);
    await tx.query(`delete from photos`);
    await tx.query(
      `update sim_state
       set status = 'idle', speed = 4, sim_now = null, day_start = null, day_end = null,
           plan = '[]'::jsonb, done_ids = '[]'::jsonb, last_error = null, updated_at = now()
       where site_id = $1`,
      [DEMO_SITE_ID],
    );
  });
  await seedOperational(db);
}

export async function seedOperational(db: Database): Promise<void> {
  const siteRows = await db.query<{ timezone: string }>(
    `select timezone from sites where id = $1`,
    [DEMO_SITE_ID],
  );
  const timezone = siteRows[0]?.timezone ?? "America/Chicago";
  const dayStart = shiftStartUtc(new Date(), timezone, 6);
  const createdAt = addMinutes(dayStart, -60).toISOString();

  for (const stop of DAY_SCRIPT) {
    await createAppointment(db, {
      code: stop.code,
      carrierName: stop.carrierName,
      scac: stop.scac,
      trailerNumber: stop.trailerNumber,
      driverName: stop.driverName,
      tractorNumber: stop.tractorNumber,
      loadId: stop.loadId,
      loadType: stop.loadType,
      emptyOrLoaded: stop.emptyOrLoaded,
      isReefer: stop.isReefer,
      setpointF: stop.setpointF,
      plannedAt: addMinutes(dayStart, stop.plannedMinute).toISOString(),
      occurredAt: createdAt,
      source: "simulator",
    });
  }

  const configRows = await db.query<{ snapshot: unknown }>(
    `select sc.snapshot
     from sites s
     join site_configs sc on sc.id = s.current_config_id
     where s.id = $1`,
    [DEMO_SITE_ID],
  );
  const parsed = asJson<SiteConfigSnapshot | null>(configRows[0]?.snapshot, null);
  const config = parsed ? validateSnapshot(parsed) : defaultSnapshot();

  for (const drop of OVERNIGHT) {
    const named = placementByName(config, drop.placeName);
    await performCheckIn(db, {
      trailerNumber: drop.trailerNumber,
      scac: drop.scac,
      carrierName: drop.carrierName,
      driverName: drop.driverName,
      tractorNumber: drop.tractorNumber,
      loadId: drop.loadId,
      loadType: drop.loadType,
      emptyOrLoaded: drop.emptyOrLoaded,
      isReefer: drop.isReefer,
      setpointF: drop.setpointF ?? null,
      tempF: drop.tempF ?? null,
      fuelPct: drop.fuelPct ?? null,
      sealNumber: drop.sealIn,
      locationKind: named?.kind,
      locationId: named?.id,
      preferredPlace: drop.placeName,
      occurredAt: addMinutes(dayStart, drop.offsetMin).toISOString(),
      source: "simulator",
    });
  }
}
