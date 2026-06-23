import { Suspense, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { CompanyInfoProvider, useCompanyInfo } from "./company/CompanyInfoContext";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AuthGate } from "./auth/AuthGate";
import { Shell } from "./components/Shell";
import { LandingPage } from "./components/LandingPage";
import { Launcher } from "./launcher/Launcher";
import { AppStubPage } from "./apps/AppStubPage";
import { getAppDef, resolveAppName } from "./apps/registry";
import { listAppAccessForUser } from "./storage/db";
import { AdminDashboard } from "./admin/AdminDashboard";
import { OperatorDashboard } from "./operator/OperatorDashboard";
import "./App.css";

// AuthGate guarantees "authenticated" before this can mount.
function AdminRoute() {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  if (state.profile.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <AdminDashboard />;
}

// Platform-operator control plane — gated by the super_admin flag (cross-tenant),
// distinct from the per-tenant admin role above.
function OperatorRoute() {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  if (!state.profile.superAdmin) return <Navigate to="/dashboard" replace />;
  return <OperatorDashboard />;
}

// Coarse "open-this-app" gate (app_access). RLS still protects data, but this
// stops someone who wasn't granted an app from mounting it by typing the URL.
// Stubs are gated the same way as functional apps, for consistency. Admins
// bypass — they can already reach everything via the admin panel.
function RequireAppAccess({ appId, children }: { appId: string; children: ReactNode }) {
  const { state } = useAuth();
  const { companyInfo } = useCompanyInfo();
  const userId = state.status === "authenticated" ? state.profile.id : null;
  const isAdmin = state.status === "authenticated" && state.profile.role === "admin";
  const [allowed, setAllowed] = useState<boolean | null>(isAdmin ? true : null);

  useEffect(() => {
    if (isAdmin || userId === null) return;
    let cancelled = false;
    setAllowed(null);
    listAppAccessForUser(userId)
      .then((grants) => {
        if (!cancelled) setAllowed(grants.some((grant) => grant.appId === appId));
      })
      .catch(() => {
        // On read failure, fail closed — don't mount an app we can't verify.
        if (!cancelled) setAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, userId, isAdmin]);

  if (allowed === null) return <div className="boot-status">Checking access…</div>;
  if (!allowed) {
    const def = getAppDef(appId);
    const name = def ? resolveAppName(def, companyInfo) : "that app";
    return <Navigate to="/dashboard" replace state={{ deniedApp: name }} />;
  }
  return <>{children}</>;
}

// The registry is the single source of truth: each app entry carries its own
// root component. Unknown ids (or stubs) fall back to the generic stub page.
function AppRoute() {
  const { appId } = useParams<{ appId: string }>();
  const def = appId ? getAppDef(appId) : undefined;
  const Component = def?.component ?? AppStubPage;
  if (!appId) return <Navigate to="/dashboard" replace />;
  return (
    <RequireAppAccess appId={appId}>
      <Suspense fallback={<div className="boot-status">Loading…</div>}>
        <Component />
      </Suspense>
    </RequireAppAccess>
  );
}

function AppInner() {
  const { companyInfo, loading, error } = useCompanyInfo();

  if (loading) return <div className="boot-status">Loading…</div>;
  if (error || !companyInfo) {
    return <div className="boot-status boot-status--err">Failed to load CompanyInfo.md{error ? `: ${error}` : ""}</div>;
  }

  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<AuthGate />}>
          <Route element={<Shell />}>
            <Route index element={<Launcher />} />
            <Route path="admin" element={<AdminRoute />} />
            <Route path="operator" element={<OperatorRoute />} />
            <Route path="app/:appId" element={<AppRoute />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <CompanyInfoProvider>
        <AppInner />
      </CompanyInfoProvider>
    </BrowserRouter>
  );
}
