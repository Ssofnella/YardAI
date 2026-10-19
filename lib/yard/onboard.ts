import type { FeedMode, SiteConfigSnapshot } from "@/lib/domain/config";
import { normalizeFeeds } from "@/lib/domain/config";
import type { Database } from "@/lib/db/types";
import { YardError } from "@/lib/db/types";
import { newFeedKey } from "@/lib/onboarding/keys";
import { isPublishable, layoutToSnapshot, type LayoutDraft } from "@/lib/onboarding/layout";
import { loadConfig, requireSite } from "@/lib/yard/context";
import { publishConfig } from "@/lib/yard/operations";

const MODES = new Set<FeedMode>(["manual", "csv", "email", "webhook"]);

export function assertDraft(value: LayoutDraft): void {
  if (!value?.center || !Number.isFinite(value.center.lat) || !Number.isFinite(value.center.lng)) {
    throw new YardError("The map needs a center point");
  }
  const doors = (value.doors ?? []).filter(isPublishable);
  const spots = (value.spots ?? []).filter(isPublishable);
  if (!doors.length) {
    throw new YardError("Accept at least one door. Suggested marks stay drafts until you accept them.");
  }
  if (!spots.length) {
    throw new YardError("Accept at least one spot, or use the grid template.");
  }
  for (const door of doors) {
    if (!door.name?.trim()) throw new YardError("Every door needs a number");
  }
  for (const spot of spots) {
    if (!spot.name?.trim()) throw new YardError("Every spot needs a number");
  }
}

export async function saveAllowedSenders(db: Database, senders: string[]): Promise<string[]> {
  const site = await requireSite(db);
  const config = await loadConfig(db, site);
  const snapshot = structuredClone(config.snapshot);
  snapshot.feeds = normalizeFeeds({ ...snapshot.feeds, allowedSenders: senders });
  if (!snapshot.feeds.allowedSenders.length) {
    throw new YardError("Add at least one sender domain.");
  }
  await publishConfig(db, snapshot, "Email sender allowlist");
  return snapshot.feeds.allowedSenders;
}

export async function confirmOnboarding(
  db: Database,
  draft: LayoutDraft,
  feedMode: string,
  allowedSenders: string[] = [],
): Promise<{ version: number; webhookKey: string | null; webhookHint: string | null }> {
  assertDraft(draft);
  const mode = MODES.has(feedMode as FeedMode) ? (feedMode as FeedMode) : "manual";
  const site = await requireSite(db);
  const config = await loadConfig(db, site);
  const keys = await db.query<{ key_hint: string }>(
    `select key_hint from feed_keys where site_id = $1 order by created_at desc limit 1`,
    [site.id],
  );
  let webhookKey: string | null = null;
  let webhookHint = keys[0]?.key_hint ?? null;
  if (mode === "webhook" && !keys.length) {
    const created = newFeedKey();
    webhookKey = created.key;
    webhookHint = created.hint;
    await db.query(
      `insert into feed_keys (id, site_id, key_hash, key_hint) values ($1, $2, $3, $4)`,
      [crypto.randomUUID(), site.id, created.hash, created.hint],
    );
  }
  const snapshot: SiteConfigSnapshot = layoutToSnapshot(draft, config.snapshot);
  const senders = allowedSenders.length ? allowedSenders : snapshot.feeds.allowedSenders;
  if (mode === "email" && senders.length === 0) {
    throw new YardError("Add at least one sender domain before email-in can be saved.");
  }
  snapshot.feeds = normalizeFeeds({
    ...snapshot.feeds,
    mode,
    webhookHint,
    allowedSenders: senders,
  });
  const published = await publishConfig(db, snapshot, "Guided setup");
  await db.query(
    `update sites set address = $2, latitude = $3, longitude = $4, onboarded_at = now() where id = $1`,
    [site.id, draft.address || null, draft.center.lat, draft.center.lng],
  );
  return { version: published.version, webhookKey, webhookHint };
}
