import type { AskAnswer, AskContext, AskMatch, AskVisit } from "@/lib/ai/types";

function line(visit: AskVisit): string {
  const where = visit.locationName ?? "unplaced";
  const hours = Math.floor(visit.dwellMinutes / 60);
  const mins = visit.dwellMinutes % 60;
  const dwell = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return `${visit.trailerNumber} (${visit.scac}) at ${where}, ${dwell}`;
}

function reefers(ctx: AskContext): AskVisit[] {
  return ctx.visits.filter((visit) => visit.isReefer);
}

export function groundAnswer(answer: AskAnswer, ctx: AskContext): AskAnswer {
  const known = new Set<string>();
  for (const visit of ctx.visits) {
    known.add(visit.trailerNumber.toUpperCase());
    if (visit.locationName) known.add(visit.locationName.toUpperCase());
  }
  for (const appointment of ctx.appointments) {
    known.add(appointment.code.toUpperCase());
    if (appointment.trailerNumber) known.add(appointment.trailerNumber.toUpperCase());
  }
  for (const match of answer.matches) known.add(match.label.toUpperCase());
  const tokens = answer.text.toUpperCase().match(/\b[A-Z]{1,4}-?\d{2,}\b|\b[ABDRSH]\d{2}\b/g) ?? [];
  const missing = tokens.filter((token) => ![...known].some((item) => item === token || item.includes(token)));
  if (missing.length) {
    return { ...answer, text: "Here are the matching records." };
  }
  return answer;
}

export function askYard(question: string, ctx: AskContext): AskAnswer {
  const text = question.trim().toLowerCase();
  const move = question.match(/\bmove\s+([a-z0-9-]+)\s+to\s+(?:door\s+|spot\s+)?([a-z0-9-]+)/i);
  if (move) {
    return {
      provider: "heuristic",
      matches: [],
      action: {
        label: `Create move task: ${move[1].toUpperCase()} to ${move[2].toUpperCase()}`,
        trailerNumber: move[1].toUpperCase(),
        toName: move[2].toUpperCase(),
      },
      text: "I cannot move a trailer from a question. You can create the task yourself, and it waits for a driver.",
    };
  }
  const matches: AskMatch[] = [];

  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*hour/);
  const overHours = hourMatch ? Number(hourMatch[1]) : null;

  if (/reefer/.test(text) && overHours != null) {
    const min = overHours * 60;
    for (const visit of reefers(ctx).filter((visit) => visit.dwellMinutes > min)) {
      matches.push({ label: visit.trailerNumber, detail: line(visit) });
    }
    return {
      provider: "heuristic",
      matches,
      text: matches.length
        ? `${matches.length} reefer${matches.length === 1 ? "" : "s"} have been here over ${overHours} hour${overHours === 1 ? "" : "s"}.`
        : `No reefers have been here over ${overHours} hours.`,
    };
  }

  if (/reefer/.test(text) && /fuel|low/.test(text)) {
    for (const visit of reefers(ctx).filter(
      (visit) => visit.fuelPct != null && visit.fuelPct <= ctx.lowFuelPct,
    )) {
      matches.push({
        label: visit.trailerNumber,
        detail: `${line(visit)}, fuel ${visit.fuelPct}%`,
      });
    }
    return {
      provider: "heuristic",
      matches,
      text: matches.length
        ? `${matches.length} reefer${matches.length === 1 ? "" : "s"} at or under ${ctx.lowFuelPct}% fuel.`
        : `No reefers are under the ${ctx.lowFuelPct}% fuel floor.`,
    };
  }

  if (/reefer/.test(text)) {
    for (const visit of reefers(ctx)) matches.push({ label: visit.trailerNumber, detail: line(visit) });
    return {
      provider: "heuristic",
      matches,
      text: matches.length ? `${matches.length} reefers are on the yard.` : "No reefers are on the yard.",
    };
  }

  if (/detention|free time|over free/.test(text)) {
    for (const visit of ctx.visits.filter((visit) => visit.dwellMinutes >= ctx.freeTimeMinutes)) {
      matches.push({ label: visit.trailerNumber, detail: line(visit) });
    }
    return {
      provider: "heuristic",
      matches,
      text: matches.length
        ? `${matches.length} trailer${matches.length === 1 ? "" : "s"} are past ${ctx.freeTimeMinutes} min of free time.`
        : `Nobody is past ${ctx.freeTimeMinutes} min of free time.`,
    };
  }

  if (/late|no-?show|miss/.test(text)) {
    for (const appointment of ctx.appointments.filter((item) => item.status === "no_show" || item.status === "expected")) {
      if (appointment.status === "no_show" || new Date(appointment.plannedAt).getTime() < new Date(ctx.now).getTime()) {
        matches.push({
          label: appointment.code,
          detail: `${appointment.code} ${appointment.trailerNumber ?? ""} is ${appointment.status}.`.replace(/\s+/g, " "),
        });
      }
    }
    return {
      provider: "heuristic",
      matches,
      text: matches.length
        ? `${matches.length} appointment${matches.length === 1 ? "" : "s"} are late or a no-show.`
        : "No late appointments or no-shows.",
    };
  }

  if (/hold/.test(text)) {
    for (const visit of ctx.visits.filter((visit) => visit.flags.includes("hold") || visit.statusKey === "hold")) {
      matches.push({ label: visit.trailerNumber, detail: line(visit) });
    }
    return {
      provider: "heuristic",
      matches,
      text: matches.length ? `${matches.length} trailer${matches.length === 1 ? "" : "s"} on hold.` : "Nothing is on hold.",
    };
  }

  const place = text.match(/(?:door|spot)\s+([a-z]{0,3}\d{1,3})/i);
  if (place) {
    const name = place[1].toUpperCase();
    for (const visit of ctx.visits.filter((visit) => (visit.locationName ?? "").toUpperCase().includes(name))) {
      matches.push({ label: visit.trailerNumber, detail: line(visit) });
    }
    return {
      provider: "heuristic",
      matches,
      text: matches.length ? `${name} is occupied.` : `${name} is empty.`,
    };
  }

  if (/empty/.test(text)) {
    for (const visit of ctx.visits.filter((visit) => visit.emptyOrLoaded === "empty")) {
      matches.push({ label: visit.trailerNumber, detail: line(visit) });
    }
    return {
      provider: "heuristic",
      matches,
      text: matches.length ? `${matches.length} empties on the yard.` : "No empties on the yard.",
    };
  }

  if (/how many|count/.test(text)) {
    return {
      provider: "heuristic",
      matches: [{ label: "On yard", detail: `${ctx.visits.length} trailers` }],
      text: `${ctx.visits.length} trailers are on the yard, ${reefers(ctx).length} of them reefers.`,
    };
  }

  return {
    provider: "heuristic",
    matches: [],
    text: "I can answer dwell, reefers, fuel, detention, late appointments, holds, and who is on a door. Try: which reefers have been here over 4 hours?",
  };
}
