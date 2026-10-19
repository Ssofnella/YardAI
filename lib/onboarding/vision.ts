/**
 * Imagery is not sent to a model.
 * USDA NAIP is public domain, but at 0.6 m dock doors are usually invisible,
 * and licensed imagery must not be traced. Door marks are geometry guesses.
 */
export async function visionFootprint(): Promise<null> {
  return null;
}
