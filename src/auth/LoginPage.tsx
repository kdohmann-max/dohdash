import { useCompanyInfo } from "../company/CompanyInfoContext";
import { useAuth } from "./AuthContext";
import "./auth.css";

export function LoginPage() {
  const { companyInfo } = useCompanyInfo();
  const { signInWithGoogle } = useAuth();

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>{companyInfo?.dashboardName ?? "Sign in"}</h1>
        {companyInfo ? <p className="muted">{companyInfo.companyName}</p> : null}
        <div className="auth-actions">
          <button className="auth-button" onClick={() => void signInWithGoogle()}>
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}
