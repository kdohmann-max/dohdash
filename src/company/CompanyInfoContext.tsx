import { createContext, useContext, useEffect, useState } from "react";
import { applyCompanyTheme, loadCompanyInfo } from "./companyInfo";
import { TENANT_NOT_FOUND } from "../storage/db";
import type { CompanyInfo } from "./types";

interface CompanyInfoState {
  companyInfo: CompanyInfo | null;
  loading: boolean;
  error: string | null;
  // No tenant matches this hostname — render a "not set up yet" page rather
  // than the retryable error state (mirrors useAuthState's pending-vs-error).
  notFound: boolean;
}

const CompanyInfoCtx = createContext<CompanyInfoState>({
  companyInfo: null,
  loading: true,
  error: null,
  notFound: false,
});

export function useCompanyInfo() {
  return useContext(CompanyInfoCtx);
}

export function CompanyInfoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CompanyInfoState>({
    companyInfo: null,
    loading: true,
    error: null,
    notFound: false,
  });

  useEffect(() => {
    let cancelled = false;
    loadCompanyInfo()
      .then((info) => {
        if (cancelled) return;
        applyCompanyTheme(info);
        document.title = info.dashboardName;
        setState({ companyInfo: info, loading: false, error: null, notFound: false });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load company info";
        const notFound = message === TENANT_NOT_FOUND;
        setState({
          companyInfo: null,
          loading: false,
          // A missing tenant isn't a retryable failure — surface it via notFound.
          error: notFound ? null : message,
          notFound,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <CompanyInfoCtx.Provider value={state}>{children}</CompanyInfoCtx.Provider>;
}
