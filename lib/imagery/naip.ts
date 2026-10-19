/**
 * Self-hosted USDA NAIP tiles for one Texas 2022 quarter-quad.
 * The files live in public/imagery and are public-domain NAIP.
 * The browser never calls Google, Mapbox, or Esri.
 */
export const NAIP_SCENE = {
  provider: "naip" as const,
  captureYear: 2022,
  state: "tx",
  item: "tx_m_3209610_sw_14_060_20220704",
  resolutionM: 0.6,
  west: -96.879761,
  south: 32.74615,
  east: -96.807188,
  north: 32.816839,
  center: { lng: -96.8434745, lat: 32.7814945 },
  minZoom: 15,
  maxZoom: 17,
  label: "Imagery: USDA NAIP 2022 (public domain)",
  tileTemplate: "/imagery/naip/2022/tx/{z}/{x}/{y}.png",
};

export type ImageryProviderId = "naip" | "plain" | "licensed_basemap";

export type ImageryConfig = {
  provider: ImageryProviderId;
  captureYear: number;
  label: string;
  tileTemplate: string | null;
  minZoom: number;
  maxZoom: number;
  bounds: { west: number; south: number; east: number; north: number };
  center: { lng: number; lat: number };
  licensedEnabled: boolean;
  note: string;
};

export function imageryConfig(): ImageryConfig {
  const licensed = process.env.YARD_LICENSED_IMAGERY === "on";
  const requested = process.env.YARD_IMAGERY_PROVIDER?.trim() || "naip";
  if (requested === "plain") {
    return {
      provider: "plain",
      captureYear: NAIP_SCENE.captureYear,
      label: "No imagery. Draw on a plain canvas.",
      tileTemplate: null,
      minZoom: NAIP_SCENE.minZoom,
      maxZoom: NAIP_SCENE.maxZoom,
      bounds: NAIP_SCENE,
      center: NAIP_SCENE.center,
      licensedEnabled: licensed,
      note: "Plain canvas. Door marks are still drafts until you accept them.",
    };
  }
  if (requested === "licensed_basemap" && licensed && process.env.YARD_LICENSED_TILE_URL?.trim()) {
    return {
      provider: "licensed_basemap",
      captureYear: Number(process.env.YARD_LICENSED_CAPTURE_YEAR || NAIP_SCENE.captureYear),
      label: "Licensed imagery (legal review required). Not used as model input.",
      tileTemplate: process.env.YARD_LICENSED_TILE_URL.trim(),
      minZoom: 14,
      maxZoom: 19,
      bounds: NAIP_SCENE,
      center: NAIP_SCENE.center,
      licensedEnabled: true,
      note: "Licensed tiles are display-only. Yardline does not send them to a model.",
    };
  }
  return {
    provider: "naip",
    captureYear: NAIP_SCENE.captureYear,
    label: NAIP_SCENE.label,
    tileTemplate: NAIP_SCENE.tileTemplate,
    minZoom: NAIP_SCENE.minZoom,
    maxZoom: NAIP_SCENE.maxZoom,
    bounds: {
      west: NAIP_SCENE.west,
      south: NAIP_SCENE.south,
      east: NAIP_SCENE.east,
      north: NAIP_SCENE.north,
    },
    center: NAIP_SCENE.center,
    licensedEnabled: licensed,
    note: "This imagery is from 2022. Your yard may have changed. At 0.6 m, dock doors are often invisible, so door marks are a spacing guess until you accept them.",
  };
}

export function insideNaip(lng: number, lat: number): boolean {
  return lng >= NAIP_SCENE.west && lng <= NAIP_SCENE.east && lat >= NAIP_SCENE.south && lat <= NAIP_SCENE.north;
}
