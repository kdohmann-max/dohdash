import { Link } from "react-router-dom";
import { resolveAppName, type AppDef } from "../apps/registry";
import { useCompanyInfo } from "../company/CompanyInfoContext";
import "./AppTile.css";

export function AppTile({ app }: { app: AppDef }) {
  const { companyInfo } = useCompanyInfo();
  return (
    <Link to={app.route} className="app-tile">
      <span className="app-tile-icon" aria-hidden="true">
        {app.icon}
      </span>
      <span className="app-tile-name">{resolveAppName(app, companyInfo)}</span>
      <span className="app-tile-description">{app.description}</span>
      {app.status === "stub" && <span className="app-tile-soon">Coming soon</span>}
    </Link>
  );
}
