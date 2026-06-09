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

Input: `{ image: base64string, mimeType: string }`
Output: `ProcessResult`

**Error unwrapping gotcha:** `FunctionsHttpError` wraps the actual error message in `.context` (a `Response` object). The code reads `.context.json()` to extract `{ error?: string }`. Logging the raw error won't show the real message.

Client-side 10 MB size limit enforced in `UploadPanel.tsx` before the call is made.

## Blueprint rendering

`src/apps/chicken-scratch/components/BlueprintRenderer.tsx` — renders `Shape[]` + `DimensionLabel[]` as inline SVG.

`serializeSvg()` converts the rendered SVG DOM back to a string for clipboard copy and file download.

## "Send to DohDocs"

`ResultPanel.tsx` — on save:
1. Calls `createDoc(null, ownerId)` then `saveDoc({ ...doc, title, markdown })` via `db.ts`
2. Navigates to `/dashboard/app/tasks`

Handwriting result → saved as-is Markdown. Blueprint result → SVG serialized into a fenced code block + dimension labels appended as a Markdown list.
