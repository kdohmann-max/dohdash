import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `You are analyzing a photo. Your task has two parts:

1. Classify the image as either "handwriting" (handwritten text, notes, a document) or "blueprint" (a floor plan, sketch, or technical drawing with shapes and measurements).

2. Process it accordingly:

If "handwriting": Transcribe the text and format it as clean Markdown. Use headings (##) where the writer clearly intended section titles. Use bullet lists (-) for lists. Use plain paragraphs for everything else. Do not add extra structure that isn't implied by the original.

If "blueprint": Extract all rooms/spaces, walls, and dimension labels. Return coordinates normalized to a 0-1000 x 0-1000 grid (0,0 is top-left). Represent rooms as "rect" shapes. Represent individual walls as "line" shapes only when they don't form a complete rect.

Return ONLY a valid JSON object in one of these two shapes — no explanation, no markdown fences:

Handwriting: {"type":"handwriting","markdown":"# Title\n\nContent..."}

Blueprint: {"type":"blueprint","elements":[{"kind":"rect","x":0,"y":0,"width":400,"height":300,"label":"Living Room"},{"kind":"line","x":400,"y":0,"x2":400,"y2":500}],"labels":[{"text":"24 ft","x":200,"y":320,"anchor":"middle"}]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { image, mimeType } = await req.json() as { image: string; mimeType: string };
    if (!image || !mimeType) {
      return new Response(JSON.stringify({ error: "image and mimeType are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY secret not set");

    const model = Deno.env.get("MODEL") ?? "claude-opus-4-8";
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

    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const result = JSON.parse(text);

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
