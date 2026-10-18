import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schemaSql } from "@/lib/db/schema";
import { openPglite } from "@/lib/db/pglite";
import type { Database } from "@/lib/db/types";
import { seedDemo } from "@/lib/seed/demo";
import { insertEvent } from "@/lib/yard/event-store";
import { performCheckIn, performCheckOut } from "@/lib/yard/operations";
import { createEvent } from "@/lib/domain/events";

let db: Database;

beforeAll(async () => {
  db = await openPglite();
  await db.exec(schemaSql());
  await seedDemo(db);
});

afterAll(async () => {
  await db.close();
});

describe("yard database", () => {
  it("checks in a mismatched trailer, flags the seal on the way out, and keeps events append-only", async () => {
    const checked = await performCheckIn(db, {
      trailerNumber: "MP-3310",
      scac: "MNPR",
      carrierName: "Moonpier Drayage",
      driverName: "Samir Holt",
      tractorNumber: "T-88",
      loadId: "LD-2404",
      loadType: "inbound",
      emptyOrLoaded: "loaded",
      sealNumber: "SL-44041",
      appointmentId: "APT-2404",
      preferredPlace: "A05",
      source: "manual",
    });

    expect(checked.flags.map((flag) => flag.code)).toContain("id_mismatch");
    const mismatch = checked.events.find((event) => event.eventType === "id.mismatch");
    expect(mismatch).toBeTruthy();
    expect(mismatch?.trailerNumber).toBe("MP-3310");
    expect(mismatch?.scac).toBe("MNPR");
    expect(mismatch?.appointmentId).toBe("APT-2404");
    expect(mismatch?.loadId).toBe("LD-2404");
    expect(mismatch?.location).toMatch(/A05/);
    expect(mismatch?.occurredAt.endsWith("Z")).toBe(true);
    expect(mismatch?.source).toBe("manual");
    expect(checked.events.some((event) => event.eventType === "gate.check_in")).toBe(true);

    const replay = await insertEvent(db, mismatch!);
    expect(replay).toBe("replayed");

    const forged = createEvent({
      ...mismatch!,
      id: mismatch!.id,
      location: "Door D01",
      payload: mismatch!.payload,
    });
    await expect(insertEvent(db, forged)).rejects.toThrow(/different body/);

    const out = await performCheckOut(db, {
      visitId: checked.visitId!,
      sealOut: "SL-44042",
      source: "manual",
    });
    const seal = out.events.find((event) => event.eventType === "seal.mismatch");
    expect(seal?.payload).toMatchObject({ sealIn: "SL-44041", sealOut: "SL-44042" });
    expect(out.events.some((event) => event.eventType === "gate.check_out")).toBe(true);

    await expect(
      db.query(`update events set location = 'tampered' where id = $1`, [mismatch!.id]),
    ).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from events where id = $1`, [mismatch!.id])).rejects.toThrow(
      /append-only/,
    );
  });
});
