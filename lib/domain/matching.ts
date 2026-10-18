/**
 * Matching keys, in the order the gate uses them:
 * 1. The appointment the clerk selected.
 * 2. Trailer number + SCAC.
 * 3. Load ID.
 * 4. Trailer number alone, which flags a SCAC mismatch when the carrier differs.
 *
 * A mismatch is recorded and the check-in still completes. Most gate errors
 * are mismatched IDs, and blocking the truck does not fix the record.
 */

export type ArrivalKey = {
  id: string;
  appointmentCode: string;
  trailerNumber: string | null;
  scac: string;
  loadId: string | null;
  carrierName: string;
};

export type CheckInIdentity = {
  trailerNumber: string;
  scac: string;
  loadId?: string | null;
  appointmentId?: string | null;
};

export type MatchMethod =
  | "appointment_id"
  | "trailer_and_scac"
  | "load_id"
  | "trailer_only"
  | "none";

export type MatchResult = {
  appointment: ArrivalKey | null;
  matchMethod: MatchMethod;
  idMismatch: boolean;
  reasons: string[];
};

export function normalizeId(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function matchArrival(
  input: CheckInIdentity,
  arrivals: ArrivalKey[],
): MatchResult {
  const trailer = normalizeId(input.trailerNumber);
  const scac = normalizeId(input.scac);
  const loadId = normalizeId(input.loadId);
  const selected = (input.appointmentId ?? "").trim();

  if (!trailer) {
    return {
      appointment: null,
      matchMethod: "none",
      idMismatch: false,
      reasons: ["Trailer number is required before a match can be checked"],
    };
  }

  if (selected) {
    const appointment = arrivals.find(
      (row) => row.id === selected || row.appointmentCode.toLowerCase() === selected.toLowerCase(),
    );
    if (!appointment) {
      return {
        appointment: null,
        matchMethod: "none",
        idMismatch: true,
        reasons: [`No expected arrival matches appointment ${selected}`],
      };
    }
    return {
      appointment,
      matchMethod: "appointment_id",
      ...compareIdentity(input, appointment, trailer, scac, loadId),
    };
  }

  const byTrailerAndScac = arrivals.find(
    (row) =>
      normalizeId(row.trailerNumber) === trailer && normalizeId(row.scac) === scac,
  );
  if (byTrailerAndScac) {
    return {
      appointment: byTrailerAndScac,
      matchMethod: "trailer_and_scac",
      idMismatch: false,
      reasons: [],
    };
  }

  if (loadId) {
    const byLoad = arrivals.find((row) => normalizeId(row.loadId) === loadId);
    if (byLoad) {
      const compared = compareIdentity(input, byLoad, trailer, scac, loadId);
      return {
        appointment: byLoad,
        matchMethod: "load_id",
        ...compared,
      };
    }
  }

  const byTrailer = arrivals.find((row) => normalizeId(row.trailerNumber) === trailer);
  if (byTrailer) {
    const compared = compareIdentity(input, byTrailer, trailer, scac, loadId);
    return {
      appointment: byTrailer,
      matchMethod: "trailer_only",
      idMismatch: compared.idMismatch,
      reasons: compared.reasons,
    };
  }

  return { appointment: null, matchMethod: "none", idMismatch: false, reasons: [] };
}

function compareIdentity(
  input: CheckInIdentity,
  appointment: ArrivalKey,
  trailer: string,
  scac: string,
  loadId: string,
): { idMismatch: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const expectedTrailer = normalizeId(appointment.trailerNumber);
  if (expectedTrailer && expectedTrailer !== trailer) {
    reasons.push(
      `Trailer number ${input.trailerNumber.trim()} does not match appointment ${appointment.appointmentCode}, which expects ${appointment.trailerNumber}.`,
    );
  }
  const expectedScac = normalizeId(appointment.scac);
  if (expectedScac && expectedScac !== scac) {
    reasons.push(
      `SCAC ${input.scac.trim().toUpperCase()} does not match appointment ${appointment.appointmentCode}, which expects ${appointment.scac}.`,
    );
  }
  const expectedLoad = normalizeId(appointment.loadId);
  if (loadId && expectedLoad && loadId !== expectedLoad) {
    reasons.push(
      `Load ID ${input.loadId?.trim()} does not match appointment ${appointment.appointmentCode}, which expects ${appointment.loadId}.`,
    );
  }
  return { idMismatch: reasons.length > 0, reasons };
}
