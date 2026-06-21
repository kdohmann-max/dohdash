import { useState } from "react";
import type { TimeEntry } from "../../../storage/db";
import {
  minutesToDecimalHours,
  formatMinutesAsTime,
} from "../../time-tracker/time-utils";

interface EmployeeSectionProps {
  employeeName: string;
  rate: number | null;
  entries: TimeEntry[];
  onSetRate: (rate: number | null) => void;
  onTogglePaid: (ids: string[], paid: boolean) => void;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function EmployeeSection({
  employeeName,
  rate,
  entries,
  onSetRate,
  onTogglePaid,
}: EmployeeSectionProps) {
  const [rateInput, setRateInput] = useState<string>(
    rate !== null ? String(rate) : ""
  );
  const [rateSaving, setRateSaving] = useState(false);

  const totalNetHours = entries.reduce(
    (sum, e) => sum + minutesToDecimalHours(e.netMinutes),
    0
  );
  const totalPay = rate !== null ? round2(totalNetHours * rate) : null;

  const unpaidEntries = entries.filter((e) => !e.paid);

  async function handleSaveRate() {
    const parsed = rateInput.trim() === "" ? null : parseFloat(rateInput);
    if (rateInput.trim() !== "" && (isNaN(parsed as number) || (parsed as number) < 0)) return;
    setRateSaving(true);
    try {
      await onSetRate(parsed);
    } finally {
      setRateSaving(false);
    }
  }

  return (
    <div className="td-employee-card">
      <div className="td-employee-header">
        <div className="td-employee-name">{employeeName}</div>

        <div className="td-employee-totals">
          <span className="td-totals-hours">
            {round2(totalNetHours)} hrs total
          </span>
          {totalPay !== null && (
            <span className="td-totals-pay">${totalPay.toFixed(2)}</span>
          )}
        </div>

        <div className="td-rate-editor">
          <label className="td-rate-label" htmlFor={`rate-${employeeName}`}>
            Rate ($/hr)
          </label>
          <div className="td-rate-input-row">
            <span className="td-rate-prefix">$</span>
            <input
              id={`rate-${employeeName}`}
              type="number"
              min="0"
              step="0.01"
              className="td-input td-rate-input"
              placeholder="—"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
            />
            <button
              type="button"
              className="td-btn td-btn--secondary"
              onClick={handleSaveRate}
              disabled={rateSaving}
            >
              {rateSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {unpaidEntries.length > 0 && (
        <div className="td-bulk-action">
          <button
            type="button"
            className="td-btn td-btn--secondary td-btn--sm"
            onClick={() =>
              onTogglePaid(
                unpaidEntries.map((e) => e.id),
                true
              )
            }
          >
            Mark all unpaid as paid ({unpaidEntries.length})
          </button>
        </div>
      )}

      <div className="td-entry-table">
        <div className="td-entry-table-head">
          <span>Date</span>
          <span>Job</span>
          <span>Time</span>
          <span>Break</span>
          <span>Net hrs</span>
          <span>Pay</span>
          <span>Paid</span>
        </div>

        {entries.map((entry) => {
          const netHours = minutesToDecimalHours(entry.netMinutes);
          const breakHours = minutesToDecimalHours(entry.breakMinutes);
          const entryPay =
            rate !== null ? round2(netHours * rate) : null;

          const timeDisplay =
            entry.entryMode === "range" &&
            entry.startMinutes !== null &&
            entry.endMinutes !== null
              ? `${formatMinutesAsTime(entry.startMinutes)}–${formatMinutesAsTime(entry.endMinutes)}`
              : "Hours entry";

          return (
            <div
              key={entry.id}
              className={`td-entry-row${entry.paid ? " td-entry-row--paid" : ""}`}
            >
              <span className="td-cell td-cell--date">{entry.workDate}</span>
              <span className="td-cell td-cell--job">{entry.jobLabel || "—"}</span>
              <span className="td-cell td-cell--time">{timeDisplay}</span>
              <span className="td-cell td-cell--break">
                {breakHours > 0 ? `${breakHours}h` : "—"}
              </span>
              <span className="td-cell td-cell--net">{netHours}h</span>
              <span className="td-cell td-cell--pay">
                {entryPay !== null ? `$${entryPay.toFixed(2)}` : "—"}
              </span>
              <span className="td-cell td-cell--paid">
                <input
                  type="checkbox"
                  className="td-paid-checkbox"
                  checked={entry.paid}
                  onChange={(e) =>
                    onTogglePaid([entry.id], e.target.checked)
                  }
                  aria-label={entry.paid ? "Mark unpaid" : "Mark paid"}
                />
              </span>
            </div>
          );
        })}
      </div>

      {entries.length === 0 && (
        <div className="td-empty-section">No entries for this period.</div>
      )}
    </div>
  );
}
