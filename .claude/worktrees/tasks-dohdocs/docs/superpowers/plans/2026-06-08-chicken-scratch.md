# Chicken Scratch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Chicken Scratch" app to DohDash that converts photos of handwriting into formatted Markdown and blueprint sketches into clean SVG diagrams, using a Supabase Edge Function to call a vision LLM.

**Architecture:** Single-page React app — upload zone transitions to a processing spinner, then shows the result with copy/download/send-to-DohDocs actions. A Supabase Edge Function (`process-scratch`) holds the LLM API key and returns either `{ type: "handwriting", markdown }` or `{ type: "blueprint", elements, labels }`. The frontend renders blueprint JSON as an inline SVG using a normalized 0–1000 coordinate grid.

**Tech Stack:** React 19, TypeScript, Supabase Edge Functions (Deno), `@anthropic-ai/sdk` (npm via Deno), `marked` (Markdown → HTML), `supabase.functions.invoke` for the frontend call.

**Design spec:** `docs/superpowers/specs/2026-06-08-chicken-scratch-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/apps/registry.ts` | Modify | Add `chicken-scratch` entry |
| `src/App.tsx` | Modify | Add `AppRoute` case for chicken-scratch |
| `src/apps/chicken-scratch/types.ts` | Create | Shared `ProcessResult`, `Shape`, `DimensionLabel` types |
| `src/apps/chicken-scratch/ChickenScratchApp.tsx` | Create | Root component, owns `AppState` machine, calls Edge Function |
| `src/apps/chicken-scratch/ChickenScratchApp.css` | Create | App shell layout |
| `src/apps/chicken-scratch/components/UploadPanel.tsx` | Create | Camera + file buttons, FileReader, 10 MB guard |
| `src/apps/chicken-scratch/components/UploadPanel.css` | Create | Upload zone styles |
| `src/apps/chicken-scratch/components/BlueprintRenderer.tsx` | Create | `elements[]` + `labels[]` → inline `<svg>` |
| `src/apps/chicken-scratch/components/BlueprintRenderer.css` | Create | Blueprint SVG container |
| `src/apps/chicken-scratch/components/ResultPanel.tsx` | Create | Markdown/SVG display + Copy/Download/→DohDocs |
| `src/apps/chicken-scratch/components/ResultPanel.css` | Create | Result panel styles |
| `supabase/functions/process-scratch/index.ts` | Create | Edge Function: CORS, LLM call, JSON response |

---

## Task 1: Register the app and create the placeholder component

**Files:**
- Modify: `src/apps/registry.ts`
- Modify: `src/App.tsx`
- Create: `src/apps/chicken-scratch/ChickenScratchApp.tsx`
- Create: `src/apps/chicken-scratch/ChickenScratchApp.css`

- [ ] **Step 1: Add `chicken-scratch` to APP_REGISTRY**

  In `src/apps/registry.ts`, add to the `APP_REGISTRY` array after the last entry:

  ```ts
  {
    id: "chicken-scratch",
    name: "Chicken Scratch",
    icon: "✍️",
    description: "Convert handwriting and sketches into clean digital text and diagrams.",
    route: "/dashboard/app/chicken-scratch",
  },
  ```

- [ ] **Step 2: Add the AppRoute case in App.tsx**

  In `src/App.tsx`, add the import at the top with the other app imports:

  ```tsx
  import { ChickenScratchApp } from "./apps/chicken-scratch/ChickenScratchApp";
  ```

  Then update `AppRoute`:

  ```tsx
  function AppRoute() {
    const { appId } = useParams<{ appId: string }>();
    if (appId === "tasks") return <TasksApp />;
    if (appId === "chicken-scratch") return <ChickenScratchApp />;
    return <AppStubPage />;
  }
  ```

- [ ] **Step 3: Create the placeholder component**

  Create `src/apps/chicken-scratch/ChickenScratchApp.tsx`:

  ```tsx
  import "./ChickenScratchApp.css";

  export function ChickenScratchApp() {
    return <div className="chicken-scratch"><p>Coming soon</p></div>;
  }
  ```

  Create `src/apps/chicken-scratch/ChickenScratchApp.css`:

  ```css
  .chicken-scratch {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: var(--spacing-lg);
    max-width: 680px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }
  ```

- [ ] **Step 4: Verify build passes**

  ```
  npm run build
  ```

  Expected: no TypeScript errors, build succeeds.

- [ ] **Step 5: Commit**

  ```bash
  git add src/apps/registry.ts src/App.tsx src/apps/chicken-scratch/
  git commit -m "feat: register Chicken Scratch app and scaffold placeholder"
  ```

---

## Task 2: Install `marked`

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

  ```
  npm install marked
  ```

- [ ] **Step 2: Verify build still passes**

  ```
  npm run build
  ```

  Expected: clean build.

- [ ] **Step 3: Commit**

  ```bash
  git add package.json package-lock.json
  git commit -m "feat: add marked for Markdown rendering in Chicken Scratch"
  ```

---

## Task 3: Create shared types

**Files:**
- Create: `src/apps/chicken-scratch/types.ts`

- [ ] **Step 1: Create the types file**

  Create `src/apps/chicken-scratch/types.ts`:

  ```ts
  export interface Shape {
    kind: "rect" | "line";
    x: number;
    y: number;
    width?: number;
    height?: number;
    x2?: number;
    y2?: number;
    label?: string;
  }

  export interface DimensionLabel {
    text: string;
    x: number;
    y: number;
    anchor: "start" | "middle" | "end";
  }

  export type ProcessResult =
    | { type: "handwriting"; markdown: string }
    | { type: "blueprint"; elements: Shape[]; labels: DimensionLabel[] };
  ```

- [ ] **Step 2: Verify build passes**

  ```
  npm run build
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/apps/chicken-scratch/types.ts
  git commit -m "feat: add shared types for Chicken Scratch ProcessResult"
  ```

---

## Task 4: Supabase Edge Function — scaffold with CORS

**Files:**
- Create: `supabase/functions/process-scratch/index.ts`

- [ ] **Step 1: Create the function with CORS and a mock response**

  Create `supabase/functions/process-scratch/index.ts`:

  ```ts
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

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

      // Mock response — replaced in Task 5
      const result = {
        type: "handwriting",
        markdown: "# Mock Result\n\n- Item one\n- Item two",
      };

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
  ```

- [ ] **Step 2: Serve the function locally and smoke-test it**

  In a separate terminal:
  ```
  supabase functions serve process-scratch --no-verify-jwt
  ```

  In another terminal (PowerShell):
  ```powershell
  Invoke-RestMethod -Method Post `
    -Uri "http://localhost:54321/functions/v1/process-scratch" `
    -ContentType "application/json" `
    -Body '{"image":"abc","mimeType":"image/jpeg"}'
  ```

  Expected output:
  ```json
  {"type":"handwriting","markdown":"# Mock Result\n\n- Item one\n- Item two"}
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add supabase/functions/process-scratch/index.ts
  git commit -m "feat: scaffold process-scratch Edge Function with CORS and mock response"
  ```

---

## Task 5: Edge Function — LLM integration

**Files:**
- Modify: `supabase/functions/process-scratch/index.ts`

- [ ] **Step 1: Set the Anthropic API key as a Supabase secret**

  ```
  supabase secrets set ANTHROPIC_API_KEY=<your-anthropic-api-key>
  ```

  Optionally set a specific model (defaults to `claude-opus-4-8`):
  ```
  supabase secrets set MODEL=claude-opus-4-8
  ```

- [ ] **Step 2: Replace the mock with the real LLM call**

  Replace the entire contents of `supabase/functions/process-scratch/index.ts`:

  ```ts
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
  ```

- [ ] **Step 3: Test locally with a real image**

  With `supabase functions serve process-scratch --no-verify-jwt` running (PowerShell):

  ```powershell
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\test-image.jpg"))
  $body = '{"image":"' + $b64 + '","mimeType":"image/jpeg"}'
  Invoke-RestMethod -Method Post -Uri "http://localhost:54321/functions/v1/process-scratch" -ContentType "application/json" -Body $body
  ```

  Expected: JSON with `type: "handwriting"` and a `markdown` field, or `type: "blueprint"` with `elements` and `labels`.

- [ ] **Step 4: Deploy the function**

  ```
  supabase functions deploy process-scratch
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/functions/process-scratch/index.ts
  git commit -m "feat: add LLM integration to process-scratch Edge Function"
  ```

---

## Task 6: `UploadPanel` component

**Files:**
- Create: `src/apps/chicken-scratch/components/UploadPanel.tsx`
- Create: `src/apps/chicken-scratch/components/UploadPanel.css`

- [ ] **Step 1: Create the component**

  Create `src/apps/chicken-scratch/components/UploadPanel.tsx`:

  ```tsx
  import { useRef } from "react";
  import "./UploadPanel.css";

  const MAX_BYTES = 10 * 1024 * 1024;

  interface Props {
    onImage: (base64: string, mimeType: string, fileName: string) => void;
  }

  export function UploadPanel({ onImage }: Props) {
    const cameraRef = useRef<HTMLInputElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    function handleFile(file: File) {
      if (file.size > MAX_BYTES) {
        alert("Image too large — please use a photo under 10 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const comma = dataUrl.indexOf(",");
        const base64 = dataUrl.slice(comma + 1);
        const mimeType = dataUrl.slice(5, dataUrl.indexOf(";"));
        onImage(base64, mimeType, file.name);
      };
      reader.readAsDataURL(file);
    }

    return (
      <div className="upload-panel">
        <div className="upload-zone">
          <span className="upload-icon" aria-hidden="true">✍️</span>
          <p>Take a photo or attach an image of handwriting or a sketch</p>
          <div className="upload-buttons">
            <button className="btn-camera" onClick={() => cameraRef.current?.click()}>
              📷 Camera
            </button>
            <button className="btn-file" onClick={() => fileRef.current?.click()}>
              📎 Attach File
            </button>
          </div>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>
    );
  }
  ```

- [ ] **Step 2: Create the CSS**

  Create `src/apps/chicken-scratch/components/UploadPanel.css`:

  ```css
  .upload-panel {
    width: 100%;
  }

  .upload-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    border: 2px dashed var(--border);
    border-radius: var(--rounded-lg);
    padding: var(--spacing-xl) var(--spacing-lg);
    background: var(--bg-alt);
    text-align: center;
  }

  .upload-icon {
    font-size: 2.5rem;
  }

  .upload-zone p {
    color: var(--muted);
    margin: 0;
    font-size: 0.9rem;
    max-width: 28ch;
  }

  .upload-buttons {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn-camera {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--rounded-md);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: 0.9rem;
    cursor: pointer;
    min-width: 120px;
  }

  .btn-file {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--rounded-md);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: 0.9rem;
    cursor: pointer;
    min-width: 120px;
  }
  ```

- [ ] **Step 3: Verify build passes**

  ```
  npm run build
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/apps/chicken-scratch/components/UploadPanel.tsx src/apps/chicken-scratch/components/UploadPanel.css
  git commit -m "feat: add UploadPanel with camera and file input"
  ```

---

## Task 7: `BlueprintRenderer` component

**Files:**
- Create: `src/apps/chicken-scratch/components/BlueprintRenderer.tsx`
- Create: `src/apps/chicken-scratch/components/BlueprintRenderer.css`

- [ ] **Step 1: Create the component**

  Create `src/apps/chicken-scratch/components/BlueprintRenderer.tsx`:

  ```tsx
  import type { RefObject } from "react";
  import type { Shape, DimensionLabel } from "../types";
  import "./BlueprintRenderer.css";

  interface Props {
    elements: Shape[];
    labels: DimensionLabel[];
    svgRef: RefObject<SVGSVGElement | null>;
  }

  export function BlueprintRenderer({ elements, labels, svgRef }: Props) {
    const validElements = elements.filter(
      (el) => el.kind === "rect" || el.kind === "line",
    );
    const hasWarning = validElements.length < elements.length;

    return (
      <div className="blueprint-renderer">
        {hasWarning && (
          <p className="blueprint-warning">
            Some elements couldn't be drawn — check the downloaded SVG.
          </p>
        )}
        <svg
          ref={svgRef}
          viewBox="0 0 1000 1000"
          className="blueprint-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          {validElements.map((el, i) =>
            el.kind === "rect" ? (
              <g key={i}>
                <rect
                  x={el.x}
                  y={el.y}
                  width={el.width ?? 0}
                  height={el.height ?? 0}
                  stroke="var(--accent)"
                  strokeWidth="8"
                  fill="none"
                />
                {el.label && (
                  <text
                    x={el.x + (el.width ?? 0) / 2}
                    y={el.y + (el.height ?? 0) / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--muted)"
                    fontSize="24"
                  >
                    {el.label}
                  </text>
                )}
              </g>
            ) : (
              <line
                key={i}
                x1={el.x}
                y1={el.y}
                x2={el.x2 ?? el.x}
                y2={el.y2 ?? el.y}
                stroke="var(--accent)"
                strokeWidth="6"
              />
            ),
          )}
          {labels.map((lbl, i) => (
            <text
              key={i}
              x={lbl.x}
              y={lbl.y}
              textAnchor={lbl.anchor}
              fill="var(--text)"
              fontSize="20"
            >
              {lbl.text}
            </text>
          ))}
        </svg>
      </div>
    );
  }

  export function serializeSvg(svgEl: SVGSVGElement): Blob {
    const svgString = new XMLSerializer().serializeToString(svgEl);
    return new Blob([svgString], { type: "image/svg+xml" });
  }
  ```

- [ ] **Step 2: Create the CSS**

  Create `src/apps/chicken-scratch/components/BlueprintRenderer.css`:

  ```css
  .blueprint-renderer {
    width: 100%;
  }

  .blueprint-svg {
    width: 100%;
    height: auto;
    border-radius: var(--rounded-md);
    background: var(--bg-alt);
    display: block;
  }

  .blueprint-warning {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0 0 var(--spacing-xs);
  }
  ```

- [ ] **Step 3: Verify build passes**

  ```
  npm run build
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/apps/chicken-scratch/components/BlueprintRenderer.tsx src/apps/chicken-scratch/components/BlueprintRenderer.css
  git commit -m "feat: add BlueprintRenderer — LLM JSON to inline SVG"
  ```

---

## Task 8: `ResultPanel` component

**Files:**
- Create: `src/apps/chicken-scratch/components/ResultPanel.tsx`
- Create: `src/apps/chicken-scratch/components/ResultPanel.css`

- [ ] **Step 1: Create the component**

  Create `src/apps/chicken-scratch/components/ResultPanel.tsx`:

  ```tsx
  import { useRef } from "react";
  import { marked } from "marked";
  import { BlueprintRenderer, serializeSvg } from "./BlueprintRenderer";
  import { createDoc, saveDoc } from "../../../storage/db";
  import type { ProcessResult } from "../types";
  import "./ResultPanel.css";

  interface Props {
    result: ProcessResult;
    fileName: string;
    ownerId: string | null;
    onNew: () => void;
  }

  function deriveTitle(result: ProcessResult, fileName: string): string {
    if (result.type === "handwriting") {
      const first = result.markdown.split("\n").find((l) => l.trim());
      return (first?.replace(/^#+\s*/, "") ?? "").slice(0, 80) || "Untitled";
    }
    return fileName.replace(/\.[^.]+$/, "");
  }

  export function ResultPanel({ result, fileName, ownerId, onNew }: Props) {
    const svgRef = useRef<SVGSVGElement>(null);

    const detectedLabel =
      result.type === "handwriting" ? "handwriting ✓" : "blueprint sketch ✓";

    function handleCopy() {
      if (result.type === "handwriting") {
        void navigator.clipboard.writeText(result.markdown);
      } else if (svgRef.current) {
        void navigator.clipboard.writeText(
          new XMLSerializer().serializeToString(svgRef.current),
        );
      }
    }

    function handleDownload() {
      let blob: Blob;
      let name: string;
      if (result.type === "handwriting") {
        blob = new Blob([result.markdown], { type: "text/markdown" });
        name = fileName.replace(/\.[^.]+$/, "") + ".md";
      } else {
        blob = svgRef.current
          ? serializeSvg(svgRef.current)
          : new Blob([""], { type: "image/svg+xml" });
        name = fileName.replace(/\.[^.]+$/, "") + ".svg";
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    }

    async function handleSendToDohDocs() {
      try {
        const title = deriveTitle(result, fileName);
        let markdown: string;
        if (result.type === "handwriting") {
          markdown = result.markdown;
        } else {
          const svgString = svgRef.current
            ? new XMLSerializer().serializeToString(svgRef.current)
            : "";
          const dimensionLines = result.labels.map((l) => `- ${l.text}`).join("\n");
          markdown = `# ${title}\n\n\`\`\`svg\n${svgString}\n\`\`\`\n\n## Dimensions\n\n${dimensionLines}`;
        }
        const doc = await createDoc(null, ownerId);
        await saveDoc({ ...doc, title, markdown, updatedAt: Date.now() });
      } catch {
        alert("Couldn't save to DohDocs. Please try again.");
      }
    }

    const htmlContent =
      result.type === "handwriting"
        ? (marked.parse(result.markdown) as string)
        : null;

    return (
      <div className="result-panel">
        <div className="result-header">
          <div className="result-file-info">
            <span className="result-file-name">{fileName}</span>
            <span className="result-detected">Detected: {detectedLabel}</span>
          </div>
          <button className="btn-new" onClick={onNew}>↺ New</button>
        </div>

        <div className="result-content">
          {result.type === "handwriting" && htmlContent !== null && (
            <div
              className="result-markdown"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          )}
          {result.type === "blueprint" && (
            <BlueprintRenderer
              elements={result.elements}
              labels={result.labels}
              svgRef={svgRef}
            />
          )}
        </div>

        <div className="result-actions">
          <button className="btn-action" onClick={handleCopy}>📋 Copy</button>
          <button className="btn-action" onClick={handleDownload}>⬇️ Download</button>
          <button className="btn-action btn-dohdocs" onClick={() => void handleSendToDohDocs()}>
            → DohDocs
          </button>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Create the CSS**

  Create `src/apps/chicken-scratch/components/ResultPanel.css`:

  ```css
  .result-panel {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    background: var(--bg-alt);
    border: 1px solid var(--border);
    border-radius: var(--rounded-md);
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .result-file-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .result-file-name {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-detected {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .btn-new {
    background: none;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: var(--rounded-sm);
    padding: 4px 10px;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .result-content {
    background: var(--bg-alt);
    border: 1px solid var(--border);
    border-radius: var(--rounded-md);
    padding: var(--spacing-md);
  }

  .result-markdown {
    color: var(--text);
    font-size: 0.9rem;
    line-height: 1.7;
  }

  .result-markdown h1,
  .result-markdown h2,
  .result-markdown h3 {
    color: var(--accent);
    margin: var(--spacing-sm) 0 var(--spacing-xs);
  }

  .result-markdown ul,
  .result-markdown ol {
    padding-left: var(--spacing-md);
  }

  .result-markdown p {
    margin: var(--spacing-xs) 0;
  }

  .result-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .btn-action {
    flex: 1;
    background: var(--bg-alt);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--rounded-md);
    padding: var(--spacing-sm);
    font-size: 0.85rem;
    cursor: pointer;
  }

  .btn-dohdocs {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent-soft);
  }
  ```

- [ ] **Step 3: Verify build passes**

  ```
  npm run build
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/apps/chicken-scratch/components/ResultPanel.tsx src/apps/chicken-scratch/components/ResultPanel.css
  git commit -m "feat: add ResultPanel with Markdown display, blueprint SVG, and action buttons"
  ```

---

## Task 9: Wire `ChickenScratchApp` — replace placeholder with full implementation

**Files:**
- Modify: `src/apps/chicken-scratch/ChickenScratchApp.tsx`
- Modify: `src/apps/chicken-scratch/ChickenScratchApp.css`

- [ ] **Step 1: Replace the placeholder with the full implementation**

  Replace `src/apps/chicken-scratch/ChickenScratchApp.tsx`:

  ```tsx
  import { useCallback, useState } from "react";
  import { UploadPanel } from "./components/UploadPanel";
  import { ResultPanel } from "./components/ResultPanel";
  import { useAuth } from "../../auth/AuthContext";
  import { supabase } from "../../storage/db";
  import type { ProcessResult } from "./types";
  import "./ChickenScratchApp.css";

  type AppState =
    | { status: "idle" }
    | { status: "processing"; fileName: string }
    | { status: "done"; fileName: string; result: ProcessResult }
    | { status: "error"; message: string };

  export function ChickenScratchApp() {
    const { state: authState } = useAuth();
    const ownerId =
      authState.status === "authenticated" ? authState.profile.id : null;
    const [appState, setAppState] = useState<AppState>({ status: "idle" });

    const handleImage = useCallback(
      async (base64: string, mimeType: string, fileName: string) => {
        setAppState({ status: "processing", fileName });
        try {
          const { data, error } = await supabase.functions.invoke(
            "process-scratch",
            { body: { image: base64, mimeType } },
          );
          if (error) throw error;
          setAppState({ status: "done", fileName, result: data as ProcessResult });
        } catch (err) {
          setAppState({
            status: "error",
            message:
              err instanceof Error
                ? err.message
                : "Something went wrong — try again.",
          });
        }
      },
      [],
    );

    const handleNew = useCallback(() => setAppState({ status: "idle" }), []);

    return (
      <div className="chicken-scratch">
        {appState.status === "idle" && <UploadPanel onImage={handleImage} />}

        {appState.status === "processing" && (
          <div className="cs-processing">
            <div className="cs-spinner" aria-label="Processing" />
            <p>Processing image…</p>
          </div>
        )}

        {appState.status === "done" && (
          <ResultPanel
            result={appState.result}
            fileName={appState.fileName}
            ownerId={ownerId}
            onNew={handleNew}
          />
        )}

        {appState.status === "error" && (
          <div className="cs-error">
            <p>{appState.message}</p>
            <button onClick={handleNew}>↺ Try Again</button>
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Add processing and error styles to `ChickenScratchApp.css`**

  Replace `src/apps/chicken-scratch/ChickenScratchApp.css`:

  ```css
  .chicken-scratch {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: var(--spacing-lg);
    max-width: 680px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .cs-processing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    min-height: 200px;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .cs-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: cs-spin 0.8s linear infinite;
  }

  @keyframes cs-spin {
    to { transform: rotate(360deg); }
  }

  .cs-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
    text-align: center;
  }

  .cs-error p {
    color: var(--muted);
    margin: 0;
  }

  .cs-error button {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--rounded-md);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: 0.9rem;
    cursor: pointer;
  }
  ```

- [ ] **Step 3: Verify build passes**

  ```
  npm run build
  ```

  Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/apps/chicken-scratch/ChickenScratchApp.tsx src/apps/chicken-scratch/ChickenScratchApp.css
  git commit -m "feat: wire ChickenScratchApp state machine — upload, processing, done, error"
  ```

---

## Task 10: End-to-end smoke test

- [ ] **Step 1: Grant yourself app access**

  Open the Admin panel → Apps tab, find "Chicken Scratch" and grant access to your account. (The `chicken-scratch` `app_id` is referenced directly by the string in `app_access` — no migration needed.)

- [ ] **Step 2: Start the dev server**

  ```
  npm run dev
  ```

  Sign in and confirm "Chicken Scratch" appears in the launcher.

- [ ] **Step 3: Test the handwriting flow**

  - Click "Attach File" and upload a photo of handwritten notes.
  - Confirm the spinner appears while processing.
  - Confirm formatted Markdown text renders in the result panel.
  - Click "📋 Copy" — paste into a text editor and verify the Markdown is there.
  - Click "⬇️ Download" — verify a `.md` file downloads with the correct content.
  - Click "→ DohDocs" — open the Tasks app and verify the note was created with the correct title and content.
  - Click "↺ New" — confirm the app returns to the upload zone.

- [ ] **Step 4: Test the blueprint flow**

  - Upload a photo of a hand-drawn floor plan or sketch with measurements.
  - Confirm the SVG renders with clean lines and labeled dimensions.
  - Click "⬇️ Download" — verify an `.svg` file downloads and opens correctly in a browser or vector tool.
  - Click "→ DohDocs" — verify a note is created containing the SVG code block and a Dimensions section.

- [ ] **Step 5: Test on mobile**

  Open `http://<your-local-ip>:5173` on a phone. Tap "📷 Camera" — confirm the native camera opens. Take a photo and confirm processing begins and completes correctly.

- [ ] **Step 6: Test error state**

  Temporarily pass a non-image file (e.g., a `.pdf`) to verify the error state shows the message and the "↺ Try Again" button returns to the upload zone.

- [ ] **Step 7: Final commit**

  ```bash
  git add -A
  git commit -m "feat: complete Chicken Scratch app — handwriting and blueprint conversion"
  ```
