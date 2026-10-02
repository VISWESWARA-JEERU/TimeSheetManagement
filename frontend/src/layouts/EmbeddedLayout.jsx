import { useState } from "react";
import { ExternalLink, Loader2, LogOut } from "lucide-react";
import {
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";

function EmbeddedLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  function openFullApp() {
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete("embedded");
    const search = searchParams.toString();

    navigate(
      `${location.pathname}${search ? `?${search}` : ""}${location.hash}`,
      { replace: true }
    );
  }

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setLogoutError("");
    try {
      const result = await logout();
      if (!result?.ims_end_session_url) {
        navigate("/login?embedded=1", { replace: true });
      }
    } catch (error) {
      console.error("Embedded logout failed:", error);
      setLogoutError(error.message || "Unable to log out.");
      setLoggingOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={openFullApp}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Open the full application"
        >
          Open full app
          <ExternalLink size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Sign out"
        >
          {loggingOut ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <LogOut size={14} aria-hidden="true" />
          )}
          Sign out
        </button>
      </div>
      {logoutError && (
        <p className="mb-3 text-right text-xs text-red-700" role="alert">
          {logoutError}
        </p>
      )}
      <Outlet />
    </main>
  );
}

export default EmbeddedLayout;