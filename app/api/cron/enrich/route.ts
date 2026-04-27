import { NextResponse } from "next/server";
import { enrichProducts } from "@/src/enrichment/product-enricher";
import { generateProductEmbeddings, generateIngredientEmbeddings } from "@/src/enrichment/embedding-generator";
import { linkIngredientsToProducts } from "@/src/ingredients/mapping-seeder";
import { startSyncLog, completeSyncLog, failSyncLog } from "@/src/db/client";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logId = await startSyncLog("all", "cron-enrich");
  const startTime = Date.now();

  const results: Record<string, unknown> = {};

  try {
    // Enrich new products (ai_description IS NULL)
    console.log("[cron-enrich] Running product enrichment...");
    const enrichResult = await enrichProducts();
    results.enriched = enrichResult;

    // Generate embeddings for un-embedded products
    console.log("[cron-enrich] Generating product embeddings...");
    const embedResult = await generateProductEmbeddings();
    results.productEmbeddings = embedResult;

    // Generate ingredient embeddings
    console.log("[cron-enrich] Generating ingredient embeddings...");
    const ingredientEmbedResult = await generateIngredientEmbeddings();
    results.ingredientEmbeddings = ingredientEmbedResult;

    // Re-link ingredients to products
    console.log("[cron-enrich] Linking ingredients to products...");
    await linkIngredientsToProducts();
    results.linked = true;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    await completeSyncLog(logId, {
      products_enriched: typeof enrichResult === "number" ? enrichResult : 0,
      embeddings_generated: typeof embedResult === "number" ? embedResult : 0,
    });

    return NextResponse.json({ status: "ok", elapsed: `${elapsed}s`, results });
  } catch (err: any) {
    await failSyncLog(logId, err.message);
    console.error("[cron-enrich] Failed:", err.message);
    return NextResponse.json(
      { status: "error", error: err.message, results },
      { status: 200 },
    );
  }
}
