import { Link, NavLink, Outlet, useMatch } from "react-router-dom";
import { useCompanyInfo } from "../company/CompanyInfoContext";
import { useAuth } from "../auth/AuthContext";
import { getAppDef, resolveAppName } from "../apps/registry";
import { ThemeToggle } from "./ThemeToggle";
import "./Shell.css";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? "shell-link shell-link--active" : "shell-link";
}

export function Shell() {
  const { companyInfo } = useCompanyInfo();
  const { state, signOut } = useAuth();
  const appMatch = useMatch("/dashboard/app/:appId");
  const adminMatch = useMatch("/dashboard/admin");
  const operatorMatch = useMatch("/dashboard/operator");
  const operatorAssistantMatch = useMatch("/dashboard/operator/assistant");

  const isLauncher = !appMatch && !adminMatch && !operatorMatch && !operatorAssistantMatch;

  let appName: string | null = null;
  if (appMatch?.params.appId) {
    const appDef = getAppDef(appMatch.params.appId);
    appName = appDef ? resolveAppName(appDef, companyInfo ?? null) : appMatch.params.appId;
  } else if (adminMatch) {
    appName = "Admin";
  } else if (operatorAssistantMatch) {
    appName = "Assistant";
  } else if (operatorMatch) {
    appName = "Operator";
  }

  // AuthGate only mounts <Outlet/> (and therefore Shell) in the
  // "authenticated" state, so this is always true — the check just keeps
  // `profile` narrowed for TypeScript without an `as` cast.
  if (state.status !== "authenticated") return null;
  const { profile } = state;

  return (
    <div className="shell">
      <header className="shell-header">
        {isLauncher ? (
          <>
            <div className="shell-brand">
              {companyInfo?.logo && <img src={companyInfo.logo} alt="Logo" className="shell-logo" />}
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
              {profile.superAdmin ? (
                <NavLink to="/dashboard/operator" className={navLinkClass}>
                  Operator
                </NavLink>
              ) : null}
              {profile.superAdmin ? (
                <NavLink to="/dashboard/operator/assistant" className={navLinkClass}>
                  Assistant
                </NavLink>
              ) : null}
            </nav>
            <div className="shell-user">
              <ThemeToggle />
              <span className="shell-user-name">{profile.displayName ?? profile.email}</span>
              <button className="shell-signout" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <Link to="/dashboard" className="shell-crumb-home" title="Back to launcher">
              {companyInfo?.logo && (
                <img src={companyInfo.logo} alt="Logo" className="shell-logo shell-logo--sm" />
              )}
              <span className="shell-crumb-brand">{companyInfo?.dashboardName}</span>
            </Link>
            <span className="shell-crumb-sep" aria-hidden="true">/</span>
            <span className="shell-crumb-app">{appName}</span>
            <div className="shell-crumb-actions">
              <ThemeToggle />
              <button className="shell-signout" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </>
        )}
      </header>
      <main className="shell-content">
        <Outlet />
      </main>
    </div>
  );
}
