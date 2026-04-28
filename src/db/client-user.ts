/**
 * User-scoped Supabase client factory.
 *
 * Phase 1 + Phase 2 W6/W7/W8 endpoints query through `getSupabase()` which
 * uses the service role key and bypasses RLS. That's correct for cron + system
 * code paths.
 *
 * For user-facing API endpoints that want to defer authorization to RLS rather
 * than enforce in handler code, use `getSupabaseForUser(jwt)`. The returned
 * client uses the anon key + the user's JWT, so every query is filtered by
 * the auth.uid()-based RLS policies installed in migration 007.
 *
 * No endpoints currently use this — added for future use.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

export function getSupabaseForUser(jwt: string): SupabaseClient {
  if (!config.supabase.url || !config.supabase.anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set for user-scoped client');
  }
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
