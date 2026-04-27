import { NextResponse } from "next/server";
import { syncWithDiff } from "@/src/sync/sync-orchestrator";
import { startSyncLog, completeSyncLog, failSyncLog } from "@/src/db/client";

export const maxDuration = 300;

/** aFood sync — slower (~3-5 min with concurrency optimization). */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logId = await startSyncLog("afood", "cron-sync");
  const startTime = Date.now();

  try {
    const result = await syncWithDiff("afood");
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    await completeSyncLog(logId, {
      products_synced: result.total,
      products_added: result.added,
      products_updated: result.updated,
      products_removed: result.removed,
      price_changes: result.priceChanges,
    });

    return NextResponse.json({ status: result.error ? "error" : "ok", elapsed: `${elapsed}s`, result });
  } catch (err: any) {
    await failSyncLog(logId, err.message);
    return NextResponse.json({ status: "error", error: err.message }, { status: 200 });
  }
}
