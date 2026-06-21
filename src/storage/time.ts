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
