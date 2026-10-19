import type { SiteConfigSnapshot } from "@/lib/domain/config";
import { validateSnapshot } from "@/lib/domain/config";
import { asIso, asJson, asNumber, asText } from "@/lib/db/json";
import type { Sql } from "@/lib/db/types";
import { YardError } from "@/lib/db/types";

export type SiteContext = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  timezone: string;
  currentConfigId: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  onboardedAt: string | null;
};

export type ConfigRecord = {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  snapshot: SiteConfigSnapshot;
};

export type Clock = {
  asOf: string;
  mode: "wall" | "sim";
  status: "idle" | "running" | "paused" | "done";
  speed: number;
  dayStart: string | null;
  dayEnd: string | null;
  lastError: string | null;
};

export async function requireSite(sql: Sql): Promise<SiteContext> {
  const rows = await sql.query<Record<string, unknown>>(
    `select s.id, s.company_id, s.name, s.timezone, s.current_config_id, c.name as company_name,
            s.address, s.latitude, s.longitude, s.onboarded_at
     from sites s
     join companies c on c.id = s.company_id
     order by s.created_at
     limit 1`,
  );
  const row = rows[0];
  if (!row) throw new YardError("No site is set up yet", 500);
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    companyName: String(row.company_name),
    name: String(row.name),
    timezone: String(row.timezone),
    currentConfigId: asText(row.current_config_id),
    address: asText(row.address),
    latitude: asNumber(row.latitude),
    longitude: asNumber(row.longitude),
    onboardedAt: asIso(row.onboarded_at),
  };
}

export async function loadConfig(sql: Sql, site: SiteContext): Promise<ConfigRecord> {
  if (!site.currentConfigId) throw new YardError("This site has no published config", 500);
  const rows = await sql.query<Record<string, unknown>>(
    `select id, version, note, snapshot, created_at from site_configs where id = $1`,
    [site.currentConfigId],
  );
  const row = rows[0];
  if (!row) throw new YardError("Published config is missing", 500);
  return {
    id: String(row.id),
    version: Number(row.version),
    note: asText(row.note),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
    snapshot: validateSnapshot(asJson<SiteConfigSnapshot>(row.snapshot, {} as SiteConfigSnapshot)),
  };
}

export async function readClock(sql: Sql, siteId: string): Promise<Clock> {
  const rows = await sql.query<Record<string, unknown>>(
    `select status, speed, day_start, day_end, sim_now, last_error from sim_state where site_id = $1`,
    [siteId],
  );
  const row = rows[0];
  const wall = new Date().toISOString();
  if (!row || row.status === "idle" || !row.sim_now) {
    return {
      asOf: wall,
      mode: "wall",
      status: (row?.status as Clock["status"]) || "idle",
      speed: asNumber(row?.speed) ?? 4,
      dayStart: asIso(row?.day_start),
      dayEnd: asIso(row?.day_end),
      lastError: asText(row?.last_error),
    };
  }
  return {
    asOf: asIso(row.sim_now) ?? wall,
    mode: "sim",
    status: String(row.status) as Clock["status"],
    speed: asNumber(row.speed) ?? 4,
    dayStart: asIso(row.day_start),
    dayEnd: asIso(row.day_end),
    lastError: asText(row.last_error),
  };
}

export async function occupiedLocationIds(sql: Sql, siteId: string): Promise<Set<string>> {
  const rows = await sql.query<{ location_id: string }>(
    `select location_id from visits
     where site_id = $1 and checked_out_at is null and location_id is not null`,
    [siteId],
  );
  return new Set(rows.map((row) => row.location_id));
}
