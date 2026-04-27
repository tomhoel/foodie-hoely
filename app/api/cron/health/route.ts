import { NextResponse } from "next/server";
import { getSupabase } from "@/src/db/client";

export async function GET() {
  const db = getSupabase();

  // Recent sync logs (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: logs } = await db
    .from("sync_log")
    .select("source, sync_type, status, products_synced, products_added, products_updated, products_removed, price_changes, error_message, started_at, completed_at")
    .gte("started_at", sevenDaysAgo)
    .order("started_at", { ascending: false })
    .limit(20);

  // Product counts
  const [total, active, discontinued] = await Promise.all([
    db.from("products").select("id", { count: "exact", head: true }),
    db.from("products").select("id", { count: "exact", head: true }).eq("is_discontinued", false).eq("in_stock", true),
    db.from("products").select("id", { count: "exact", head: true }).eq("is_discontinued", true),
  ]);

  // Determine health status
  const recentSyncs = (logs || []).filter((l) => l.sync_type === "cron-sync" || l.sync_type === "full");
  const recentFailures = recentSyncs.filter((l) => l.status === "failed");
  const lastSuccess = recentSyncs.find((l) => l.status === "completed");

  let status: "healthy" | "degraded" | "failing" = "healthy";
  if (recentSyncs.length === 0) {
    status = "failing";
  } else if (recentFailures.length > recentSyncs.length / 2) {
    status = "failing";
  } else if (recentFailures.length > 0) {
    status = "degraded";
  }

  return NextResponse.json({
    status,
    products: {
      total: total.count || 0,
      active: active.count || 0,
      discontinued: discontinued.count || 0,
    },
    last_successful_sync: lastSuccess?.completed_at || null,
    recent_logs: logs || [],
  });
}
