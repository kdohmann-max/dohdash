import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CompanyInfoProvider, useCompanyInfo } from "./company/CompanyInfoContext";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AuthGate } from "./auth/AuthGate";
import { Shell } from "./components/Shell";
import { LandingPage } from "./components/LandingPage";
import { Launcher } from "./launcher/Launcher";
import { AppStubPage } from "./apps/AppStubPage";
import { AdminDashboard } from "./admin/AdminDashboard";
import "./App.css";

// AuthGate guarantees "authenticated" before this can mount.
function AdminRoute() {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  if (state.profile.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <AdminDashboard />;
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
            <Route path="app/:appId" element={<AppStubPage />} />
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
