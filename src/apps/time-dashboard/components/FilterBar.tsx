import type { TimeEntryFilters, TimeJob } from "../../../storage/db";
import type { Profile } from "../../../storage/db";

interface FilterBarProps {
  jobs: TimeJob[];
  employees: Profile[];
  value: TimeEntryFilters;
  onChange: (f: TimeEntryFilters) => void;
}

export function FilterBar({ jobs, employees, value, onChange }: FilterBarProps) {
  function set(patch: Partial<TimeEntryFilters>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="td-filter-bar">
      <div className="td-filter-group">
        <label className="td-filter-label" htmlFor="td-filter-from">From</label>
        <input
          id="td-filter-from"
          type="date"
          className="td-input"
          value={value.from ?? ""}
          onChange={(e) => set({ from: e.target.value || undefined })}
        />
      </div>

      <div className="td-filter-group">
        <label className="td-filter-label" htmlFor="td-filter-to">To</label>
        <input
          id="td-filter-to"
          type="date"
          className="td-input"
          value={value.to ?? ""}
          onChange={(e) => set({ to: e.target.value || undefined })}
        />
      </div>

      <div className="td-filter-group">
        <label className="td-filter-label" htmlFor="td-filter-employee">Employee</label>
        <select
          id="td-filter-employee"
          className="td-input td-select"
          value={value.userId ?? ""}
          onChange={(e) => set({ userId: e.target.value || undefined })}
        >
          <option value="">All employees</option>
          {employees.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName ?? p.email}
            </option>
          ))}
        </select>
      </div>

      <div className="td-filter-group">
        <label className="td-filter-label" htmlFor="td-filter-job">Job</label>
        <select
          id="td-filter-job"
          className="td-input td-select"
          value={value.jobId ?? ""}
          onChange={(e) => set({ jobId: e.target.value || undefined })}
        >
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
              {j.archived ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="td-filter-group">
        <label className="td-filter-label" htmlFor="td-filter-paid">Paid status</label>
        <select
          id="td-filter-paid"
          className="td-input td-select"
          value={value.paid === true ? "paid" : value.paid === false ? "unpaid" : ""}
          onChange={(e) => {
            const v = e.target.value;
            set({ paid: v === "paid" ? true : v === "unpaid" ? false : undefined });
          }}
        >
          <option value="">All</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
        </select>
      </div>
    </div>
  );
}
