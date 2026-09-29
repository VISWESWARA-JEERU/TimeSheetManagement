import { apiClient } from "../lib/apiClient";


export const taskService = {
  // =====================================================
  // LIST TASKS
  // =====================================================

  async getAll({
    projectId = null,
    assignedToMe = false,
    activeOnly = true,
  } = {}) {
    const params = new URLSearchParams();

    if (projectId) {
      params.set(
        "project_id",
        projectId
      );
    }

    params.set(
      "assigned_to_me",
      String(assignedToMe)
    );

    params.set(
      "active_only",
      String(activeOnly)
    );

    return apiClient.get(
      `/tasks?${params.toString()}`
    );
  },


  // =====================================================
  // GET ONE TASK
  // =====================================================

  async getById(taskId) {
    return apiClient.get(
      `/tasks/${taskId}`
    );
  },
};