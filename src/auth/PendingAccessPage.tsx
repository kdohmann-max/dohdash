import { useCompanyInfo } from "../company/CompanyInfoContext";
import { useAuth } from "./AuthContext";
import "./auth.css";

export function PendingAccessPage() {
  const { companyInfo } = useCompanyInfo();
  const { signOut } = useAuth();
  const adminContact = companyInfo?.adminContact;

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Access pending</h1>
        <p className="muted">
          Your account isn't set up for {companyInfo?.dashboardName ?? "this dashboard"} yet.
          {adminContact ? (
            <>
              {" "}
              Contact <a href={`mailto:${adminContact.email}`}>{adminContact.email}</a>
              {adminContact.phone ? ` (${adminContact.phone})` : ""} to request access.
            </>
          ) : null}
        </p>
        <div className="auth-actions">
          <button className="auth-button auth-button--ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
