import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LoginPage } from "./LoginPage";
import { PendingAccessPage } from "./PendingAccessPage";
import { REDIRECT_STORAGE_KEY } from "./useAuthState";
import "./auth.css";

export function AuthGate() {
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const restoredRef = useRef(false);

  // Once authenticated, restore whatever path was stashed before the OAuth
  // round-trip (see signInWithGoogle in useAuthState) — runs at most once
  // per mount, guarded by the ref so later in-app navigations don't re-fire.
  useEffect(() => {
    if (state.status !== "authenticated" || restoredRef.current) return;
    restoredRef.current = true;

    const redirect = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
    if (!redirect) return;
    sessionStorage.removeItem(REDIRECT_STORAGE_KEY);

    if (redirect !== location.pathname + location.search) {
      navigate(redirect, { replace: true });
    }
  }, [state.status, navigate, location]);

  switch (state.status) {
    case "loading":
      return <div className="boot-status">Loading…</div>;
    case "signed-out":
      return <LoginPage />;
    case "wrong-tenant":
      return (
        <div className="auth-screen">
          <div className="auth-card">
            <h1>Wrong workspace</h1>
            <p className="muted">
              You're signed in as <strong>{state.session.user.email}</strong>, but that account isn't a
              member of this workspace. Each DohDash account belongs to one company — sign out and sign
              back in with an account for this workspace.
            </p>
            <div className="auth-actions">
              <button className="auth-button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    case "pending-access":
      return <PendingAccessPage />;
    case "authenticated":
      return <Outlet />;
    case "error":
      return (
        <div className="auth-screen">
          <div className="auth-card">
            <h1>Something went wrong</h1>
            <p className="muted">{state.message}</p>
            <div className="auth-actions">
              <button className="auth-button" onClick={() => window.location.reload()}>
                Retry
              </button>
              <button className="auth-button auth-button--ghost" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
  }
}
