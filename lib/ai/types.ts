import type { DoorType, SpotType } from "@/lib/domain/config";

export type AiProviderId = "heuristic" | "model";

export type PlaceKind = "door" | "spot";

export type PlaceChoice = {
  kind: PlaceKind;
  id: string;
  name: string;
  type: string;
};

export type ArrivalRequest = {
  isReefer: boolean;
  loadType: string;
  emptyOrLoaded: string;
  /** auto picks a door when the appointment is due, and a spot when it is not. */
  handling?: "live" | "drop" | "auto";
  plannedAt?: string | null;
  /** Seal hold and similar. Only holding spots are eligible. */
  restrict?: "holding" | null;
};

export type DoorSlot = {
  id: string;
  name: string;
  type: DoorType;
  sort: number;
  occupied: boolean;
};

export type SpotSlot = {
  id: string;
  name: string;
  type: SpotType;
  zoneId: string;
  zoneSort: number;
  row: number;
  col: number;
  occupied: boolean;
};

export type RecommendInput = {
  now: string;
  request: ArrivalRequest;
  doors: DoorSlot[];
  spots: SpotSlot[];
};

export type PlaceRecommendation = {
  suggestionId: string;
  place: PlaceChoice;
  reason: string;
  score: number;
  factors: string[];
  provider: AiProviderId;
};

export type OptimizeVisit = {
  id: string;
  trailerNumber: string;
  scac: string;
  isReefer: boolean;
  fuelPct: number | null;
  handling: "live" | "drop";
  locationKind: "spot" | "door" | "offsite";
  locationId: string;
  locationName: string;
  statusKey: string;
  flags?: string[];
  workCompletedAt: string | null;
  dwellMinutes: number;
  emptyOrLoaded: string | null;
};

export type UpcomingAppointment = {
  code: string;
  isReefer: boolean;
  plannedAt: string;
  emptyOrLoaded: string;
};

export type OptimizeInput = {
  now: string;
  freeTimeMinutes: number;
  lowFuelPct: number;
  doors: DoorSlot[];
  spots: SpotSlot[];
  visits: OptimizeVisit[];
  upcoming: UpcomingAppointment[];
};

export type MoveBenefit = {
  detentionMinutes: number;
  dockIdleMinutes: number;
  summary: string;
};

export type OptimizeMove = {
  id: string;
  visitId: string;
  trailerNumber: string;
  scac: string;
  kind: "respot" | "door_swap";
  fromName: string;
  to: PlaceChoice;
  reason: string;
  benefit: MoveBenefit;
  rank: number;
};

export type RiskFlag = {
  id: string;
  kind: "detention" | "reefer_fuel" | "late_appointment";
  severity: "watch" | "now";
  subject: string;
  detail: string;
  visitId?: string;
  appointmentCode?: string;
};

export type RiskInput = {
  now: string;
  freeTimeMinutes: number;
  warnBeforeMinutes: number;
  graceMinutes: number;
  lowFuelPct: number;
  visits: {
    id: string;
    trailerNumber: string;
    scac: string;
    isReefer: boolean;
    fuelPct: number | null;
    dwellMinutes: number;
    locationName: string | null;
  }[];
  appointments: {
    code: string;
    trailerNumber: string | null;
    status: string;
    plannedAt: string;
    isReefer: boolean;
  }[];
};

export type AskVisit = {
  trailerNumber: string;
  scac: string;
  isReefer: boolean;
  dwellMinutes: number;
  fuelPct: number | null;
  locationName: string | null;
  statusKey: string;
  emptyOrLoaded: string | null;
  flags: string[];
};

export type AskAppointment = {
  code: string;
  status: string;
  plannedAt: string;
  isReefer: boolean;
  trailerNumber: string | null;
  carrierName: string;
};

export type AskContext = {
  now: string;
  freeTimeMinutes: number;
  lowFuelPct: number;
  visits: AskVisit[];
  appointments: AskAppointment[];
};

export type AskMatch = {
  label: string;
  detail: string;
};

export type AskAnswer = {
  text: string;
  matches: AskMatch[];
  provider: AiProviderId;
  asOf?: string;
  /** A button the person may press. Asking never writes the move. */
  action?: { label: string; trailerNumber: string; toName: string } | null;
};
