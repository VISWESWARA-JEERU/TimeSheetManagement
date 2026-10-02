import { ExternalLink } from "lucide-react";
import {
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

function EmbeddedLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  function openFullApp() {
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete("embedded");
    const search = searchParams.toString();

    navigate(
      `${location.pathname}${search ? `?${search}` : ""}${location.hash}`,
      { replace: true }
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-3 sm:p-4">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openFullApp}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Open the full application"
        >
          Open full app
          <ExternalLink size={14} aria-hidden="true" />
        </button>
      </div>
      <Outlet />
    </main>
  );
}

export default EmbeddedLayout;