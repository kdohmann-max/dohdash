# Chicken Scratch — Context

## State machine

`src/apps/chicken-scratch/ChickenScratchApp.tsx`

```ts
type AppState =
  | { status: "idle" }
  | { status: "processing"; fileName: string }
  | { status: "done"; fileName: string; result: ProcessResult }
  | { status: "error"; message: string }
```

Transitions: upload → `processing` → `done` | `error`. "Try Again" / "New Image" resets to `idle`. There is no retry on the edge function — user must re-upload.

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

interface DimensionLabel {
  text: string; x: number; y: number;
  anchor: "start" | "middle" | "end";
}
```

## Edge function integration

Calls Supabase Edge Function `process-scratch` via `supabase.functions.invoke()` (one of two permitted direct `supabase` uses — see `dohdash.md`).

Input: `{ image: base64string, mimeType: string, model?: string }` — `model` comes from the picker in `UploadPanel.tsx` (`src/apps/chicken-scratch/models.ts`, `MODEL_OPTIONS`/`DEFAULT_MODEL`). The edge function validates it against its own `ALLOWED_MODELS` allowlist (kept in sync with `models.ts`) and falls back to `DEFAULT_MODEL_ID` if missing/invalid. `scratch_cache` is keyed on `(image_hash, model)` so the same image re-processed with a different model isn't served a stale result.
Output: `ProcessResult`

The blueprint extraction prompt is shape/part-generic — it does not assume the drawing is a building, rooms, or walls; it extracts arbitrary `Shape[]` (rects/lines) and `DimensionLabel[]`.

**Error unwrapping gotcha:** `FunctionsHttpError` wraps the actual error message in `.context` (a `Response` object). The code reads `.context.json()` to extract `{ error?: string }`. Logging the raw error won't show the real message.

Client-side 10 MB size limit enforced in `UploadPanel.tsx` before the call is made.

## Blueprint rendering

`src/apps/chicken-scratch/components/BlueprintRenderer.tsx` — renders `Shape[]` + `DimensionLabel[]` to a `<canvas>` (rasterized PNG, not SVG) via `renderBlueprint()`. Output is a fixed-palette "technical drawing": white background, charcoal ink, gray dimension lines — independent of the app's light/dark theme.

Exports `canvasToBlob()` and `canvasToDataUrl()` for PNG export.

`src/apps/chicken-scratch/components/blueprintDraw.ts` — the actual Canvas2D drawing code, called by `BlueprintRenderer`.
- `MODEL_SIZE = 1000` (logical drawing space, matches the 0-1000 grid the model returns coordinates in), `RENDER_SCALE = 2` (output pixel multiplier for a crisp raster export). `CANVAS_SIZE` adds padding + a charcoal border + outer margin around `MODEL_SIZE`.
- `PALETTE` is a fixed set of colors (white background, charcoal ink, gray dimension lines/labels) — not theme-derived.
- Draws the border/padding, then rects/lines and shape labels, then dimension annotations (extension lines, 45° tick marks, offset dimension line, centered/rotated label with a background box for legibility), then any unmatched labels as plain text

`src/apps/chicken-scratch/dimensions.ts` — pure logic consumed by `blueprintDraw.ts`, no canvas/DOM dependency:
- `parseDimension(text)` — parses a label into inches (feet/inches like `12'-6"`, plain feet, inches, meters, centimeters, millimeters, or a bare number assumed to be feet)
- `matchDimensionLabels(elements, labels)` — matches each `DimensionLabel` to the nearest rect edge (top = width, left = height) or to a line's full segment (`edge: "length"`), within a sketch-unit threshold
- `adjustShapeProportions(elements, matches)` — three phases: (1) rects with both width+height labels get their drawn height corrected to the real-world aspect ratio; (2) a `globalScale` (sketch px → real units) is computed as the median across all matched shapes/lines, including phase-1 results; (3) remaining shapes with only one matched dimension (rects with one edge, or lines with a length label) are rescaled using `globalScale`
- `buildDimensionAnnotations(elements, labels, matches)` — turns matches into dimension-line annotations for `blueprintDraw.ts`, including standalone lines (classified as horizontal/vertical by `|dx|` vs `|dy|`); labels that don't match any edge are returned as `unmatched` and rendered as plain text

## "Send to DohDocs"

`ResultPanel.tsx` — on save:
1. Calls `createDoc(null, ownerId)` then `saveDoc({ ...doc, title, markdown })` via `db.ts`
2. Navigates to `/dashboard/app/tasks`

Handwriting result → saved as-is Markdown. Blueprint result → canvas rasterized via `canvasToDataUrl()` and embedded as a base64 PNG `![Blueprint](data:image/png;...)` Markdown image, with dimension labels appended as a Markdown list.

## Copy / Download

`ResultPanel.tsx` — both are async and branch on `result.type`:
- Handwriting: Copy writes the Markdown text to the clipboard; Download saves a `.md` file.
- Blueprint: Copy writes a PNG (`canvasToBlob()`) to the clipboard via `ClipboardItem`, falling back to `handleDownload()` if `navigator.clipboard.write` isn't available; Download saves a `.png` file.
