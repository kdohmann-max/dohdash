import { Link } from "react-router-dom";
import { useCompanyInfo } from "../company/CompanyInfoContext";
import { useAuth } from "../auth/AuthContext";
import "./LandingPage.css";

export function LandingPage() {
  const { companyInfo } = useCompanyInfo();
  const { state } = useAuth();

  const ctaLabel = state.status === "authenticated" ? "Go to dashboard" : "Sign in";

  return (
    <div className="landing">
      <div className="landing-hero">
        <h1>{companyInfo?.dashboardName}</h1>
        <Link to="/dashboard" className="landing-cta">
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
