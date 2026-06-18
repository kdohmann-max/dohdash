import { Link, Navigate, useParams } from "react-router-dom";
import { getAppDef, resolveAppName } from "./registry";
import { useCompanyInfo } from "../company/CompanyInfoContext";
import "./AppStubPage.css";

export function AppStubPage() {
  const { appId } = useParams<{ appId: string }>();
  const { companyInfo } = useCompanyInfo();
  const app = appId ? getAppDef(appId) : undefined;

  if (!app) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="app-stub">
      <span className="app-stub-icon" aria-hidden="true">
        {app.icon}
      </span>
      <h1>{resolveAppName(app, companyInfo)}</h1>
      <p className="app-stub-description">{app.description}</p>
      <span className="app-stub-badge">Coming soon</span>
      <Link to="/dashboard" className="app-stub-back">
        ← Back to launcher
      </Link>
    </div>
  );
}
