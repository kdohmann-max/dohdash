import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `You are analyzing a photo. Your task has two parts:

1. Classify the image as either "handwriting" (handwritten text, notes, a document) or "blueprint" (a sketch or technical drawing of physical objects — this may be a floor plan/room layout, furniture or cabinet parts, a mechanical part, or any other diagram made of shapes, lines, and dimensions).

2. Process it accordingly:

If "handwriting": Transcribe the text and format it as clean Markdown. Use headings (##) where the writer clearly intended section titles. Use bullet lists (-) for lists. Use plain paragraphs for everything else. Do not add extra structure that isn't implied by the original.

If "blueprint": Extract every distinct shape and dimension label from the drawing. Do not assume the drawing represents a building, rooms, or walls — it could equally be a cabinet, a furniture part, a mechanical component, or any other object. Return coordinates normalized to a 0-1000 x 0-1000 grid (0,0 is top-left). Represent rectangular parts or spaces as "rect" shapes. Represent any other straight edges or segments — including non-rectangular outlines, individual segments, or standalone lines — as "line" shapes when they don't form a complete rect. Capture every dimension label (e.g. "12'-6\\"", "300mm", "24") as a separate label with its position and text exactly as written.

Return ONLY a valid JSON object in one of these two shapes — no explanation, no markdown fences:

Handwriting: {"type":"handwriting","markdown":"# Title\n\nContent..."}

Blueprint: {"type":"blueprint","elements":[{"kind":"rect","x":0,"y":0,"width":400,"height":300,"label":"Part A"},{"kind":"line","x":400,"y":0,"x2":400,"y2":500}],"labels":[{"text":"24 ft","x":200,"y":320,"anchor":"middle"}]}`;

// Keep in sync with src/apps/chicken-scratch/models.ts MODEL_OPTIONS.
const ALLOWED_MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
const DEFAULT_MODEL_ID = "claude-opus-4-8";

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

    const hashBytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(image),
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

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY secret not set");

    const anthropic = new Anthropic({ apiKey });

    const msg = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: image,
            },
          },
          { type: "text", text: PROMPT },
        ],
      }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const result = JSON.parse(text);

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
