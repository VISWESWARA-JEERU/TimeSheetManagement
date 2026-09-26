// export const projectService = {
// 	isAvailable: false,
// };
import { apiClient } from "../lib/apiClient";

export const projectService = {
  async getAll({ activeOnly = true } = {}) {
    const params = new URLSearchParams();

    params.set("active_only", String(activeOnly));

    return apiClient.get(
      `/projects?${params.toString()}`
    );
  },

  async getById(projectId) {
    return apiClient.get(
      `/projects/${projectId}`
    );
  },
};
