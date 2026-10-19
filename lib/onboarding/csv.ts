export type CsvArrival = {
  code: string;
  carrierName: string;
  scac: string;
  trailerNumber: string;
  loadId: string;
  loadType: string;
  emptyOrLoaded: string;
  isReefer: boolean;
  plannedAt: string;
  setpointF: number | null;
  expectedSeal: string | null;
  driverName: string | null;
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function parseArrivalCsv(text: string): { rows: CsvArrival[]; errors: string[] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], errors: ["The file is empty."] };
  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase().replace(/\s+/g, "_"));
  const need = ["appointment_code", "carrier_name", "scac", "trailer_number", "load_id", "load_type", "planned_at"];
  const missing = need.filter((key) => !header.includes(key));
  if (missing.length) {
    return { rows: [], errors: [`Missing columns: ${missing.join(", ")}`] };
  }
  const index = (key: string) => header.indexOf(key);
  const rows: CsvArrival[] = [];
  const errors: string[] = [];
  for (let lineNo = 1; lineNo < lines.length; lineNo += 1) {
    const cells = splitCsvLine(lines[lineNo]);
    const value = (key: string) => cells[index(key)]?.trim() ?? "";
    const code = value("appointment_code");
    const trailerNumber = value("trailer_number");
    const scac = value("scac").toUpperCase();
    const planned = value("planned_at");
    if (!code || !trailerNumber || !scac || !planned || Number.isNaN(new Date(planned).getTime())) {
      errors.push(`Row ${lineNo + 1} needs a code, trailer, SCAC, and a valid planned_at.`);
      continue;
    }
    const setpoint = value("setpoint_f");
    rows.push({
      code,
      carrierName: value("carrier_name") || "Unknown carrier",
      scac,
      trailerNumber,
      loadId: value("load_id") || code,
      loadType: value("load_type") || "inbound",
      emptyOrLoaded: value("empty_or_loaded") === "empty" ? "empty" : "loaded",
      isReefer: /^(1|true|yes|y)$/i.test(value("is_reefer")),
      plannedAt: new Date(planned).toISOString(),
      setpointF: setpoint && Number.isFinite(Number(setpoint)) ? Number(setpoint) : null,
      expectedSeal: value("expected_seal") || null,
      driverName: value("driver_name") || null,
    });
  }
  return { rows, errors };
}
