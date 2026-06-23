import { createClient } from "npm:@supabase/supabase-js@2";

// Adds a tenant's domain to Supabase's allowed redirect URL list via the
// Supabase Management API. Called by the operator panel; super-admin only.
//
// Required secret: SUPABASE_ACCESS_TOKEN — a Supabase Personal Access Token
// (supabase.com/dashboard/account/tokens). Built-in env vars (SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) are injected automatically.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Validate the caller's JWT, then verify super_admin via service role.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: profile } = await adminClient
    .from("profiles")
    .select("super_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.super_admin) return json({ error: "Forbidden" }, 403);

  // Parse and normalise the domain (e.g. "https://acme.dohdash.app").
  let domain: string;
  try {
    ({ domain } = await req.json() as { domain: string });
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!domain || typeof domain !== "string") return json({ error: "domain is required" }, 400);
  domain = domain.replace(/\/+$/, ""); // strip trailing slashes
  const redirectUrl = `${domain}/**`;

  // Project ref is embedded in the Supabase URL (e.g. "awytndrcppmevaguyikg").
  const projectRef = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (!projectRef) return json({ error: "Cannot derive project ref from SUPABASE_URL" }, 500);

  const accessToken = Deno.env.get("SUPABASE_ACCESS_TOKEN");
  if (!accessToken) {
    return json(
      {
        error:
          "SUPABASE_ACCESS_TOKEN not configured. Create a Personal Access Token at " +
          "supabase.com/dashboard/account/tokens and add it as an Edge Function secret.",
      },
      500,
    );
  }

  const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
  const mgmtHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // Fetch the current allowed redirect URL list.
  const getRes = await fetch(mgmtUrl, { headers: mgmtHeaders });
  if (!getRes.ok) {
    const text = await getRes.text();
    return json({ error: `Supabase Management API error (GET): ${text}` }, 502);
  }
  const config = (await getRes.json()) as { additional_redirect_urls?: string[] };
  const existing: string[] = config.additional_redirect_urls ?? [];

  if (existing.includes(redirectUrl)) {
    return json({ alreadyPresent: true, redirectUrl });
  }

  // Append the new URL and PATCH it back.
  const patchRes = await fetch(mgmtUrl, {
    method: "PATCH",
    headers: mgmtHeaders,
    body: JSON.stringify({ additional_redirect_urls: [...existing, redirectUrl] }),
  });
  if (!patchRes.ok) {
    const text = await patchRes.text();
    return json({ error: `Supabase Management API error (PATCH): ${text}` }, 502);
  }

  return json({ added: true, redirectUrl });
});
