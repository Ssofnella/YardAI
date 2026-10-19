import {
  AlarmClock,
  ArrowDownToLine,
  ArrowUpFromLine,
  Ban,
  Circle,
  Fuel,
  Hourglass,
  OctagonPause,
  Package,
  Power,
  ShieldAlert,
  ThermometerSnowflake,
  TriangleAlert,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";

const STATE_ICONS: Record<string, LucideIcon> = {
  empty: Circle,
  loaded: Package,
  loading: ArrowUpFromLine,
  unloading: ArrowDownToLine,
  hold: OctagonPause,
  out_of_service: Ban,
  occupied: Warehouse,
  done: Package,
};

const FLAG_ORDER = [
  "hold",
  "seal_mismatch",
  "seal_missing",
  "reefer_temp",
  "reefer_unit",
  "reefer_fuel",
  "dwell_over",
  "dwell_warn",
  "id_mismatch",
  "door_not_reefer",
];

const FLAG_ICONS: Record<string, LucideIcon> = {
  hold: OctagonPause,
  seal_mismatch: ShieldAlert,
  seal_missing: ShieldAlert,
  reefer_temp: ThermometerSnowflake,
  reefer_unit: Power,
  reefer_fuel: Fuel,
  dwell_over: AlarmClock,
  dwell_warn: Hourglass,
  id_mismatch: TriangleAlert,
  door_not_reefer: Warehouse,
};

const FLAG_TEXT: Record<string, string> = {
  hold: "HOLD",
  seal_mismatch: "SEAL",
  seal_missing: "NO SEAL",
  reefer_temp: "TEMP",
  reefer_unit: "UNIT OFF",
  reefer_fuel: "FUEL",
  dwell_over: "OVER",
  dwell_warn: "DWELL",
  id_mismatch: "ID",
  door_not_reefer: "DRY DOOR",
};

const FLAG_CLASS: Record<string, string> = {
  hold: "bg-flag-hold text-yellow-300",
  seal_mismatch: "bg-flag-seal text-white",
  seal_missing: "bg-flag-seal text-white",
  reefer_temp: "bg-flag-reefer text-white",
  reefer_unit: "bg-flag-reefer text-white",
  reefer_fuel: "bg-flag-fuel text-slate-950 border border-amber-700",
  dwell_over: "bg-red-100 text-red-900 border-2 border-red-800",
  dwell_warn: "bg-amber-100 text-amber-900 border-2 border-amber-700",
  id_mismatch: "bg-white text-slate-950 border-2 border-slate-950",
  door_not_reefer: "bg-white text-slate-950 border-2 border-slate-950",
};

export function StateChip({
  statusKey,
  label,
  color,
}: {
  statusKey: string;
  label: string;
  color?: string;
}) {
  const Icon = STATE_ICONS[statusKey] ?? Package;
  return (
    <span
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 border-slate-700 bg-slate-100 px-2.5 text-sm font-semibold text-slate-950"
      style={color ? { borderColor: color } : undefined}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function FlagChip({ code, detail }: { code: string; detail?: string }) {
  const Icon = FLAG_ICONS[code] ?? TriangleAlert;
  const text = FLAG_TEXT[code] ?? code;
  return (
    <span
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-bold uppercase",
        FLAG_CLASS[code] ?? "bg-slate-950 text-white",
      )}
      title={detail}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span>{text}</span>
    </span>
  );
}

export function orderedFlags<T extends { code: string }>(flags: T[]): T[] {
  return [...flags].sort((a, b) => {
    const ai = FLAG_ORDER.indexOf(a.code);
    const bi = FLAG_ORDER.indexOf(b.code);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export function dwellFlag(
  minutes: number,
  freeTimeMinutes: number,
  warnBeforeMinutes: number,
): { code: "dwell_over" | "dwell_warn"; detail: string } | null {
  if (freeTimeMinutes <= 0) return null;
  if (minutes >= freeTimeMinutes) {
    const over = minutes - freeTimeMinutes;
    return { code: "dwell_over", detail: `Over free time ${formatMinutes(over)}` };
  }
  const left = freeTimeMinutes - minutes;
  if (left <= warnBeforeMinutes) {
    return { code: "dwell_warn", detail: `Free time ends in ${formatMinutes(left)}` };
  }
  return null;
}

function formatMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}
