import * as dotenv from "dotenv";
dotenv.config();

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    serviceKey: process.env.SUPABASE_SERVICE_KEY || "",
  },
  google: {
    apiKey: process.env.GOOGLE_AI_API_KEY || "",
    embeddingModel: "gemini-embedding-001",
    flashModel: "gemini-3.1-flash-lite-preview",
  },
  meny: {
    storeId: process.env.MENY_STORE_ID || "7080001150488",
    apiBase: "https://platform-rest-prod.ngdata.no",
    chainId: "1300",
  },
  afood: {
    baseUrl: "https://afoodmarket.no",
    apiUrl: "https://afoodmarket.no/wp-json/wp/v2",
    ajaxUrl: "https://afoodmarket.no/wp-admin/admin-ajax.php",
  },
  sync: {
    batchSize: 50,
    delayMs: 300,
  },
  matching: {
    similarityThreshold: 0.45,
    concurrency: 5,
    tier2CandidateCount: 20,
    blendWeights: { semantic: 0.4, productScore: 0.6 },
    categoryBoost: 0.15,
    quantityBlend: { stored: 0.7, fit: 0.3 },
    linkingMinScore: 0.3,
    linkingMaxProducts: 5,
  },
  embedding: {
    concurrency: 5,
    rateLimitMs: 50,
    maxCacheSize: 500,
  },
  profile: {
    dir: "~/.foodie",
  },
} as const;

export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.supabase.url) missing.push("SUPABASE_URL");
  if (!config.supabase.serviceKey) missing.push("SUPABASE_SERVICE_KEY");
  if (!config.google.apiKey) missing.push("GOOGLE_AI_API_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}\nCopy .env.example to .env and fill in the values.`);
  }
}
