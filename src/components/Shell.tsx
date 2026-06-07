import { NavLink, Outlet } from "react-router-dom";
import { useCompanyInfo } from "../company/CompanyInfoContext";
import { useAuth } from "../auth/AuthContext";
import "./Shell.css";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? "shell-link shell-link--active" : "shell-link";
}

export function Shell() {
  const { companyInfo } = useCompanyInfo();
  const { state, signOut } = useAuth();

  // AuthGate only mounts <Outlet/> (and therefore Shell) in the
  // "authenticated" state, so this is always true — the check just keeps
  // `profile` narrowed for TypeScript without an `as` cast.
  if (state.status !== "authenticated") return null;
  const { profile } = state;

  return (
    <div className="shell">
      <header className="shell-topbar">
        <div className="shell-brand">
          {companyInfo?.logo ? <img src={companyInfo.logo} alt="" className="shell-logo" /> : null}
          <span className="shell-dashboard-name">{companyInfo?.dashboardName}</span>
        </div>
        <nav className="shell-nav">
          <NavLink to="/dashboard" end className={navLinkClass}>
            Launcher
          </NavLink>
          {profile.role === "admin" ? (
            <NavLink to="/dashboard/admin" className={navLinkClass}>
              Admin
            </NavLink>
          ) : null}
        </nav>
        <div className="shell-user">
          <span className="shell-user-name">{profile.displayName ?? profile.email}</span>
          <button className="shell-signout" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="shell-content">
        <Outlet />
      </main>
    </div>
  );
}
