import { DEMO_WEBHOOK_KEY } from "@/lib/demo/ids";
import { getDatabase } from "@/lib/db/client";
import { imageryConfig } from "@/lib/imagery/naip";
import { apiError } from "@/lib/http";
import { aiRuntimeProvider, emailInboundDomain } from "@/lib/runtime/flags";
import { loadConfig, requireSite } from "@/lib/yard/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await getDatabase();
    const site = await requireSite(db);
    const config = await loadConfig(db, site);
    const keys = await db.query<{ key_hint: string }>(
      `select key_hint from feed_keys where site_id = $1 order by created_at desc limit 1`,
      [site.id],
    );
    return Response.json({
      emailAddress: config.snapshot.feeds.emailAddress,
      emailDomain: emailInboundDomain(),
      allowedSenders: config.snapshot.feeds.allowedSenders,
      webhookHint: keys[0]?.key_hint ?? config.snapshot.feeds.webhookHint,
      demoWebhookKey: DEMO_WEBHOOK_KEY,
      aiProvider: aiRuntimeProvider(),
      imagery: imageryConfig().provider,
    });
  } catch (error) {
    return apiError(error);
  }
}
