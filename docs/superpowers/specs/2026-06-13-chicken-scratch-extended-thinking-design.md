# Chicken Scratch: Extended Thinking for Blueprint Extraction

## Problem

After the 2026-06-12 prompt rewrite (`feat: improve Chicken Scratch blueprint extraction
accuracy`), blueprint extraction still misses, invents, or merges shapes despite the
prompt's STEP 1 "enumerate every shape before writing JSON" instruction. The likely
cause: the prompt simultaneously requires "Return ONLY a valid JSON object — no
explanation, no markdown fences," leaving the model no place to actually perform that
enumeration before committing to coordinates.

## Approach

Enable Claude's extended thinking on both API calls in
`supabase/functions/process-scratch/index.ts` (first-pass extraction and the
self-verification pass), giving the model a dedicated reasoning scratchpad to work
through the prompt's STEP 1–4 enumeration/cross-check before producing the final
JSON-only response. No changes to `ProcessResult`, client code, or `dimensions.ts` —
the output schema is unchanged.

## Changes

### 1. Enable extended thinking on both `anthropic.messages.create()` calls

Add to both the first-pass and verification-pass requests:

```ts
thinking: { type: "enabled", budget_tokens: 8000 },
```

Raise `max_tokens` from `8192` → `16000` so thinking + JSON output both fit.

### 2. Fix response content-block parsing (critical)

With thinking enabled, `msg.content[0]` becomes a `thinking` block and the JSON text
moves to a later block. The current code assumes index 0 is the text block:

```ts
const firstText = stripFences(msg.content[0].type === "text" ? msg.content[0].text : "");
```

This must change to find the block by type, for both `msg` and `verifyMsg`:

```ts
const textBlock = msg.content.find((b) => b.type === "text");
const firstText = stripFences(textBlock?.type === "text" ? textBlock.text : "");
```

Without this fix, every request would silently produce an empty string, fail
`JSON.parse`, and surface as "The model returned an unreadable extraction."

### 3. Prompt addition

Add one sentence directing the model to use its reasoning for STEPS 1–4 and keep the
final response JSON-only:

> "Use your reasoning to work through STEPS 1–4 systematically before answering. Your
> final response must contain ONLY the JSON object — no explanation, no markdown
> fences."

Applies to both `PROMPT` and `VERIFY_PROMPT`.

### 4. Bump `PROMPT_VERSION`

`"2"` → `"3"`, per the existing convention, so `scratch_cache` entries from the
pre-thinking prompt are retired and not served as if produced under this approach.

## Tradeoffs

- **Cost/latency**: extended thinking tokens are billed as output tokens and add to
  both the extraction and verification calls — roughly doubles thinking-related token
  spend per request.
- **Model support assumption**: all three `ALLOWED_MODELS` (`claude-opus-4-8`,
  `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) are assumed to support extended
  thinking. If one doesn't, the call errors and surfaces via the existing 500 error
  path — no per-model special-casing.

## Out of scope

- Client-side changes (`ResultPanel.tsx`, `dimensions.ts`, `blueprintDraw.ts`) —
  `ProcessResult` shape is unchanged.
- Anthropic tool-use / JSON Schema structured outputs (considered as Approach A,
  not pursued).
- Three-pass enumerate-then-extract pipeline (considered as Approach C, not pursued).

## Testing

- Manual: re-run extraction on sketches known to previously miss/invent/merge shapes;
  compare `elements`/`labels` output before and after.
- Confirm `scratch_cache` rows under the old `::v2` hash are no longer hit (new
  `::v3` hash always misses on first run after deploy).
- Existing `dimensions.test.ts` unit tests remain unaffected (no changes to
  client-side geometry code).
