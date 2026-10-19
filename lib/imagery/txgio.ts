/**
 * TxGIO (formerly TNRIS) StratMap county orthoimagery.
 *
 * The catalog is the ImageServer folder published at
 * https://imagery.geographic.texas.gov/server/rest/services/StratMap
 * as read on 19 Oct 2026. Accepted StratMap deliverables are in the public
 * domain. This is not the licensed Hexagon Texas Imagery Service.
 * Pixels are displayed only. They are never sent to a model.
 */
import type { ImageryConfig } from "@/lib/imagery/naip";

const EARTH = 6_378_137;
export const TXGIO_IMAGERY_HOST = "imagery.geographic.texas.gov";

export type StratMapService = {
  id: string;
  year: number;
  /** Ground sample distance in meters. NAIP is about 0.6 m. */
  resolutionM: number;
  resolutionLabel: string;
  place: string;
  attribution: string;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
};

export const STRATMAP_SERVICES: StratMapService[] = [
  {
    id: "StratMap16_NCCIR_6in_Smith",
    year: 2016,
    resolutionM: 0.1524,
    resolutionLabel: "6 inch",
    place: "Smith County",
    attribution:
      "Texas Geographic Information Office, City of Tyler, Smith County, Smith County 9-1-1, Smith County Appraisal District",
    xmin: -10643355.8097,
    ymin: 3769303.4219897036,
    xmax: -10568213.7749829,
    ymax: 3856126.0253000036,
  },
  {
    id: "StratMap18_NCCIR_6in_Smith_ETX",
    year: 2018,
    resolutionM: 0.1524,
    resolutionLabel: "6 inch",
    place: "East Texas counties including Smith",
    attribution:
      "Texas Geographic Information Office, City of Tyler, East Texas Council of Governments, Smith County, Smith County 9-1-1, Smith County Appraisal District, Texas Eastern 9-1-1",
    xmin: -10699004.6809,
    ymin: 3687490.8564706966,
    xmax: -10463833.3395652,
    ymax: 3907927.3747999966,
  },
  {
    id: "StratMap19_NCCIR_6in_Brazos",
    year: 2019,
    resolutionM: 0.1524,
    resolutionLabel: "6 inch",
    place: "Brazos area",
    attribution:
      "Texas Geographic Information Office, Brazos 9-1-1, Brazos Central Appraisal District, Capital Area Council of Governments, City of Austin, City of Bastrop, City of Bee Cave, City of Bryan, City of Burnet, City of College Station, City of Round Rock, City of West Lake Hills, Hays County, Texas A&M University, Texas Municipal Power Agency, Travis County",
    xmin: -10765118.4983,
    ymin: 3545621.5801370996,
    xmax: -10686483.143906299,
    ymax: 3630896.1011999995,
  },
  {
    id: "StratMap19_NCCIR_CapArea",
    year: 2019,
    resolutionM: 0.1524,
    resolutionLabel: "6 inch",
    place: "Capital Area",
    attribution:
      "Texas Geographic Information Office, Brazos 9-1-1, Brazos Central Appraisal District, Capital Area Council of Governments, City of Austin, City of Bastrop, City of Bee Cave, City of Bryan, City of Burnet, City of College Station, City of Round Rock, City of West Lake Hills, Hays County, Texas A&M University, Texas Municipal Power Agency, Travis County",
    xmin: -11019023.5625,
    ymin: 3453298.4496722016,
    xmax: -10747400.0506091,
    ymax: 3638986.9376000017,
  },
  {
    id: "StratMap20_NCCIR_CapArea_McLennan",
    year: 2020,
    resolutionM: 0.0762,
    resolutionLabel: "3 inch",
    place: "Capital Area and McLennan County",
    attribution:
      "Texas Geographic Information Office, Capital Area Council of Governments, City of Bee Cave, City of Burnet, City of Marble Falls, City of Pflugerville, City of Round Rock, City of Waco, City of West Lake Hills, McLennan County and McLennan County 9-1-1",
    xmin: -11019757.362205451,
    ymin: 3452938.2052335492,
    xmax: -10746451.732003301,
    ymax: 3750241.396274899,
  },
  {
    id: "StratMap21_NCCIR_CapArea_Brazos_Kerr",
    year: 2021,
    resolutionM: 0.1524,
    resolutionLabel: "6 inch",
    place: "Capital Area, Brazos, and Kerr",
    attribution:
      "Texas Geographic Information Office, Capital Area Council of Governments, Brazos Central Appraisal District, City of Austin, City of Bastrop, City of Bee Cave, City of Bryan, City of College Station, City of Round Rock, City of Horseshoe Bend, City of Smithville, City of Kerrville, Kerrville Public Utility Board, Texas A&M University, Texas Municipal Power Agency",
    xmin: -11081623.8412,
    ymin: 3455298.622009997,
    xmax: -10688222.126388699,
    ymax: 3638986.703599997,
  },
];

const BY_ID = new Map(STRATMAP_SERVICES.map((service) => [service.id, service]));

export function lngLatToMercator(lng: number, lat: number): { x: number; y: number } {
  const clamped = Math.max(-85, Math.min(85, lat));
  const x = EARTH * ((lng * Math.PI) / 180);
  const y = EARTH * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
  return { x, y };
}

export function mercatorToLngLat(x: number, y: number): { lng: number; lat: number } {
  const lng = (x / EARTH) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / EARTH)) - Math.PI / 2) * (180 / Math.PI);
  return { lng, lat };
}

export function serviceBounds(service: StratMapService): ImageryConfig["bounds"] {
  const westSouth = mercatorToLngLat(service.xmin, service.ymin);
  const eastNorth = mercatorToLngLat(service.xmax, service.ymax);
  return { west: westSouth.lng, south: westSouth.lat, east: eastNorth.lng, north: eastNorth.lat };
}

/** Newest collection that contains the point. A shared year prefers the finer pixel. */
export function stratMapAt(lng: number, lat: number): StratMapService | null {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const { x, y } = lngLatToMercator(lng, lat);
  const hits = STRATMAP_SERVICES.filter(
    (service) => x >= service.xmin && x <= service.xmax && y >= service.ymin && y <= service.ymax,
  );
  hits.sort((a, b) => b.year - a.year || a.resolutionM - b.resolutionM);
  return hits[0] ?? null;
}

export function tileBbox(z: number, x: number, y: number): [number, number, number, number] {
  const origin = 20037508.342789244;
  const span = (origin * 2) / 2 ** z;
  const minx = -origin + x * span;
  const maxx = minx + span;
  const maxy = origin - y * span;
  const miny = maxy - span;
  return [minx, miny, maxx, maxy];
}

export function stratMapForTile(
  z: number,
  x: number,
  y: number,
): { service: StratMapService; bbox: [number, number, number, number] } | null {
  const bbox = tileBbox(z, x, y);
  const center = mercatorToLngLat((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2);
  const service = stratMapAt(center.lng, center.lat);
  if (!service) return null;
  return { service, bbox };
}

const BLOCKED = /google|mapbox|esri|arcgisonline|arcgis\.com/i;

/** Public TxGIO exportImage URL. Refuses any host other than the StratMap server. */
export function txgioExportUrl(serviceId: string, bbox: [number, number, number, number]): string {
  const service = BY_ID.get(serviceId);
  if (!service) throw new Error("Unknown StratMap service");
  if (!bbox.every((value) => Number.isFinite(value))) throw new Error("Bad bbox");
  const url = new URL(
    `https://${TXGIO_IMAGERY_HOST}/server/rest/services/StratMap/${service.id}/ImageServer/exportImage`,
  );
  url.searchParams.set("bbox", bbox.map((value) => value.toFixed(3)).join(","));
  url.searchParams.set("bboxSR", "3857");
  url.searchParams.set("imageSR", "3857");
  url.searchParams.set("size", "256,256");
  url.searchParams.set("format", "png");
  url.searchParams.set("f", "image");
  if (url.host !== TXGIO_IMAGERY_HOST) throw new Error("Refusing imagery host");
  if (BLOCKED.test(url.toString())) throw new Error("Refusing blocked imagery host");
  return url.toString();
}

export function txgioImageryConfig(service: StratMapService, center: { lng: number; lat: number }): ImageryConfig {
  return {
    provider: "txgio",
    captureYear: service.year,
    label: `Imagery: TxGIO StratMap ${service.year} (${service.resolutionLabel}, public domain)`,
    tileTemplate: "/api/imagery/txgio/{z}/{x}/{y}",
    minZoom: 12,
    maxZoom: 19,
    bounds: serviceBounds(service),
    center,
    licensedEnabled: false,
    note: `TxGIO StratMap covers ${service.place}, ${service.year}, about ${service.resolutionLabel}. That is finer than NAIP. It is public-domain county ortho, not the licensed Texas Imagery Service. It is not sent to a model. Door marks stay drafts until you accept them.`,
    attribution: service.attribution,
    resolutionM: service.resolutionM,
    sendsToModel: false,
    collection: service.id,
  };
}
