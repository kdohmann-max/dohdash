import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  listAllTimeEntries,
  listTimeRates,
  listTimeJobs,
  listProfiles,
  setEntriesPaid,
  setTimeRate,
  type TimeEntry,
  type TimeRate,
  type TimeJob,
  type TimeEntryFilters,
  type Profile,
} from "../../storage/db";
import { minutesToDecimalHours, formatMinutesAsTime } from "../time-tracker/time-utils";
import { buildCsv, downloadCsv, type ExportRow } from "./export";
import { FilterBar } from "./components/FilterBar";
import { EmployeeSection } from "./components/EmployeeSection";
import { JobManager } from "./components/JobManager";
import "./TimeDashboardApp.css";

function defaultFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function TimeDashboardApp() {
  const { state } = useAuth();
  const currentUserId =
    state.status === "authenticated" ? state.profile.id : null;

  const [filters, setFilters] = useState<TimeEntryFilters>({
    from: defaultFrom(),
    to: defaultTo(),
  });
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [rates, setRates] = useState<TimeRate[]>([]);
  const [jobs, setJobs] = useState<TimeJob[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build a map of userId → hourlyRate
  const rateMap = new Map<string, number | null>(
    rates.map((r) => [r.userId, r.hourlyRate])
  );

  const loadEntries = useCallback(async () => {
    try {
      const data = await listAllTimeEntries(filters);
      setEntries(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load entries.");
    }
  }, [filters]);

  const loadRates = useCallback(async () => {
    try {
      const data = await listTimeRates();
      setRates(data);
    } catch {
      // non-fatal — rates just won't show
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const data = await listTimeJobs(true);
      setJobs(data);
    } catch {
      // non-fatal
    }
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const data = await listProfiles();
      setProfiles(data);
    } catch {
      // non-fatal
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([loadEntries(), loadRates(), loadJobs(), loadProfiles()])
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load data.");
      })
      .finally(() => setLoading(false));
  }, [loadEntries, loadRates, loadJobs, loadProfiles]);

  // Reload entries when filters change (skip the initial mount — covered by the Promise.all above)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    loadEntries();
  }, [loadEntries]);

  // Group entries by userId
  const entriesByUser = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const arr = entriesByUser.get(entry.userId) ?? [];
    arr.push(entry);
    entriesByUser.set(entry.userId, arr);
  }

  // Display name helper
  function getEmployeeName(userId: string, firstEntry?: TimeEntry): string {
    if (firstEntry?.userName) return firstEntry.userName;
    if (firstEntry?.userEmail) return firstEntry.userEmail;
    const p = profiles.find((pr) => pr.id === userId);
    return p?.displayName ?? p?.email ?? userId;
  }

  function showActionError(msg: string) {
    setActionError(msg);
    if (actionErrorTimerRef.current) clearTimeout(actionErrorTimerRef.current);
    actionErrorTimerRef.current = setTimeout(() => setActionError(null), 6000);
  }

  async function handleTogglePaid(ids: string[], paid: boolean) {
    if (!currentUserId) return;
    try {
      await setEntriesPaid(ids, paid, currentUserId);
      setActionError(null);
      await loadEntries();
    } catch (err) {
      showActionError(err instanceof Error ? err.message : "Could not update paid status. Please try again.");
    }
  }

  async function handleSetRate(userId: string, rate: number | null) {
    if (!currentUserId) return;
    try {
      await setTimeRate(userId, rate, currentUserId);
      setActionError(null);
      await loadRates();
    } catch (err) {
      showActionError(err instanceof Error ? err.message : "Could not save rate. Please try again.");
    }
  }

  function handleExport() {
    const from = filters.from ?? "all";
    const to = filters.to ?? "all";

    const rows: ExportRow[] = entries.map((entry) => {
      const netHours = minutesToDecimalHours(entry.netMinutes);
      const breakHours = minutesToDecimalHours(entry.breakMinutes);
      const rate = rateMap.get(entry.userId) ?? null;
      const pay = rate !== null ? round2(netHours * rate) : null;

      const start =
        entry.entryMode === "range" && entry.startMinutes !== null
          ? formatMinutesAsTime(entry.startMinutes)
          : "";
      const end =
        entry.entryMode === "range" && entry.endMinutes !== null
          ? formatMinutesAsTime(entry.endMinutes)
          : "";

      const employee =
        entry.userName ?? entry.userEmail ?? entry.userId;

      return {
        employee,
        date: entry.workDate,
        job: entry.jobLabel,
        start,
        end,
        breakHours,
        netHours,
        rate,
        pay,
        paid: entry.paid,
      };
    });

    downloadCsv(`time-export-${from}_${to}.csv`, buildCsv(rows));
  }

  if (!currentUserId) {
    return (
      <div className="time-dashboard-app">
        <div className="td-loading">Loading…</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="time-dashboard-app">
        <div className="td-loading">Loading time data…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="time-dashboard-app">
        <div className="td-load-error">
          <p>{loadError}</p>
          <button
            type="button"
            className="td-btn td-btn--primary"
            onClick={() => {
              setLoading(true);
              Promise.all([loadEntries(), loadRates(), loadJobs(), loadProfiles()]).finally(
                () => setLoading(false)
              );
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const userIds = Array.from(entriesByUser.keys());

  return (
    <div className="time-dashboard-app">
      <div className="td-content">
        {actionError && (
          <div className="td-load-error td-action-error">
            <p>{actionError}</p>
            <button
              type="button"
              className="td-btn td-btn--ghost td-btn--sm"
              onClick={() => setActionError(null)}
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="td-top-bar">
          <h1 className="td-app-title">Time Dashboard</h1>
          <button
            type="button"
            className="td-btn td-btn--primary"
            onClick={handleExport}
            disabled={entries.length === 0}
          >
            Export CSV
          </button>
        </div>

        <FilterBar
          jobs={jobs.filter((j) => !j.archived)}
          employees={profiles}
          value={filters}
          onChange={setFilters}
        />

        <JobManager jobs={jobs} onChanged={loadJobs} />

        <div className="td-sections">
          {userIds.length === 0 ? (
            <div className="td-empty-state">
              No time entries found for the selected filters. Try adjusting the
              date range or filter options.
            </div>
          ) : (
            userIds.map((userId) => {
              const userEntries = entriesByUser.get(userId) ?? [];
              const firstEntry = userEntries[0];
              const employeeName = getEmployeeName(userId, firstEntry);
              const rate = rateMap.get(userId) ?? null;

              return (
                <EmployeeSection
                  key={userId}
                  employeeName={employeeName}
                  rate={rate}
                  entries={userEntries}
                  onSetRate={(r) => handleSetRate(userId, r)}
                  onTogglePaid={handleTogglePaid}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
