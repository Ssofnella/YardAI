export type ReeferLimits = {
  tempToleranceF: number;
  minFuelPct: number;
};

export type ReeferReading = {
  isReefer: boolean;
  setpointF: number | null;
  tempF: number | null;
  fuelPct: number | null;
};

export type ReeferAlert = {
  outOfRange: boolean;
  tempOutOfRange: boolean;
  fuelLow: boolean;
  reasons: string[];
};

export function reeferAlerts(reading: ReeferReading, limits: ReeferLimits): ReeferAlert {
  if (!reading.isReefer) {
    return { outOfRange: false, tempOutOfRange: false, fuelLow: false, reasons: [] };
  }
  const reasons: string[] = [];
  let tempOutOfRange = false;
  let fuelLow = false;
  if (
    reading.setpointF != null &&
    reading.tempF != null &&
    Math.abs(reading.tempF - reading.setpointF) > limits.tempToleranceF
  ) {
    tempOutOfRange = true;
    reasons.push(
      `Temperature ${reading.tempF}°F is more than ${limits.tempToleranceF}°F from the ${reading.setpointF}°F set point.`,
    );
  }
  if (reading.fuelPct != null && reading.fuelPct < limits.minFuelPct) {
    fuelLow = true;
    reasons.push(`Fuel is ${reading.fuelPct}%, under the ${limits.minFuelPct}% floor.`);
  }
  return {
    outOfRange: reasons.length > 0,
    tempOutOfRange,
    fuelLow,
    reasons,
  };
}
