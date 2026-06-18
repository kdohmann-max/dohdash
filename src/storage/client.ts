import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// The single Supabase client for the whole app. Every storage domain module
// imports it from here; nothing outside src/storage/ may import it directly.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
