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

export type SealGlyph = { char: string; differs: boolean };

/** Digit-by-digit compare for the mismatch panel. Differing characters are boxed. */
export function sealGlyphs(
  expected: string | null | undefined,
  found: string | null | undefined,
): { expected: SealGlyph[]; found: SealGlyph[] } {
  const left = normalizeSeal(expected);
  const right = normalizeSeal(found);
  const length = Math.max(left.length, right.length);
  const expectedGlyphs: SealGlyph[] = [];
  const foundGlyphs: SealGlyph[] = [];
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? "";
    const b = right[index] ?? "";
    const differs = a !== b;
    expectedGlyphs.push({ char: a || "·", differs });
    foundGlyphs.push({ char: b || "·", differs });
  }
  return { expected: expectedGlyphs, found: foundGlyphs };
}
