import { createClient } from "@supabase/supabase-js";

const TEST_USER_EMAIL = "yeg.built.form@gmail.com";
const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: profile, error: pErr } = await admin
  .from("profiles").select("id, email").eq("email", TEST_USER_EMAIL).single();
if (pErr) { console.error("profile lookup failed:", pErr.message); process.exit(1); }
console.log("user id:", profile.id);

const { data: existing } = await admin
  .from("app_access").select("app_id").eq("user_id", profile.id).eq("app_id", "tasks");
if (existing && existing.length) {
  console.log("already has tasks access");
} else {
  const { error: iErr } = await admin.from("app_access").insert({
    user_id: profile.id, app_id: "tasks", granted_by: profile.id, created_at: Date.now(),
  });
  if (iErr) { console.error("grant failed:", iErr.message); process.exit(1); }
  console.log("granted tasks access");
}
