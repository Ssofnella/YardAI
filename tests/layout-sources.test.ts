import { afterEach, describe, expect, it } from "vitest";
import { imageryConfig } from "@/lib/imagery/naip";
import { resolveImagery } from "@/lib/imagery/resolve";
import { stratMapAt, txgioExportUrl } from "@/lib/imagery/txgio";
import { layoutDecisions } from "@/lib/onboarding/decisions";
import { acceptListingFacts, lookupListings, type SearchHit } from "@/lib/onboarding/listings";
import { isPublishable } from "@/lib/onboarding/layout";
import { mergeLayoutSources } from "@/lib/onboarding/merge";
import { layoutFromVision, parseVisionMarks } from "@/lib/onboarding/photo-draft";
import { visionFootprint } from "@/lib/onboarding/vision";

const AUSTIN = { lng: -97.7431, lat: 30.2672 };
const DALLAS = { lng: -96.8434745, lat: 32.7814945 };
const CHICAGO = { lng: -87.6298, lat: 41.8781 };

const previousProvider = process.env.YARD_IMAGERY_PROVIDER;

afterEach(() => {
  if (previousProvider === undefined) delete process.env.YARD_IMAGERY_PROVIDER;
  else process.env.YARD_IMAGERY_PROVIDER = previousProvider;
});

describe("TxGIO StratMap and NAIP", () => {
  it("uses StratMap inside a published county service and NAIP outside it", () => {
    delete process.env.YARD_IMAGERY_PROVIDER;
    const austin = resolveImagery(AUSTIN);
    expect(austin.provider).toBe("txgio");
    expect(austin.resolutionM).toBeLessThan(0.6);
    expect(austin.captureYear).toBeGreaterThanOrEqual(2016);
    expect(austin.attribution).toMatch(/Texas Geographic Information Office/);
    expect(austin.tileTemplate).toBe("/api/imagery/txgio/{z}/{x}/{y}");
    expect(austin.sendsToModel).toBe(false);
    expect(austin.tileTemplate ?? "").not.toMatch(/google|mapbox|esri|arcgis|arcgisonline/i);
    expect(austin.collection).toMatch(/^StratMap/);

    const dallas = resolveImagery(DALLAS);
    expect(dallas.provider).toBe("naip");
    expect(dallas.tileTemplate).toMatch(/^\/imagery\/naip\//);

    const chicago = resolveImagery(CHICAGO);
    expect(chicago.provider).toBe("naip");
    expect(chicago.note).toMatch(/NAIP/);
  });

  it("keeps an explicit NAIP lock and the default global config on this origin", () => {
    process.env.YARD_IMAGERY_PROVIDER = "naip";
    expect(resolveImagery(AUSTIN).provider).toBe("naip");
    delete process.env.YARD_IMAGERY_PROVIDER;
    const imagery = imageryConfig();
    expect(imagery.provider).toBe("naip");
    expect(imagery.sendsToModel).toBe(false);
  });

  it("builds a TxGIO export URL only for a catalogued service", () => {
    const service = stratMapAt(AUSTIN.lng, AUSTIN.lat);
    expect(service).toBeTruthy();
    const url = txgioExportUrl(service!.id, [-1, -1, 1, 1]);
    const parsed = new URL(url);
    expect(parsed.host).toBe("imagery.geographic.texas.gov");
    expect(parsed.pathname).toContain(`/StratMap/${service!.id}/ImageServer/exportImage`);
    expect(url).not.toMatch(/google|mapbox|esri|arcgisonline|arcgis\.com/i);
    expect(() => txgioExportUrl("https://services.arcgisonline.com/arcgis", [0, 0, 1, 1])).toThrow(/Unknown/);
  });

  it("does not send aerial imagery to a model", async () => {
    await expect(visionFootprint()).resolves.toBeNull();
  });
});

describe("listing facts", () => {
  const hit: SearchHit = {
    title: "Industrial warehouse",
    url: "https://www.loopnet.com/Listing/100",
    snippet: "20 dock-high doors and a long brochure paragraph that must not be stored",
  };

  it("keeps a sourced number and drops prose, photos, and unknown URLs", () => {
    const facts = acceptListingFacts(
      JSON.stringify({
        facts: [
          { field: "dock_high_doors", value: 20, sourceUrl: hit.url, sourceName: "not trusted" },
          { field: "drive_in_doors", value: 2, sourceUrl: "https://www.dallascad.org/Acct/123" },
          { field: "dock_high_doors", value: 9, sourceUrl: "https://evil.example/phish" },
          { field: "brochure", value: "copied listing text", sourceUrl: hit.url },
        ],
      }),
      [hit, { title: "CAD", url: "https://www.dallascad.org/Acct/123", snippet: "account" }],
    );
    expect(facts.map((fact) => fact.display)).toEqual([
      "Found: 20 dock-high doors (LoopNet)",
      "Found: 2 drive-in doors (Dallas CAD)",
    ]);
    expect(JSON.stringify(facts)).not.toMatch(/brochure|paragraph|copied listing/);
  });

  it("skips the lookup when a search key or an AI key is missing", async () => {
    const called: string[] = [];
    const result = await lookupListings(
      { address: "100 Industrial Blvd, Dallas, TX" },
      {
        searchKey: "",
        aiKey: "",
        fetch: async (url) => {
          called.push(url);
          throw new Error("should not fetch");
        },
      },
    );
    expect(result.skipped).toBe(true);
    expect(result.facts).toEqual([]);
    expect(called).toEqual([]);
    expect(result.reason).toMatch(/No listing site is contacted/);
  });

  it("calls only the search API and stores facts, not snippets", async () => {
    const called: string[] = [];
    const result = await lookupListings(
      { address: "100 Industrial Blvd, Dallas, TX" },
      {
        searchKey: "test-key",
        aiKey: "test-ai",
        provider: "brave",
        fetch: async (url) => {
          called.push(String(url));
          return new Response(
            JSON.stringify({
              web: { results: [{ title: hit.title, url: hit.url, description: hit.snippet }] },
            }),
          );
        },
        complete: async () =>
          JSON.stringify({
            facts: [{ field: "dock_high_doors", value: 20, sourceUrl: hit.url }],
          }),
      },
    );
    expect(called).toHaveLength(1);
    expect(called[0]).toMatch(/^https:\/\/api\.search\.brave\.com\//);
    expect(called.some((url) => /loopnet/i.test(url))).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.facts[0]?.display).toBe("Found: 20 dock-high doors (LoopNet)");
    expect(JSON.stringify(result)).not.toMatch(/brochure|paragraph/);
  });
});

describe("photo draft and merge", () => {
  it("places uploaded photo marks as unconfirmed suggestions", () => {
    const raw = `The building has many doors. ${JSON.stringify({
      kind: "dock_wall",
      marks: [
        { kind: "door", x: 0.2, y: 0.4, confidence: "medium" },
        { kind: "door", x: 0.8, y: 0.4, confidence: "high" },
        { kind: "spot", x: 0.5, y: 0.8, confidence: "high" },
      ],
    })} Do not copy this sentence.`;
    const vision = parseVisionMarks(raw, "dock_wall");
    expect(vision?.marks).toHaveLength(2);
    const draft = layoutFromVision(vision!, AUSTIN, "pin");
    expect(draft.doors.every((door) => door.status === "suggested" && door.sourceLabel === "Dock photo")).toBe(true);
    expect(draft.doors.every((door) => !isPublishable(door))).toBe(true);
    expect(JSON.stringify(draft)).not.toMatch(/Do not copy this sentence/);
    expect(draft.doors[0]?.position.lng).not.toBe(draft.doors[1]?.position.lng);
  });

  it("merges a listing count with a photo draft and keeps both labels", () => {
    const vision = parseVisionMarks(
      JSON.stringify({
        kind: "overhead",
        marks: [
          { kind: "door", x: 0.3, y: 0.2, confidence: "medium" },
          { kind: "door", x: 0.6, y: 0.2, confidence: "medium" },
          { kind: "spot", x: 0.4, y: 0.7, confidence: "low" },
        ],
      }),
      "overhead",
    );
    const merged = mergeLayoutSources({
      center: AUSTIN,
      address: "100 Industrial Blvd",
      facts: [
        {
          field: "dock_high_doors",
          value: 20,
          sourceUrl: "https://www.loopnet.com/Listing/100",
          sourceName: "LoopNet",
          display: "Found: 20 dock-high doors (LoopNet)",
        },
      ],
      vision,
      imagery: { provider: "txgio", label: "Imagery: TxGIO StratMap 2021 (6 inch, public domain)", note: "basemap" },
    });
    expect(merged.needsDoorCount).toBe(false);
    expect(merged.draft?.source).toBe("photo");
    expect(merged.draft?.doors).toHaveLength(2);
    expect(merged.draft?.doors.every((door) => door.sourceLabel === "Overhead photo" && door.status === "suggested")).toBe(true);
    expect(merged.draft?.spots.some((spot) => spot.sourceLabel === "Overhead photo")).toBe(true);
    expect(merged.draft?.factLines).toEqual(["Found: 20 dock-high doors (LoopNet)"]);
    expect(merged.draft?.conflicts?.[0]).toMatch(/20/);
    expect(merged.draft?.imageryProvider).toBe("txgio");
    expect(merged.draft?.doors.every((door) => !isPublishable(door))).toBe(true);
  });

  it("seeds a spacing draft from the listing when there is no photo", () => {
    const merged = mergeLayoutSources({
      center: DALLAS,
      facts: [
        {
          field: "dock_high_doors",
          value: 4,
          sourceUrl: "https://www.collincad.org/property/1",
          sourceName: "Collin CAD",
          display: "Found: 4 dock-high doors (Collin CAD)",
        },
      ],
      imagery: { provider: "naip", label: "Imagery: USDA NAIP 2022 (public domain)", note: "naip" },
    });
    expect(merged.draft?.source).toBe("listing");
    expect(merged.draft?.doors).toHaveLength(4);
    expect(merged.draft?.doors.every((door) => door.sourceLabel === "Listing door count" && door.confidence === "low")).toBe(true);
    expect(merged.tried).toContain("listing");
  });

  it("logs each suggestion and whether it was accepted", () => {
    const merged = mergeLayoutSources({
      center: DALLAS,
      doorCount: 2,
      facts: [
        {
          field: "clear_height_ft",
          value: 32,
          sourceUrl: "https://example.com/yardline-lakeshore-demo",
          sourceName: "Lakeshore demo record",
          display: "Found: 32 ft clear height (Lakeshore demo record)",
        },
      ],
      listingAccepted: true,
      imagery: { provider: "naip", label: "NAIP", note: "" },
    });
    const draft = merged.draft!;
    draft.doors = draft.doors.map((door, index) => ({
      ...door,
      status: index === 0 ? "accepted" : "rejected",
    }));
    const decisions = layoutDecisions(draft);
    const door = decisions.filter((item) => item.payload.suggestionId === "layout:door-1");
    expect(door.map((item) => item.eventType)).toEqual(["ai.suggested", "ai.accepted"]);
    expect(decisions.some((item) => item.eventType === "ai.dismissed" && item.payload.suggestionId === "layout:door-2")).toBe(true);
    expect(decisions.some((item) => item.payload.kind === "listing_fact" && item.eventType === "ai.suggested")).toBe(true);
    expect(JSON.stringify(decisions)).not.toMatch(/google|mapbox|esri imagery/i);
  });
});
