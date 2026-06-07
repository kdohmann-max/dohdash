import { Link } from "react-router-dom";
import type { AppDef } from "../apps/registry";
import "./AppTile.css";

export function AppTile({ app }: { app: AppDef }) {
  return (
    <Link to={app.route} className="app-tile">
      <span className="app-tile-icon" aria-hidden="true">
        {app.icon}
      </span>
      <span className="app-tile-name">{app.name}</span>
      <span className="app-tile-description">{app.description}</span>
    </Link>
  );
}
