import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useCompanyInfo } from "../company/CompanyInfoContext";
import { useAuth } from "./AuthContext";
import { createAccessRequest } from "../storage/db";
import { ThemeToggle } from "../components/ThemeToggle";
import "./auth.css";

export function buildPendingAccessRequestInput(session: Session) {
  const userMeta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const nameCandidates = [userMeta.full_name, userMeta.name, session.user.email].map((value) => {
    if (typeof value !== "string") return "";
    return value.trim();
  });

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    displayName: nameCandidates.find(Boolean) ?? null,
    avatarUrl: typeof userMeta.avatar_url === "string" ? userMeta.avatar_url : null,
  };
}

export function PendingAccessPage() {
  const { companyInfo } = useCompanyInfo();
  const { state, signOut } = useAuth();
  const adminContact = companyInfo?.adminContact;
  const [requestState, setRequestState] = useState<"idle" | "submitted" | "error">("idle");
  const submittedRef = useRef(false);

  useEffect(() => {
    if (state.status !== "pending-access" || submittedRef.current) return;

    submittedRef.current = true;
    void createAccessRequest(buildPendingAccessRequestInput(state.session))
      .then(() => setRequestState("submitted"))
      .catch(() => {
        setRequestState("error");
        // Best-effort: the page already shows the "contact admin" fallback
        // regardless of whether the request row was recorded.
      });
  }, [state]);

  return (
    <div className="auth-screen">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <h1>Access pending</h1>
        <p className="muted">
          Your account isn't set up for {companyInfo?.dashboardName ?? "this dashboard"} yet.
          {requestState === "submitted" ? " We’ve recorded your request and the admin team will review it shortly." : null}
          {requestState === "error" ? " We could not save the request automatically, so please contact the admin team directly." : null}
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
