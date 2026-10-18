import { describe, expect, it } from "vitest";
import { enqueue, flushOutbox, memoryOutbox, type OutboxRecord, type SyncResult } from "@/lib/client/outbox";

describe("outbox", () => {
  it("keeps one row per client id and does not duplicate a flush that stops halfway", async () => {
    const store = memoryOutbox();
    const first = await enqueue(store, {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      kind: "check_in",
      body: { trailerNumber: "HL-1" },
      deviceTime: "2026-10-18T12:00:00.000Z",
    });
    const again = await enqueue(store, {
      id: first.id,
      kind: "check_in",
      body: { trailerNumber: "OTHER" },
      deviceTime: first.deviceTime,
    });
    expect(again.body.trailerNumber).toBe("HL-1");
    await enqueue(store, {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      kind: "check_out",
      body: { visitId: "v" },
      deviceTime: first.deviceTime,
    });

    const seen: string[] = [];
    const send = async (record: OutboxRecord): Promise<SyncResult> => {
      seen.push(record.id);
      if (record.kind === "check_out") throw new Error("offline");
      return { id: record.id, status: "accepted" };
    };
    const mid = await flushOutbox(store, send);
    expect(mid.sent).toBe(1);
    expect(mid.pending).toBe(1);
    expect(seen).toEqual([first.id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]);

    const done = await flushOutbox(store, async (record) => {
      seen.push(record.id);
      return { id: record.id, status: record.kind === "check_in" ? "duplicate" : "accepted" };
    });
    expect(done.pending).toBe(0);
    expect(seen.filter((id) => id === first.id)).toEqual([first.id]);
    expect(await store.list()).toEqual([]);
  });
});