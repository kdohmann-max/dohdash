import { useEffect, useState } from "react";
import { listAuditLog, type AuditEntry, type AuditAction, type Profile } from "../storage/db";
import "./ActivityPanel.css";

const ACTION_LABELS: Record<AuditAction, string> = {
  provision_user: "Granted access",
  accept_request: "Accepted request",
  reject_request: "Rejected request",
  cancel_pending: "Cancelled invitation",
  remove_user: "Removed user",
  grant_app_access: "Granted app",
  revoke_app_access: "Revoked app",
  change_role: "Changed role",
};

function detailText(entry: AuditEntry): string {
  if (!entry.detail) return "";
  return Object.values(entry.detail)
    .map((value) => String(value))
    .join(", ");
}

export function ActivityPanel({ profiles }: { profiles: Profile[] }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAuditLog()
      .then((loaded) => {
        if (!cancelled) setEntries(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function actorName(actorId: string | null): string {
    if (!actorId) return "removed user";
    const profile = profiles.find((p) => p.id === actorId);
    return profile ? (profile.displayName ?? profile.email) : "removed user";
  }

  if (error) return <p className="admin-error">{error}</p>;
  if (entries === null) return <p className="admin-status">Loading…</p>;
  if (entries.length === 0) {
    return <p className="admin-status">No admin activity recorded yet.</p>;
  }

  return (
    <section className="admin-section activity-panel">
      <h2>Recent admin activity</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Target</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="activity-when">{new Date(entry.createdAt).toLocaleString()}</td>
              <td>{actorName(entry.actorId)}</td>
              <td>
                <span className="activity-action">{ACTION_LABELS[entry.action] ?? entry.action}</span>
              </td>
              <td>{entry.target}</td>
              <td className="activity-detail">{detailText(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
