import { apiClient } from "../lib/apiClient";

export const teamService = {
  /**
   * Get all teams the currently logged-in user belongs to.
   *
   * Backend:
   * GET /api/v1/teams/mine
   */
  getMine() {
    return apiClient.get("/teams/mine");
  },

  /**
   * Get teams managed by the current user.
   *
   * Manager/Admin:
   * GET /api/v1/teams/managed
   */
  getManaged() {
    return apiClient.get("/teams/managed");
  },

  /**
   * Get members of a specific team.
   *
   * Manager/Admin only.
   *
   * Backend:
   * GET /api/v1/teams/{team_id}/members
   */
  getMembers(teamId) {
    if (!teamId) {
      throw new Error("Team ID is required.");
    }

    return apiClient.get(`/teams/${teamId}/members`);
  },
};