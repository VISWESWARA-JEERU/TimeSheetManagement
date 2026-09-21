import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

function RoleGuard({
  children,
  allowedRoles = [],
}) {
  const {
    user,
    loading,
  } = useAuth();

  const location = useLocation();

  // Wait until authentication check finishes
  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />

          <p className="text-sm text-slate-500">
            Checking permissions...
          </p>
        </div>
      </div>
    );
  }

  // User is not logged in
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

  // Check whether user has one of the allowed roles
  const hasAllowedRole =
    allowedRoles.length === 0 ||
    allowedRoles.some((role) =>
      user.roles?.includes(role)
    );

  // Logged in, but not authorized for this page
  if (!hasAllowedRole) {
    return (
      <Navigate
        to="/today"
        replace
      />
    );
  }

  return children;
}

export default RoleGuard;