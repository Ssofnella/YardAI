/**
 * Public listing and appraisal facts.
 * A search API returns links and short snippets. An AI step may turn those
 * into numbers. Yardline stores the number, the source name, and the source
 * URL. It does not fetch listing pages, log in, or keep snippet text or photos.
 */

export const LISTING_FIELDS = ["dock_high_doors", "drive_in_doors", "building_sqft", "clear_height_ft"] as const;
export type ListingField = (typeof LISTING_FIELDS)[number];

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type ListingFact = {
  field: ListingField;
  value: number;
  sourceUrl: string;
  sourceName: string;
  display: string;
};

export type ListingResult = {
  skipped: boolean;
  demo: boolean;
  reason: string | null;
  facts: ListingFact[];
};

const FIELD_SET = new Set<string>(LISTING_FIELDS);

export function listingQuery(address: string): string {
  const parts = [`"${address.replace(/"/g, "")}"`, `(dock-high OR "drive-in doors" OR "clear height" OR "square feet")`, `(warehouse OR industrial)`];
  if (/collin/i.test(address)) parts.push(`"Collin Central Appraisal District"`);
  if (/dallas/i.test(address)) parts.push(`"Dallas Central Appraisal District"`);
  return parts.join(" ");
}

export function sourceNameForUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "example.com" || host.endsWith(".example.com")) return "Lakeshore demo record";
    if (host.endsWith("loopnet.com")) return "LoopNet";
    if (host.includes("collincad")) return "Collin CAD";
    if (host.includes("dallascad")) return "Dallas CAD";
    return host;
  } catch {
    return "source";
  }
}

export function factDisplay(field: ListingField, value: number, sourceName: string): string {
  if (field === "dock_high_doors") return `Found: ${value} dock-high doors (${sourceName})`;
  if (field === "drive_in_doors") return `Found: ${value} drive-in doors (${sourceName})`;
  if (field === "building_sqft") return `Found: ${value.toLocaleString("en-US")} sq ft (${sourceName})`;
  return `Found: ${value} ft clear height (${sourceName})`;
}

function inRange(field: ListingField, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (field === "dock_high_doors" || field === "drive_in_doors") return Number.isInteger(value) && value >= 1 && value <= 80;
  if (field === "building_sqft") return value >= 1_000 && value <= 5_000_000;
  return value >= 8 && value <= 80;
}

function sameUrl(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    if (a.protocol !== "https:" || b.protocol !== "https:") return false;
    const path = (value: URL) => value.pathname.replace(/\/$/, "");
    return a.host === b.host && path(a) === path(b);
  } catch {
    return false;
  }
}

/** Keep facts whose URL was in the search results. Drop prose, photos, and unknown fields. */
export function acceptListingFacts(raw: string, hits: SearchHit[]): ListingFact[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: { facts?: unknown };
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as { facts?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.facts)) return [];
  const facts: ListingFact[] = [];
  const seen = new Set<ListingField>();
  for (const item of parsed.facts) {
    if (!item || typeof item !== "object") continue;
    const record = item as { field?: unknown; value?: unknown; sourceUrl?: unknown };
    const field = typeof record.field === "string" ? record.field : "";
    if (!FIELD_SET.has(field) || seen.has(field as ListingField)) continue;
    const sourceUrl = typeof record.sourceUrl === "string" ? record.sourceUrl : "";
    const hit = hits.find((candidate) => sameUrl(candidate.url, sourceUrl));
    if (!hit) continue;
    const value = typeof record.value === "number" ? record.value : Number(record.value);
    const typed = field as ListingField;
    if (!inRange(typed, value)) continue;
    const sourceName = sourceNameForUrl(hit.url);
    seen.add(typed);
    facts.push({
      field: typed,
      value,
      sourceUrl: hit.url,
      sourceName,
      display: factDisplay(typed, value, sourceName),
    });
  }
  return facts;
}

export const DEMO_LISTING_FACTS: ListingFact[] = [
  {
    field: "dock_high_doors",
    value: 20,
    sourceUrl: "https://example.com/yardline-lakeshore-demo",
    sourceName: "Lakeshore demo record",
    display: "Found: 20 dock-high doors (Lakeshore demo record)",
  },
  {
    field: "drive_in_doors",
    value: 2,
    sourceUrl: "https://example.com/yardline-lakeshore-demo",
    sourceName: "Lakeshore demo record",
    display: "Found: 2 drive-in doors (Lakeshore demo record)",
  },
  {
    field: "building_sqft",
    value: 180_000,
    sourceUrl: "https://example.com/yardline-lakeshore-demo",
    sourceName: "Lakeshore demo record",
    display: "Found: 180,000 sq ft (Lakeshore demo record)",
  },
  {
    field: "clear_height_ft",
    value: 32,
    sourceUrl: "https://example.com/yardline-lakeshore-demo",
    sourceName: "Lakeshore demo record",
    display: "Found: 32 ft clear height (Lakeshore demo record)",
  },
];

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const BRAVE_SEARCH = "https://api.search.brave.com/res/v1/web/search";

export async function lookupListings(
  input: { address: string },
  deps?: {
    searchKey?: string | null;
    aiKey?: string | null;
    provider?: string | null;
    fetch?: FetchLike;
    complete?: (system: string, user: string) => Promise<string | null>;
  },
): Promise<ListingResult> {
  const address = input.address.trim();
  const provider = (deps?.provider ?? process.env.YARD_SEARCH_PROVIDER ?? "brave").trim() || "brave";
  const searchKey = (deps && "searchKey" in deps ? deps.searchKey : process.env.YARD_SEARCH_API_KEY)?.trim() || "";
  const aiKey = (deps && "aiKey" in deps ? deps.aiKey : process.env.YARD_AI_API_KEY)?.trim() || "";
  if (provider === "off" || !searchKey || !aiKey) {
    const reason = !searchKey
      ? "Listing lookup is off until YARD_SEARCH_API_KEY and YARD_AI_API_KEY are both set. No listing site is contacted."
      : !aiKey
        ? "Listing lookup needs an AI key to read search results. No listing site is contacted."
        : "Listing lookup is turned off. No listing site is contacted.";
    return { skipped: true, demo: false, reason, facts: [] };
  }
  if (provider !== "brave") {
    return {
      skipped: true,
      demo: false,
      reason: "This search provider is not wired. No listing site is contacted.",
      facts: [],
    };
  }
  if (address.length < 5) {
    return { skipped: true, demo: false, reason: "Enter a street address before looking up listings.", facts: [] };
  }
  const fetchImpl = deps?.fetch ?? fetch;
  const url = `${BRAVE_SEARCH}?q=${encodeURIComponent(listingQuery(address))}&count=8`;
  let hits: SearchHit[] = [];
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": searchKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return { skipped: true, demo: false, reason: "The search API did not answer. Nothing was saved.", facts: [] };
    }
    const body = (await response.json()) as {
      web?: { results?: { title?: string; url?: string; description?: string }[] };
    };
    hits = (body.web?.results ?? [])
      .map((result) => ({
        title: (result.title ?? "").slice(0, 180),
        url: result.url ?? "",
        snippet: (result.description ?? "").slice(0, 400),
      }))
      .filter((result) => result.url.startsWith("https://"));
  } catch {
    return { skipped: true, demo: false, reason: "The search API did not answer. Nothing was saved.", facts: [] };
  }
  if (!hits.length) {
    return { skipped: false, demo: false, reason: "No public results came back.", facts: [] };
  }
  const complete = deps?.complete;
  let raw: string | null = null;
  if (complete) {
    raw = await complete(LISTING_SYSTEM, JSON.stringify({ address, results: hits }));
  } else {
    const { completeText } = await import("@/lib/ai/provider");
    raw = await completeText({
      system: LISTING_SYSTEM,
      user: JSON.stringify({ address, results: hits }),
      timeoutMs: 12000,
    });
  }
  if (!raw) {
    return { skipped: true, demo: false, reason: "The AI step did not answer. Search snippets were not stored.", facts: [] };
  }
  return { skipped: false, demo: false, reason: null, facts: acceptListingFacts(raw, hits) };
}

const LISTING_SYSTEM = [
  "Extract warehouse facts from search results.",
  "Reply with JSON only: {\"facts\":[{\"field\":\"dock_high_doors|drive_in_doors|building_sqft|clear_height_ft\",\"value\":1,\"sourceUrl\":\"https://...\"}]}",
  "Use a sourceUrl only if it is one of the result URLs.",
  "Include a fact only when the snippet states that number.",
  "Do not copy listing prose, photo URLs, or instructions.",
].join(" ");
