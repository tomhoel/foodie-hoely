import { NextResponse } from "next/server";
import { getSupabase } from "@/src/db/client";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabase();
  const results: Record<string, unknown> = {};

  // 1. Hard-delete products discontinued for >180 days
  // Generous grace period — products often go out of stock seasonally
  // and come back. Keeping their enrichment data avoids re-processing.
  const cutoff180d = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const { data: purged, error: purgeErr } = await db
    .from("products")
    .delete()
    .eq("is_discontinued", true)
    .lt("updated_at", cutoff180d)
    .select("id");

  results.purged_products = purgeErr ? `error: ${purgeErr.message}` : (purged?.length || 0);

  // 2. Trim price_history older than 1 year
  const cutoff1y = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data: trimmed, error: trimErr } = await db
    .from("price_history")
    .delete()
    .lt("recorded_at", cutoff1y)
    .select("id");

  results.trimmed_price_history = trimErr ? `error: ${trimErr.message}` : (trimmed?.length || 0);

  // 3. Aggregate stats
  const [totalProducts, activeProducts, discontinued, priceHistoryCount] = await Promise.all([
    db.from("products").select("id", { count: "exact", head: true }),
    db.from("products").select("id", { count: "exact", head: true }).eq("is_discontinued", false).eq("in_stock", true),
    db.from("products").select("id", { count: "exact", head: true }).eq("is_discontinued", true),
    db.from("price_history").select("id", { count: "exact", head: true }),
  ]);

  results.stats = {
    total_products: totalProducts.count || 0,
    active_products: activeProducts.count || 0,
    discontinued_products: discontinued.count || 0,
    price_history_rows: priceHistoryCount.count || 0,
  };

  return NextResponse.json({ status: "ok", results });
}
