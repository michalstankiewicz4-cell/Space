import { SUPABASE_URL, SUPABASE_ANON_KEY, NET_ENABLED } from "./env.js";

// `null` in offline mode — no networking module should call it then (every
// place that uses `supabase` is guarded by `NET_ENABLED`).
export const supabase = NET_ENABLED ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
