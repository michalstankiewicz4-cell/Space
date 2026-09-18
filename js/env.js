// Konfiguracja środowiska (Supabase). Zobacz README.md, sekcja
// "Multiplayer / Supabase setup". `anon key` jest z założenia publiczny
// (bezpieczeństwo zapewniają reguły RLS w supabase/schema.sql), więc trzymanie
// go w tym pliku jest bezpieczne — to hasła/service-role key nigdy tu nie trafiają.
//
// Można nadpisać te wartości bez edytowania tego pliku (np. do testów na
// innym projekcie Supabase) — wystarczy przed załadowaniem gry ustawić
// `window.ROJ_ENV = { SUPABASE_URL, SUPABASE_ANON_KEY }`.

const DEFAULTS = {
  SUPABASE_URL: "https://qbtbquzylmgheaqlljhg.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFidGJxdXp5bG1naGVhcWxsamhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTgxODAsImV4cCI6MjEwNTMzNDE4MH0.UkE2dYBVdHOIj3LLik3nbRlp3jsKIrYEsbGkwYclzUM"
};

const overrides = (typeof window !== "undefined" && window.ROJ_ENV) || {};

export const SUPABASE_URL = overrides.SUPABASE_URL || DEFAULTS.SUPABASE_URL;
export const SUPABASE_ANON_KEY = overrides.SUPABASE_ANON_KEY || DEFAULTS.SUPABASE_ANON_KEY;

// Gra działa w trybie lokalnym (offline), jeśli multiplayer nie jest
// skonfigurowany albo skrypt supabase-js (ładowany klasycznym <script> w
// index.html) się nie wczytał.
export const NET_ENABLED = !!SUPABASE_URL && !!SUPABASE_ANON_KEY &&
  SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1 &&
  SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE") === -1 &&
  typeof window !== "undefined" && typeof window.supabase !== "undefined";
