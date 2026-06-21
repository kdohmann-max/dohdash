import { useState } from "react";
import type { TimeJob } from "../../../storage/db";
import { createTimeJob, renameTimeJob, archiveTimeJob } from "../../../storage/db";

interface JobManagerProps {
  jobs: TimeJob[];
  onChanged: () => void;
}

export function JobManager({ jobs, onChanged }: JobManagerProps) {
  const [expanded, setExpanded] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setAddError(null);
    try {
      await createTimeJob(name);
      setNewName("");
      onChanged();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add job.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRename(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    setSavingId(id);
    try {
      await renameTimeJob(id, name);
      setRenamingId(null);
      setRenameValue("");
      onChanged();
    } finally {
      setSavingId(null);
    }
  }

  async function handleArchive(id: string, archive: boolean) {
    setSavingId(id);
    try {
      await archiveTimeJob(id, archive);
      setArchiveConfirmId(null);
      onChanged();
    } finally {
      setSavingId(null);
    }
  }

  const activeJobs = jobs.filter((j) => !j.archived);
  const archivedJobs = jobs.filter((j) => j.archived);

  return (
    <div className="td-job-manager">
      <button
        type="button"
        className="td-job-manager-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="td-job-manager-toggle-label">Manage Jobs</span>
        <span className="td-job-manager-toggle-icon">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="td-job-manager-body">
          {/* Add new job */}
          <div className="td-job-add-row">
            <input
              type="text"
              className="td-input td-job-add-input"
              placeholder="New job name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              maxLength={80}
            />
            <button
              type="button"
              className="td-btn td-btn--primary td-btn--sm"
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {addError && <p className="td-job-error">{addError}</p>}

          {/* Job list */}
          {activeJobs.length === 0 && archivedJobs.length === 0 && (
            <p className="td-job-empty">
              No jobs yet — add the jobs your crew works on so they show up in
              the Time Tracker dropdown.
            </p>
          )}

          {activeJobs.length > 0 && (
            <ul className="td-job-list">
              {activeJobs.map((job) => (
                <li key={job.id} className="td-job-item">
                  {renamingId === job.id ? (
                    <div className="td-job-rename-row">
                      <input
                        type="text"
                        className="td-input td-job-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(job.id);
                          if (e.key === "Escape") {
                            setRenamingId(null);
                            setRenameValue("");
                          }
                        }}
                        autoFocus
                        maxLength={80}
                      />
                      <button
                        type="button"
                        className="td-btn td-btn--secondary td-btn--sm"
                        onClick={() => handleRename(job.id)}
                        disabled={savingId === job.id || !renameValue.trim()}
                      >
                        {savingId === job.id ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="td-btn td-btn--ghost td-btn--sm"
                        onClick={() => {
                          setRenamingId(null);
                          setRenameValue("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : archiveConfirmId === job.id ? (
                    <div className="td-job-confirm-row">
                      <span className="td-job-confirm-text">
                        Archive "{job.name}"? It won't appear in new entries.
                      </span>
                      <button
                        type="button"
                        className="td-btn td-btn--destructive td-btn--sm"
                        onClick={() => handleArchive(job.id, true)}
                        disabled={savingId === job.id}
                      >
                        {savingId === job.id ? "Archiving…" : "Archive"}
                      </button>
                      <button
                        type="button"
                        className="td-btn td-btn--ghost td-btn--sm"
                        onClick={() => setArchiveConfirmId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="td-job-row">
                      <span className="td-job-name">{job.name}</span>
                      <div className="td-job-actions">
                        <button
                          type="button"
                          className="td-btn td-btn--ghost td-btn--sm"
                          onClick={() => {
                            setRenamingId(job.id);
                            setRenameValue(job.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="td-btn td-btn--ghost td-btn--sm td-btn--danger"
                          onClick={() => setArchiveConfirmId(job.id)}
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {archivedJobs.length > 0 && (
            <div className="td-job-archived">
              <p className="td-job-archived-label">Archived jobs</p>
              <ul className="td-job-list td-job-list--archived">
                {archivedJobs.map((job) => (
                  <li key={job.id} className="td-job-item td-job-item--archived">
                    <div className="td-job-row">
                      <span className="td-job-name">{job.name}</span>
                      <button
                        type="button"
                        className="td-btn td-btn--ghost td-btn--sm"
                        onClick={() => handleArchive(job.id, false)}
                        disabled={savingId === job.id}
                      >
                        Restore
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
