import { Link } from "react-router-dom";
import React, { useRef, useState } from "react";
import { resolveAppName, type AppDef } from "../apps/registry";
import { useCompanyInfo } from "../company/CompanyInfoContext";
import "./AppTile.css";

// How long the "Coming soon…" badge stays up after a stub tile is tapped,
// before fading back out (the CSS handles the fade via the data-flash flag).
const FLASH_MS = 1400;

export function AppTile({ app }: { app: AppDef }) {
  const { companyInfo } = useCompanyInfo();
  const isStub = app.status === "stub";
  const [flash, setFlash] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Touch devices have no hover, so a tap on a stub tile would otherwise just
  // navigate to an empty stub with no feedback. Instead, flash the same
  // "Coming soon…" state desktop shows on hover, then let it fade out.
  function handleStubTap(e: React.MouseEvent) {
    e.preventDefault();
    clearTimeout(timer.current);
    setFlash(true);
    timer.current = setTimeout(() => setFlash(false), FLASH_MS);
  }

  return (
    <Link
      to={app.route}
      className="app-tile"
      data-stub={isStub ? "true" : undefined}
      data-flash={flash ? "true" : undefined}
      onClick={isStub ? handleStubTap : undefined}
    >
      <span className="app-tile-icon" aria-hidden="true">
        {React.cloneElement(app.icon, { size: 64 })}
      </span>
      <div className="app-tile-content">
        <span className="app-tile-name">{resolveAppName(app, companyInfo)}</span>
        <span className="app-tile-description">{app.description}</span>
      </div>
      {isStub && <span className="app-tile-soon">Coming soon…</span>}
    </Link>
  );
}
