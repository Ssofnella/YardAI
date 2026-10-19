import type { CsvArrival } from "@/lib/onboarding/csv";

export function senderDomain(from: string): string {
  const match = from.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  if (match) return match[1];
  return from.trim().toLowerCase().replace(/^@/, "");
}

export function senderAllowed(from: string, allowlist: string[]): boolean {
  const domain = senderDomain(from);
  if (!domain || !allowlist.length) return false;
  return allowlist.some((item) => {
    const allowed = item.trim().toLowerCase().replace(/^@/, "");
    return domain === allowed || domain.endsWith(`.${allowed}`);
  });
}

export function parseAppointmentEmail(text: string, now = new Date()): CsvArrival | { error: string } {
  const body = text.replace(/\s+/g, " ").trim();
  const trailer = body.match(/trailer(?:\s+number)?[:\s#]+([A-Z]{0,4}-?\d[A-Z0-9-]{1,})/i);
  const scac = body.match(/\bscac[:\s]+([A-Z]{2,4})\b/i);
  const carrier = body.match(/carrier[:\s]+([A-Za-z0-9&.' -]{2,40}?)(?=\s+(?:trailer|scac|load|seal|appointment|planned|door)\b|$)/i);
  const load = body.match(/\bload(?:\s+id)?[:\s#]+([A-Z0-9-]{2,})/i);
  const code = body.match(/\b(?:appointment|asn|code)[:\s#]+([A-Z0-9-]{3,})/i);
  const seal = body.match(/\bseal[:\s#]+([A-Z0-9-]{3,})/i);
  const setpoint = body.match(/\b(?:set\s*point|setpoint)[:\s]+(-?\d+(?:\.\d+)?)/i);
  const iso = body.match(/\b(20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)\b/);
  const clock = body.match(/\b(?:at|planned|appointment)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!trailer || !scac) {
    return { error: "The note needs a trailer number and a SCAC. Example: Trailer HL-100 SCAC HRBR." };
  }
  let planned = now;
  if (iso) {
    const parsed = new Date(iso[1].replace(" ", "T"));
    if (!Number.isNaN(parsed.getTime())) planned = parsed;
  } else if (clock) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2] ?? 0);
    const meridiem = clock[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    planned = new Date(now);
    planned.setUTCHours(hour + 5, minute, 0, 0);
  }
  const reefer = /reefer|frozen|set\s*point/i.test(body);
  return {
    code: (code?.[1] ?? `ASN-${trailer[1]}`).toUpperCase(),
    carrierName: carrier?.[1]?.trim() || "Email carrier",
    scac: scac[1].toUpperCase(),
    trailerNumber: trailer[1].toUpperCase(),
    loadId: (load?.[1] ?? `LD-${trailer[1]}`).toUpperCase(),
    loadType: /outbound/i.test(body) ? "outbound" : "inbound",
    emptyOrLoaded: /empty/i.test(body) ? "empty" : "loaded",
    isReefer: reefer,
    plannedAt: planned.toISOString(),
    setpointF: setpoint ? Number(setpoint[1]) : null,
    expectedSeal: seal?.[1]?.toUpperCase() ?? null,
    driverName: null,
  };
}
