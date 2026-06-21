import { useState } from "react";
import type { TimeEntry } from "../../../storage/db";
import { deleteTimeEntry } from "../../../storage/db";
import {
  formatMinutesAsTime,
  formatDurationHm,
  minutesToDecimalHours,
} from "../time-utils";

interface HistoryListProps {
  entries: TimeEntry[];
  onEdit: (e: TimeEntry) => void;
  onDeleted: () => void;
  filterFrom: string;
  filterTo: string;
  onFilterFromChange: (v: string) => void;
  onFilterToChange: (v: string) => void;
}

/** Format a work_date string (YYYY-MM-DD) to a readable label. */
function formatWorkDate(dateStr: string): string {
  // Parse as local date to avoid timezone shift from new Date(dateStr)
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function HistoryList({
  entries,
  onEdit,
  onDeleted,
  filterFrom,
  filterTo,
  onFilterFromChange,
  onFilterToChange,
}: HistoryListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleDelete(entry: TimeEntry) {
    if (confirmId !== entry.id) {
      setConfirmId(entry.id);
      return;
    }
    setDeletingId(entry.id);
    setConfirmId(null);
    try {
      await deleteTimeEntry(entry.id);
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  function cancelConfirm() {
    setConfirmId(null);
  }

  // Group entries by workDate (entries already newest-first from query)
  const grouped: Map<string, TimeEntry[]> = new Map();
  for (const entry of entries) {
    const existing = grouped.get(entry.workDate);
    if (existing) existing.push(entry);
    else grouped.set(entry.workDate, [entry]);
  }
  const dates = Array.from(grouped.keys());

  return (
    <div className="tt-history">
      <div className="tt-history-head">
        <h2 className="tt-section-title">Time History</h2>
        <div className="tt-date-filter">
          <label className="tt-label" htmlFor="tt-filter-from">From</label>
          <input
            id="tt-filter-from"
            type="date"
            className="tt-input tt-filter-input"
            value={filterFrom}
            onChange={(e) => onFilterFromChange(e.target.value)}
          />
          <label className="tt-label" htmlFor="tt-filter-to">To</label>
          <input
            id="tt-filter-to"
            type="date"
            className="tt-input tt-filter-input"
            value={filterTo}
            onChange={(e) => onFilterToChange(e.target.value)}
          />
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="tt-empty-state">
          <p>No time logged yet. Use the form above to add your first entry.</p>
        </div>
      ) : (
        <div className="tt-entry-groups">
          {dates.map((date) => {
            const dayEntries = grouped.get(date)!;
            const dayNet = dayEntries.reduce((sum, e) => sum + e.netMinutes, 0);
            return (
              <div key={date} className="tt-date-group">
                <div className="tt-date-header">
                  <span className="tt-date-label">{formatWorkDate(date)}</span>
                  <span className="tt-date-total">
                    Total: {formatDurationHm(dayNet)} ({minutesToDecimalHours(dayNet)} hrs)
                  </span>
                </div>
                <div className="tt-entry-list">
                  {dayEntries.map((entry) => (
                    <div key={entry.id} className={`tt-entry-row${entry.paid ? " tt-entry-row--paid" : ""}`}>
                      <div className="tt-entry-main">
                        <span className="tt-entry-job">{entry.jobLabel}</span>
                        {entry.note && (
                          <span className="tt-entry-note">{entry.note}</span>
                        )}
                      </div>
                      <div className="tt-entry-meta">
                        {entry.entryMode === "range" &&
                          entry.startMinutes !== null &&
                          entry.endMinutes !== null ? (
                          <span className="tt-entry-times">
                            {formatMinutesAsTime(entry.startMinutes)}–{formatMinutesAsTime(entry.endMinutes)}
                          </span>
                        ) : (
                          <span className="tt-entry-times tt-entry-times--hours">Hours</span>
                        )}
                        {entry.breakMinutes > 0 && (
                          <span className="tt-entry-break">−{formatDurationHm(entry.breakMinutes)} break</span>
                        )}
                        <span className="tt-entry-net">
                          <strong>{formatDurationHm(entry.netMinutes)}</strong>
                          {" "}
                          <span className="tt-net-decimal">({minutesToDecimalHours(entry.netMinutes)} hrs)</span>
                        </span>
                        {entry.paid && (
                          <span className="tt-paid-badge">Paid</span>
                        )}
                      </div>
                      {!entry.paid && (
                        <div className="tt-entry-actions">
                          <button
                            type="button"
                            className="tt-action-btn"
                            onClick={() => onEdit(entry)}
                            aria-label="Edit entry"
                          >
                            Edit
                          </button>
                          {confirmId === entry.id ? (
                            <span className="tt-delete-confirm">
                              <button
                                type="button"
                                className="tt-action-btn tt-action-btn--danger"
                                onClick={() => handleDelete(entry)}
                                disabled={deletingId === entry.id}
                              >
                                Confirm delete
                              </button>
                              <button
                                type="button"
                                className="tt-action-btn"
                                onClick={cancelConfirm}
                              >
                                Keep
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="tt-action-btn tt-action-btn--danger"
                              onClick={() => handleDelete(entry)}
                              disabled={deletingId === entry.id}
                              aria-label="Delete entry"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                      {entry.paid && (
                        <div className="tt-entry-actions tt-entry-actions--locked">
                          <span className="tt-paid-lock" title="Paid — locked">Paid — locked</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
