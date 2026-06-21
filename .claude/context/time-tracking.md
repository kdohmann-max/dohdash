# Time Tracking — Context

Two apps: `time-tracker` (worker, functional) and `time-dashboard` (manager, functional). Both lazy-loaded from `APP_REGISTRY`.

## Apps & access

- **`time-tracker`** — workers log their own hours. Access = standard `app_access` grant for `time-tracker`.
- **`time-dashboard`** — managers see all workers' time, manage pay, export CSV. Access = `app_access` grant for `time-dashboard` **or** admin. The SQL helper `can_view_all_time()` (`SECURITY DEFINER`, migration `0023`) encodes this: `is_admin() or has_app_access('time-dashboard')`. Used in RLS policies on all three tables — never inline the check.
- **Pay visibility:** anyone with dashboard access (`can_view_all_time()`) sees hourly rates and computed pay. Workers see none of it.

## Entry model

Worker entries (`time_entries`) support two modes, toggled per entry:

- **`range`** (default) — worker picks Start time and End time (minutes since midnight). Break is subtracted via presets (no break, 30 min, 1 hr, etc.). `net_minutes = (end - start) - break_minutes`.
- **`hours`** — worker enters total hours directly. `net_minutes` stores the value directly; `start_time`/`end_time`/`break_minutes` are null.

Job tag: worker picks from a dropdown of active `time_jobs` rows, or selects "Other…" and types a custom label. The chosen label is always **denormalized into `time_entries.job_label`** (never joined at query time) so historical entries survive job renames/archival.

## DB tables (migration `0023_time_tracking.sql`)

All three tables are tenant-owned: `tenant_id uuid not null default current_tenant_id()` + `tenant_id = current_tenant_id()` in every RLS policy.

### `time_entries`

Per-worker time log rows.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid → profiles | worker who owns the entry |
| `date` | date | work date |
| `entry_mode` | text | `'range'` or `'hours'` |
| `start_time` | integer \| null | minutes since midnight (range mode) |
| `end_time` | integer \| null | minutes since midnight (range mode) |
| `break_minutes` | integer | default 0 |
| `net_minutes` | integer | computed net work time |
| `job_id` | uuid \| null | FK → `time_jobs` (nullable; null when "Other…") |
| `job_label` | text \| null | denormalized label; always populated if a job or custom label is set |
| `note` | text \| null | optional free-text note |
| `paid` | boolean | default false |
| `paid_at` | timestamptz \| null | when marked paid |
| `paid_by` | uuid \| null | who marked paid |
| `tenant_id` | uuid | auto-stamped |

RLS:
- **SELECT/UPDATE/DELETE own rows**: `auth.uid() = user_id`
- **SELECT/UPDATE all same-tenant**: `can_view_all_time()`
- **INSERT**: `auth.uid() = user_id AND has_app_access('time-tracker')`

### `time_jobs`

Interim job list for the job-tag dropdown. **Superseded when the Job Files / Jobs app is built** — at that point the dropdown must source jobs from the Jobs app instead; `job_label` stays denormalized on `time_entries` so no migration is needed then.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | job display name |
| `archived` | boolean | default false; hidden from dropdown |
| `tenant_id` | uuid | auto-stamped |

RLS: SELECT any authenticated same-tenant user; INSERT/UPDATE/DELETE = `can_view_all_time()`.

### `time_rates`

Per-user hourly rate (pay-sensitive — dashboard access only).

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid PK → profiles | one row per worker |
| `hourly_rate` | numeric | dollars per hour |
| `tenant_id` | uuid | auto-stamped |

RLS: SELECT/INSERT/UPDATE = `can_view_all_time()`. Workers cannot read their own rate.

## Storage module (`src/storage/time.ts`)

Re-exported by `db.ts`. Types: `TimeEntry`, `TimeEntryInput`, `TimeJob`, `TimeRate`, `EntryMode` (`'range' | 'hours'`), `TimeEntryFilters`.

| Function | What it does |
|----------|--------------|
| `listMyTimeEntries(filters?)` | Current user's entries, optionally filtered |
| `listAllTimeEntries(filters?)` | All same-tenant entries (dashboard; `TimeEntryFilters`: date range, `userId`, `jobId`, `paid`) |
| `createTimeEntry(input)` | Insert a new entry |
| `updateTimeEntry(id, patch)` | Partial update |
| `deleteTimeEntry(id)` | Delete own entry |
| `setEntriesPaid(ids, paid)` | Bulk mark paid/unpaid (dashboard) |
| `listTimeJobs()` | Active (non-archived) jobs for dropdown |
| `createTimeJob(name)` | Add a job (dashboard) |
| `renameTimeJob(id, name)` | Rename a job (dashboard) |
| `archiveTimeJob(id)` | Archive a job; hides from dropdown (dashboard) |
| `listTimeRates()` | All per-user rates (dashboard) |
| `setTimeRate(userId, rate)` | Upsert a worker's hourly rate (dashboard) |

## Time Dashboard features

`src/apps/time-dashboard/` — grouped by employee; columns include computed pay (`net_minutes / 60 * hourly_rate`). Key interactions:

- **Inline rate editor** — click a rate cell to edit; calls `setTimeRate`.
- **Paid toggle** — per-row checkbox + bulk "Mark paid" action → `setEntriesPaid`.
- **Filters** — date range, employee, job, paid/unpaid status.
- **CSV export** — native browser download, no server round-trip. Columns (in order): `Employee, Date, Job, Start, End, Break (h), Net hours, Rate, Pay, Paid`.

## Time Tracker features

`src/apps/time-tracker/` — worker's own entries only. Key interactions:

- **New entry form** — date picker, mode toggle (Start/End | Total hours), job dropdown + "Other…" free-text, break preset selector, optional note.
- **Entry list** — own entries sorted by date desc; edit/delete own entries.
- No pay or rate information shown to worker.
