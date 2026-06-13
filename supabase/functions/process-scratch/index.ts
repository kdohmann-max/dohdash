import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Bump whenever PROMPT/VERIFY_PROMPT change so stale cached extractions stop being served. */
const PROMPT_VERSION = "3";

const PROMPT = `You are analyzing a photo. Your task has two parts:

1. Classify the image as either "handwriting" (handwritten text, notes, a document) or "blueprint" (a sketch or technical drawing of physical objects — this may be a floor plan/room layout, furniture or cabinet parts, a mechanical part, or any other diagram made of shapes, lines, and dimensions).

2. Process it accordingly:

If "handwriting": Transcribe the text and format it as clean Markdown. Use headings (##) where the writer clearly intended section titles. Use bullet lists (-) for lists. Use plain paragraphs for everything else. Do not add extra structure that isn't implied by the original.

If "blueprint": Extract the drawing's shapes and dimension labels. Do not assume the drawing represents a building, rooms, or walls — it could equally be a cabinet, a furniture part, a mechanical component, or any other object. Work systematically:

STEP 1 — ENUMERATE: Scan the sketch left-to-right, top-to-bottom. Count every distinct closed rectangle and every standalone straight edge before writing any JSON. Every pen stroke that is part of the drawing must be accounted for by exactly one shape — do not merge two adjacent rectangles into one, do not split one rectangle into separate lines, and do not invent shapes that are not drawn. If the sketch is drawn on graph/grid paper, the background grid is NOT part of the drawing — never extract it as shapes or lines.

STEP 2 — COORDINATES: Return coordinates on a 0-1000 x 0-1000 grid (0,0 is top-left). Preserve the RELATIVE positions and proportions exactly as drawn: if one rectangle is drawn twice as wide as another, its width value must be about twice as large; if two rectangles share a wall or touch edge-to-edge, their coordinates must share that exact edge — identical coordinate values, no gap and no overlap. Edges that are clearly intended to be horizontal or vertical (the vast majority in this kind of sketch) must be reported as exactly horizontal or vertical — snap out any slight skew from hand-drawing rather than reproducing it; only report a non-90-degree angle when the sketch unambiguously shows a deliberate diagonal.

STEP 3 — DIMENSION LABELS: Capture every written measurement (e.g. "12'-6\\"", "300mm", "24") as a separate label with its position and its text EXACTLY as written. Place each label's x,y at the point where the text sits in the sketch, adjacent to the edge it measures. Only include a shape's "label" or a dimension label if that text is actually written on the sketch — never invent, infer, or add names, titles, or dimensions that are not present in the image.

STEP 4 — CROSS-CHECK: Before answering, compare your coordinates against the written dimensions. If one edge is labeled 20 ft and another 10 ft, the first edge's drawn coordinate span must be about twice the second's. When the sketch's hand-drawn proportions and its written dimension labels conflict, adjust your coordinates to agree with the written dimensions.

Shape kinds: "rect" for rectangles, "line" for any other straight edge or segment that doesn't form a complete rect.

Return ONLY a valid JSON object in one of these two shapes — no explanation, no markdown fences:

Handwriting: {"type":"handwriting","markdown":"# Title\n\nContent..."}

Blueprint: {"type":"blueprint","elements":[{"kind":"rect","x":0,"y":0,"width":400,"height":300,"label":"Part A"},{"kind":"line","x":400,"y":0,"x2":400,"y2":500}],"labels":[{"text":"24 ft","x":200,"y":320,"anchor":"middle"}]}`;

const VERIFY_PROMPT = `Audit your extraction above against the image, checking in this order:
1. MISSING shapes — is any drawn rectangle or standalone line absent from the JSON?
2. INVENTED shapes — does any JSON shape have no corresponding pen stroke in the drawing (including graph-paper grid lines mistakenly extracted)?
3. MISPLACED shapes — do the relative positions match the sketch (left of, above, touching, contained in)? Shapes drawn sharing an edge must share identical coordinate values in the JSON — no gap, no overlap.
4. PROPORTIONS — do the coordinate spans agree with the written dimension labels? An edge labeled twice as long as another must have roughly twice the coordinate span.
5. LABELS — is every written measurement present, with its text verbatim, positioned next to the edge it measures? Is any label invented?

Return the corrected JSON in exactly the same format ({"type":"blueprint","elements":[...],"labels":[...]}). If everything is already correct, return the same JSON unchanged. Return ONLY the JSON object — no commentary, no markdown fences.`;

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
    if (el.kind === "rect") {
      if (!isFinitePair(el.x, el.y)) return "rect has invalid position";
      if (typeof el.width !== "number" || !Number.isFinite(el.width) || el.width <= 0) return "rect has invalid width";
      if (typeof el.height !== "number" || !Number.isFinite(el.height) || el.height <= 0) return "rect has invalid height";
      if (el.label !== undefined && typeof el.label !== "string") return "rect has invalid label";
    } else if (el.kind === "line") {
      if (!isFinitePair(el.x, el.y, el.x2, el.y2)) return "line has invalid coordinates";
    } else {
      return "element has unknown kind";
    }
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
