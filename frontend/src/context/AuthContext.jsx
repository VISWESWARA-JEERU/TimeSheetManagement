import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { authService } from "../services/authService";
import { ApiError } from "../lib/apiClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authConfig, setAuthConfig] = useState(null);

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  /**
   * Load backend authentication configuration.
   */
  const loadAuthConfig = useCallback(async () => {
    try {
      const config = await authService.getConfig();

      setAuthConfig(config);

      return config;
    } catch (error) {
      console.error("Failed to load auth config:", error);

      setAuthError(
        error.message || "Unable to load authentication configuration."
      );

      return null;
    }
  }, []);

  /**
   * Check whether the browser already has
   * a valid backend session.
   */
  const loadCurrentUser = useCallback(async () => {
    try {
      const currentUser = await authService.getCurrentUser();

      setUser(currentUser);
      setAuthError(null);

      return currentUser;
    } catch (error) {
      // 401 simply means there is currently
      // no authenticated session.
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        return null;
      }

      console.error("Failed to load current user:", error);

      setUser(null);

      setAuthError(
        error.message || "Unable to load the current user."
      );

      return null;
    }
  }, []);

  /**
   * Initialize authentication when the
   * application first loads.
   */
  useEffect(() => {
    async function initializeAuth() {
      setLoading(true);
      setAuthError(null);

      try {
        await loadAuthConfig();
        await loadCurrentUser();
      } finally {
        setLoading(false);
      }
    }

    initializeAuth();
  }, [loadAuthConfig, loadCurrentUser]);

  /**
   * Local development login.
   *
   * Backend creates the session cookie and
   * returns the logged-in user.
   */
  const devLogin = useCallback(async (email) => {
    setAuthError(null);

    try {
      const loggedInUser = await authService.devLogin(email);

      setUser(loggedInUser);

      return loggedInUser;
    } catch (error) {
      console.error("Development login failed:", error);

      setUser(null);

      setAuthError(
        error.message || "Unable to sign in."
      );

      throw error;
    }
  }, []);

  /**
   * Start IMS / OIDC authentication.
   */
  const loginWithIMS = useCallback(
    async (returnTo = window.location.origin) => {
      setAuthError(null);

      try {
        const result = await authService.startLogin(returnTo);

        if (!result?.authorize_url) {
          throw new Error(
            "Authentication server did not provide a login URL."
          );
        }

        window.location.assign(result.authorize_url);
      } catch (error) {
        console.error("IMS login failed:", error);

        setAuthError(
          error.message || "Unable to start IMS login."
        );

        throw error;
      }
    },
    []
  );

  /**
   * Logout current user.
   */
  const logout = useCallback(async () => {
    setAuthError(null);

    try {
      const result = await authService.logout();

      setUser(null);

      // Backend may provide the IMS logout URL.
      if (result?.ims_end_session_url) {
        window.location.assign(result.ims_end_session_url);
      }

      return result;
    } catch (error) {
      console.error("Logout failed:", error);

      setAuthError(
        error.message || "Unable to log out."
      );

      throw error;
    }
  }, []);

  /**
   * Reload /auth/me.
   *
   * Useful when user information or permissions
   * may have changed.
   */
  const refreshUser = useCallback(async () => {
    return loadCurrentUser();
  }, [loadCurrentUser]);

  /**
   * Role helper.
   */
  const hasRole = useCallback(
    (role) => {
      return user?.roles?.includes(role) ?? false;
    },
    [user]
  );

  /**
   * Permission helper.
   */
  const hasPermission = useCallback(
    (permission) => {
      return user?.permissions?.includes(permission) ?? false;
    },
    [user]
  );

  const isAuthenticated = Boolean(user);

  const isAdmin = hasRole("admin");

  // Backend considers admin a manager too.
  const isManager =
    hasRole("manager") || isAdmin;

  const isMember = hasRole("member");

  const value = useMemo(
    () => ({
      // Authentication state
      user,
      authConfig,
      loading,
      authError,
      isAuthenticated,

      // Roles
      isAdmin,
      isManager,
      isMember,

      // Actions
      devLogin,
      loginWithIMS,
      logout,
      refreshUser,

      // Helpers
      hasRole,
      hasPermission,

      // Allows pages to clear an old error
      clearAuthError: () => setAuthError(null),
    }),
    [
      user,
      authConfig,
      loading,
      authError,
      isAuthenticated,
      isAdmin,
      isManager,
      isMember,
      devLogin,
      loginWithIMS,
      logout,
      refreshUser,
      hasRole,
      hasPermission,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside an AuthProvider."
    );
  }

  return context;
}