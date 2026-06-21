import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { listMyTimeEntries, listTimeJobs, type TimeEntry, type TimeJob } from "../../storage/db";
import { EntryForm } from "./components/EntryForm";
import { HistoryList } from "./components/HistoryList";
import "./TimeTrackerApp.css";

function defaultFrom(): string {
  // Default range: first day of current month
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimeTrackerApp() {
  const { state } = useAuth();
  const userId = state.status === "authenticated" ? state.profile.id : null;

  const [jobs, setJobs] = useState<TimeJob[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [filterFrom, setFilterFrom] = useState(defaultFrom());
  const [filterTo, setFilterTo] = useState(defaultTo());

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);
    try {
      const [fetchedJobs, fetchedEntries] = await Promise.all([
        listTimeJobs(),
        listMyTimeEntries(userId, { from: filterFrom, to: filterTo }),
      ]);
      setJobs(fetchedJobs);
      setEntries(fetchedEntries);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [userId, filterFrom, filterTo]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  function handleSaved() {
    setEditing(null);
    loadData();
  }

  function handleCancelEdit() {
    setEditing(null);
  }

  function handleFilterFromChange(v: string) {
    setFilterFrom(v);
  }

  function handleFilterToChange(v: string) {
    setFilterTo(v);
  }

  if (!userId) {
    return (
      <div className="time-tracker-app">
        <div className="tt-loading">Loading…</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="time-tracker-app">
        <div className="tt-loading">Loading your time entries…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="time-tracker-app">
        <div className="tt-load-error">
          <p>{loadError}</p>
          <button type="button" className="tt-btn tt-btn--primary" onClick={() => { setLoading(true); loadData(); }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="time-tracker-app">
      <div className="tt-content">
        <h1 className="tt-app-title">Time Tracker</h1>
        <EntryForm
          userId={userId}
          jobs={jobs}
          editing={editing}
          onSaved={handleSaved}
          onCancelEdit={handleCancelEdit}
        />
        <HistoryList
          entries={entries}
          onEdit={(e) => { setEditing(e); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onDeleted={loadData}
          filterFrom={filterFrom}
          filterTo={filterTo}
          onFilterFromChange={handleFilterFromChange}
          onFilterToChange={handleFilterToChange}
        />
      </div>
    </div>
  );
}
