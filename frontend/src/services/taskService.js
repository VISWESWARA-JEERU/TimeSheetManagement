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

  async update(taskId, payload) {
    return apiClient.patch(
      `/tasks/${taskId}`,
      payload
    );
  },

  async getProjectSyncStatus(projectId) {
    return apiClient.get(
      `/github-sync/projects/${projectId}/status`
    );
  },

  async pullProject(projectId) {
    return apiClient.post(
      `/github-sync/projects/${projectId}/pull`
    );
  },

  async pushTask(taskId) {
    return apiClient.post(
      `/github-sync/tasks/${taskId}/push`
    );
  },

  async resolveUseGitHub(taskId) {
    return apiClient.post(
      `/github-sync/tasks/${taskId}/resolve/use-github`
    );
  },

  async resolveKeepLocal(taskId) {
    return apiClient.post(
      `/github-sync/tasks/${taskId}/resolve/keep-local`
    );
  },
};