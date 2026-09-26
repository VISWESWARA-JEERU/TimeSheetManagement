import { apiClient } from "../lib/apiClient";

export const taskService = {
  async getAll({
    projectId = null,
    assignedToMe = false,
    activeOnly = true,
  } = {}) {
    const params = new URLSearchParams();

    if (projectId) {
      params.set("project_id", projectId);
    }

    params.set(
      "assigned_to_me",
      String(assignedToMe)
    );

    params.set(
      "active_only",
      String(activeOnly)
    );

    const query = params.toString();

    return apiClient.get(
      query ? `/tasks?${query}` : "/tasks"
    );
  },

  async getById(taskId) {
    return apiClient.get(
      `/tasks/${taskId}`
    );
  },
};