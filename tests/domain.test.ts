import { describe, expect, it } from "vitest";
import { defaultSnapshot, validateSnapshot } from "@/lib/domain/config";
import { dwellMinutes, formatDwell } from "@/lib/domain/dwell";
import {
  EventConflictError,
  EventValidationError,
  assertReplay,
  canonicalEvent,
  createEvent,
  type CreateEventInput,
} from "@/lib/domain/events";
import { matchArrival } from "@/lib/domain/matching";
import { reeferAlerts } from "@/lib/domain/reefer";
import { checkSeals, normalizeSeal } from "@/lib/domain/seals";
import { shiftStartUtc, zonedTimeToUtc } from "@/lib/domain/time";
import { DAY_SCRIPT, buildDayPlan } from "@/lib/simulator/script";

const SITE = "22222222-2222-4222-8222-222222222222";
const COMPANY = "11111111-1111-4111-8111-111111111111";

function event(overrides: Partial<CreateEventInput> = {}) {
  return createEvent({
    siteId: SITE,
    companyId: COMPANY,
    eventType: "gate.check_in",
    trailerNumber: "HL-44121",
    scac: "hrbr",
    loadId: "LD-2401",
    appointmentId: "APT-2401",
    location: "Spot A01",
    occurredAt: "2026-10-18T15:00:00.000Z",
    source: "manual",
    ...overrides,
  });
}

describe("events", () => {
  it("stamps UTC, uppercases SCAC, and freezes the record", () => {
    const row = event({ occurredAt: "2026-10-18T10:00:00-05:00" });
    expect(row.id).toMatch(/[0-9a-f-]{36}/);
    expect(row.scac).toBe("HRBR");
    expect(row.occurredAt).toBe("2026-10-18T15:00:00.000Z");
    expect(Object.isFrozen(row)).toBe(true);
    expect(() => {
      (row as { scac: string }).scac = "NOPE";
    }).toThrow();
  });

  it("rejects a gate event without a trailer number or a bad source", () => {
    expect(() => event({ trailerNumber: "  " })).toThrow(EventValidationError);
    expect(() => event({ source: "camera" as "manual" })).toThrow(EventValidationError);
    expect(() => event({ occurredAt: "not-a-date" })).toThrow(/Invalid timestamp/);
  });

  it("lets config events omit trailer identity", () => {
    const row = createEvent({
      siteId: SITE,
      companyId: COMPANY,
      eventType: "config.published",
      occurredAt: new Date("2026-10-18T12:00:00Z"),
      source: "manual",
      payload: { version: 2 },
    });
    expect(row.trailerNumber).toBeNull();
    expect(row.scac).toBeNull();
    expect(row.payload).toEqual({ version: 2 });
  });

  it("treats an identical id as a replay and a changed body as a conflict", () => {
    const first = event({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const replay = event({
      id: first.id,
      scac: "HRBR",
      occurredAt: first.occurredAt,
    });
    expect(canonicalEvent(first)).toBe(canonicalEvent(replay));
    expect(() => assertReplay(first, replay)).not.toThrow();
    const changed = event({ id: first.id, location: "Door D02" });
    expect(() => assertReplay(first, changed)).toThrow(EventConflictError);
  });
});

describe("seals", () => {
  it("ignores case, spaces, and dashes", () => {
    expect(normalizeSeal(" sl-44041 ")).toBe("SL44041");
    expect(checkSeals("SL-44041", "sl 44041").mismatch).toBe(false);
  });

  it("flags a different seal, a missing outbound seal, and ignores two blanks", () => {
    expect(checkSeals("SL-44041", "SL-44042").mismatch).toBe(true);
    expect(checkSeals("SL-44041", "").mismatch).toBe(true);
    expect(checkSeals("", "   ").mismatch).toBe(false);
    expect(checkSeals(null, null).mismatch).toBe(false);
  });
});

describe("matching", () => {
  const arrivals = [
    {
      id: "appt-1",
      appointmentCode: "APT-2404",
      trailerNumber: "MP-3309",
      scac: "MNPR",
      loadId: "LD-2404",
      carrierName: "Moonpier Drayage",
    },
    {
      id: "appt-2",
      appointmentCode: "APT-2401",
      trailerNumber: "HL-44121",
      scac: "HRBR",
      loadId: "LD-2401",
      carrierName: "Harborlight Freight",
    },
  ];

  it("matches the selected appointment and flags a trailer number that does not agree", () => {
    const result = matchArrival(
      { trailerNumber: "MP-3310", scac: "MNPR", loadId: "LD-2404", appointmentId: "APT-2404" },
      arrivals,
    );
    expect(result.matchMethod).toBe("appointment_id");
    expect(result.idMismatch).toBe(true);
    expect(result.reasons[0]).toMatch(/MP-3310/);
    expect(result.reasons[0]).toMatch(/MP-3309/);
  });

  it("matches trailer plus SCAC with no flag", () => {
    const result = matchArrival({ trailerNumber: "hl44121", scac: "hrbr" }, arrivals);
    expect(result.matchMethod).toBe("trailer_and_scac");
    expect(result.idMismatch).toBe(false);
    expect(result.appointment?.appointmentCode).toBe("APT-2401");
  });

  it("matches a load id and flags a disagreeing SCAC", () => {
    const result = matchArrival(
      { trailerNumber: "MP-3309", scac: "HRBR", loadId: "LD-2404" },
      arrivals,
    );
    expect(result.matchMethod).toBe("load_id");
    expect(result.idMismatch).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/SCAC/);
  });

  it("flags a trailer-only match when the SCAC belongs to someone else", () => {
    const result = matchArrival({ trailerNumber: "MP-3309", scac: "HRBR" }, arrivals);
    expect(result.matchMethod).toBe("trailer_only");
    expect(result.idMismatch).toBe(true);
  });

  it("returns no match for a walk-up the yard is not expecting", () => {
    const result = matchArrival({ trailerNumber: "ZZ-1", scac: "ZZZZ" }, arrivals);
    expect(result.matchMethod).toBe("none");
    expect(result.idMismatch).toBe(false);
  });
});

describe("reefer alerts and dwell", () => {
  const limits = { tempToleranceF: 5, minFuelPct: 25 };

  it("alerts when temperature or fuel is outside the site limits", () => {
    const hot = reeferAlerts({ isReefer: true, setpointF: 34, tempF: 47, fuelPct: 18 }, limits);
    expect(hot.tempOutOfRange).toBe(true);
    expect(hot.fuelLow).toBe(true);
    const ok = reeferAlerts({ isReefer: true, setpointF: 34, tempF: 36, fuelPct: 40 }, limits);
    expect(ok.outOfRange).toBe(false);
    const dry = reeferAlerts({ isReefer: false, setpointF: null, tempF: 90, fuelPct: 0 }, limits);
    expect(dry.outOfRange).toBe(false);
  });

  it("counts dwell in minutes and clamps a checkout that is the end of the visit", () => {
    expect(dwellMinutes("2026-10-18T11:00:00Z", "2026-10-18T12:30:00Z")).toBe(90);
    expect(
      dwellMinutes("2026-10-18T11:00:00Z", "2026-10-18T18:00:00Z", "2026-10-18T12:00:00Z"),
    ).toBe(60);
    expect(formatDwell(90)).toBe("1h 30m");
    expect(formatDwell(12)).toBe("12m");
  });
});

describe("site clock", () => {
  it("stores Chicago wall time as UTC", () => {
    expect(zonedTimeToUtc(2026, 10, 18, 6, 0, "America/Chicago").toISOString()).toBe(
      "2026-10-18T11:00:00.000Z",
    );
    expect(zonedTimeToUtc(2026, 1, 15, 6, 0, "America/Chicago").toISOString()).toBe(
      "2026-01-15T12:00:00.000Z",
    );
    const start = shiftStartUtc(new Date("2026-10-18T18:00:00.000Z"), "America/Chicago");
    expect(start.toISOString()).toBe("2026-10-18T11:00:00.000Z");
  });
});

describe("config and the simulated day", () => {
  it("publishes a 20-door yard and rejects a form that hides the trailer number", () => {
    const snapshot = defaultSnapshot();
    expect(snapshot.doors).toHaveLength(20);
    expect(snapshot.spots.length).toBeGreaterThan(20);
    expect(snapshot.checkInFields.some((field) => field.key === "po_number" && !field.builtin)).toBe(
      true,
    );
    const broken = structuredClone(snapshot);
    const trailer = broken.checkInFields.find((field) => field.key === "trailer_number");
    trailer!.enabled = false;
    expect(() => validateSnapshot(broken)).toThrow(/Trailer number/);
  });

  it("plans late arrivals, no-shows, a reefer alarm, an ID mismatch, and a seal mismatch", () => {
    const { steps, dayEnd } = buildDayPlan(new Date("2026-10-18T11:00:00.000Z"));
    expect(dayEnd.toISOString()).toBe("2026-10-18T23:00:00.000Z");
    expect(steps.map((step) => step.at).join(",")).toBe([...steps].map((step) => step.at).sort().join(","));
    expect(DAY_SCRIPT.some((stop) => stop.exceptions.includes("no_show"))).toBe(true);
    expect(DAY_SCRIPT.some((stop) => stop.exceptions.includes("late") && (stop.arriveOffsetMin ?? 0) >= 30)).toBe(
      true,
    );
    expect(DAY_SCRIPT.some((stop) => stop.exceptions.includes("reefer") && (stop.tempF ?? 0) > 40)).toBe(
      true,
    );
    expect(DAY_SCRIPT.some((stop) => stop.checkInTrailer && stop.checkInTrailer !== stop.trailerNumber)).toBe(
      true,
    );
    expect(DAY_SCRIPT.some((stop) => stop.sealOut && stop.sealOut !== stop.sealIn)).toBe(true);
    expect(steps.some((step) => step.kind === "no_show")).toBe(true);
    expect(steps.some((step) => step.kind === "check_out")).toBe(true);
  });
});
