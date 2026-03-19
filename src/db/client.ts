import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabase.url, config.supabase.serviceKey);
  }
  return client;
}

// Helper: start a sync log entry
export async function startSyncLog(source: string, syncType: string): Promise<string> {
  const db = getSupabase();
  const { data, error } = await db
    .from("sync_log")
    .insert({ source, sync_type: syncType, status: "started" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// Helper: complete a sync log entry
export async function completeSyncLog(
  logId: string,
  stats: { products_synced?: number; products_enriched?: number; embeddings_generated?: number }
): Promise<void> {
  const db = getSupabase();
  const { error } = await db
    .from("sync_log")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      ...stats,
    })
    .eq("id", logId);
  if (error) throw error;
}

// Helper: fail a sync log entry
export async function failSyncLog(logId: string, errorMessage: string): Promise<void> {
  const db = getSupabase();
  const { error } = await db
    .from("sync_log")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq("id", logId);
  if (error) throw error;
}
