import { addMinutes } from "@/lib/domain/time";

export type ScriptException =
  | "late"
  | "no_show"
  | "reefer"
  | "id_mismatch"
  | "seal_mismatch"
  | "drop";

export type ScriptedStop = {
  code: string;
  carrierName: string;
  scac: string;
  trailerNumber: string;
  driverName: string;
  tractorNumber: string;
  loadId: string;
  loadType: "inbound" | "outbound" | "transfer";
  emptyOrLoaded: "empty" | "loaded";
  isReefer: boolean;
  setpointF: number | null;
  /** Minutes after 06:00 site-local. */
  plannedMinute: number;
  arriveOffsetMin: number;
  noShow?: boolean;
  checkInTrailer?: string;
  checkInScac?: string;
  sealIn: string;
  sealOut?: string;
  tempF?: number | null;
  fuelPct?: number | null;
  spotName?: string;
  doorName?: string;
  liveDoor?: boolean;
  toDoorAfterMin?: number;
  workMin?: number;
  checkout?: boolean;
  summary: string;
  exceptions: ScriptException[];
};

export type OvernightDrop = {
  trailerNumber: string;
  scac: string;
  carrierName: string;
  driverName: string;
  tractorNumber: string;
  loadId: string;
  loadType: "inbound" | "outbound";
  emptyOrLoaded: "empty" | "loaded";
  isReefer: boolean;
  setpointF?: number | null;
  tempF?: number | null;
  fuelPct?: number | null;
  sealIn: string;
  placeName: string;
  /** Minutes relative to 06:00. Negative means the trailer was already in the yard. */
  offsetMin: number;
};

/**
 * A fixed fictional shift. Names, SCACs, and numbers are invented.
 * The same script plays every time someone resets the day.
 */
export const DAY_SCRIPT: ScriptedStop[] = [
  {
    code: "APT-2401",
    carrierName: "Harborlight Freight",
    scac: "HRBR",
    trailerNumber: "HL-44121",
    driverName: "Mara Ellison",
    tractorNumber: "T-190",
    loadId: "LD-2401",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: false,
    setpointF: null,
    plannedMinute: 30,
    arriveOffsetMin: 0,
    sealIn: "SL-24011",
    sealOut: "SL-24011",
    spotName: "A01",
    doorName: "D02",
    toDoorAfterMin: 35,
    workMin: 45,
    checkout: true,
    summary: "On-time dry inbound. Parks on A01, unloads at D02, seal matches.",
    exceptions: [],
  },
  {
    code: "APT-2402",
    carrierName: "Pinecone Logistics",
    scac: "PNCN",
    trailerNumber: "PKC-2204",
    driverName: "Jonah Peck",
    tractorNumber: "T-441",
    loadId: "LD-2402",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: true,
    setpointF: 34,
    plannedMinute: 60,
    arriveOffsetMin: 75,
    sealIn: "SL-24021",
    sealOut: "SL-24021",
    tempF: 47,
    fuelPct: 18,
    spotName: "R02",
    doorName: "D18",
    toDoorAfterMin: 25,
    workMin: 40,
    checkout: true,
    summary: "Late reefer. 47°F against a 34°F set point, and fuel at 18%.",
    exceptions: ["late", "reefer"],
  },
  {
    code: "APT-2403",
    carrierName: "Redkettle Transport",
    scac: "RDKT",
    trailerNumber: "RK-7781",
    driverName: "Inez Calder",
    tractorNumber: "T-77",
    loadId: "LD-2403",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: false,
    setpointF: null,
    plannedMinute: 75,
    arriveOffsetMin: 0,
    noShow: true,
    sealIn: "SL-24031",
    summary: "No-show. Marked missed 30 minutes after the appointment.",
    exceptions: ["no_show"],
  },
  {
    code: "APT-2404",
    carrierName: "Moonpier Drayage",
    scac: "MNPR",
    trailerNumber: "MP-3309",
    driverName: "Samir Holt",
    tractorNumber: "T-88",
    loadId: "LD-2404",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: false,
    setpointF: null,
    plannedMinute: 100,
    arriveOffsetMin: 5,
    checkInTrailer: "MP-3310",
    sealIn: "SL-44041",
    sealOut: "SL-44042",
    spotName: "A05",
    doorName: "D06",
    toDoorAfterMin: 30,
    workMin: 40,
    checkout: true,
    summary: "Trailer MP-3310 is checked in against appointment MP-3309. The outbound seal does not match.",
    exceptions: ["id_mismatch", "seal_mismatch"],
  },
  {
    code: "APT-2405",
    carrierName: "Cinder & Rye Carriers",
    scac: "CNDR",
    trailerNumber: "CR-1502",
    driverName: "Ruthie Quinn",
    tractorNumber: "T-12",
    loadId: "LD-2405",
    loadType: "outbound",
    emptyOrLoaded: "empty",
    isReefer: false,
    setpointF: null,
    plannedMinute: 130,
    arriveOffsetMin: 0,
    sealIn: "SL-24051",
    sealOut: "SL-24051",
    spotName: "A12",
    doorName: "D09",
    toDoorAfterMin: 20,
    workMin: 55,
    checkout: true,
    summary: "Empty outbound. Loads at D09 and leaves on the same seal.",
    exceptions: [],
  },
  {
    code: "APT-2406",
    carrierName: "Harborlight Freight",
    scac: "HRBR",
    trailerNumber: "HL-45002",
    driverName: "Ellis Navarro",
    tractorNumber: "T-204",
    loadId: "LD-2406",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: true,
    setpointF: 0,
    plannedMinute: 165,
    arriveOffsetMin: 0,
    sealIn: "SL-24061",
    tempF: 1,
    fuelPct: 70,
    spotName: "R06",
    summary: "Frozen drop on R06. Temperature is in range and the trailer stays put.",
    exceptions: ["drop"],
  },
  {
    code: "APT-2407",
    carrierName: "Pinecone Logistics",
    scac: "PNCN",
    trailerNumber: "PKC-1180",
    driverName: "Mara Ellison",
    tractorNumber: "T-190",
    loadId: "LD-2407",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: false,
    setpointF: null,
    plannedMinute: 200,
    arriveOffsetMin: 0,
    sealIn: "SL-24071",
    sealOut: "SL-24071",
    liveDoor: true,
    doorName: "D01",
    workMin: 50,
    checkout: true,
    summary: "Live unload straight to D01. The driver waits at the door.",
    exceptions: [],
  },
  {
    code: "APT-2408",
    carrierName: "Redkettle Transport",
    scac: "RDKT",
    trailerNumber: "RK-1020",
    driverName: "Inez Calder",
    tractorNumber: "T-77",
    loadId: "LD-2408",
    loadType: "transfer",
    emptyOrLoaded: "loaded",
    isReefer: false,
    setpointF: null,
    plannedMinute: 240,
    arriveOffsetMin: 40,
    sealIn: "SL-24081",
    sealOut: "SL-24081",
    spotName: "A08",
    doorName: "D11",
    toDoorAfterMin: 20,
    workMin: 35,
    checkout: true,
    summary: "Transfer, 40 minutes late, then door D11.",
    exceptions: ["late"],
  },
  {
    code: "APT-2409",
    carrierName: "Moonpier Drayage",
    scac: "MNPR",
    trailerNumber: "MP-6001",
    driverName: "Jonah Peck",
    tractorNumber: "T-441",
    loadId: "LD-2409",
    loadType: "inbound",
    emptyOrLoaded: "empty",
    isReefer: false,
    setpointF: null,
    plannedMinute: 280,
    arriveOffsetMin: 0,
    sealIn: "",
    spotName: "B02",
    summary: "Empty drop on B02. No seal and no door.",
    exceptions: ["drop"],
  },
  {
    code: "APT-2410",
    carrierName: "Cinder & Rye Carriers",
    scac: "CNDR",
    trailerNumber: "CR-1888",
    driverName: "Samir Holt",
    tractorNumber: "T-55",
    loadId: "LD-2410",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: false,
    setpointF: null,
    plannedMinute: 315,
    arriveOffsetMin: 0,
    sealIn: "SL-24101",
    sealOut: "SL-24101",
    spotName: "A14",
    doorName: "D14",
    toDoorAfterMin: 25,
    workMin: 40,
    checkout: true,
    summary: "Routine inbound through D14.",
    exceptions: [],
  },
  {
    code: "APT-2411",
    carrierName: "Harborlight Freight",
    scac: "HRBR",
    trailerNumber: "HL-44180",
    driverName: "Ruthie Quinn",
    tractorNumber: "T-190",
    loadId: "LD-2411",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: false,
    setpointF: null,
    plannedMinute: 360,
    arriveOffsetMin: 0,
    noShow: true,
    sealIn: "SL-24111",
    summary: "Second no-show of the shift.",
    exceptions: ["no_show"],
  },
  {
    code: "APT-2412",
    carrierName: "Pinecone Logistics",
    scac: "PNCN",
    trailerNumber: "PKC-3344",
    driverName: "Ellis Navarro",
    tractorNumber: "T-90",
    loadId: "LD-2412",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: true,
    setpointF: 36,
    plannedMinute: 420,
    arriveOffsetMin: 0,
    sealIn: "SL-24121",
    sealOut: "SL-24121",
    tempF: 36,
    fuelPct: 55,
    liveDoor: true,
    doorName: "D17",
    workMin: 40,
    checkout: true,
    summary: "Live reefer at D17. Temperature matches the set point.",
    exceptions: [],
  },
  {
    code: "APT-2413",
    carrierName: "Redkettle Transport",
    scac: "RDKT",
    trailerNumber: "RK-5512",
    driverName: "Mara Ellison",
    tractorNumber: "T-300",
    loadId: "LD-2413",
    loadType: "outbound",
    emptyOrLoaded: "loaded",
    isReefer: false,
    setpointF: null,
    plannedMinute: 490,
    arriveOffsetMin: 0,
    sealIn: "SL-24131",
    sealOut: "SL-24131",
    spotName: "S02",
    doorName: "D08",
    toDoorAfterMin: 15,
    workMin: 35,
    checkout: true,
    summary: "Staged on S02, then loads out D08.",
    exceptions: [],
  },
  {
    code: "APT-2414",
    carrierName: "Moonpier Drayage",
    scac: "MNPR",
    trailerNumber: "MP-9090",
    driverName: "Inez Calder",
    tractorNumber: "T-16",
    loadId: "LD-2414",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: false,
    setpointF: null,
    plannedMinute: 560,
    arriveOffsetMin: 25,
    sealIn: "SL-24141",
    spotName: "A16",
    summary: "Arrives 25 minutes late and stays on A16 through the end of the shift.",
    exceptions: ["late", "drop"],
  },
];

export const OVERNIGHT: OvernightDrop[] = [
  {
    trailerNumber: "HL-44002",
    scac: "HRBR",
    carrierName: "Harborlight Freight",
    driverName: "Mara Ellison",
    tractorNumber: "T-188",
    loadId: "LD-7001",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: true,
    setpointF: 34,
    tempF: 35,
    fuelPct: 64,
    sealIn: "SL-70011",
    placeName: "R01",
    offsetMin: -480,
  },
  {
    trailerNumber: "PKC-11880",
    scac: "PNCN",
    carrierName: "Pinecone Logistics",
    driverName: "Jonah Peck",
    tractorNumber: "T-440",
    loadId: "LD-7002",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: false,
    sealIn: "SL-70021",
    placeName: "A03",
    offsetMin: -450,
  },
  {
    trailerNumber: "RK-9001",
    scac: "RDKT",
    carrierName: "Redkettle Transport",
    driverName: "Inez Calder",
    tractorNumber: "T-70",
    loadId: "LD-7003",
    loadType: "inbound",
    emptyOrLoaded: "empty",
    isReefer: false,
    sealIn: "",
    placeName: "A11",
    offsetMin: -400,
  },
  {
    trailerNumber: "CR-1510",
    scac: "CNDR",
    carrierName: "Cinder & Rye Carriers",
    driverName: "Ruthie Quinn",
    tractorNumber: "T-14",
    loadId: "LD-7004",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: true,
    setpointF: 34,
    tempF: 36,
    fuelPct: 12,
    sealIn: "SL-70041",
    placeName: "R04",
    offsetMin: -360,
  },
  {
    trailerNumber: "MP-2201",
    scac: "MNPR",
    carrierName: "Moonpier Drayage",
    driverName: "Samir Holt",
    tractorNumber: "T-80",
    loadId: "LD-7005",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: false,
    sealIn: "SL-70051",
    placeName: "S01",
    offsetMin: -300,
  },
  {
    trailerNumber: "HL-44220",
    scac: "HRBR",
    carrierName: "Harborlight Freight",
    driverName: "Ellis Navarro",
    tractorNumber: "T-205",
    loadId: "LD-7006",
    loadType: "inbound",
    emptyOrLoaded: "loaded",
    isReefer: false,
    sealIn: "SL-70061",
    placeName: "D04",
    offsetMin: -50,
  },
];

export type SimStepKind = "check_in" | "no_show" | "to_door" | "work_done" | "check_out";

export type SimStep = {
  id: string;
  at: string;
  kind: SimStepKind;
  appointmentCode: string;
};

export function buildDayPlan(dayStart: Date, stops: ScriptedStop[] = DAY_SCRIPT): {
  steps: SimStep[];
  dayEnd: Date;
} {
  const dayEnd = addMinutes(dayStart, 12 * 60);
  const steps: SimStep[] = [];
  for (const stop of stops) {
    const planned = addMinutes(dayStart, stop.plannedMinute);
    if (stop.noShow) {
      steps.push({
        id: `${stop.code}:no_show`,
        at: addMinutes(planned, 30).toISOString(),
        kind: "no_show",
        appointmentCode: stop.code,
      });
      continue;
    }
    const arrive = addMinutes(planned, stop.arriveOffsetMin);
    steps.push({
      id: `${stop.code}:check_in`,
      at: arrive.toISOString(),
      kind: "check_in",
      appointmentCode: stop.code,
    });
    if (stop.liveDoor && stop.doorName) {
      const done = addMinutes(arrive, stop.workMin ?? 45);
      steps.push({
        id: `${stop.code}:work_done`,
        at: done.toISOString(),
        kind: "work_done",
        appointmentCode: stop.code,
      });
      if (stop.checkout !== false) {
        steps.push({
          id: `${stop.code}:check_out`,
          at: addMinutes(done, 10).toISOString(),
          kind: "check_out",
          appointmentCode: stop.code,
        });
      }
    } else if (stop.doorName) {
      const move = addMinutes(arrive, stop.toDoorAfterMin ?? 40);
      steps.push({
        id: `${stop.code}:to_door`,
        at: move.toISOString(),
        kind: "to_door",
        appointmentCode: stop.code,
      });
      const done = addMinutes(move, stop.workMin ?? 50);
      steps.push({
        id: `${stop.code}:work_done`,
        at: done.toISOString(),
        kind: "work_done",
        appointmentCode: stop.code,
      });
      if (stop.checkout !== false) {
        steps.push({
          id: `${stop.code}:check_out`,
          at: addMinutes(done, 12).toISOString(),
          kind: "check_out",
          appointmentCode: stop.code,
        });
      }
    }
  }
  steps.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return { steps, dayEnd };
}

export function stopByCode(code: string): ScriptedStop | undefined {
  return DAY_SCRIPT.find((stop) => stop.code === code);
}
