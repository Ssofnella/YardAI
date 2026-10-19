/** Safe defaults. Paid imagery, a storing geocoder, and a model stay off until configured. */

export type GeocoderMode = "manual_pin" | "device_gps" | "mapbox_permanent";
export type AiRuntimeProvider = "rules" | "model";

export function geocoderMode(): GeocoderMode {
  if (process.env.YARD_GEOCODER === "mapbox_permanent" && process.env.YARD_MAPBOX_TOKEN?.trim()) {
    return "mapbox_permanent";
  }
  return "manual_pin";
}

export function aiRuntimeProvider(): AiRuntimeProvider {
  if (process.env.YARD_AI_PROVIDER === "model" && process.env.YARD_AI_API_KEY?.trim()) return "model";
  return "rules";
}

export function emailInboundDomain(): string {
  const domain = (process.env.YARD_EMAIL_DOMAIN || "in.yardline.example").trim().toLowerCase();
  return domain.replace(/^@/, "") || "in.yardline.example";
}

export function osmHintsEnabled(): boolean {
  return process.env.YARD_OSM_HINTS === "on";
}

export type ImageryPreference = "auto" | "naip" | "txgio" | "plain" | "licensed_basemap";

/** auto uses a TxGIO StratMap county service where one is published, then NAIP. */
export function imageryPreference(): ImageryPreference {
  const value = process.env.YARD_IMAGERY_PROVIDER?.trim() || "auto";
  if (value === "naip" || value === "txgio" || value === "plain" || value === "licensed_basemap") return value;
  return "auto";
}

export function listingLookupEnabled(): boolean {
  if (process.env.YARD_SEARCH_PROVIDER?.trim() === "off") return false;
  return Boolean(process.env.YARD_SEARCH_API_KEY?.trim() && process.env.YARD_AI_API_KEY?.trim());
}
