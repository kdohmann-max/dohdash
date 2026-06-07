import { useEffect, useState } from "react";
import { APP_REGISTRY } from "../apps/registry";
import { listAppAccessForUser, grantAppAccess, revokeAppAccess, type Profile } from "../storage/db";
import "./AppAccessPanel.css";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function AppAccessPanel({
  profiles,
  currentUserId,
}: {
  profiles: Profile[];
  currentUserId: string | null;
}) {
  const [selectedUserId, setSelectedUserId] = useState(profiles[0]?.id ?? "");
  const [grantedIds, setGrantedIds] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAppId, setPendingAppId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedUserId) {
      setGrantedIds(null);
      return;
    }

    let cancelled = false;
    setGrantedIds(null);
    listAppAccessForUser(selectedUserId)
      .then((grants) => {
        if (cancelled) return;
        setGrantedIds(new Set(grants.map((grant) => grant.appId)));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedUserId]);

  async function handleToggle(appId: string, granted: boolean) {
    if (!selectedUserId || !currentUserId || grantedIds === null) return;

    setPendingAppId(appId);
    setError(null);
    try {
      if (granted) {
        await revokeAppAccess(selectedUserId, appId);
      } else {
        await grantAppAccess(selectedUserId, appId, currentUserId);
      }
      setGrantedIds((prev) => {
        if (!prev) return prev;
        const next = new Set(prev);
        if (granted) next.delete(appId);
        else next.add(appId);
        return next;
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPendingAppId(null);
    }
  }

  if (profiles.length === 0) {
    return <p className="admin-status">No people yet — grant someone access on the Users tab first.</p>;
  }

  return (
    <div className="app-access-panel">
      <label className="app-access-picker">
        <span>Person</span>
        <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.displayName ?? profile.email}
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="admin-error">{error}</p> : null}

      {grantedIds === null ? (
        <p className="admin-status">Loading…</p>
      ) : (
        <ul className="app-access-list">
          {APP_REGISTRY.map((app) => {
            const granted = grantedIds.has(app.id);
            return (
              <li key={app.id} className="app-access-row">
                <label>
                  <input
                    type="checkbox"
                    checked={granted}
                    disabled={pendingAppId === app.id}
                    onChange={() => void handleToggle(app.id, granted)}
                  />
                  <span className="app-access-icon" aria-hidden="true">
                    {app.icon}
                  </span>
                  <span>{app.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
