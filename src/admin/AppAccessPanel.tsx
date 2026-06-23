import { useEffect, useState } from "react";
import { APP_REGISTRY, isTenantAppEnabled, resolveAppName } from "../apps/registry";
import { useCompanyInfo } from "../company/CompanyInfoContext";
import { listAppAccessForUser, grantAppAccess, revokeAppAccess, logAdminAction, type Profile } from "../storage/db";
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
  const { companyInfo } = useCompanyInfo();
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
      const targetEmail = profiles.find((p) => p.id === selectedUserId)?.email ?? selectedUserId;
      if (granted) {
        await revokeAppAccess(selectedUserId, appId);
        void logAdminAction(currentUserId, "revoke_app_access", targetEmail, { app_id: appId }).catch(() => {});
      } else {
        await grantAppAccess(selectedUserId, appId, currentUserId);
        void logAdminAction(currentUserId, "grant_app_access", targetEmail, { app_id: appId }).catch(() => {});
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
        <>
          <ul className="app-access-list">
            {APP_REGISTRY.filter((app) => isTenantAppEnabled(app.id, companyInfo?.enabledApps)).map((app) => {
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
                    <span>{resolveAppName(app, companyInfo)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {APP_REGISTRY.some((app) => !isTenantAppEnabled(app.id, companyInfo?.enabledApps)) ? (
            <p className="admin-status">
              Some apps are not shown — they aren't enabled for this organization.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
