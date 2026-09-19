// Environment configuration (Supabase). See README.md, section
// "Multiplayer / Supabase setup". The `anon key` is public by design
// (security comes from the RLS policies in supabase/schema.sql), so keeping
// it in this file is safe — passwords/service-role keys never go here.
//
// These values can be overridden without editing this file (e.g. to test
// against a different Supabase project) — just set
// `window.ROJ_ENV = { SUPABASE_URL, SUPABASE_ANON_KEY }` before the game loads.

const DEFAULTS = {
  SUPABASE_URL: "https://qbtbquzylmgheaqlljhg.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFidGJxdXp5bG1naGVhcWxsamhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTgxODAsImV4cCI6MjEwNTMzNDE4MH0.UkE2dYBVdHOIj3LLik3nbRlp3jsKIrYEsbGkwYclzUM"
};

const overrides = (typeof window !== "undefined" && window.ROJ_ENV) || {};

export const SUPABASE_URL = overrides.SUPABASE_URL || DEFAULTS.SUPABASE_URL;
export const SUPABASE_ANON_KEY = overrides.SUPABASE_ANON_KEY || DEFAULTS.SUPABASE_ANON_KEY;

// The game runs in local (offline) mode if multiplayer isn't configured, or
// if the supabase-js script (loaded via a classic <script> in index.html)
// failed to load.
export const NET_ENABLED = !!SUPABASE_URL && !!SUPABASE_ANON_KEY &&
  SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1 &&
  SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE") === -1 &&
  typeof window !== "undefined" && typeof window.supabase !== "undefined";
