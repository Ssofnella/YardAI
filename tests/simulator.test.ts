import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schemaSql } from "@/lib/db/schema";
import { openPglite } from "@/lib/db/pglite";
import type { Database } from "@/lib/db/types";
import { shiftStartUtc } from "@/lib/domain/time";
import { seedDemo } from "@/lib/seed/demo";
import { applyScriptStep } from "@/lib/simulator/runner";
import { buildDayPlan } from "@/lib/simulator/script";
import { getYardState } from "@/lib/yard/state";

let db: Database;

beforeAll(async () => {
  db = await openPglite();
  await db.exec(schemaSql());
  await seedDemo(db);
  const site = await db.query<{ timezone: string }>(`select timezone from sites limit 1`);
  const dayStart = shiftStartUtc(new Date(), site[0].timezone, 6);
  const { steps } = buildDayPlan(dayStart);
  for (const step of steps) {
    await applyScriptStep(db, step);
  }
}, 30_000);

afterAll(async () => {
  await db.close();
});

describe("simulated shift", () => {
  it("plays arrivals, door moves, exceptions, and check-outs", async () => {
    const state = await getYardState(db);
    expect(state.counts.noShows).toBe(2);
    expect(state.counts.expected).toBe(0);
    expect(state.counts.departed).toBeGreaterThan(5);
    expect(state.counts.onYard).toBeGreaterThan(5);

    const events = await db.query<{ event_type: string }>(`select event_type from events`);
    const types = new Set(events.map((row) => row.event_type));
    for (const type of [
      "gate.check_in",
      "gate.check_out",
      "door.assigned",
      "door.work_completed",
      "appointment.no_show",
      "id.mismatch",
      "seal.mismatch",
      "reefer.alert",
      "reefer.reading",
    ]) {
      expect(types.has(type)).toBe(true);
    }

    const mismatch = await db.query<Record<string, unknown>>(
      `select trailer_number, scac, load_id, appointment_id, location, occurred_at, source, id
       from events where event_type = 'id.mismatch'`,
    );
    expect(mismatch[0]).toMatchObject({
      trailer_number: "MP-3310",
      scac: "MNPR",
      load_id: "LD-2404",
      appointment_id: "APT-2404",
      source: "simulator",
    });
    expect(String(mismatch[0].occurred_at)).toBeTruthy();
    expect(mismatch[0].id).toBeTruthy();
    expect(String(mismatch[0].location)).toMatch(/A05/);
  });
});
