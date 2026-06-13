import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { CompanyInfoProvider, useCompanyInfo } from "./company/CompanyInfoContext";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AuthGate } from "./auth/AuthGate";
import { Shell } from "./components/Shell";
import { LandingPage } from "./components/LandingPage";
import { Launcher } from "./launcher/Launcher";
import { AppStubPage } from "./apps/AppStubPage";
import { TasksApp } from "./apps/tasks/TasksApp";
import { ChickenScratchApp } from "./apps/chicken-scratch/ChickenScratchApp";
import { FractionCalculatorApp } from "./apps/fraction-calculator/FractionCalculatorApp";
import { AdminDashboard } from "./admin/AdminDashboard";
import "./App.css";

// AuthGate guarantees "authenticated" before this can mount.
function AdminRoute() {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  if (state.profile.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <AdminDashboard />;
}

// Tasks ("DohDocs") manages its own internal note-routing; every other
// app id still renders the generic stub.
function AppRoute() {
  const { appId } = useParams<{ appId: string }>();
  if (appId === "tasks") return <TasksApp />;
  if (appId === "chicken-scratch") return <ChickenScratchApp />;
  if (appId === "fraction-calculator") return <FractionCalculatorApp />;
  return <AppStubPage />;
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
