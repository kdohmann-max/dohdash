import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { listAppAccessForUser } from "../storage/db";
import { APP_REGISTRY } from "../apps/registry";
import { AppTile } from "./AppTile";
import "./Launcher.css";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function Launcher() {
  const { state } = useAuth();
  const location = useLocation();
  const deniedApp = (location.state as { deniedApp?: string } | null)?.deniedApp ?? null;
  const [grantedIds, setGrantedIds] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // AuthGate guarantees "authenticated" before Launcher can mount.
  const userId = state.status === "authenticated" ? state.profile.id : null;

  useEffect(() => {
    if (userId === null) return;

    let cancelled = false;
    listAppAccessForUser(userId)
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
  }, [userId]);

  const notice = deniedApp ? (
    <p className="launcher-status launcher-status--err">
      You don't have access to {deniedApp}. Ask your admin to grant it.
    </p>
  ) : null;

  if (error) {
    return (
      <>
        {notice}
        <p className="launcher-status launcher-status--err">Couldn't load your apps: {error}</p>
      </>
    );
  }
  if (grantedIds === null) {
    return (
      <>
        {notice}
        <p className="launcher-status">Loading your apps…</p>
      </>
    );
  }

  const apps = APP_REGISTRY.filter((app) => grantedIds.has(app.id));

  if (apps.length === 0) {
    return (
      <>
        {notice}
        <p className="launcher-status">No apps available yet. Contact your admin to request access.</p>
      </>
    );
  }

  return (
    <>
      {notice}
      <div className="launcher-grid">
        {apps.map((app) => (
          <AppTile key={app.id} app={app} />
        ))}
      </div>
    </>
  );
}
