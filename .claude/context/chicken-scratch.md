# Chicken Scratch — Context

Converts handwriting/sketches to clean text or a dimensioned blueprint via a Supabase Edge Function. Functional app (not a stub).

## State machine

`src/apps/chicken-scratch/ChickenScratchApp.tsx`

```ts
type AppState =
  | { status: "idle" }
  | { status: "processing"; fileName: string }
  | { status: "done"; fileName: string; result: ProcessResult }
  | { status: "error"; message: string }
```

upload → `processing` → `done` | `error`. "Try Again" / "New Image" resets to `idle`. No edge-function retry — user re-uploads.

## Result types

`src/apps/chicken-scratch/types.ts`

```ts
type ProcessResult =
  | { type: "handwriting"; markdown: string }
  | { type: "blueprint"; elements: Shape[]; labels: DimensionLabel[] }

interface Shape {
  kind: "rect" | "line";
  x: number; y: number;
  width?: number; height?: number;  // rect only
  x2?: number; y2?: number;          // line only
  label?: string;
}

interface DimensionLabel { text: string; x: number; y: number; anchor: "start" | "middle" | "end"; }
```

## Edge function

Calls `process-scratch` via `supabase.functions.invoke()` (a permitted direct `supabase` use — see `dohdash.md`).

- **In:** `{ image: base64, mimeType, model? }`. `model` from the `UploadPanel.tsx` picker (`models.ts`: `MODEL_OPTIONS`/`DEFAULT_MODEL`); the function validates against its own `ALLOWED_MODELS` allowlist (keep in sync) and falls back to `DEFAULT_MODEL_ID`. `scratch_cache` is keyed on `(image_hash, model)` so re-processing with a different model isn't served a stale result. **Out:** `ProcessResult`.
- Blueprint prompt is shape/part-generic — no assumption of buildings/rooms/walls; extracts arbitrary `Shape[]` + `DimensionLabel[]`.
- Client-side 10 MB size limit enforced in `UploadPanel.tsx`.
- **Error-unwrap gotcha:** `FunctionsHttpError` wraps the real message in `.context` (a `Response`). Read `.context.json()` for `{ error? }` — logging the raw error won't show it.
- **Model backend:** Google Gemini via direct `@google/generative-ai` SDK (`GoogleGenerativeAI`, `getGenerativeModel().generateContent()`), `GEMINI_API_KEY` secret. Only model is `gemini-flash-latest` (`MODEL_OPTIONS`/`ALLOWED_MODELS`/`DEFAULT_MODEL_ID`). Anthropic has been fully removed. Prompts live in `supabase/functions/process-scratch/prompts/extract.md` and `verify.md` (loaded at startup via `Deno.readTextFile`) — edit these directly to iterate on the prompt, no `index.ts` changes needed. `PROMPT_VERSION` (currently `"3"`) salts the `scratch_cache` hash — bump it whenever either prompt file changes so stale cached extractions stop being served.
- **Deploy:** edits to `index.ts` require `supabase functions deploy process-scratch` — not automatic.

## Blueprint rendering

`components/BlueprintRenderer.tsx` — renders `Shape[]` + `DimensionLabel[]` to a `<canvas>` (rasterized PNG, not SVG) via `renderBlueprint()`. Fixed "technical drawing" palette (white bg, charcoal ink, gray dimension lines), independent of app theme. Exports `canvasToBlob()` / `canvasToDataUrl()`.

`components/blueprintDraw.ts` — Canvas2D drawing.
- `MODEL_SIZE = 1000` (logical space, matches the 0–1000 grid the model returns), `RENDER_SCALE = 2` (crisp raster). `CANVAS_SIZE` adds padding + charcoal border + outer margin. `PALETTE` is fixed, not theme-derived.
- Draws border/padding → rects/lines + shape labels → dimension annotations (extension lines, 45° ticks, offset dimension line, centered/rotated label with background box) → unmatched labels as plain text.
- `centeringOffset(adjusted)` translates the drawing (via `ctx.translate`) so the adjusted shapes' bounding box, expanded by `DIM_OFFSET + EXT_OVERSHOOT` margin on each side for dimension lines, is centered within the `MODEL_SIZE` 0-1000 grid — keeps sketches that don't span the full grid from rendering pinned to the top-left.

`dimensions.ts` — pure logic (no canvas/DOM), consumed by `blueprintDraw.ts`:
- `parseDimension(text)` — label → inches (feet/inches `12'-6"`, feet, inches, m, cm, mm, or a bare number = feet)
- `matchDimensionLabels(elements, labels)` — each label → nearest rect edge (top = width, left = height) or a line's full segment (`edge: "length"`), within a sketch-unit threshold
- `adjustShapeProportions(elements, matches)` — 3 phases: (1) rects with both width+height labels get drawn height corrected to real aspect ratio; (2) `globalScale` (sketch px → real units) = median across all matched shapes/lines incl. phase-1; (3) remaining single-dimension shapes rescaled by `globalScale`
- `buildDimensionAnnotations(...)` — matches → annotations, incl. standalone lines (horizontal/vertical by `|dx|` vs `|dy|`); non-matching labels returned as `unmatched`, rendered as plain text

## ResultPanel — save / copy / download

`ResultPanel.tsx`:
- **Send to DohDocs:** `createDoc(null, ownerId)` → `saveDoc({...doc, title, markdown})` → navigate `/dashboard/app/tasks`. Handwriting saved as-is; blueprint embedded as a base64 PNG (`canvasToDataUrl()`) `![Blueprint](data:image/png;...)` with dimension labels appended as a Markdown list.
- **Copy/Download** (async, branch on `result.type`): handwriting → Markdown text / `.md` file; blueprint → PNG via `ClipboardItem` (falls back to download if `clipboard.write` unavailable) / `.png` file.
