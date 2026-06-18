import { useEffect } from "react";
import { useCompanyInfo } from "../company/CompanyInfoContext";
import { useAuth } from "./AuthContext";
import { createAccessRequest } from "../storage/db";
import "./auth.css";

export function PendingAccessPage() {
  const { companyInfo } = useCompanyInfo();
  const { state, signOut } = useAuth();
  const adminContact = companyInfo?.adminContact;

  useEffect(() => {
    if (state.status !== "pending-access") return;
    const { id, email, user_metadata } = state.session.user;
    void createAccessRequest({
      id,
      email: email ?? "",
      displayName: (user_metadata?.full_name as string | undefined) ?? null,
      avatarUrl: (user_metadata?.avatar_url as string | undefined) ?? null,
    }).catch((err: unknown) => {
      // Best-effort: the page already shows the "contact admin" fallback
      // regardless of whether the request row was recorded.
      console.error("createAccessRequest failed", err);
    });
  }, [state]);

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
