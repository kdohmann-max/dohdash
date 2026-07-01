# Personal Assistant — Context

The "Personal Assistant" is DohDash's AI layer: a Jarvis-style second brain built in
two distinct phases. Keep them separate — different audiences, different infrastructure,
different safety models.

## Phase 1: Operator coding agent (SHIPPED — June 2026)

A super-admin-only tool at `/dashboard/operator/assistant`. The operator submits
natural-language tasks; the local `agent.js` runs them headless against the real
codebase; a live transcript streams back; the operator reviews the diff and approves
before anything deploys.

Full technical detail: `operator-assistant.md`.  
Goals + decision log: `operator-journal.md`.

**Key constraints (non-negotiable):**
- Operator data has NO `tenant_id` — zero crossover with any tenant, by construction.
- Nothing deploys without an explicit operator click (Approve button → git push → Vercel).
- Claude subprocess has full bash but git is blocked by a Node.js shim; staged diff is
  verified at deploy time; human approval is the final gate.

## Phase 2: Per-tenant assistant (not yet started)

A conversational agent for every DohDash user — field workers and admins alike.
Gated by the existing two-gate model (`enabledApps` toggle = "if they pay").

**Architecture decision (locked):** runs server-side in a Supabase Edge Function,
same pattern as Chicken Scratch. Tool use mapped onto `src/storage/db.ts` functions.
RLS bounds every query to `current_tenant_id()` — a tenant's assistant cannot see or
touch any other tenant's data.

**UX mandate (non-negotiable):** this is for field workers, not engineers.
- Voice input + confirmation cards on top of the existing pick-list UIs — not replacing them.
- Recognition over recall. No free-text IDs, no Markdown syntax.
- Destructive actions (delete, mark paid, etc.) always require an explicit confirm step.
- The assistant suggests and confirms; it does not act silently.

**Planned capabilities (phase 2 scope, not yet designed):**
- Log time ("log 6 hours on Oakwood today")
- Query status ("what did I log this week?")
- Create a task/note ("add a note about the inspection")
- Simple lookups ("who do I contact about X?")

**What phase 2 is NOT:**
- A coding agent — that's phase 1 (operator-only).
- A replacement for any existing UI — it's an additional entry point.
- A cross-tenant feature — each assistant instance is fully tenant-scoped.

## Sequencing rationale

Operator-first because: isolated (no tenant risk), highest personal value, reuses
Remote Claude infrastructure already built. Tenant phase starts only after the operator
agent is proven end-to-end.
