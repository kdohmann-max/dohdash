import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const TEST_USER_EMAIL = "yeg.built.form@gmail.com";
const DEV_SERVER_ORIGIN = "http://localhost:5173";
const OUTPUT_PATH = "playwright/.auth/admin.json";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error(
    "Missing required env vars. Need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, " +
      "and SUPABASE_SERVICE_ROLE_KEY in .env.local (run with --env-file=.env.local)."
  );
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
  type: "magiclink",
  email: TEST_USER_EMAIL,
});

if (linkError) {
  console.error("generateLink failed:", linkError.message);
  process.exit(1);
}

// Use email_otp, not hashed_token: this project's GoTrue rejects
// hashed_token from generateLink as immediately expired.
const tokenHash = linkData.properties.email_otp;

const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
  email: TEST_USER_EMAIL,
  token: tokenHash,
  type: "magiclink",
});

if (verifyError) {
  console.error("verifyOtp failed:", verifyError.message);
  process.exit(1);
}

const session = verifyData.session;
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const storageKey = `sb-${projectRef}-auth-token`;

const storageState = {
  cookies: [],
  origins: [
    {
      origin: DEV_SERVER_ORIGIN,
      localStorage: [{ name: storageKey, value: JSON.stringify(session) }],
    },
  ],
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(storageState, null, 2));
console.log(`Wrote session for ${TEST_USER_EMAIL} to ${OUTPUT_PATH}`);
