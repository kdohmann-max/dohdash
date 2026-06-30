import { useCompanyInfo } from "../company/CompanyInfoContext";
import { useAuth } from "./AuthContext";
import { ThemeToggle } from "../components/ThemeToggle";
import "./auth.css";

function GoogleMark() {
  return (
    <svg className="auth-gmark" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.2 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16z"/>
      <path fill="#FBBC05" d="M10.5 28.3c-.5-1.4-.7-2.9-.7-4.3s.3-3 .7-4.3l-7.9-6.1C.9 16.9 0 20.3 0 24s.9 7.1 2.6 10.4l7.9-6.1z"/>
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.8 2.1-6.3 0-11.6-3.7-13.5-9.3l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  );
}

export function LoginPage() {
  const { companyInfo } = useCompanyInfo();
  const { signInWithGoogle } = useAuth();

  return (
    <div className="auth-screen">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <h1>{companyInfo?.dashboardName ?? "Sign in"}</h1>
        <div className="auth-actions">
          <button className="auth-button" onClick={() => void signInWithGoogle()}>
            <GoogleMark />
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}
