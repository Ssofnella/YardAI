import { asIso, asJson, asNumber, asText } from "@/lib/db/json";
import type { Database } from "@/lib/db/types";
import { getDatabase } from "@/lib/db/client";
import { DEMO_SITE_ID } from "@/lib/demo/ids";
import { resetOperational } from "@/lib/seed/demo";
import { shiftStartUtc } from "@/lib/domain/time";
import { activeProvider } from "@/lib/ai/provider";
import { optimizeInput, recommendInput } from "@/lib/ai/snapshot";
import {
  assignDoor,
  completeDoorWork,
  logSiteSuggestion,
  markNoShow,
  performCheckIn,
  performCheckOut,
} from "@/lib/yard/operations";
import { requireSite } from "@/lib/yard/context";
import { buildDayPlan, stopByCode, type SimStep } from "@/lib/simulator/script";

type SimRow = {
  status: string;
  speed: number;
  day_start: unknown;
  day_end: unknown;
  sim_now: unknown;
  plan: unknown;
  done_ids: unknown;
  last_error: string | null;
};

type Slot = { timer: NodeJS.Timeout | null; ticking: boolean; lastTick: number };
const globalSlot = globalThis as { __yardlineSim?: Slot };

function slot(): Slot {
  if (!globalSlot.__yardlineSim) {
    globalSlot.__yardlineSim = { timer: null, ticking: false, lastTick: Date.now() };
  }
  return globalSlot.__yardlineSim;
}

const SPEEDS = [1, 2, 4, 8, 16];

export function normalizeSpeed(speed: number): number {
  const nearest = SPEEDS.reduce((best, item) =>
    Math.abs(item - speed) < Math.abs(best - speed) ? item : best,
  );
  return nearest;
}

export async function controlSimulator(action: string, speed?: number): Promise<{ message: string }> {
  const db = await getDatabase();
  if (action === "reset") {
    stopTimer();
    await resetOperational(db);
    return { message: "Yard reset to this morning. Overnight trailers are back on their spots." };
  }
  if (action === "pause") {
    await db.query(
      `update sim_state set status = 'paused', updated_at = now() where site_id = $1 and status = 'running'`,
      [DEMO_SITE_ID],
    );
    stopTimer();
    return { message: "Simulator paused." };
  }
  if (action === "speed" && speed) {
    await db.query(`update sim_state set speed = $2, updated_at = now() where site_id = $1`, [
      DEMO_SITE_ID,
      normalizeSpeed(speed),
    ]);
    return { message: `Speed set to ${normalizeSpeed(speed)} simulated minutes per second.` };
  }
  if (action === "start" || action === "resume" || action === "replay") {
    const existing = await readSim(db);
    if (action === "replay" || (action === "start" && existing?.status === "done")) {
      stopTimer();
      await resetOperational(db);
    }
    await ensurePlan(db, speed ? normalizeSpeed(speed) : undefined);
    await db.query(
      `update sim_state set status = 'running', updated_at = now() where site_id = $1`,
      [DEMO_SITE_ID],
    );
    startTimer();
    return {
      message:
        action === "replay"
          ? "Playing the shift again from 6:00."
          : "Playing the shift.",
    };
  }
  throw new Error("Unknown simulator action");
}

export function ensureRunner(): void {
  void getDatabase()
    .then(async (db) => {
      const row = await readSim(db);
      if (row?.status === "running") startTimer();
    })
    .catch(() => undefined);
}

async function ensurePlan(db: Database, speed?: number) {
  const site = await requireSite(db);
  const row = await readSim(db);
  const dayStart = shiftStartUtc(new Date(), site.timezone, 6);
  const { steps, dayEnd } = buildDayPlan(dayStart);
  const needsPlan =
    !row || row.status === "idle" || row.status === "done" || !Array.isArray(asJson(row.plan, []));
  if (!row) {
    await db.query(
      `insert into sim_state (site_id, status, speed, day_start, day_end, sim_now, plan, done_ids)
       values ($1, 'paused', $2, $3, $4, $3, $5::jsonb, '[]'::jsonb)`,
      [site.id, speed ?? 4, dayStart.toISOString(), dayEnd.toISOString(), JSON.stringify(steps)],
    );
    return;
  }
  if (needsPlan || row.status === "done") {
    await db.query(
      `update sim_state
       set speed = $2, day_start = $3, day_end = $4, sim_now = $3, plan = $5::jsonb,
           done_ids = '[]'::jsonb, last_error = null, status = 'paused', updated_at = now()
       where site_id = $1`,
      [site.id, speed ?? row.speed ?? 4, dayStart.toISOString(), dayEnd.toISOString(), JSON.stringify(steps)],
    );
    return;
  }
  if (speed) {
    await db.query(`update sim_state set speed = $2 where site_id = $1`, [site.id, speed]);
  }
}

function startTimer() {
  const current = slot();
  if (current.timer) return;
  current.timer = setInterval(() => {
    void tick();
  }, 250);
}

function stopTimer() {
  const current = slot();
  if (current.timer) clearInterval(current.timer);
  current.timer = null;
}

export async function tick(): Promise<void> {
  const current = slot();
  if (current.ticking) return;
  current.ticking = true;
  try {
    const db = await getDatabase();
    const row = await readSim(db);
    if (!row || row.status !== "running" || !row.sim_now || !row.day_end) {
      if (row?.status !== "running") stopTimer();
      return;
    }
    const speed = row.speed || 4;
    const elapsed = Math.min(1000, Math.max(50, Date.now() - current.lastTick));
    current.lastTick = Date.now();
    const advanceMs = speed * 60_000 * (elapsed / 1000);
    const currentNow = new Date(asIso(row.sim_now) ?? Date.now());
    const end = new Date(asIso(row.day_end) ?? currentNow);
    let next = new Date(currentNow.getTime() + advanceMs);
    if (next > end) next = end;
    const plan = asJson<SimStep[]>(row.plan, []);
    const done = new Set(asJson<string[]>(row.done_ids, []));
    const due = plan.filter((step) => !done.has(step.id) && new Date(step.at) <= next);
    let lastError = row.last_error;
    for (const step of due) {
      try {
        await applyScriptStep(db, step);
        lastError = null;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Simulator step failed";
      }
      done.add(step.id);
    }
    const finished = next >= end;
    await db.query(
      `update sim_state
       set sim_now = $2, done_ids = $3::jsonb, last_error = $4, status = $5, updated_at = now()
       where site_id = $1`,
      [
        DEMO_SITE_ID,
        next.toISOString(),
        JSON.stringify([...done]),
        lastError,
        finished ? "done" : "running",
      ],
    );
    if (finished) stopTimer();
  } finally {
    current.ticking = false;
  }
}

export async function applyScriptStep(db: Database, step: SimStep) {
  const stop = stopByCode(step.appointmentCode);
  if (!stop) throw new Error(`Missing script for ${step.appointmentCode}`);
  if (step.kind === "no_show") {
    await markNoShow(db, { appointmentCode: stop.code, occurredAt: step.at, source: "simulator" });
    return;
  }
  if (step.kind === "check_in") {
    const plannedAt = new Date(new Date(step.at).getTime() - stop.arriveOffsetMin * 60_000).toISOString();
    const suggestion = await arrivalSuggestion(db, step.at, stop, plannedAt);
    await performCheckIn(db, {
      trailerNumber: stop.checkInTrailer ?? stop.trailerNumber,
      scac: stop.checkInScac ?? stop.scac,
      carrierName: stop.carrierName,
      driverName: stop.driverName,
      tractorNumber: stop.tractorNumber,
      loadId: stop.loadId,
      loadType: stop.loadType,
      emptyOrLoaded: stop.emptyOrLoaded,
      isReefer: stop.isReefer,
      setpointF: stop.setpointF,
      tempF: stop.tempF ?? null,
      fuelPct: stop.fuelPct ?? null,
      sealNumber: stop.sealIn,
      appointmentId: stop.code,
      locationKind: stop.liveDoor ? "door" : "spot",
      preferredPlace: stop.liveDoor ? stop.doorName : stop.spotName,
      occurredAt: step.at,
      source: "simulator",
      ai: suggestion,
    });
    return;
  }
  if (step.kind === "to_door") {
    await assignDoor(db, {
      appointmentCode: stop.code,
      doorName: stop.doorName,
      occurredAt: step.at,
      source: "simulator",
      fallback: true,
    });
    return;
  }
  if (step.kind === "work_done") {
    await completeDoorWork(db, {
      appointmentCode: stop.code,
      occurredAt: step.at,
      source: "simulator",
    });
    await logOptimizePass(db, step.at, step.id);
    return;
  }
  await performCheckOut(db, {
    visitId: await visitIdFor(db, stop.code),
    sealOut: stop.sealOut ?? stop.sealIn,
    occurredAt: step.at,
    source: "simulator",
  });
}

async function arrivalSuggestion(
  db: Database,
  now: string,
  stop: NonNullable<ReturnType<typeof stopByCode>>,
  plannedAt: string,
) {
  try {
    const rec = await activeProvider().recommend(
      await recommendInput(db, now, {
        isReefer: stop.isReefer,
        loadType: stop.loadType,
        emptyOrLoaded: stop.emptyOrLoaded,
        plannedAt,
        handling: stop.liveDoor ? "live" : "drop",
      }),
    );
    const scripted = (stop.liveDoor ? stop.doorName : stop.spotName) ?? "";
    return {
      suggestionId: rec.suggestionId,
      placeKind: rec.place.kind,
      placeId: rec.place.id,
      placeName: rec.place.name,
      reason: rec.reason,
      provider: rec.provider,
      accepted: scripted.toLowerCase() === rec.place.name.toLowerCase(),
    };
  } catch {
    return null;
  }
}

async function logOptimizePass(db: Database, now: string, stepId: string) {
  try {
    const plan = await activeProvider().optimize(await optimizeInput(db, now));
    if (!plan.moves.length) return;
    await logSiteSuggestion(db, {
      kind: "optimize",
      suggestionId: `opt:${stepId}`,
      source: "simulator",
      occurredAt: now,
      payload: {
        provider: plan.provider,
        reason: plan.moves[0]?.reason ?? "Yard scan",
        moves: plan.moves.map((move) => ({
          id: move.id,
          visitId: move.visitId,
          trailerNumber: move.trailerNumber,
          scac: move.scac,
          fromName: move.fromName,
          toName: move.to.name,
          toId: move.to.id,
          toKind: move.to.kind,
          kind: move.kind,
          reason: move.reason,
          detentionMinutes: move.benefit.detentionMinutes,
          dockIdleMinutes: move.benefit.dockIdleMinutes,
        })),
      },
    });
  } catch {
    // A suggestion must not stop the scripted move.
  }
}

async function visitIdFor(db: Database, code: string): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `select id from visits where appointment_code = $1 and checked_out_at is null order by checked_in_at desc limit 1`,
    [code],
  );
  if (!rows[0]) throw new Error(`No on-site visit for ${code}`);
  return rows[0].id;
}

async function readSim(db: Database): Promise<(SimRow & { speed: number }) | null> {
  const rows = await db.query<Record<string, unknown>>(
    `select status, speed, day_start, day_end, sim_now, plan, done_ids, last_error
     from sim_state where site_id = $1`,
    [DEMO_SITE_ID],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    status: String(row.status),
    speed: asNumber(row.speed) ?? 4,
    day_start: row.day_start,
    day_end: row.day_end,
    sim_now: row.sim_now,
    plan: row.plan,
    done_ids: row.done_ids,
    last_error: asText(row.last_error),
  };
}
