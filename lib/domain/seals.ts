/** Compare seals the way a gate clerk does: ignore case, spaces, and dashes. */
export function normalizeSeal(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "");
}

export type SealCheck = {
  mismatch: boolean;
  sealIn: string;
  sealOut: string;
  normalizedIn: string;
  normalizedOut: string;
};

/**
 * A mismatch is a flag, not a block. Both blank means there was nothing to
 * compare. A seal on the way in and a different or blank seal on the way out
 * is a mismatch.
 */
export function checkSeals(
  sealIn: string | null | undefined,
  sealOut: string | null | undefined,
): SealCheck {
  const normalizedIn = normalizeSeal(sealIn);
  const normalizedOut = normalizeSeal(sealOut);
  const mismatch = Boolean(normalizedIn || normalizedOut) && normalizedIn !== normalizedOut;
  return {
    mismatch,
    sealIn: (sealIn ?? "").trim(),
    sealOut: (sealOut ?? "").trim(),
    normalizedIn,
    normalizedOut,
  };
}
