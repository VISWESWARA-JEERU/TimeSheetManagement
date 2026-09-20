// import { apiClient } from "../lib/apiClient";

// export const authService = {
//   getConfig: () => apiClient.get("/auth/config"),
//   getCurrentUser: () => apiClient.get("/auth/me"),
//   startLogin: (returnTo = window.location.origin) =>
//     apiClient.post(`/auth/login?return_to=${encodeURIComponent(returnTo)}`),
//   devLogin: (email) => apiClient.post("/auth/dev-login", { email }),
//   logout: () => apiClient.post("/auth/logout"),
// };
import { apiClient } from "../lib/apiClient";

export const authService = {
  /**
   * Get authentication configuration.
   *
   * Response example:
   * {
   *   oidc_enabled: false,
   *   local_dev_auth: true,
   *   app_name: "Team Timesheet"
   * }
   */
  getConfig() {
    return apiClient.get("/auth/config");
  },

  /**
   * Get the currently authenticated user.
   *
   * The browser automatically sends the session cookie
   * because apiClient uses credentials: "include".
   */
  getCurrentUser() {
    return apiClient.get("/auth/me");
  },

  /**
   * Local development login.
   *
   * Backend expects:
   * {
   *   email: "user@example.com"
   * }
   *
   * No password is required in LOCAL_DEV_AUTH mode.
   */
  devLogin(email) {
    return apiClient.post("/auth/dev-login", {
      email: email.trim(),
    });
  },

  /**
   * Start IMS / OIDC login.
   *
   * Backend returns:
   * {
   *   authorize_url: "...",
   *   state: "..."
   * }
   *
   * The LoginPage will redirect the browser to authorize_url.
   */
  startLogin(returnTo = window.location.origin) {
    const encodedReturnTo = encodeURIComponent(returnTo);

    return apiClient.post(
      `/auth/login?return_to=${encodedReturnTo}`
    );
  },

  /**
   * Logout the current user.
   *
   * Backend deletes/invalidates the session and clears
   * the session cookie.
   */
  logout() {
    return apiClient.post("/auth/logout");
  },
};
