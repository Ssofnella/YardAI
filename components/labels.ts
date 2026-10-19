export function spotTypeLabel(type: string): string {
  if (type === "reefer") return "Reefer plug";
  if (type === "staging") return "Staging";
  if (type === "holding") return "Holding";
  if (type === "out_of_service") return "Out of service";
  return "Dry";
}

export function doorTypeLabel(type: string): string {
  if (type === "reefer") return "Reefer";
  if (type === "both") return "Dry + reefer";
  return "Dry";
}

export function flagLabel(code: string): string {
  const labels: Record<string, string> = {
    id_mismatch: "ID mismatch",
    seal_mismatch: "Seal mismatch",
    seal_missing: "No seal",
    hold: "Hold",
    reefer_temp: "Temp",
    reefer_fuel: "Fuel",
    reefer_unit: "Unit off",
    door_not_reefer: "Dry door",
  };
  return labels[code] ?? code;
}

export function inkFor(hex: string): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return "#1c1915";
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.64 ? "#1c1915" : "#f8f5ef";
}

export const controlClass =
  "h-12 w-full rounded-lg border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";
