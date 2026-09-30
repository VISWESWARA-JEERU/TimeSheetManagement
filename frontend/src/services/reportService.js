import { apiClient } from "../lib/apiClient";

function reportQuery(filters) {
  const params = new URLSearchParams();
  params.set("period_start", filters.periodStart);
  params.set("period_end", filters.periodEnd);

  if (filters.userId) {
    params.set("user_id", filters.userId);
  }
  if (filters.projectId) {
    params.set("project_id", filters.projectId);
  }
  if (filters.billable !== "") {
    params.set("billable", filters.billable);
  }

  return params.toString();
}

export const reportService = {
  getSummary(filters) {
    return apiClient.get(`/reports/summary?${reportQuery(filters)}`);
  },

  getProjects(filters) {
    return apiClient.get(`/reports/projects?${reportQuery(filters)}`);
  },

  getMembers(filters) {
    return apiClient.get(`/reports/members?${reportQuery(filters)}`);
  },

  getDaily(filters) {
    return apiClient.get(`/reports/daily?${reportQuery(filters)}`);
  },

  getAttendance(filters) {
    return apiClient.get(`/reports/attendance?${reportQuery(filters)}`);
  },
};
