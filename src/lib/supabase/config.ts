// Supabase configuration detection. BLACKNET runs fully offline (localStorage)
// when these env vars are absent, so the game is playable with zero backend
// setup; when present, it enables cloud auth + synchronized saves.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = (): boolean =>
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
