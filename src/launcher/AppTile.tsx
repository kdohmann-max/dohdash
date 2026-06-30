import { Link } from "react-router-dom";
import React from "react";
import { resolveAppName, type AppDef } from "../apps/registry";
import { useCompanyInfo } from "../company/CompanyInfoContext";
import "./AppTile.css";

export function AppTile({ app }: { app: AppDef }) {
  const { companyInfo } = useCompanyInfo();
  return (
    <Link to={app.route} className="app-tile" data-stub={app.status === "stub" ? "true" : undefined}>
      <span className="app-tile-icon" aria-hidden="true">
        {React.cloneElement(app.icon, { size: 64 })}
      </span>
      <div className="app-tile-content">
        <span className="app-tile-name">{resolveAppName(app, companyInfo)}</span>
        <span className="app-tile-description">{app.description}</span>
      </div>
      {app.status === "stub" && <span className="app-tile-soon">Coming soon…</span>}
    </Link>
  );
}
