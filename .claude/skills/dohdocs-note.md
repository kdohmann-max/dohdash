---
name: dohdocs-note
description: Create or edit a DohDocs note from a prompt — no codebase scanning needed
tags: [dohdocs, notes, content]
---

# DohDocs Note

Create or edit a note in DohDocs (the Tasks app). All necessary API knowledge is
pre-baked here — do NOT read any source files, do NOT grep the codebase.

## Goal

Generate note content from the user's prompt, then write and run a one-shot script
that upserts it to the `notes` table via the Supabase service role.

## What you need (already known — do not re-derive)

**Table:** `notes (id text PK, title text, markdown text, updated_at bigint, folder_id text|null, owner_id uuid|null)`

**Env file:** `.env.local` in the project root (never committed). Keys:
- `VITE_SUPABASE_URL` — the Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role, bypasses RLS

**Owner:** look up the current user from `auth.users` by email
(`kdohmann@gmail.com`) using the admin API. The resulting UUID is the
`owner_id` for the new note.

## Workflow

1. **Generate content.** Write the title and markdown body based on the user's
   prompt. Be thorough — create real, useful content, not placeholders.

2. **Write the script.** Create `scripts/dev/upsert-note.mjs` using this
   exact template (fill in TITLE and MARKDOWN):

```js
// scripts/dev/upsert-note.mjs — delete after use
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load .env.local without a dotenv dependency
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Look up owner UUID by email
const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (authErr) throw authErr;
const owner = users.find((u) => u.email === "kdohmann@gmail.com");
if (!owner) throw new Error("User not found — is SUPABASE_SERVICE_ROLE_KEY correct?");

const TITLE = "YOUR TITLE HERE";
const MARKDOWN = `YOUR MARKDOWN HERE`;

const id = crypto.randomUUID();
const { error } = await supabase.from("notes").insert({
  id,
  title: TITLE,
  markdown: MARKDOWN,
  updated_at: Date.now(),
  folder_id: null,
  owner_id: owner.id,
});
if (error) throw error;
console.log("✓ Created note:", id, "—", TITLE);
```

   **To edit an existing note instead of creating:** replace `.insert({...})`
   with `.upsert({...})` and use the known note's UUID as `id` (or query for
   it first with `.select("id").eq("title", "...").single()`).

3. **Run the script.**
   ```
   node scripts/dev/upsert-note.mjs
   ```

4. **Clean up.** After confirming success, delete `scripts/dev/upsert-note.mjs`.
   It's a one-shot helper and shouldn't accumulate.

## Rules

- Never read `src/storage/`, `src/apps/tasks/`, or any other source file — all
  needed info is in this skill.
- Never install new npm packages — `@supabase/supabase-js` is already in
  `package.json`.
- Do not add `folder_id` unless the user specifies a folder by name; resolve
  it with `.select("id").eq("name", "...").single()` from the `folders` table
  if needed.
- Write real content. If the prompt is vague, make a sensible, complete note
  and say what you created.
- Keep the script under 60 lines. If it's getting complex, simplify.
