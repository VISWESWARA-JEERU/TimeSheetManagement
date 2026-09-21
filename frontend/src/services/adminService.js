import { apiClient } from "../lib/apiClient";

export const adminService = {
  // ==========================================
  // USERS
  // ==========================================

  listUsers({
    page = 1,
    pageSize = 20,
    query = "",
    status = "",
  } = {}) {
    const params = new URLSearchParams();

    params.set("page", String(page));
    params.set("page_size", String(pageSize));

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (status) {
      params.set("status", status);
    }

    return apiClient.get(
      `/admin/users?${params.toString()}`
    );
  },

  getUser(userId) {
    if (!userId) {
      throw new Error("User ID is required.");
    }

    return apiClient.get(`/admin/users/${userId}`);
  },

  updateUser(userId, payload) {
    if (!userId) {
      throw new Error("User ID is required.");
    }

    return apiClient.patch(
      `/admin/users/${userId}`,
      payload
    );
  },

  // ==========================================
  // ROLES
  // ==========================================

  grantRole(userId, role) {
    if (!userId) {
      throw new Error("User ID is required.");
    }

    if (!role) {
      throw new Error("Role is required.");
    }

    return apiClient.post(
      `/admin/users/${userId}/roles`,
      { role }
    );
  },

  revokeRole(userId, role) {
    if (!userId) {
      throw new Error("User ID is required.");
    }

    if (!role) {
      throw new Error("Role is required.");
    }

    return apiClient.delete(
      `/admin/users/${userId}/roles/${role}`
    );
  },

  // ==========================================
  // TEAMS
  // ==========================================

  listTeams() {
    return apiClient.get("/admin/teams");
  },

  createTeam(name) {
    const cleanName = name?.trim();

    if (!cleanName) {
      throw new Error("Team name is required.");
    }

    return apiClient.post("/admin/teams", {
      name: cleanName,
    });
  },

  renameTeam(teamId, name) {
    const cleanName = name?.trim();

    if (!teamId) {
      throw new Error("Team ID is required.");
    }

    if (!cleanName) {
      throw new Error("Team name is required.");
    }

    return apiClient.patch(
      `/admin/teams/${teamId}`,
      {
        name: cleanName,
      }
    );
  },

  deleteTeam(teamId) {
    if (!teamId) {
      throw new Error("Team ID is required.");
    }

    return apiClient.delete(
      `/admin/teams/${teamId}`
    );
  },

  // ==========================================
  // TEAM MEMBERS
  // ==========================================

  addTeamMember(
    teamId,
    userId,
    isManager = false
  ) {
    if (!teamId) {
      throw new Error("Team ID is required.");
    }

    if (!userId) {
      throw new Error("User ID is required.");
    }

    return apiClient.post(
      `/admin/teams/${teamId}/members`,
      {
        user_id: userId,
        is_manager: Boolean(isManager),
      }
    );
  },

  removeTeamMember(teamId, userId) {
    if (!teamId) {
      throw new Error("Team ID is required.");
    }

    if (!userId) {
      throw new Error("User ID is required.");
    }

    return apiClient.delete(
      `/admin/teams/${teamId}/members/${userId}`
    );
  },

  // ==========================================
  // AUDIT LOGS
  // ==========================================

  listAuditLogs({
    page = 1,
    pageSize = 20,
  } = {}) {
    const params = new URLSearchParams();

    params.set("page", String(page));
    params.set("page_size", String(pageSize));

    return apiClient.get(
      `/admin/audit-logs?${params.toString()}`
    );
  },
};