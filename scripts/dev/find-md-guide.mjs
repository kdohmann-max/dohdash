import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from("notes")
  .select("id, title, owner_id, updated_at, markdown")
  .ilike("title", "%markdown%");

if (error) { console.error(error); process.exit(1); }
console.log(`Found ${data.length} note(s):`);
for (const n of data) {
  console.log(`\n=== ${n.title} (${n.id}) owner=${n.owner_id} updated=${n.updated_at}`);
  console.log(`--- markdown (${n.markdown?.length ?? 0} chars) ---`);
  console.log(n.markdown);
}
