import type { FuelMark } from "@/lib/domain/config";

export type ReeferLimits = {
  tempToleranceF: number;
  minFuelPct: number;
  lowFuelAtOrBelow?: FuelMark;
};

export type ReeferReading = {
  isReefer: boolean;
  setpointF: number | null;
  tempF: number | null;
  fuelPct: number | null;
  /** E, 1/4, 1/2, 3/4, F. When set, this wins over fuelPct for the fuel rule. */
  fuelLevel?: string | null;
  unitRunning?: boolean | null;
};

export type ReeferAlert = {
  outOfRange: boolean;
  tempOutOfRange: boolean;
  fuelLow: boolean;
  unitOff: boolean;
  deltaF: number | null;
  reasons: string[];
};

export const FUEL_MARKS = ["E", "1/4", "1/2", "3/4", "F"] as const;

const FUEL_PCT: Record<string, number> = {
  E: 0,
  "1/4": 25,
  "1/2": 50,
  "3/4": 75,
  F: 100,
};

export function fuelMarkToPct(mark: string | null | undefined): number | null {
  if (!mark) return null;
  const value = FUEL_PCT[mark];
  return value == null ? null : value;
}

export function reeferAlerts(reading: ReeferReading, limits: ReeferLimits): ReeferAlert {
  if (!reading.isReefer) {
    return {
      outOfRange: false,
      tempOutOfRange: false,
      fuelLow: false,
      unitOff: false,
      deltaF: null,
      reasons: [],
    };
  }
  const reasons: string[] = [];
  let tempOutOfRange = false;
  let fuelLow = false;
  let unitOff = false;
  let deltaF: number | null = null;
  const tolerance = limits.tempToleranceF;
  if (reading.setpointF != null && reading.tempF != null) {
    deltaF = reading.tempF - reading.setpointF;
    if (Math.abs(deltaF) > tolerance) {
      tempOutOfRange = true;
      const direction = deltaF > 0 ? "above" : "below";
      reasons.push(
        `Reefer ${Math.abs(deltaF)}°F ${direction} set point (${reading.tempF}°F vs ${reading.setpointF}°F, tolerance ${tolerance}°F).`,
      );
    }
  }
  const threshold = limits.lowFuelAtOrBelow ?? "1/4";
  const level = reading.fuelLevel ? fuelMarkToPct(reading.fuelLevel) : null;
  if (level != null && fuelMarkToPct(threshold) != null && level <= (fuelMarkToPct(threshold) as number)) {
    fuelLow = true;
    reasons.push(`Fuel at ${reading.fuelLevel}, at or below ${threshold}.`);
  } else if (level == null && reading.fuelPct != null && reading.fuelPct < limits.minFuelPct) {
    fuelLow = true;
    reasons.push(`Fuel is ${reading.fuelPct}%, under the ${limits.minFuelPct}% floor.`);
  }
  if (reading.unitRunning === false) {
    unitOff = true;
    reasons.push("Unit not running.");
  }
  return {
    outOfRange: reasons.length > 0,
    tempOutOfRange,
    fuelLow,
    unitOff,
    deltaF,
    reasons,
  };
}
