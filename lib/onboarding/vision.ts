/**
 * Aerial imagery is not sent to a model.
 * USDA NAIP and TxGIO StratMap are basemaps only. A licensed tile URL is display-only.
 * Door marks from those images are spacing guesses until a person accepts them.
 * A photo or plan the user uploads is handled in photo-draft.ts.
 */
export async function visionFootprint(): Promise<null> {
  return null;
}
