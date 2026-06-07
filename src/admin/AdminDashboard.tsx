import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  listProfiles,
  updateProfileRole,
  listPendingProfiles,
  revokePendingProfile,
  provisionUserByEmail,
  type Profile,
  type PendingProfile,
  type Role,
} from "../storage/db";
import { AppAccessPanel } from "./AppAccessPanel";
import "./AdminDashboard.css";

type Tab = "users" | "app-access";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function AdminDashboard() {
  const { state } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [pending, setPending] = useState<PendingProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = () => setReloadKey((key) => key + 1);
  const currentUserId = state.status === "authenticated" ? state.profile.id : null;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([listProfiles(), listPendingProfiles()])
      .then(([loadedProfiles, loadedPending]) => {
        if (cancelled) return;
        setProfiles(loadedProfiles);
        setPending(loadedPending);
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
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleCancelPending(email: string) {
    try {
      await revokePendingProfile(email);
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
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      {profiles === null || pending === null ? (
        <p className="admin-status">Loading…</p>
      ) : tab === "users" ? (
        <UsersTab
          profiles={profiles}
          pending={pending}
          currentUserId={currentUserId}
          onRoleToggle={(p) => void handleRoleToggle(p)}
          onCancelPending={(email) => void handleCancelPending(email)}
          onProvisioned={reload}
        />
      ) : (
        <AppAccessPanel profiles={profiles} currentUserId={currentUserId} />
      )}
    </div>
  );
}

function UsersTab({
  profiles,
  pending,
  currentUserId,
  onRoleToggle,
  onCancelPending,
  onProvisioned,
}: {
  profiles: Profile[];
  pending: PendingProfile[];
  currentUserId: string | null;
  onRoleToggle: (profile: Profile) => void;
  onCancelPending: (email: string) => void;
  onProvisioned: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
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
                <td>
                  <button
                    className="admin-link-button"
                    onClick={() => onRoleToggle(profile)}
                    disabled={profile.id === currentUserId}
                    title={profile.id === currentUserId ? "You can't change your own role" : undefined}
                  >
                    {profile.role === "admin" ? "Make member" : "Make admin"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
