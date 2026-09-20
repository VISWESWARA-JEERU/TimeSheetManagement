import { useState } from "react";
import {
  LogOut,
  Menu,
  UserRound,
} from "lucide-react";
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import Sidebar from "../components/common/Sidebar";
import { useAuth } from "../context/AuthContext";

function AppLayout() {
  const {
    user,
    loading,
    logout,
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [userMenuOpen, setUserMenuOpen] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  /*
   * Wait until AuthContext has finished checking
   * the current backend session.
   */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />

          <p className="text-sm font-medium text-slate-600">
            Loading workspace...
          </p>
        </div>
      </div>
    );
  }

  /*
   * Protect application routes.
   */
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
        }}
      />
    );
  }

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setUserMenuOpen(false);

    try {
      const result = await logout();

      /*
       * AuthContext handles IMS end-session
       * redirection when one exists.
       *
       * For local development, return to login.
       */
      if (!result?.ims_end_session_url) {
        navigate("/login", {
          replace: true,
        });
      }
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main application */}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}

        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile menu */}

            <button
              type="button"
              onClick={() =>
                setSidebarOpen(true)
              }
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>

            <div>
              <p className="text-sm font-semibold text-slate-900">
                {getPageTitle(
                  location.pathname
                )}
              </p>

              <p className="hidden text-xs text-slate-500 sm:block">
                Team Timesheet
              </p>
            </div>
          </div>

          {/* User dropdown */}

          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setUserMenuOpen(
                  (previous) => !previous
                )
              }
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-slate-100"
            >
              <UserAvatar
                name={user.full_name}
              />

              <div className="hidden text-left sm:block">
                <p className="max-w-40 truncate text-sm font-semibold text-slate-800">
                  {user.full_name}
                </p>

                <p className="text-xs capitalize text-slate-500">
                  {getPrimaryRole(user.roles)}
                </p>
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {user.full_name}
                  </p>

                  <p className="mt-1 truncate text-xs text-slate-500">
                    {user.email}
                  </p>
                </div>

                <div className="p-2">
                  <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600">
                    <UserRound size={17} />

                    <span>
                      {getPrimaryRole(
                        user.roles
                      )}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <LogOut size={17} />

                    {loggingOut
                      ? "Signing out..."
                      : "Sign out"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page */}

        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function UserAvatar({ name }) {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
      {getInitials(name)}
    </div>
  );
}

function getInitials(name) {
  if (!name) {
    return "U";
  }

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getPrimaryRole(roles = []) {
  if (roles.includes("admin")) {
    return "Admin";
  }

  if (roles.includes("manager")) {
    return "Manager";
  }

  return "Member";
}

function getPageTitle(pathname) {
  const titles = {
    "/today": "Today",
    "/timesheet": "My Timesheet",
    "/tasks": "Tasks",
    "/reports": "Reports",
    "/team": "Team",
    "/approvals": "Approvals",
    "/admin": "Admin",
  };

  return titles[pathname] || "Team Timesheet";
}

export default AppLayout;