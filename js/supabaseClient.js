import { SUPABASE_URL, SUPABASE_ANON_KEY, NET_ENABLED } from "./env.js";

// `null` w trybie offline — żaden moduł sieciowy nie powinien go wtedy wołać
// (wszystkie miejsca korzystające z `supabase` są zabezpieczone `NET_ENABLED`).
export const supabase = NET_ENABLED ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
