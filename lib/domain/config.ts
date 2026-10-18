import type { ReeferLimits } from "@/lib/domain/reefer";

export type DoorType = "dry" | "reefer" | "both";
export type SpotType = "dry" | "reefer" | "staging" | "holding" | "out_of_service";
export type FuelMark = "E" | "1/4" | "1/2" | "3/4" | "F";
export type DeviceType = "ipad_landscape" | "ipad_portrait" | "phone" | "android_tablet";
export type SealMismatchPolicy = "hold" | "allow_with_reason" | "note";
export type YardRole = "admin" | "office" | "gate";

/** Open decisions Allen has not locked. Each one is a published setting. */
export type SitePolicies = {
  deviceType: DeviceType;
  locale: "en" | "es";
  spotsNumbered: boolean;
  gateCount: 1 | 2;
  sealMismatchPolicy: SealMismatchPolicy;
  blindSealEntry: boolean;
  clearTempRoles: YardRole[];
  graceMinutes: number;
  freeTimeMinutes: number;
  warnBeforeMinutes: number;
  lowFuelAtOrBelow: FuelMark;
};

export function defaultPolicies(): SitePolicies {
  return {
    deviceType: "ipad_landscape",
    locale: "en",
    spotsNumbered: true,
    gateCount: 1,
    sealMismatchPolicy: "allow_with_reason",
    blindSealEntry: true,
    clearTempRoles: ["admin", "office"],
    graceMinutes: 30,
    freeTimeMinutes: 120,
    warnBeforeMinutes: 30,
    lowFuelAtOrBelow: "1/4",
  };
}
export type FieldType = "text" | "number" | "photo" | "checkbox" | "dropdown" | "signature";

export type DoorDef = {
  id: string;
  name: string;
  type: DoorType;
  sort: number;
};

export type ZoneDef = {
  id: string;
  name: string;
  sort: number;
};

export type SpotDef = {
  id: string;
  zoneId: string;
  name: string;
  type: SpotType;
  row: number;
  col: number;
};

export type StatusDef = {
  id: string;
  key: string;
  label: string;
  color: string;
  sort: number;
  system?: boolean;
};

export type CheckInField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  builtin: boolean;
  enabled: boolean;
  locked?: boolean;
  options?: string[];
  showWhen?: "always" | "reefer";
};

export type LoadTypeDef = {
  value: string;
  label: string;
};

export type SiteConfigSnapshot = {
  companyName: string;
  siteName: string;
  timezone: string;
  doors: DoorDef[];
  zones: ZoneDef[];
  spots: SpotDef[];
  trailerStatuses: StatusDef[];
  doorStatuses: StatusDef[];
  checkInFields: CheckInField[];
  loadTypes: LoadTypeDef[];
  reefer: ReeferLimits;
  policies: SitePolicies;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DOOR_TYPES = new Set<DoorType>(["dry", "reefer", "both"]);
const SPOT_TYPES = new Set<SpotType>(["dry", "reefer", "staging", "holding", "out_of_service"]);
const FUEL_MARKS = new Set<FuelMark>(["E", "1/4", "1/2", "3/4", "F"]);
const DEVICE_TYPES = new Set<DeviceType>(["ipad_landscape", "ipad_portrait", "phone", "android_tablet"]);
const SEAL_POLICIES = new Set<SealMismatchPolicy>(["hold", "allow_with_reason", "note"]);
const YARD_ROLES = new Set<YardRole>(["admin", "office", "gate"]);
const FIELD_TYPES = new Set<FieldType>([
  "text",
  "number",
  "photo",
  "checkbox",
  "dropdown",
  "signature",
]);

const SYSTEM_TRAILER_KEYS = ["empty", "loaded", "loading", "unloading"];
const SYSTEM_DOOR_KEYS = ["empty", "occupied", "loading", "unloading", "done"];

export function slugKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || "status";
}

function door(n: number, type: DoorType): DoorDef {
  const name = `D${String(n).padStart(2, "0")}`;
  return { id: `door-${name.toLowerCase()}`, name, type, sort: n };
}

function spotRow(
  zoneId: string,
  prefix: string,
  count: number,
  type: SpotType,
  cols = 8,
): SpotDef[] {
  return Array.from({ length: count }, (_, index) => {
    const name = `${prefix}${String(index + 1).padStart(2, "0")}`;
    return {
      id: `spot-${name.toLowerCase()}`,
      zoneId,
      name,
      type,
      row: Math.floor(index / cols),
      col: index % cols,
    };
  });
}

export function defaultSnapshot(): SiteConfigSnapshot {
  const doors: DoorDef[] = [];
  for (let n = 1; n <= 20; n += 1) {
    doors.push(door(n, n <= 6 ? "both" : "dry"));
  }
  return {
    companyName: "Lakeshore Provisions",
    siteName: "Lakeshore DC",
    timezone: "America/Chicago",
    doors,
    zones: [
      { id: "zone-reefer", name: "Reefer row", sort: 1 },
      { id: "zone-a", name: "Drop lot A", sort: 2 },
      { id: "zone-b", name: "Drop lot B", sort: 3 },
      { id: "zone-staging", name: "Staging", sort: 4 },
      { id: "zone-holding", name: "Holding", sort: 5 },
    ],
    spots: [
      ...spotRow("zone-reefer", "R", 10, "reefer", 5),
      ...spotRow("zone-a", "A", 16, "dry"),
      ...spotRow("zone-b", "B", 8, "dry"),
      ...spotRow("zone-staging", "S", 4, "staging", 4),
      ...spotRow("zone-holding", "H", 4, "holding", 4),
    ],
    trailerStatuses: [
      { id: "st-empty", key: "empty", label: "Empty", color: "#047857", sort: 1, system: true },
      { id: "st-loaded", key: "loaded", label: "Loaded", color: "#1e3a8a", sort: 2, system: true },
      { id: "st-loading", key: "loading", label: "Loading", color: "#c2410c", sort: 3, system: true },
      {
        id: "st-unloading",
        key: "unloading",
        label: "Unloading",
        color: "#b45309",
        sort: 4,
        system: true,
      },
      { id: "st-hold", key: "hold", label: "Hold", color: "#9f1239", sort: 5 },
      {
        id: "st-oos",
        key: "out_of_service",
        label: "Out of service",
        color: "#57534e",
        sort: 6,
      },
    ],
    doorStatuses: [
      { id: "ds-empty", key: "empty", label: "Empty", color: "#047857", sort: 1, system: true },
      { id: "ds-occupied", key: "occupied", label: "Occupied", color: "#1d4ed8", sort: 2, system: true },
      { id: "ds-loading", key: "loading", label: "Loading", color: "#c2410c", sort: 3, system: true },
      {
        id: "ds-unloading",
        key: "unloading",
        label: "Unloading",
        color: "#b45309",
        sort: 4,
        system: true,
      },
      { id: "ds-done", key: "done", label: "Done", color: "#44403c", sort: 5, system: true },
    ],
    checkInFields: defaultCheckInFields(),
    loadTypes: [
      { value: "inbound", label: "Inbound" },
      { value: "outbound", label: "Outbound" },
      { value: "transfer", label: "Transfer" },
    ],
    reefer: { tempToleranceF: 5, minFuelPct: 25 },
    policies: defaultPolicies(),
  };
}

export function defaultCheckInFields(): CheckInField[] {
  return [
    field("f-trailer", "trailer_number", "Trailer number", "text", true, true),
    field("f-tractor", "tractor_number", "Tractor number", "text", false),
    field("f-carrier", "carrier_name", "Carrier", "text", true, true),
    field("f-scac", "scac", "SCAC", "text", true, true),
    field("f-driver", "driver_name", "Driver", "text", false),
    field("f-seal", "seal_number", "Seal number", "text", false),
    field("f-load-type", "load_type", "Load type", "dropdown", true),
    field("f-load", "load_id", "Load ID", "text", false),
    field("f-empty", "empty_or_loaded", "Empty or loaded", "dropdown", true),
    field("f-reefer", "is_reefer", "Reefer", "checkbox", false),
    field("f-setpoint", "setpoint_f", "Set point (°F)", "number", false, false, "reefer"),
    field("f-temp", "temp_f", "Actual temperature (°F)", "number", false, false, "reefer"),
    field("f-fuel", "fuel_pct", "Fuel (%)", "number", false, false, "reefer"),
    field("f-photo", "photo", "Photo", "photo", false),
    field("f-po", "po_number", "PO number", "text", false, false, "always", false),
  ];
}

function field(
  id: string,
  key: string,
  label: string,
  type: FieldType,
  required: boolean,
  locked = false,
  showWhen: "always" | "reefer" = "always",
  builtin = true,
): CheckInField {
  const base: CheckInField = {
    id,
    key,
    label,
    type,
    required: locked ? true : required,
    builtin,
    enabled: true,
    locked,
    showWhen,
  };
  if (key === "empty_or_loaded") base.options = ["loaded", "empty"];
  return base;
}

export function validateSnapshot(input: SiteConfigSnapshot): SiteConfigSnapshot {
  const snapshot = structuredClone(input);
  if (!snapshot.siteName?.trim()) throw new ConfigError("Site name is required");
  if (!snapshot.companyName?.trim()) throw new ConfigError("Company name is required");
  if (!snapshot.timezone?.trim()) throw new ConfigError("Timezone is required");
  try {
    Intl.DateTimeFormat("en-US", { timeZone: snapshot.timezone });
  } catch {
    throw new ConfigError(`Unknown timezone ${snapshot.timezone}`);
  }
  if (!snapshot.doors?.length) throw new ConfigError("Add at least one door");
  assertUnique(snapshot.doors.map((door) => door.name.trim().toLowerCase()), "door names");
  for (const door of snapshot.doors) {
    if (!door.name.trim()) throw new ConfigError("Every door needs a name");
    if (!DOOR_TYPES.has(door.type)) throw new ConfigError(`Door ${door.name} has an unknown type`);
  }
  if (!snapshot.zones?.length) throw new ConfigError("Add at least one yard zone");
  if (!snapshot.spots?.length) throw new ConfigError("Add at least one yard spot");
  const zoneIds = new Set(snapshot.zones.map((zone) => zone.id));
  assertUnique(snapshot.spots.map((spot) => spot.name.trim().toLowerCase()), "spot names");
  for (const spot of snapshot.spots) {
    if (!spot.name.trim()) throw new ConfigError("Every spot needs a name");
    if (!zoneIds.has(spot.zoneId)) {
      throw new ConfigError(`Spot ${spot.name} points at a missing zone`);
    }
    if (!SPOT_TYPES.has(spot.type)) throw new ConfigError(`Spot ${spot.name} has an unknown type`);
  }
  assertStatuses(snapshot.trailerStatuses, SYSTEM_TRAILER_KEYS, "trailer");
  assertStatuses(snapshot.doorStatuses, SYSTEM_DOOR_KEYS, "door");
  if (!snapshot.checkInFields?.length) throw new ConfigError("The check-in form needs fields");
  const trailerField = snapshot.checkInFields.find((item) => item.key === "trailer_number");
  const scacField = snapshot.checkInFields.find((item) => item.key === "scac");
  if (!trailerField?.enabled || !trailerField.required) {
    throw new ConfigError("Trailer number stays required");
  }
  if (!scacField?.enabled || !scacField.required) {
    throw new ConfigError("SCAC stays required");
  }
  const keys = snapshot.checkInFields.map((item) => item.key);
  assertUnique(keys, "form field keys");
  for (const item of snapshot.checkInFields) {
    if (!FIELD_TYPES.has(item.type)) throw new ConfigError(`Unknown field type ${item.type}`);
    if (!item.label.trim()) throw new ConfigError("Every form field needs a label");
    if (item.type === "dropdown" && item.key !== "load_type" && !item.options?.length) {
      throw new ConfigError(`${item.label} needs at least one option`);
    }
  }
  if (!snapshot.loadTypes?.length) throw new ConfigError("Add at least one load type");
  const tolerance = Number(snapshot.reefer?.tempToleranceF);
  const fuel = Number(snapshot.reefer?.minFuelPct);
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 40) {
    throw new ConfigError("Reefer temperature tolerance must be between 0 and 40°F");
  }
  if (!Number.isFinite(fuel) || fuel < 0 || fuel > 100) {
    throw new ConfigError("Reefer fuel floor must be between 0 and 100%");
  }
  snapshot.reefer = { tempToleranceF: tolerance, minFuelPct: fuel };
  snapshot.policies = normalizePolicies(snapshot.policies);
  snapshot.siteName = snapshot.siteName.trim();
  snapshot.companyName = snapshot.companyName.trim();
  return snapshot;
}

function assertStatuses(statuses: StatusDef[], required: string[], kind: string) {
  if (!statuses?.length) throw new ConfigError(`Add at least one ${kind} status`);
  assertUnique(
    statuses.map((status) => status.key),
    `${kind} status keys`,
  );
  for (const key of required) {
    if (!statuses.some((status) => status.key === key)) {
      throw new ConfigError(`${kind} statuses must include ${key}`);
    }
  }
  for (const status of statuses) {
    if (!status.label.trim()) throw new ConfigError(`A ${kind} status is missing its label`);
    if (!/^#[0-9a-fA-F]{6}$/.test(status.color)) {
      throw new ConfigError(`${status.label} needs a hex color`);
    }
  }
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new ConfigError(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function normalizePolicies(input: Partial<SitePolicies> | null | undefined): SitePolicies {
  const base = defaultPolicies();
  const source = input ?? {};
  const roles = Array.isArray(source.clearTempRoles)
    ? source.clearTempRoles.filter((role): role is YardRole => YARD_ROLES.has(role as YardRole))
    : base.clearTempRoles;
  const grace = clampNumber(source.graceMinutes, base.graceMinutes, 0, 240);
  const freeTime = clampNumber(source.freeTimeMinutes, base.freeTimeMinutes, 0, 1440);
  const warn = clampNumber(source.warnBeforeMinutes, base.warnBeforeMinutes, 0, freeTime || 1440);
  return {
    deviceType: DEVICE_TYPES.has(source.deviceType as DeviceType)
      ? (source.deviceType as DeviceType)
      : base.deviceType,
    locale: source.locale === "es" ? "es" : "en",
    spotsNumbered: source.spotsNumbered !== false,
    gateCount: source.gateCount === 2 ? 2 : 1,
    sealMismatchPolicy: SEAL_POLICIES.has(source.sealMismatchPolicy as SealMismatchPolicy)
      ? (source.sealMismatchPolicy as SealMismatchPolicy)
      : base.sealMismatchPolicy,
    blindSealEntry: source.blindSealEntry !== false,
    clearTempRoles: roles.length ? roles : base.clearTempRoles,
    graceMinutes: grace,
    freeTimeMinutes: freeTime,
    warnBeforeMinutes: warn,
    lowFuelAtOrBelow: FUEL_MARKS.has(source.lowFuelAtOrBelow as FuelMark)
      ? (source.lowFuelAtOrBelow as FuelMark)
      : base.lowFuelAtOrBelow,
  };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function statusLabel(statuses: { key: string; label: string }[], key: string): string {
  return statuses.find((status) => status.key === key)?.label ?? key;
}

export function statusColor(statuses: { key: string; color: string }[], key: string): string {
  return statuses.find((status) => status.key === key)?.color ?? "#44403c";
}

export function deriveDoorStatus(visit: {
  statusKey: string;
  workCompletedAt: string | null;
} | null): string {
  if (!visit) return "empty";
  if (visit.workCompletedAt) return "done";
  if (visit.statusKey === "loading" || visit.statusKey === "unloading") return visit.statusKey;
  return "occupied";
}

export const TIMEZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];
