import { useEffect, useState } from "react";
import type { EntryMode, TimeEntry, TimeEntryInput, TimeJob } from "../../../storage/db";
import {
  parseTimeToMinutes,
  formatDurationHm,
  minutesToDecimalHours,
  hoursToMinutes,
  rangeNetMinutes,
  hoursNetMinutes,
} from "../time-utils";
import { createTimeEntry, updateTimeEntry } from "../../../storage/db";
import { BREAK_OPTIONS } from "../data/breaks";

interface EntryFormProps {
  userId: string;
  jobs: TimeJob[];
  editing?: TimeEntry | null;
  onSaved: () => void;
  onCancelEdit?: () => void;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EntryForm({ userId, jobs, editing, onSaved, onCancelEdit }: EntryFormProps) {
  const [workDate, setWorkDate] = useState(todayString());
  const [mode, setMode] = useState<EntryMode>("range");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hoursField, setHoursField] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string>("__other");
  const [customJobName, setCustomJobName] = useState("");
  const [checkedBreaks, setCheckedBreaks] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Pre-fill form when editing an existing entry
  useEffect(() => {
    if (editing) {
      setWorkDate(editing.workDate);
      setMode(editing.entryMode);
      if (editing.entryMode === "range") {
        setStartTime(
          editing.startMinutes !== null
            ? `${String(Math.floor(editing.startMinutes / 60)).padStart(2, "0")}:${String(editing.startMinutes % 60).padStart(2, "0")}`
            : ""
        );
        setEndTime(
          editing.endMinutes !== null
            ? `${String(Math.floor(editing.endMinutes / 60)).padStart(2, "0")}:${String(editing.endMinutes % 60).padStart(2, "0")}`
            : ""
        );
        setHoursField("");
      } else {
        setStartTime("");
        setEndTime("");
        setHoursField(String(minutesToDecimalHours(editing.netMinutes + editing.breakMinutes)));
      }
      // Restore job selection
      const matchedJob = jobs.find((j) => j.id === editing.jobId);
      if (matchedJob) {
        setSelectedJobId(matchedJob.id);
        setCustomJobName("");
      } else {
        setSelectedJobId("__other");
        setCustomJobName(editing.jobLabel);
      }
      // Restore breaks via best-effort matching of break minutes
      const newChecked = new Set<string>();
      let remaining = editing.breakMinutes;
      for (const opt of [...BREAK_OPTIONS].sort((a, b) => b.minutes - a.minutes)) {
        if (remaining >= opt.minutes) {
          newChecked.add(opt.id);
          remaining -= opt.minutes;
        }
      }
      setCheckedBreaks(newChecked);
      setNote(editing.note ?? "");
    } else {
      resetForm();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function resetForm() {
    setWorkDate(todayString());
    setMode("range");
    setStartTime("");
    setEndTime("");
    setHoursField("");
    setSelectedJobId("__other");
    setCustomJobName("");
    setCheckedBreaks(new Set());
    setNote("");
    setSaveError(null);
  }

  const breakMinutes = Array.from(checkedBreaks).reduce((sum, id) => {
    const opt = BREAK_OPTIONS.find((b) => b.id === id);
    return sum + (opt?.minutes ?? 0);
  }, 0);

  // Live net minutes calculation
  let netMinutes: number | null = null;
  let validationHint: string | null = null;

  if (mode === "range") {
    const start = parseTimeToMinutes(startTime);
    const end = parseTimeToMinutes(endTime);
    if (startTime && endTime && start !== null && end !== null) {
      const computed = rangeNetMinutes(start, end, breakMinutes);
      if (computed === null) {
        validationHint = "End time must be after start time.";
      } else {
        netMinutes = computed;
      }
    } else if (startTime || endTime) {
      validationHint = "Enter both start and end times.";
    }
  } else {
    const hours = parseFloat(hoursField);
    if (hoursField && !isNaN(hours) && hours > 0) {
      netMinutes = hoursNetMinutes(hoursToMinutes(hours), breakMinutes);
    } else if (hoursField) {
      validationHint = "Enter a valid number of hours.";
    }
  }

  const jobLabel =
    selectedJobId === "__other"
      ? customJobName.trim()
      : (jobs.find((j) => j.id === selectedJobId)?.name ?? "");

  const canSave =
    netMinutes !== null &&
    netMinutes >= 0 &&
    workDate.length === 10 &&
    jobLabel.length > 0;

  function toggleBreak(id: string) {
    setCheckedBreaks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!canSave || netMinutes === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const startMins =
        mode === "range" ? parseTimeToMinutes(startTime) : null;
      const endMins =
        mode === "range" ? parseTimeToMinutes(endTime) : null;

      const input: TimeEntryInput = {
        workDate,
        entryMode: mode,
        startMinutes: startMins ?? null,
        endMinutes: endMins ?? null,
        breakMinutes,
        netMinutes,
        jobId: selectedJobId === "__other" ? null : selectedJobId,
        jobLabel,
        note: note.trim() || null,
      };

      if (editing) {
        await updateTimeEntry(editing.id, input);
      } else {
        await createTimeEntry(input, userId);
      }
      onSaved();
      if (!editing) resetForm();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tt-form-card">
      <h2 className="tt-form-title">{editing ? "Edit Entry" : "Log Time"}</h2>

      {/* Date */}
      <div className="tt-field">
        <label htmlFor="tt-work-date" className="tt-label">Date</label>
        <input
          id="tt-work-date"
          type="date"
          className="tt-input"
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
        />
      </div>

      {/* Job */}
      <div className="tt-field">
        <label htmlFor="tt-job-select" className="tt-label">Job</label>
        <select
          id="tt-job-select"
          className="tt-input tt-select"
          value={selectedJobId}
          onChange={(e) => { setSelectedJobId(e.target.value); setCustomJobName(""); }}
        >
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>{j.name}</option>
          ))}
          <option value="__other">Other…</option>
        </select>
        {selectedJobId === "__other" && (
          <input
            type="text"
            className="tt-input tt-custom-job"
            placeholder="Enter job name"
            value={customJobName}
            onChange={(e) => setCustomJobName(e.target.value)}
            aria-label="Custom job name"
          />
        )}
      </div>

      {/* Mode toggle */}
      <div className="tt-field">
        <span className="tt-label">Entry type</span>
        <div className="tt-mode-toggle">
          <button
            type="button"
            className={`tt-mode-btn${mode === "range" ? " tt-mode-btn--active" : ""}`}
            onClick={() => setMode("range")}
          >
            Start / End time
          </button>
          <button
            type="button"
            className={`tt-mode-btn${mode === "hours" ? " tt-mode-btn--active" : ""}`}
            onClick={() => setMode("hours")}
          >
            Total hours
          </button>
        </div>
      </div>

      {/* Range inputs */}
      {mode === "range" && (
        <div className="tt-time-row">
          <div className="tt-field tt-field--half">
            <label htmlFor="tt-start" className="tt-label">Start time</label>
            <input
              id="tt-start"
              type="time"
              className="tt-input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="tt-field tt-field--half">
            <label htmlFor="tt-end" className="tt-label">End time</label>
            <input
              id="tt-end"
              type="time"
              className="tt-input"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Hours input */}
      {mode === "hours" && (
        <div className="tt-field">
          <label htmlFor="tt-hours" className="tt-label">Hours worked</label>
          <input
            id="tt-hours"
            type="number"
            className="tt-input"
            min="0"
            step="0.25"
            placeholder="e.g. 8 or 7.5"
            value={hoursField}
            onChange={(e) => setHoursField(e.target.value)}
          />
        </div>
      )}

      {/* Breaks */}
      <div className="tt-field">
        <span className="tt-label">Breaks taken</span>
        <div className="tt-breaks">
          {BREAK_OPTIONS.map((opt) => (
            <label key={opt.id} className="tt-break-option">
              <input
                type="checkbox"
                className="tt-checkbox"
                checked={checkedBreaks.has(opt.id)}
                onChange={() => toggleBreak(opt.id)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Net hours readout */}
      <div className={`tt-net-hours${validationHint ? " tt-net-hours--invalid" : ""}`}>
        {validationHint ? (
          <span className="tt-validation-hint">{validationHint}</span>
        ) : netMinutes !== null ? (
          <span className="tt-net-value">
            Net: <strong>{formatDurationHm(netMinutes)}</strong>{" "}
            <span className="tt-net-decimal">({minutesToDecimalHours(netMinutes)} hrs)</span>
          </span>
        ) : (
          <span className="tt-net-placeholder">Net hours will appear here</span>
        )}
      </div>

      {/* Note */}
      <div className="tt-field">
        <label htmlFor="tt-note" className="tt-label">Note <span className="tt-optional">(optional)</span></label>
        <input
          id="tt-note"
          type="text"
          className="tt-input"
          placeholder="Any details about this entry"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {saveError && <p className="tt-save-error">{saveError}</p>}

      <div className="tt-form-actions">
        {editing && onCancelEdit && (
          <button type="button" className="tt-btn tt-btn--secondary" onClick={onCancelEdit}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="tt-btn tt-btn--primary"
          onClick={handleSave}
          disabled={!canSave || saving}
        >
          {saving ? "Saving…" : editing ? "Update Entry" : "Save Entry"}
        </button>
      </div>
    </div>
  );
}
