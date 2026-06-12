import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  listProfiles,
  updateProfileRole,
  listPendingProfiles,
  revokePendingProfile,
  provisionUserByEmail,
  listAccessRequests,
  acceptAccessRequest,
  rejectAccessRequest,
  removeUser,
  listUserActivity,
  logAdminAction,
  type Profile,
  type PendingProfile,
  type AccessRequest,
  type Role,
  type AuditAction,
} from "../storage/db";
import { AppAccessPanel } from "./AppAccessPanel";
import { ActivityPanel } from "./ActivityPanel";
import "./AdminDashboard.css";

type Tab = "users" | "app-access" | "activity";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function AdminDashboard() {
  const { state } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [pending, setPending] = useState<PendingProfile[] | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[] | null>(null);
  const [activity, setActivity] = useState<Map<string, number | null>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = () => setReloadKey((key) => key + 1);
  const currentUserId = state.status === "authenticated" ? state.profile.id : null;

  // Fire-and-forget audit writes for the direct-table-write admin actions;
  // the RPC-backed actions (provision, accept, remove) log inside SQL.
  function audit(action: AuditAction, target: string, detail?: Record<string, unknown>) {
    if (currentUserId) void logAdminAction(currentUserId, action, target, detail).catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([listProfiles(), listPendingProfiles(), listAccessRequests(), listUserActivity()])
      .then(([loadedProfiles, loadedPending, loadedAccessRequests, loadedActivity]) => {
        if (cancelled) return;
        setProfiles(loadedProfiles);
        setPending(loadedPending);
        setAccessRequests(loadedAccessRequests);
        setActivity(loadedActivity);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleRoleToggle(profile: Profile) {
    const nextRole: Role = profile.role === "admin" ? "member" : "admin";
    try {
      await updateProfileRole(profile.id, nextRole);
      audit("change_role", profile.email, { role: nextRole });
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleCancelPending(email: string) {
    try {
      await revokePendingProfile(email);
      audit("cancel_pending", email);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleAcceptRequest(id: string) {
    try {
      await acceptAccessRequest(id);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleRejectRequest(id: string) {
    const request = accessRequests?.find((req) => req.id === id);
    try {
      await rejectAccessRequest(id);
      audit("reject_request", request?.email ?? id);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleRemoveUser(profile: Profile) {
    try {
      await removeUser(profile.id);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="admin-dashboard">
      <h1>Admin</h1>
      <div className="admin-tabs">
        <button
          className={tab === "users" ? "admin-tab admin-tab--active" : "admin-tab"}
          onClick={() => setTab("users")}
        >
          Users
        </button>
        <button
          className={tab === "app-access" ? "admin-tab admin-tab--active" : "admin-tab"}
          onClick={() => setTab("app-access")}
        >
          App Access
        </button>
        <button
          className={tab === "activity" ? "admin-tab admin-tab--active" : "admin-tab"}
          onClick={() => setTab("activity")}
        >
          Activity
        </button>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      {profiles === null || pending === null || accessRequests === null ? (
        <p className="admin-status">Loading…</p>
      ) : tab === "users" ? (
        <UsersTab
          profiles={profiles}
          pending={pending}
          accessRequests={accessRequests}
          activity={activity}
          currentUserId={currentUserId}
          onRoleToggle={(p) => void handleRoleToggle(p)}
          onCancelPending={(email) => void handleCancelPending(email)}
          onAcceptRequest={(id) => void handleAcceptRequest(id)}
          onRejectRequest={(id) => void handleRejectRequest(id)}
          onRemoveUser={(p) => void handleRemoveUser(p)}
          onProvisioned={reload}
        />
      ) : tab === "app-access" ? (
        <AppAccessPanel profiles={profiles} currentUserId={currentUserId} />
      ) : (
        <ActivityPanel profiles={profiles} />
      )}
    </div>
  );
}

function UsersTab({
  profiles,
  pending,
  accessRequests,
  activity,
  currentUserId,
  onRoleToggle,
  onCancelPending,
  onAcceptRequest,
  onRejectRequest,
  onRemoveUser,
  onProvisioned,
}: {
  profiles: Profile[];
  pending: PendingProfile[];
  accessRequests: AccessRequest[];
  activity: Map<string, number | null>;
  currentUserId: string | null;
  onRoleToggle: (profile: Profile) => void;
  onCancelPending: (email: string) => void;
  onAcceptRequest: (id: string) => void;
  onRejectRequest: (id: string) => void;
  onRemoveUser: (profile: Profile) => void;
  onProvisioned: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Profile | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await provisionUserByEmail(trimmed, role);
      setEmail("");
      setRole("member");
      onProvisioned();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-users">
      <section className="admin-section">
        <h2>Grant access</h2>
        <form className="admin-provision-form" onSubmit={(event) => void handleSubmit(event)}>
          <input
            type="email"
            placeholder="person@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" disabled={submitting}>
            {submitting ? "Granting…" : "Grant access"}
          </button>
        </form>
        {formError ? <p className="admin-error">{formError}</p> : null}
        <p className="admin-hint">
          Works whether or not they've signed in yet — access takes effect immediately, or the moment they
          first sign in with Google.
        </p>
      </section>

      {accessRequests.length > 0 ? (
        <section className="admin-section">
          <h2>Access requests</h2>
          <ul className="admin-pending-list">
            {accessRequests.map((req) => (
              <li key={req.id} className="admin-request-row">
                {req.avatarUrl ? (
                  <img className="admin-avatar" src={req.avatarUrl} alt="" />
                ) : (
                  <span className="admin-avatar admin-avatar--placeholder" aria-hidden="true">
                    {(req.displayName ?? req.email).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="admin-request-info">
                  <span>{req.displayName ?? req.email}</span>
                  <span className="admin-hint">
                    {req.email} · requested {new Date(req.requestedAt).toLocaleString()}
                  </span>
                </div>
                <button className="admin-accept-button" onClick={() => onAcceptRequest(req.id)}>
                  Accept
                </button>
                <button className="admin-reject-button" onClick={() => onRejectRequest(req.id)}>
                  Reject
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pending.length > 0 ? (
        <section className="admin-section">
          <h2>Pending invitations</h2>
          <ul className="admin-pending-list">
            {pending.map((entry) => (
              <li key={entry.email} className="admin-pending-row">
                <span>{entry.email}</span>
                <span className={`admin-role-badge admin-role-badge--${entry.role}`}>{entry.role}</span>
                <button className="admin-link-button" onClick={() => onCancelPending(entry.email)}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="admin-section">
        <h2>People</h2>
        {confirmRemove ? (
          <div className="admin-confirm-card">
            <p>
              Remove <strong>{confirmRemove.displayName ?? confirmRemove.email}</strong>? Their account, app
              access, and pending requests are deleted. Documents they created are kept.
            </p>
            <div className="admin-confirm-actions">
              <button
                className="admin-confirm-remove"
                onClick={() => {
                  onRemoveUser(confirmRemove);
                  setConfirmRemove(null);
                }}
              >
                Remove
              </button>
              <button className="admin-link-button" onClick={() => setConfirmRemove(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Last sign-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td>
                  <div className="admin-person">
                    {profile.avatarUrl ? (
                      <img className="admin-avatar" src={profile.avatarUrl} alt="" />
                    ) : (
                      <span className="admin-avatar admin-avatar--placeholder" aria-hidden="true">
                        {(profile.displayName ?? profile.email).slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span>{profile.displayName ?? "—"}</span>
                  </div>
                </td>
                <td>{profile.email}</td>
                <td>
                  <span className={`admin-role-badge admin-role-badge--${profile.role}`}>{profile.role}</span>
                </td>
                <td className="admin-last-signin">
                  {activity.get(profile.id) ? new Date(activity.get(profile.id) as number).toLocaleString() : "—"}
                </td>
                <td>
                  <div className="admin-row-actions">
                    <button
                      className="admin-link-button"
                      onClick={() => onRoleToggle(profile)}
                      disabled={profile.id === currentUserId}
                      title={profile.id === currentUserId ? "You can't change your own role" : undefined}
                    >
                      {profile.role === "admin" ? "Make member" : "Make admin"}
                    </button>
                    <button
                      className="admin-link-button admin-link-button--danger"
                      onClick={() => setConfirmRemove(profile)}
                      disabled={profile.id === currentUserId}
                      title={profile.id === currentUserId ? "You can't remove yourself" : undefined}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
