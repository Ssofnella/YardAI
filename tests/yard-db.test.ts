import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schemaSql } from "@/lib/db/schema";
import { openPglite } from "@/lib/db/pglite";
import type { Database } from "@/lib/db/types";
import { seedDemo } from "@/lib/seed/demo";
import { insertEvent } from "@/lib/yard/event-store";
import { clearReeferFlag, performCheckIn, performCheckOut } from "@/lib/yard/operations";
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

  it("holds a bad seal, ignores a repeated command, and blocks a gate role from clearing TEMP", async () => {
    const commandId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const held = await performCheckIn(db, {
      commandId,
      eventId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      trailerNumber: "HL-44121",
      scac: "HRBR",
      carrierName: "Harborlight Freight",
      sealNumber: "SL-99999",
      sealDecision: "hold",
      sealReason: "Number mismatch",
      loadType: "inbound",
      emptyOrLoaded: "loaded",
      appointmentId: "APT-2401",
      source: "manual",
      arrivedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      arrivalReason: "Queue",
    });
    expect(held.flags.map((flag) => flag.code)).toEqual(expect.arrayContaining(["seal_mismatch", "hold"]));
    expect(held.events.some((event) => event.eventType === "hold.placed")).toBe(true);
    expect(held.events.some((event) => event.eventType === "seal.mismatch")).toBe(true);
    expect(held.events.find((event) => event.eventType === "gate.check_in")?.id).toBe(
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    expect(held.events[0]?.payload.configVersion).toBe(1);
    expect(held.events[0]?.location).toMatch(/H0/);

    const replay = await performCheckIn(db, {
      commandId,
      trailerNumber: "HL-44121",
      scac: "HRBR",
      sealNumber: "SL-99999",
      sealDecision: "hold",
      sealReason: "Number mismatch",
      source: "manual",
    });
    expect(replay.duplicate).toBe(true);
    expect(replay.events).toHaveLength(0);

    const hot = await performCheckIn(db, {
      trailerNumber: "PKC-2204",
      scac: "PNCN",
      carrierName: "Pinecone Logistics",
      isReefer: true,
      setpointF: 34,
      tempF: 40,
      fuelLevel: "1/4",
      unitRunning: true,
      sealNumber: "SL-24021",
      loadType: "inbound",
      emptyOrLoaded: "loaded",
      appointmentId: "APT-2402",
      preferredPlace: "R02",
      source: "manual",
    });
    expect(hot.flags.map((flag) => flag.code)).toContain("reefer_temp");
    await expect(
      clearReeferFlag(db, { visitId: hot.visitId!, role: "gate", reason: "Looks fine", source: "manual" }),
    ).rejects.toThrow(/cannot clear/);
    const cleared = await clearReeferFlag(db, {
      visitId: hot.visitId!,
      role: "office",
      reason: "Product was still frozen",
      source: "manual",
    });
    expect(cleared.events[0]?.eventType).toBe("reefer.cleared");
    expect(cleared.flags.some((flag) => flag.code === "reefer_temp")).toBe(false);
  });
});
