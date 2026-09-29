import { apiClient } from "../lib/apiClient";


export const timeEntryService = {

  // =====================================================
  // GET ALL
  // =====================================================

  async getAll({
    startDate = null,
    endDate = null,
    projectId = null,
  } = {}) {
    const params =
      new URLSearchParams();

    if (startDate) {
      params.set(
        "start_date",
        startDate
      );
    }

    if (endDate) {
      params.set(
        "end_date",
        endDate
      );
    }

    if (projectId) {
      params.set(
        "project_id",
        projectId
      );
    }

    const query =
      params.toString();

    return apiClient.get(
      query
        ? `/time-entries?${query}`
        : "/time-entries"
    );
  },


  // =====================================================
  // GET BY ID
  // =====================================================

  async getById(entryId) {
    return apiClient.get(
      `/time-entries/${entryId}`
    );
  },


  // =====================================================
  // CREATE
  // =====================================================

  async create(payload) {
    console.log(
      "[timeEntryService] CREATE"
    );

    console.log(
      "[timeEntryService] payload:",
      payload
    );

    return apiClient.post(
      "/time-entries",
      payload
    );
  },


  // =====================================================
  // UPDATE
  // =====================================================

  async update(
    entryId,
    payload
  ) {
    console.log(
      "[timeEntryService] UPDATE CALLED"
    );

    console.log(
      "[timeEntryService] entryId:",
      entryId
    );

    console.log(
      "[timeEntryService] payload:",
      payload
    );

    const path =
      `/time-entries/${entryId}`;

    console.log(
      "[timeEntryService] PATCH path:",
      path
    );

    return apiClient.patch(
      path,
      payload
    );
  },


  // =====================================================
  // DELETE
  // =====================================================

  async remove(entryId) {
    console.log(
      "[timeEntryService] DELETE:",
      entryId
    );

    return apiClient.delete(
      `/time-entries/${entryId}`
    );
  },
};