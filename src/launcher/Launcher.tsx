import { useEffect, useState } from "react";
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

  if (error) {
    return <p className="launcher-status launcher-status--err">Couldn't load your apps: {error}</p>;
  }
  if (grantedIds === null) {
    return <p className="launcher-status">Loading your apps…</p>;
  }

  const apps = APP_REGISTRY.filter((app) => grantedIds.has(app.id));

  if (apps.length === 0) {
    return <p className="launcher-status">No apps available yet. Contact your admin to request access.</p>;
  }

  return (
    <div className="launcher-grid">
      {apps.map((app) => (
        <AppTile key={app.id} app={app} />
      ))}
    </div>
  );
}
