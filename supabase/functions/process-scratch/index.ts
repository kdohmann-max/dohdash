import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Bump whenever prompts/extract.md or prompts/verify.md change so stale cached extractions stop being served. */
const PROMPT_VERSION = "4";

const PROMPT = (await Deno.readTextFile(new URL("./prompts/extract.md", import.meta.url))).trim();
const VERIFY_PROMPT = (await Deno.readTextFile(new URL("./prompts/verify.md", import.meta.url))).trim();

// Keep in sync with src/apps/chicken-scratch/models.ts MODEL_OPTIONS.
const ALLOWED_MODELS = ["gemini-flash-latest"];
const DEFAULT_MODEL_ID = "gemini-flash-latest";

function stripFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
}

function isFinitePair(...nums: unknown[]): boolean {
  return nums.every((n) => typeof n === "number" && Number.isFinite(n) && n >= -100 && n <= 1100);
}

/** Returns null when the parsed result matches the ProcessResult shape, else a reason. */
function validateResult(r: unknown): string | null {
  if (typeof r !== "object" || r === null) return "result is not an object";
  const obj = r as Record<string, unknown>;

  if (obj.type === "handwriting") {
    return typeof obj.markdown === "string" ? null : "handwriting result missing markdown";
  }

  if (obj.type !== "blueprint") return "unknown result type";

  if (!Array.isArray(obj.elements)) return "blueprint result missing elements array";
  for (const el of obj.elements as Record<string, unknown>[]) {
    if (typeof el !== "object" || el === null) return "element is not an object";
    if (el.kind !== "line") return "element has unknown kind";
    if (!isFinitePair(el.x, el.y, el.x2, el.y2)) return "line has invalid coordinates";
  }

  if (!Array.isArray(obj.labels)) return "blueprint result missing labels array";
  for (const lbl of obj.labels as Record<string, unknown>[]) {
    if (typeof lbl !== "object" || lbl === null) return "label is not an object";
    if (typeof lbl.text !== "string" || lbl.text.length === 0) return "label has invalid text";
    if (!isFinitePair(lbl.x, lbl.y)) return "label has invalid position";
    if (lbl.anchor !== "start" && lbl.anchor !== "middle" && lbl.anchor !== "end") return "label has invalid anchor";
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { image, mimeType, model: requestedModel } = await req.json() as
      { image: string; mimeType: string; model?: string };
    if (!image || !mimeType) {
      return new Response(JSON.stringify({ error: "image and mimeType are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!SUPPORTED_TYPES.includes(mimeType)) {
      return new Response(
        JSON.stringify({ error: `Unsupported image format "${mimeType}". Please use a JPEG, PNG, GIF, or WebP image.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const model = (requestedModel && ALLOWED_MODELS.includes(requestedModel))
      ? requestedModel
      : (Deno.env.get("MODEL") ?? DEFAULT_MODEL_ID);

    // Salting the hash with the prompt version retires every cache entry produced
    // by older prompts without a schema migration.
    const hashBytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(image + "::v" + PROMPT_VERSION),
    );
    const imageHash = Array.from(new Uint8Array(hashBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: hit } = await sb
      .from("scratch_cache")
      .select("result")
      .eq("image_hash", imageHash)
      .eq("model", model)
      .maybeSingle();
    if (hit) {
      return new Response(JSON.stringify(hit.result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY secret not set");

    const genAI = new GoogleGenerativeAI(apiKey);
    const gModel = genAI.getGenerativeModel({ model, generationConfig: { maxOutputTokens: 8192 } });

    const imagePart = { inlineData: { mimeType, data: image } };

    const msg = await gModel.generateContent({
      contents: [{ role: "user", parts: [imagePart, { text: PROMPT }] }],
    });

    const firstText = stripFences(msg.response.text());
    let result: unknown;
    try {
      result = JSON.parse(firstText);
    } catch {
      throw new Error("The model returned an unreadable extraction — please try again.");
    }
    if (validateResult(result) !== null) {
      throw new Error("The model returned an unreadable extraction — please try again.");
    }

    // Blueprint results get a second pass: the model audits its own extraction
    // against the image. If the audit output is broken, keep the first pass.
    if ((result as { type?: string }).type === "blueprint") {
      try {
        const verifyMsg = await gModel.generateContent({
          contents: [
            { role: "user", parts: [imagePart, { text: PROMPT }] },
            { role: "model", parts: [{ text: firstText }] },
            { role: "user", parts: [{ text: VERIFY_PROMPT }] },
          ],
        });
        const verifyText = stripFences(verifyMsg.response.text());
        const verified = JSON.parse(verifyText);
        if (validateResult(verified) === null && verified.type === "blueprint") {
          result = verified;
        }
      } catch {
        // Verification must never fail the request — first-pass result stands.
      }
    }

    await sb.from("scratch_cache").insert({ image_hash: imageHash, model, result });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
