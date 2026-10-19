import { imageryConfig, type ImageryConfig } from "@/lib/imagery/naip";
import { stratMapAt, txgioImageryConfig } from "@/lib/imagery/txgio";
import { imageryPreference } from "@/lib/runtime/flags";

const NAIP_FALLBACK =
  "No published TxGIO StratMap county service covers this pin, so the basemap is USDA NAIP where that scene is shipped. Door marks stay drafts. This image is not sent to a model.";

/**
 * Pick a basemap for a pin.
 * auto and txgio use StratMap where a catalogued county service contains the point.
 * Everywhere else, including Texas counties that are not on the public server, uses NAIP.
 * plain and licensed_basemap stay display settings and are never model input.
 */
export function resolveImagery(point: { lng: number; lat: number }): ImageryConfig {
  const preference = imageryPreference();
  if (preference === "plain" || preference === "licensed_basemap" || preference === "naip") {
    return imageryConfig();
  }
  const service = stratMapAt(point.lng, point.lat);
  if (!service) {
    return { ...imageryConfig(), note: NAIP_FALLBACK };
  }
  return txgioImageryConfig(service, point);
}
