import { createContext, useContext, useEffect, useState } from "react";
import { applyCompanyTheme, loadCompanyInfo } from "./companyInfo";
import type { CompanyInfo } from "./types";

interface CompanyInfoState {
  companyInfo: CompanyInfo | null;
  loading: boolean;
  error: string | null;
}

const CompanyInfoCtx = createContext<CompanyInfoState>({
  companyInfo: null,
  loading: true,
  error: null,
});

export function useCompanyInfo() {
  return useContext(CompanyInfoCtx);
}

export function CompanyInfoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CompanyInfoState>({
    companyInfo: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    loadCompanyInfo()
      .then((info) => {
        if (cancelled) return;
        applyCompanyTheme(info);
        document.title = info.dashboardName;
        setState({ companyInfo: info, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          companyInfo: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load company info",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <CompanyInfoCtx.Provider value={state}>{children}</CompanyInfoCtx.Provider>;
}
