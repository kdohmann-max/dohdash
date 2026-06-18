import { NavLink, Outlet } from "react-router-dom";
import { useCompanyInfo } from "../company/CompanyInfoContext";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme";
import { SunIcon, MoonIcon } from "../icons";
import "./Shell.css";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? "shell-link shell-link--active" : "shell-link";
}

export function Shell() {
  const { companyInfo } = useCompanyInfo();
  const { state, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  // AuthGate only mounts <Outlet/> (and therefore Shell) in the
  // "authenticated" state, so this is always true — the check just keeps
  // `profile` narrowed for TypeScript without an `as` cast.
  if (state.status !== "authenticated") return null;
  const { profile } = state;

  return (
    <div className="shell">
      <header className="shell-topbar">
        <div className="shell-brand">
          <span>{companyInfo?.dashboardName}</span>
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
          <button
            className="shell-theme"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title="Toggle light / dark"
          >
            {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>
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
