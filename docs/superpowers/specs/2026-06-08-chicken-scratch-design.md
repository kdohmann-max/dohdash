# Chicken Scratch — Design Spec

**Date:** 2026-06-08
**Status:** Approved

## Overview

Chicken Scratch is a DohDash app that converts photos of handwriting or hand-drawn blueprint sketches into clean digital output. Handwriting becomes formatted Markdown; blueprints become clean SVG diagrams with labeled dimensions.

## Decisions

| Question | Decision |
|---|---|
| Layout | Single page — upload at top, result inline below, no history |
| Result actions | Copy + Download + Send to DohDocs (all three) |
| Type detection | Auto-detect via LLM (no manual mode toggle) |
| Blueprint output | Cleaned SVG reconstruction with dimension annotations |
| LLM call location | Supabase Edge Function (API key server-side) |
| Mobile camera | Dedicated Camera button + separate File Attach button |

## Architecture

### New Files

```
src/apps/chicken-scratch/
  ChickenScratchApp.tsx       — root component, owns all state
  ChickenScratchApp.css
  components/
    UploadPanel.tsx            — camera + file buttons, image preview
    UploadPanel.css
    ResultPanel.tsx            — renders Markdown or SVG result + action buttons
    ResultPanel.css
    BlueprintRenderer.tsx      — converts LLM JSON → inline SVG
    BlueprintRenderer.css

supabase/functions/
  process-scratch/
    index.ts                   — Edge Function: receives image, calls LLM, returns result
```

### Changes to Existing Files

- `src/apps/registry.ts` — add `chicken-scratch` to `APP_REGISTRY`
- `src/App.tsx` — add `appId === "chicken-scratch"` case in `AppRoute`

### No New DB Tables

Results are ephemeral. "→ DohDocs" reuses existing `createDoc` / `saveDoc` from `src/storage/db.ts`.

## Edge Function

**Route:** `POST supabase/functions/process-scratch`

**Request body:**
```ts
{ image: string; mimeType: string }  // image is base64-encoded
```

**Response:**
```ts
type ProcessResult =
  | { type: "handwriting"; markdown: string }
  | { type: "blueprint"; elements: Shape[]; labels: DimensionLabel[] }

interface Shape {
  kind: "rect" | "line";
  x: number; y: number;
  width?: number; height?: number;  // rect only
  x2?: number; y2?: number;         // line only
  label?: string;
}

interface DimensionLabel {
  text: string;
  x: number; y: number;
  anchor: "start" | "middle" | "end";
}
```

**LLM prompt behavior:**
- Detects image type (handwriting/text vs blueprint/sketch) in a single call
- Handwriting: transcribes and formats as Markdown — headings, lists, paragraphs inferred from context
- Blueprint: extracts rooms, walls, dimensions, and labels as structured JSON for SVG reconstruction

**API key:** Stored as a Supabase secret (`supabase secrets set LLM_API_KEY=...`), never in frontend env vars.

**LLM model:** To be decided. The Edge Function should reference the model via a `MODEL` secret so it can be swapped without a code change. Any vision-capable model works (Claude, GPT-4o, Gemini).

**SVG coordinate space:** The LLM prompt must instruct the model to return all coordinates normalized to a 0–1000 × 0–1000 grid. `BlueprintRenderer` renders into a `viewBox="0 0 1000 1000"` SVG and scales to fit its container. This avoids guessing scale from pixel values.

**CORS:** The Edge Function must respond with `Access-Control-Allow-Origin: *` (or the specific Netlify domain) and handle `OPTIONS` preflight requests, otherwise browser fetches will fail.

**Error response:** `{ error: string }` with appropriate HTTP status.

## Components

### `ChickenScratchApp`

Owns all state:

```ts
type AppState =
  | { status: "idle" }
  | { status: "processing"; imageDataUrl: string; fileName: string }
  | { status: "done"; imageDataUrl: string; fileName: string; result: ProcessResult }
  | { status: "error"; message: string }
```

On file selection: reads file as base64 via `FileReader`, transitions to `processing`, calls `supabase.functions.invoke("process-scratch", { body: { image, mimeType } })`, transitions to `done` or `error`.

### `UploadPanel`

Renders the idle state upload zone.

- **Camera button:** `<input type="file" accept="image/*" capture="environment">` — opens native camera on mobile
- **File button:** `<input type="file" accept="image/*">` — opens system file picker
- Calls `onImage(base64, mimeType, fileName)` on selection

### `ResultPanel`

Receives `result`, `imageDataUrl`, and `fileName`. Shows a slim header bar with the file name, detected type, and a "↺ New" button to reset to idle.

- **Handwriting:** renders Markdown as HTML using `marked` (lightweight, zero dependencies, already common in the JS ecosystem — read-only display, no editor)
- **Blueprint:** passes `elements` and `labels` to `BlueprintRenderer`

**Action buttons (all three always shown):**
- **Copy** — `navigator.clipboard.writeText(markdown)` for handwriting; SVG source text for blueprint
- **Download** — blob URL download; `.md` for handwriting, `.svg` for blueprint
- **→ DohDocs** — calls `createDoc(null, ownerId)` then `saveDoc(...)` from `db.ts`; title derived from first heading (handwriting) or file name (blueprint); blueprint note contains the SVG as an inline code block plus dimension text

### `BlueprintRenderer`

Takes `elements: Shape[]` and `labels: DimensionLabel[]` from the LLM response and renders a clean inline `<svg>`. Validates the array before rendering — if data is incomplete it renders whatever is valid and shows a warning banner. The rendered SVG element is also serialized to a Blob for the download action.

## Error Handling

| Scenario | Behavior |
|---|---|
| File > 10 MB | Inline warning before API call, no request sent |
| LLM call fails | `status: "error"` with message + "↺ Try Again" button (reuses same image) |
| Image unrecognizable | Edge Function returns error; frontend shows "Couldn't read this image — try a clearer photo" |
| Blueprint JSON malformed | `BlueprintRenderer` renders what it can + warning banner |
| "→ DohDocs" fails | Inline toast error; result stays visible for copy/download |
| No network | `supabase.functions.invoke` rejects; caught as standard error state with retry |

## UI States

1. **Idle** — upload zone with Camera and Attach File buttons
2. **Processing** — spinner, "Processing image…"
3. **Done (handwriting)** — file header bar + Markdown result + action buttons
4. **Done (blueprint)** — file header bar + SVG diagram + action buttons
5. **Error** — error message + "↺ Try Again" button
