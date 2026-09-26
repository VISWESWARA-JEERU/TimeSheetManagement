import { apiClient } from "../lib/apiClient";

export const timeEntryService = {
  async getAll({
    startDate = null,
    endDate = null,
    projectId = null,
  } = {}) {
    const params = new URLSearchParams();

    if (startDate) {
      params.set("start_date", startDate);
    }

    if (endDate) {
      params.set("end_date", endDate);
    }

    if (projectId) {
      params.set("project_id", projectId);
    }

    const query = params.toString();

    return apiClient.get(
      query
        ? `/time-entries?${query}`
        : "/time-entries"
    );
  },

  async getById(entryId) {
    return apiClient.get(
      `/time-entries/${entryId}`
    );
  },

  async create(payload) {
    return apiClient.post(
      "/time-entries",
      payload
    );
  },

  async update(entryId, payload) {
    return apiClient.patch(
      `/time-entries/${entryId}`,
      payload
    );
  },

  async remove(entryId) {
    return apiClient.delete(
      `/time-entries/${entryId}`
    );
  },
};