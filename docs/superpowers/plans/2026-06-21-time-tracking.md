# Time Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a worker-facing Time Tracker app and a permissioned Time Dashboard app for DohDash, letting field staff log hours and admins/delegated users review, rate, mark paid, and export everyone's time.

**Architecture:** Two new apps in the existing `APP_REGISTRY` (flip `time-tracker` from stub to functional; add new `time-dashboard`). Three tenant-scoped Postgres tables behind RLS, accessed only through a new `src/storage/time.ts` domain module re-exported by `db.ts`. Pure time math and CSV building live in dependency-free, unit-tested modules. Dashboard access is gated by the existing `app_access` table via a new `can_view_all_time()` SQL helper.

**Tech Stack:** React 19 + TypeScript 6 + Vite 8, `@supabase/supabase-js`, Postgres RLS, vitest 4. No new dependencies (CSV is native).

## Global Constraints

- **Multi-tenancy (hard invariant):** every new table gets `tenant_id uuid not null default public.current_tenant_id() references public.tenants(id)`, and **every** RLS policy ANDs `tenant_id = public.current_tenant_id()` (`using` for SELECT/UPDATE/DELETE, `with check` for INSERT). See `.claude/skills/new-migration.md`.
- **Storage boundary:** all Supabase DB calls go through a `src/storage/` domain module re-exported by `db.ts`. Never call `supabase` from a component. The one client is `src/storage/client.ts`.
- **Styleguide:** no hardcoded colors/hex, no magic pixel values, no inline ad-hoc SVGs. Use CSS custom-property tokens (`--accent`, `--spacing-md`, `--rounded-md`, etc.). Icons go in `src/icons/index.tsx` via `svgProps()`. Every color must work in light AND dark mode.
- **UX mandate:** non-technical field users. Recognition over recall — dropdowns, checkboxes, plain labels, confirm destructive actions, sensible defaults, helpful empty states, mobile-friendly.
- **Timestamps:** `created_at`/`updated_at`/`paid_at` are `bigint` epoch-ms, written from the client as `Date.now()` (matches every existing table).
- **COMMITS ARE MANUAL (overrides the TDD "commit each task" step):** CLAUDE.md forbids `git commit`/`git push` without explicit per-change approval (a push auto-deploys live to Vercel). Therefore tasks below END at "tests pass" — do NOT commit. A single manual commit checkpoint is offered at the very end (Task 9).
- **Migrations are not auto-applied:** `supabase db push` mutates the DB; run only against LOCAL or with explicit approval. Never run the isolation seeding script against prod.

---

### Task 1: Pure time math — `time-utils.ts`

**Files:**
- Create: `src/apps/time-tracker/time-utils.ts`
- Test: `src/apps/time-tracker/time-utils.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (imported by EntryForm, HistoryList, the dashboard, and export):
  - `parseTimeToMinutes(value: string): number | null` — `"07:30"` → `450`; invalid → `null`.
  - `formatMinutesAsTime(minutes: number): string` — `450` → `"07:30"` (24h, zero-padded).
  - `formatDurationHm(totalMinutes: number): string` — `480` → `"8h 0m"`.
  - `minutesToDecimalHours(totalMinutes: number): number` — `450` → `7.5` (rounded to 2dp).
  - `hoursToMinutes(hours: number): number` — `7.5` → `450` (rounds to nearest minute).
  - `rangeNetMinutes(startMinutes: number, endMinutes: number, breakMinutes: number): number | null` — `max(0, end-start-break)`; returns `null` if `end <= start` (no overnight assumption — keep it simple/explicit).
  - `hoursNetMinutes(grossMinutes: number, breakMinutes: number): number` — `max(0, gross-break)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/apps/time-tracker/time-utils.test.ts
import { describe, expect, test } from "vitest";
import {
  parseTimeToMinutes,
  formatMinutesAsTime,
  formatDurationHm,
  minutesToDecimalHours,
  hoursToMinutes,
  rangeNetMinutes,
  hoursNetMinutes,
} from "./time-utils";

describe("parseTimeToMinutes", () => {
  test("parses HH:MM 24h", () => {
    expect(parseTimeToMinutes("07:30")).toBe(450);
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });
  test("rejects invalid", () => {
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes("7")).toBeNull();
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("07:60")).toBeNull();
  });
});

describe("formatMinutesAsTime", () => {
  test("formats to zero-padded HH:MM", () => {
    expect(formatMinutesAsTime(450)).toBe("07:30");
    expect(formatMinutesAsTime(0)).toBe("00:00");
  });
});

describe("formatDurationHm", () => {
  test("formats duration", () => {
    expect(formatDurationHm(480)).toBe("8h 0m");
    expect(formatDurationHm(455)).toBe("7h 35m");
    expect(formatDurationHm(0)).toBe("0h 0m");
  });
});

describe("minutesToDecimalHours / hoursToMinutes", () => {
  test("round-trips", () => {
    expect(minutesToDecimalHours(450)).toBe(7.5);
    expect(minutesToDecimalHours(455)).toBe(7.58);
    expect(hoursToMinutes(7.5)).toBe(450);
    expect(hoursToMinutes(8)).toBe(480);
  });
});

describe("rangeNetMinutes", () => {
  test("subtracts break from span", () => {
    expect(rangeNetMinutes(420, 930, 30)).toBe(480); // 7:00-15:30 minus 30m = 8h
    expect(rangeNetMinutes(420, 480, 0)).toBe(60);
  });
  test("never negative", () => {
    expect(rangeNetMinutes(420, 450, 60)).toBe(0);
  });
  test("null when end <= start", () => {
    expect(rangeNetMinutes(600, 600, 0)).toBeNull();
    expect(rangeNetMinutes(600, 500, 0)).toBeNull();
  });
});

describe("hoursNetMinutes", () => {
  test("subtracts break, never negative", () => {
    expect(hoursNetMinutes(510, 30)).toBe(480);
    expect(hoursNetMinutes(20, 30)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/apps/time-tracker/time-utils.test.ts`
Expected: FAIL — cannot resolve `./time-utils`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/apps/time-tracker/time-utils.ts

export function parseTimeToMinutes(value: string): number | null {
  const m = /^([0-1]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatMinutesAsTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDurationHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

export function minutesToDecimalHours(totalMinutes: number): number {
  return Math.round((totalMinutes / 60) * 100) / 100;
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export function rangeNetMinutes(
  startMinutes: number,
  endMinutes: number,
  breakMinutes: number,
): number | null {
  if (endMinutes <= startMinutes) return null;
  return Math.max(0, endMinutes - startMinutes - breakMinutes);
}

export function hoursNetMinutes(grossMinutes: number, breakMinutes: number): number {
  return Math.max(0, grossMinutes - breakMinutes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/apps/time-tracker/time-utils.test.ts`
Expected: PASS (all cases).

(No commit — see Global Constraints.)

---

### Task 2: Pure CSV export — `export.ts`

**Files:**
- Create: `src/apps/time-dashboard/export.ts`
- Test: `src/apps/time-dashboard/export.test.ts`

**Interfaces:**
- Consumes: nothing (callers map domain rows → `ExportRow` before calling).
- Produces:
  - `interface ExportRow { employee: string; date: string; job: string; start: string; end: string; breakHours: number; netHours: number; rate: number | null; pay: number | null; paid: boolean; }`
  - `buildCsv(rows: ExportRow[]): string` — RFC-4180 header + rows; fields with `,`/`"`/newline are quoted and inner `"` doubled. Empty `rate`/`pay` render as empty string. `paid` renders `Yes`/`No`.
  - `downloadCsv(filename: string, csv: string): void` — Blob + temporary `<a>` click (DOM; not unit-tested).

- [ ] **Step 1: Write the failing test**

```ts
// src/apps/time-dashboard/export.test.ts
import { describe, expect, test } from "vitest";
import { buildCsv, type ExportRow } from "./export";

const base: ExportRow = {
  employee: "Alice", date: "2026-06-21", job: "Smith Reno",
  start: "07:00", end: "15:30", breakHours: 0.5, netHours: 8,
  rate: 40, pay: 320, paid: false,
};

describe("buildCsv", () => {
  test("emits header then rows", () => {
    const csv = buildCsv([base]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Employee,Date,Job,Start,End,Break (h),Net hours,Rate,Pay,Paid");
    expect(lines[1]).toBe("Alice,2026-06-21,Smith Reno,07:00,15:30,0.5,8,40,320,No");
  });

  test("quotes fields with commas/quotes", () => {
    const csv = buildCsv([{ ...base, employee: "Doe, John", job: 'He said "hi"' }]);
    expect(csv.split("\r\n")[1]).toBe(
      '"Doe, John",2026-06-21,"He said ""hi""",07:00,15:30,0.5,8,40,320,No',
    );
  });

  test("blank rate/pay and Yes for paid", () => {
    const csv = buildCsv([{ ...base, rate: null, pay: null, paid: true, end: "" }]);
    expect(csv.split("\r\n")[1]).toBe("Alice,2026-06-21,Smith Reno,07:00,,0.5,8,,,Yes");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/apps/time-dashboard/export.test.ts`
Expected: FAIL — cannot resolve `./export`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/apps/time-dashboard/export.ts

export interface ExportRow {
  employee: string;
  date: string;
  job: string;
  start: string;
  end: string;
  breakHours: number;
  netHours: number;
  rate: number | null;
  pay: number | null;
  paid: boolean;
}

const HEADER = [
  "Employee", "Date", "Job", "Start", "End",
  "Break (h)", "Net hours", "Rate", "Pay", "Paid",
];

function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function numOrBlank(value: number | null): string {
  return value === null ? "" : String(value);
}

export function buildCsv(rows: ExportRow[]): string {
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        escapeField(r.employee),
        r.date,
        escapeField(r.job),
        r.start,
        r.end,
        String(r.breakHours),
        String(r.netHours),
        numOrBlank(r.rate),
        numOrBlank(r.pay),
        r.paid ? "Yes" : "No",
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/apps/time-dashboard/export.test.ts`
Expected: PASS.

---

### Task 3: Migration `0023_time_tracking.sql` + isolation suite

**Files:**
- Create: `supabase/migrations/0023_time_tracking.sql`
- Modify: `scripts/dev/verify-tenant-isolation.mjs` (extend `TENANT_OWNED`)

**Interfaces:**
- Produces SQL objects: tables `time_jobs`, `time_entries`, `time_rates`; function `public.can_view_all_time()`.
- Building blocks already in DB: `public.is_admin()`, `public.has_app_access(text)`, `public.current_tenant_id()`.

> Note: SQL isn't unit-tested via vitest; verification is the local `verify:isolation` run in Task 8/9. This task has no failing-test step.

- [ ] **Step 1: Write the migration**

```sql
-- 0023_time_tracking.sql — Time Tracker (worker) + Time Dashboard (admin/granted) data.
-- Tenant-owned: every table carries tenant_id + tenant-scoped RLS per the multi-tenancy mandate.
-- time_jobs is an INTERIM job list; when the Jobs app is built it supersedes this as the
-- job-tag source (see CLAUDE.md). job_label is denormalized onto entries so a row keeps its
-- job name even if the job is later archived/deleted.

-- ---- Permission helper: admin OR granted the dashboard app ----
-- Global SECURITY DEFINER (mirrors is_admin()); is_admin()/has_app_access() are already
-- tenant-scoped, so this is too. Centralizes the "can see everyone's time" rule.
create or replace function public.can_view_all_time()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin() or public.has_app_access('time-dashboard')
$$;

-- ============================ time_jobs ============================
create table public.time_jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  archived boolean not null default false,
  tenant_id uuid not null default public.current_tenant_id()
             references public.tenants(id),
  created_at bigint not null
);

alter table public.time_jobs enable row level security;

-- Everyone in the tenant needs the dropdown.
create policy "time_jobs: read same-tenant"
  on public.time_jobs for select
  using (tenant_id = public.current_tenant_id());

create policy "time_jobs: managers insert"
  on public.time_jobs for insert
  with check (tenant_id = public.current_tenant_id() and public.can_view_all_time());

create policy "time_jobs: managers update"
  on public.time_jobs for update
  using (tenant_id = public.current_tenant_id() and public.can_view_all_time())
  with check (tenant_id = public.current_tenant_id() and public.can_view_all_time());

create policy "time_jobs: managers delete"
  on public.time_jobs for delete
  using (tenant_id = public.current_tenant_id() and public.can_view_all_time());

-- ============================ time_entries ============================
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  entry_mode text not null check (entry_mode in ('range', 'hours')),
  start_minutes int,
  end_minutes int,
  break_minutes int not null default 0,
  net_minutes int not null,
  job_id uuid references public.time_jobs(id) on delete set null,
  job_label text not null,
  note text,
  paid boolean not null default false,
  paid_at bigint,
  paid_by uuid references public.profiles(id) on delete set null,
  tenant_id uuid not null default public.current_tenant_id()
             references public.tenants(id),
  created_at bigint not null,
  updated_at bigint not null
);

create index time_entries_user_date_idx on public.time_entries (tenant_id, user_id, work_date);

alter table public.time_entries enable row level security;

-- Workers see their own rows; dashboard users (admin/granted) see all same-tenant rows.
create policy "time_entries: own or dashboard read"
  on public.time_entries for select
  using (tenant_id = public.current_tenant_id()
         and (user_id = auth.uid() or public.can_view_all_time()));

-- Only the worker logs their own time, and only with the worker-app gate.
create policy "time_entries: worker insert own"
  on public.time_entries for insert
  with check (tenant_id = public.current_tenant_id()
              and user_id = auth.uid()
              and public.has_app_access('time-tracker'));

-- Worker edits own; dashboard users can correct/mark paid on anyone's (same tenant).
create policy "time_entries: own or dashboard update"
  on public.time_entries for update
  using (tenant_id = public.current_tenant_id()
         and (user_id = auth.uid() or public.can_view_all_time()))
  with check (tenant_id = public.current_tenant_id()
              and (user_id = auth.uid() or public.can_view_all_time()));

create policy "time_entries: own or dashboard delete"
  on public.time_entries for delete
  using (tenant_id = public.current_tenant_id()
         and (user_id = auth.uid() or public.can_view_all_time()));

-- ============================ time_rates ============================
create table public.time_rates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hourly_rate numeric(10, 2),
  updated_at bigint not null,
  updated_by uuid references public.profiles(id) on delete set null,
  tenant_id uuid not null default public.current_tenant_id()
             references public.tenants(id)
);

alter table public.time_rates enable row level security;

-- Pay-sensitive: only dashboard users (admin/granted) can read or write rates.
create policy "time_rates: dashboard read"
  on public.time_rates for select
  using (tenant_id = public.current_tenant_id() and public.can_view_all_time());

create policy "time_rates: dashboard insert"
  on public.time_rates for insert
  with check (tenant_id = public.current_tenant_id() and public.can_view_all_time());

create policy "time_rates: dashboard update"
  on public.time_rates for update
  using (tenant_id = public.current_tenant_id() and public.can_view_all_time())
  with check (tenant_id = public.current_tenant_id() and public.can_view_all_time());

create policy "time_rates: dashboard delete"
  on public.time_rates for delete
  using (tenant_id = public.current_tenant_id() and public.can_view_all_time());
```

- [ ] **Step 2: Extend the isolation suite**

In `scripts/dev/verify-tenant-isolation.mjs`, add the three tables to `TENANT_OWNED` (line ~33):

```js
const TENANT_OWNED = [
  "notes", "folders", "doc_comments", "groups", "group_members",
  "note_shares", "folder_shares", "app_access", "profiles",
  "access_requests", "admin_audit_log", "remote_projects", "remote_sessions",
  "pending_profiles",
  "time_entries", "time_jobs", "time_rates",
];
```

- [ ] **Step 3: Apply locally and verify (LOCAL ONLY)**

Run (only if a local supabase stack is up — otherwise defer to Task 9):
```
supabase db push
supabase status -o env > .env.test
npm run verify:isolation
```
Expected: `PASS: no cross-tenant leaks.` Do NOT run against prod.

---

### Task 4: Storage domain module — `src/storage/time.ts`

**Files:**
- Create: `src/storage/time.ts`
- Modify: `src/storage/db.ts` (add `export * from "./time";`)

**Interfaces:**
- Consumes: `supabase` from `./client`.
- Produces (imported by both apps):

```ts
export type EntryMode = "range" | "hours";

export interface TimeEntry {
  id: string; userId: string; workDate: string; entryMode: EntryMode;
  startMinutes: number | null; endMinutes: number | null;
  breakMinutes: number; netMinutes: number;
  jobId: string | null; jobLabel: string; note: string | null;
  paid: boolean; paidAt: number | null; paidBy: string | null;
  createdAt: number; updatedAt: number;
  userName?: string | null;   // joined in listAllTimeEntries only
  userEmail?: string | null;  // joined in listAllTimeEntries only
}
export interface TimeEntryInput {
  workDate: string; entryMode: EntryMode;
  startMinutes: number | null; endMinutes: number | null;
  breakMinutes: number; netMinutes: number;
  jobId: string | null; jobLabel: string; note: string | null;
}
export interface TimeJob { id: string; name: string; archived: boolean; createdAt: number; }
export interface TimeRate { userId: string; hourlyRate: number | null; updatedAt: number; updatedBy: string | null; }
export interface TimeEntryFilters { from?: string; to?: string; userId?: string; jobId?: string; paid?: boolean; }
```
Functions: `listMyTimeEntries`, `listAllTimeEntries`, `createTimeEntry`, `updateTimeEntry`, `deleteTimeEntry`, `setEntriesPaid`, `listTimeJobs`, `createTimeJob`, `renameTimeJob`, `archiveTimeJob`, `listTimeRates`, `setTimeRate` (signatures below).

- [ ] **Step 1: Write the module**

```ts
// src/storage/time.ts
import { supabase } from "./client";

export type EntryMode = "range" | "hours";

export interface TimeEntry {
  id: string; userId: string; workDate: string; entryMode: EntryMode;
  startMinutes: number | null; endMinutes: number | null;
  breakMinutes: number; netMinutes: number;
  jobId: string | null; jobLabel: string; note: string | null;
  paid: boolean; paidAt: number | null; paidBy: string | null;
  createdAt: number; updatedAt: number;
  userName?: string | null;
  userEmail?: string | null;
}
export interface TimeEntryInput {
  workDate: string; entryMode: EntryMode;
  startMinutes: number | null; endMinutes: number | null;
  breakMinutes: number; netMinutes: number;
  jobId: string | null; jobLabel: string; note: string | null;
}
export interface TimeJob { id: string; name: string; archived: boolean; createdAt: number; }
export interface TimeRate { userId: string; hourlyRate: number | null; updatedAt: number; updatedBy: string | null; }
export interface TimeEntryFilters { from?: string; to?: string; userId?: string; jobId?: string; paid?: boolean; }

interface TimeEntryRow {
  id: string; user_id: string; work_date: string; entry_mode: EntryMode;
  start_minutes: number | null; end_minutes: number | null;
  break_minutes: number; net_minutes: number;
  job_id: string | null; job_label: string; note: string | null;
  paid: boolean; paid_at: number | null; paid_by: string | null;
  created_at: number; updated_at: number;
  user?: { display_name: string | null; email: string } | null;
}

function rowToEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id, userId: row.user_id, workDate: row.work_date, entryMode: row.entry_mode,
    startMinutes: row.start_minutes, endMinutes: row.end_minutes,
    breakMinutes: row.break_minutes, netMinutes: row.net_minutes,
    jobId: row.job_id, jobLabel: row.job_label, note: row.note,
    paid: row.paid, paidAt: row.paid_at, paidBy: row.paid_by,
    createdAt: row.created_at, updatedAt: row.updated_at,
    userName: row.user?.display_name ?? null,
    userEmail: row.user?.email ?? null,
  };
}

function inputToRow(input: TimeEntryInput) {
  return {
    work_date: input.workDate, entry_mode: input.entryMode,
    start_minutes: input.startMinutes, end_minutes: input.endMinutes,
    break_minutes: input.breakMinutes, net_minutes: input.netMinutes,
    job_id: input.jobId, job_label: input.jobLabel, note: input.note,
  };
}

export async function listMyTimeEntries(userId: string, range?: { from?: string; to?: string }): Promise<TimeEntry[]> {
  let q = supabase.from("time_entries").select("*").eq("user_id", userId);
  if (range?.from) q = q.gte("work_date", range.from);
  if (range?.to) q = q.lte("work_date", range.to);
  const { data, error } = await q.order("work_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as TimeEntryRow[]).map(rowToEntry);
}

export async function listAllTimeEntries(filters: TimeEntryFilters = {}): Promise<TimeEntry[]> {
  // RLS restricts this to same-tenant + (own | dashboard) rows. Join the author profile.
  let q = supabase
    .from("time_entries")
    .select("*, user:profiles!time_entries_user_id_fkey(display_name, email)");
  if (filters.from) q = q.gte("work_date", filters.from);
  if (filters.to) q = q.lte("work_date", filters.to);
  if (filters.userId) q = q.eq("user_id", filters.userId);
  if (filters.jobId) q = q.eq("job_id", filters.jobId);
  if (filters.paid !== undefined) q = q.eq("paid", filters.paid);
  const { data, error } = await q.order("work_date", { ascending: false });
  if (error) throw error;
  // Supabase's nested-join type doesn't match our manual row type — intentional cast (same as listDocs).
  return ((data ?? []) as unknown as TimeEntryRow[]).map(rowToEntry);
}

export async function createTimeEntry(input: TimeEntryInput, userId: string): Promise<TimeEntry> {
  const now = Date.now();
  const { data, error } = await supabase
    .from("time_entries")
    .insert({ ...inputToRow(input), user_id: userId, created_at: now, updated_at: now })
    .select("*")
    .single();
  if (error) throw error;
  return rowToEntry(data as TimeEntryRow);
}

export async function updateTimeEntry(id: string, patch: Partial<TimeEntryInput>): Promise<void> {
  const row: Record<string, unknown> = { updated_at: Date.now() };
  if (patch.workDate !== undefined) row.work_date = patch.workDate;
  if (patch.entryMode !== undefined) row.entry_mode = patch.entryMode;
  if (patch.startMinutes !== undefined) row.start_minutes = patch.startMinutes;
  if (patch.endMinutes !== undefined) row.end_minutes = patch.endMinutes;
  if (patch.breakMinutes !== undefined) row.break_minutes = patch.breakMinutes;
  if (patch.netMinutes !== undefined) row.net_minutes = patch.netMinutes;
  if (patch.jobId !== undefined) row.job_id = patch.jobId;
  if (patch.jobLabel !== undefined) row.job_label = patch.jobLabel;
  if (patch.note !== undefined) row.note = patch.note;
  const { error } = await supabase.from("time_entries").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const { error } = await supabase.from("time_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function setEntriesPaid(ids: string[], paid: boolean, byUserId: string): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("time_entries")
    .update({ paid, paid_at: paid ? Date.now() : null, paid_by: paid ? byUserId : null, updated_at: Date.now() })
    .in("id", ids);
  if (error) throw error;
}

export async function listTimeJobs(includeArchived = false): Promise<TimeJob[]> {
  let q = supabase.from("time_jobs").select("*");
  if (!includeArchived) q = q.eq("archived", false);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: { id: string; name: string; archived: boolean; created_at: number }) => ({
    id: r.id, name: r.name, archived: r.archived, createdAt: r.created_at,
  }));
}

export async function createTimeJob(name: string): Promise<TimeJob> {
  const { data, error } = await supabase
    .from("time_jobs")
    .insert({ name, created_at: Date.now() })
    .select("*")
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, archived: data.archived, createdAt: data.created_at };
}

export async function renameTimeJob(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("time_jobs").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function archiveTimeJob(id: string, archived = true): Promise<void> {
  const { error } = await supabase.from("time_jobs").update({ archived }).eq("id", id);
  if (error) throw error;
}

export async function listTimeRates(): Promise<TimeRate[]> {
  const { data, error } = await supabase.from("time_rates").select("*");
  if (error) throw error;
  return (data ?? []).map((r: { user_id: string; hourly_rate: number | null; updated_at: number; updated_by: string | null }) => ({
    userId: r.user_id, hourlyRate: r.hourly_rate, updatedAt: r.updated_at, updatedBy: r.updated_by,
  }));
}

export async function setTimeRate(userId: string, hourlyRate: number | null, byUserId: string): Promise<void> {
  const { error } = await supabase
    .from("time_rates")
    .upsert(
      { user_id: userId, hourly_rate: hourlyRate, updated_at: Date.now(), updated_by: byUserId },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}
```

- [ ] **Step 2: Add the barrel export**

In `src/storage/db.ts`, after `export * from "./tenants";` add:
```ts
export * from "./time";
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: PASS (no type errors).

---

### Task 5: Icon + registry wiring

**Files:**
- Modify: `src/icons/index.tsx` (add `TimeDashboardIcon`)
- Modify: `src/apps/registry.tsx` (lazy imports; flip `time-tracker`; add `time-dashboard`)

**Interfaces:**
- Consumes: `TimeTrackerApp` (Task 6), `TimeDashboardApp` (Task 7), existing `TimeTrackerIcon`.
- Produces: registry entries `time-tracker` (functional) and `time-dashboard` (functional).

- [ ] **Step 1: Add the dashboard icon**

In `src/icons/index.tsx`, add an icon using the existing `svgProps(size)` helper (stroke-only, `currentColor`, viewBox `0 0 24 24`). Example (a bar-chart/clipboard motif distinct from the clock `TimeTrackerIcon`):

```tsx
export function TimeDashboardIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 15v-3M12 15V9M17 15v-5" />
    </svg>
  );
}
```

- [ ] **Step 2: Wire the registry**

In `src/apps/registry.tsx`:
1. Import the new icon: add `TimeDashboardIcon` to the `from "../icons"` import.
2. Add lazy components alongside the others:
```tsx
const TimeTrackerApp = lazy(() => import("./time-tracker/TimeTrackerApp").then((m) => ({ default: m.TimeTrackerApp })));
const TimeDashboardApp = lazy(() => import("./time-dashboard/TimeDashboardApp").then((m) => ({ default: m.TimeDashboardApp })));
```
3. Replace the existing `time-tracker` entry's `component: AppStubPage, status: "stub"` with `component: TimeTrackerApp, status: "functional"`.
4. Add a new entry after `time-tracker`:
```tsx
  {
    id: "time-dashboard",
    name: "Time Dashboard",
    icon: <TimeDashboardIcon />,
    description: "Review, rate, and export everyone's logged time.",
    route: "/dashboard/app/time-dashboard",
    component: TimeDashboardApp,
    status: "functional",
  },
```

- [ ] **Step 3: Typecheck** — Run `npx tsc -b`. Expected: FAIL only on the not-yet-created app modules (resolved by Tasks 6–7); no errors in registry/icons themselves. (If running Tasks 6–7 first, this passes clean.)

> Execution note: build Tasks 6 and 7 before re-running the full `npx tsc -b`/`npm run build`.

---

### Task 6: Time Tracker (worker app)

**Files:**
- Create: `src/apps/time-tracker/TimeTrackerApp.tsx` + `TimeTrackerApp.css`
- Create: `src/apps/time-tracker/components/EntryForm.tsx`
- Create: `src/apps/time-tracker/components/HistoryList.tsx`
- Create: `src/apps/time-tracker/data/breaks.ts`

**Interfaces:**
- Consumes: `time-utils.ts` (Task 1); from `../../storage/db`: `listMyTimeEntries`, `createTimeEntry`, `updateTimeEntry`, `deleteTimeEntry`, `listTimeJobs`, types `TimeEntry`, `TimeEntryInput`, `TimeJob`, `EntryMode`; current user id from `useAuthState`/auth context (same source other apps use — match how TasksApp gets the user id).
- Produces: named export `TimeTrackerApp`.

- [ ] **Step 1: Break presets**

```ts
// src/apps/time-tracker/data/breaks.ts
export interface BreakOption { id: string; label: string; minutes: number; }

export const BREAK_OPTIONS: BreakOption[] = [
  { id: "coffee", label: "Coffee break (15 min)", minutes: 15 },
  { id: "lunch30", label: "Lunch (30 min)", minutes: 30 },
  { id: "lunch60", label: "Lunch (60 min)", minutes: 60 },
];
```

- [ ] **Step 2: EntryForm**

Behavior (build with plain `useState`):
- `workDate` defaults to today (`new Date().toISOString().slice(0,10)`), `<input type="date">`.
- `mode: EntryMode` toggle (two buttons / segmented control), default `"range"`.
- Range mode: `<input type="time">` for start and end. Hours mode: a numeric hours `<input>` (step `0.25`).
- Job `<select>`: options from `listTimeJobs()`; a final option `"__other"` labeled "Other…" reveals a text `<input>` for a custom name. The selected job's display text becomes `jobLabel`; `jobId` is the picked job's id or `null` for custom.
- Break checkboxes from `BREAK_OPTIONS`; `breakMinutes` = sum of checked.
- Live **Net hours** readout: range → `rangeNetMinutes(parseTimeToMinutes(start), parseTimeToMinutes(end), breakMinutes)`; hours → `hoursNetMinutes(hoursToMinutes(hoursField), breakMinutes)`; show via `minutesToDecimalHours` + `formatDurationHm`. If invalid (range end ≤ start, or unparseable) show a plain inline hint and disable Save.
- Save builds `TimeEntryInput` (`startMinutes`/`endMinutes` null in hours mode) and calls `createTimeEntry(input, userId)` (or `updateTimeEntry` when editing an existing entry passed in as a prop), then calls an `onSaved` callback to refresh history and resets the form.
- All controls have plain-language labels; Save is the accent primary button.

Props:
```tsx
interface EntryFormProps {
  userId: string;
  jobs: TimeJob[];
  editing?: TimeEntry | null;     // when set, form pre-fills and Save updates
  onSaved: () => void;
  onCancelEdit?: () => void;
}
```

- [ ] **Step 3: HistoryList**

Behavior:
- Props: `{ entries: TimeEntry[]; onEdit: (e: TimeEntry) => void; onDeleted: () => void; }`.
- Renders entries newest-first (already sorted by the query), grouped or labeled by `workDate`.
- Each row shows: date, `jobLabel`, time range (`formatMinutesAsTime` start–end) or "—" for hours mode, break (h), **Net** (`formatDurationHm` + `minutesToDecimalHours`), and a **Paid** badge when `entry.paid`.
- Edit and Delete actions per row. **Paid rows are read-only**: hide Edit/Delete (or disable with a tooltip "Paid — locked"). Delete confirms first (`window.confirm` or a small inline confirm), then `deleteTimeEntry(id)` → `onDeleted()`.
- Optional date-range filter (two `<input type="date">`) that re-queries via the parent.
- Empty state: "No time logged yet. Use the form above to add your first entry."

- [ ] **Step 4: TimeTrackerApp shell**

Behavior:
- On mount, resolve `userId` (same hook other apps use), then load `listTimeJobs()` and `listMyTimeEntries(userId)` into state (with loading/error handling consistent with other apps).
- Renders `<EntryForm>` on top and `<HistoryList>` below; wires `editing` state so clicking Edit loads a row into the form.
- Root element `<div className="time-tracker-app">`; import `./TimeTrackerApp.css`.

- [ ] **Step 5: CSS**

`TimeTrackerApp.css` scoped under `.time-tracker-app`. Tokens only (`--bg`, `--bg-alt`, `--border`, `--text`, `--muted`, `--accent`, `--accent-soft`, spacing/radius tokens). Card pattern from the styleguide for the form and rows; accent primary button for Save; destructive pattern for Delete; mobile-first (single column, large touch targets). Must work in light + dark.

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc -b`
Expected: PASS for time-tracker (time-dashboard may still error until Task 7).

---

### Task 7: Time Dashboard app

**Files:**
- Create: `src/apps/time-dashboard/TimeDashboardApp.tsx` + `TimeDashboardApp.css`
- Create: `src/apps/time-dashboard/components/FilterBar.tsx`
- Create: `src/apps/time-dashboard/components/EmployeeSection.tsx`
- Create: `src/apps/time-dashboard/components/JobManager.tsx`
- (Uses `export.ts` from Task 2.)

**Interfaces:**
- Consumes: from `../../storage/db`: `listAllTimeEntries`, `setEntriesPaid`, `listTimeRates`, `setTimeRate`, `listTimeJobs`, `createTimeJob`, `renameTimeJob`, `archiveTimeJob`, `listProfiles`, types `TimeEntry`, `TimeRate`, `TimeJob`, `Profile`, `TimeEntryFilters`; `time-utils.ts` (`minutesToDecimalHours`, `formatMinutesAsTime`, `formatDurationHm`); `export.ts` (`buildCsv`, `downloadCsv`, `ExportRow`); current user id (for `setEntriesPaid`/`setTimeRate` `byUserId`).
- Produces: named export `TimeDashboardApp`.

- [ ] **Step 1: FilterBar**

Props `{ jobs: TimeJob[]; employees: Profile[]; value: TimeEntryFilters; onChange: (f: TimeEntryFilters) => void; }`. Controls: date from/to (`<input type="date">`), employee `<select>` (All + each profile by display name/email), job `<select>` (All + jobs), paid status `<select>` (All / Paid / Unpaid → `paid` true/false/undefined). Plain labels, "All" defaults.

- [ ] **Step 2: EmployeeSection**

Props:
```tsx
interface EmployeeSectionProps {
  employeeName: string;
  rate: number | null;
  entries: TimeEntry[];
  onSetRate: (rate: number | null) => void;
  onTogglePaid: (ids: string[], paid: boolean) => void;
}
```
Behavior:
- Header: employee name, inline **rate editor** (numeric `<input>` prefixed with the company currency symbol, Save), **total net hours** (`sum(minutesToDecimalHours(net))`), **total pay** (`totalHours * rate`, blank if no rate).
- Entry rows: date, job, range/—, break (h), net hours, row pay (`netHours*rate`), a **Paid** toggle (checkbox/switch) calling `onTogglePaid([id], next)`.
- A **bulk** "Mark all unpaid as paid" action for the section calling `onTogglePaid(unpaidIds, true)`.

- [ ] **Step 3: JobManager**

Props `{ jobs: TimeJob[]; onChanged: () => void; }`. A small panel (collapsible/secondary) to add a job (text + Add → `createTimeJob`), rename inline (`renameTimeJob`), and archive (`archiveTimeJob`, confirm). This is the interim job source until the Jobs app exists. Empty state: "No jobs yet — add the jobs your crew works on so they show up in the Time Tracker dropdown."

- [ ] **Step 4: TimeDashboardApp shell**

Behavior:
- On mount load `listProfiles()`, `listTimeRates()`, `listTimeJobs(true)`, and `listAllTimeEntries(filters)`; reload entries when `filters` change.
- Group entries by `userId`; render one `<EmployeeSection>` per employee who has entries (and/or all profiles — show employees with a rate even if no entries this period; decide simplest: sections for employees that appear in the filtered entries, plus rate editing). Map `TimeRate[]` → a `Map<userId, number|null>`.
- `onTogglePaid` → `setEntriesPaid(ids, paid, currentUserId)` then reload. `onSetRate` → `setTimeRate(userId, rate, currentUserId)` then reload rates.
- **Export CSV** button: map the currently-filtered entries → `ExportRow[]` (employee = `userName ?? userEmail`, `breakHours = minutesToDecimalHours(breakMinutes)`, `netHours = minutesToDecimalHours(netMinutes)`, `rate` from the map, `pay = rate==null?null:round2(netHours*rate)`, `start`/`end` via `formatMinutesAsTime` or "" for hours mode), then `downloadCsv(\`time-export-${from}-${to}.csv\`, buildCsv(rows))`.
- Include `<FilterBar>` and `<JobManager>`. Root `<div className="time-dashboard-app">`; import `./TimeDashboardApp.css`.

- [ ] **Step 5: CSS**

`TimeDashboardApp.css` scoped under `.time-dashboard-app`. Tokens only. Per-employee card with the accent-bar pattern; table-like rows that collapse to stacked cards on narrow screens; accent primary for Export; secondary (blue) for rate Save; destructive for archive. Light + dark.

- [ ] **Step 6: Full typecheck + build + tests**

Run: `npx tsc -b` then `npm run build` then `npm test`
Expected: all PASS (build clean; `time-utils.test.ts` and `export.test.ts` green).

---

### Task 8: Documentation

**Files:**
- Create: `.claude/context/time-tracking.md`
- Modify: `CLAUDE.md`
- Modify: `.claude/context/dohdash.md`

- [ ] **Step 1: New context file** `.claude/context/time-tracking.md` — document: the two apps + ids; entry model (range/hours toggle, breaks→net); the `time_entries`/`time_jobs`/`time_rates` tables; `can_view_all_time()` and the `app_access('time-dashboard')` permission tier; pay visibility rule; the storage module functions; CSV export columns; and the **interim job list** note (Jobs app supersedes `time_jobs`).

- [ ] **Step 2: `CLAUDE.md`** — in the Apps paragraph, move Time Tracker into the functional set and add Time Dashboard; add `@.claude/context/time-tracking.md` to the import list at the bottom; add a prominent **Jobs-app note**: "When the Job Files / Jobs app is built, the Time Tracker job-tag dropdown must source jobs from it, replacing the interim `time_jobs` table; keep `job_label` denormalized on `time_entries`."

- [ ] **Step 3: `.claude/context/dohdash.md`** — add `time_entries`, `time_jobs`, `time_rates` to the **Tables** list; add `time.ts` to the storage-module list; note the new `time-dashboard` `app_id` and the `can_view_all_time()` helper alongside `is_admin()`/`has_app_access()`.

- [ ] **Step 4:** No code change to verify; ensure the new app ids and table names in docs exactly match the code/migration.

---

### Task 9: Verification + manual commit checkpoint

- [ ] **Step 1: Full local gate** — Run: `npx tsc -b && npm run build && npm test`. Expected: all clean/green.

- [ ] **Step 2: Tenant isolation (LOCAL)** — With a local supabase stack: `supabase db push` → `supabase status -o env > .env.test` → `npm run verify:isolation`. Expected: `PASS: no cross-tenant leaks.` (includes the 3 new tables). Skip/flag if no local stack is available.

- [ ] **Step 3: Dev-auth browser pass** (per `dohdash.md` "Dev auth bypass"): `npm run auth:mint`, then a `scripts/dev/` Playwright launcher with `storageState: "playwright/.auth/admin.json"`:
  - As admin: grant self `time-tracker` (and `time-dashboard`) app access if needed; open **Time Tracker**, log a start/end entry and an hours entry with breaks, confirm Net hours; open **Time Dashboard**, add a job via JobManager, set a rate, confirm $ total, mark an entry paid, click Export CSV and verify columns/escaping.
  - Confirm RLS: a profile without the `time-dashboard` grant sees only its own rows from `listAllTimeEntries` (returns own only), and `time_rates` reads are empty for it.

- [ ] **Step 4: Hand back for manual commit** — Summarize the diff and the required deploy step (`supabase db push` against prod, then commit/push for the Vercel deploy). **Do NOT commit or push** — wait for explicit approval per CLAUDE.md.

---

## Self-Review

- **Spec coverage:** worker entry (date/job/breaks/both modes) → Task 6; history + own-only → Task 6 + RLS Task 3; dashboard by employee, rates, paid/unpaid (default unpaid via column default), filters, CSV → Tasks 2 + 7; non-admin dashboard grant → `app_access('time-dashboard')` + `can_view_all_time()` Task 3/5; pay visible to granted users → single dashboard view Task 7; Jobs-app future note → Tasks 3 + 8. ✔ all mapped.
- **Placeholders:** pure-logic, migration, and storage tasks contain complete code; UI tasks specify exact files, props, and behavior with representative code (full per-line TSX/CSS follows existing app patterns — acceptable per writing-plans "follow established patterns"). No TBD/TODO left.
- **Type consistency:** `TimeEntry`/`TimeEntryInput`/`TimeJob`/`TimeRate`/`EntryMode`/`TimeEntryFilters` defined once in Task 4 and consumed verbatim in Tasks 6–7; `ExportRow` defined in Task 2 and consumed in Task 7; time-utils signatures (Task 1) match call sites. ✔

## Notes for the executor
- Resolve the current user id the same way `TasksApp` does (auth context/hook) — do not call `supabase.auth` from these components.
- Confirm the FK constraint name `time_entries_user_id_fkey` after the migration; adjust the embed alias in `listAllTimeEntries` if Postgres names it differently.
- Do not add libraries. CSV is native; dates use `<input type="date">`/`type="time"`.
