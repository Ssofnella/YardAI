import type { SealMismatchPolicy } from "@/lib/domain/config";
import { checkSeals, normalizeSeal } from "@/lib/domain/seals";

export type SealDecision = "hold" | "accept" | "match";

export type SealFlowInput = {
  expectedSeal: string | null | undefined;
  foundSeal: string | null | undefined;
  decision: SealDecision | null | undefined;
  reason: string | null | undefined;
  policy: SealMismatchPolicy;
  loaded: boolean;
};

export type SealFlow = {
  mismatch: boolean;
  missing: boolean;
  hold: boolean;
  flag: boolean;
  error: string | null;
};

/**
 * Blind entry is a UI rule. This decides what the server records once the
 * clerk has typed a seal (or chosen No seal) and picked a resolution.
 */
export function resolveSealFlow(input: SealFlowInput): SealFlow {
  const expected = normalizeSeal(input.expectedSeal);
  const found = normalizeSeal(input.foundSeal);
  if (!expected) {
    return { mismatch: false, missing: false, hold: false, flag: false, error: null };
  }
  const compared = checkSeals(expected, found);
  if (!compared.mismatch) {
    return { mismatch: false, missing: false, hold: false, flag: false, error: null };
  }
  const missing = !found;
  if (input.policy === "note" && !input.decision) {
    return { mismatch: true, missing, hold: false, flag: true, error: null };
  }
  if (input.decision !== "hold" && input.decision !== "accept") {
    return {
      mismatch: true,
      missing,
      hold: false,
      flag: true,
      error: "Choose re-enter, hold, or accept before check-in",
    };
  }
  if (input.decision === "accept") {
    if (input.policy === "hold") {
      return {
        mismatch: true,
        missing,
        hold: false,
        flag: true,
        error: "This site holds seal mismatches. Accept is not allowed.",
      };
    }
    if (!input.reason?.trim()) {
      return {
        mismatch: true,
        missing,
        hold: false,
        flag: true,
        error: "Accept needs a reason",
      };
    }
    return { mismatch: true, missing, hold: false, flag: true, error: null };
  }
  if (!input.reason?.trim()) {
    return { mismatch: true, missing, hold: true, flag: true, error: "Hold needs a reason" };
  }
  return { mismatch: true, missing, hold: true, flag: true, error: null };
}

export function canClearTemp(role: string, allowed: readonly string[]): boolean {
  return allowed.includes(role);
}
