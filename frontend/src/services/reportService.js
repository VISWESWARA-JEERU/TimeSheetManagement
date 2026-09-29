import { apiClient } from "../lib/apiClient";


export const reportService = {
  // =====================================================
  // PHASE 5.1
  // REPORT SUMMARY
  // =====================================================

  async getSummary({
    periodStart,
    periodEnd,
  }) {
    const params =
      new URLSearchParams();

    params.set(
      "period_start",
      periodStart
    );

    params.set(
      "period_end",
      periodEnd
    );

    return apiClient.get(
      `/reports/summary?${params.toString()}`
    );
  },


  // =====================================================
  // PHASE 5.2
  // PROJECT-WISE REPORT
  // =====================================================

  async getProjects({
    periodStart,
    periodEnd,
  }) {
    const params =
      new URLSearchParams();

    params.set(
      "period_start",
      periodStart
    );

    params.set(
      "period_end",
      periodEnd
    );

    return apiClient.get(
      `/reports/projects?${params.toString()}`
    );
  },
};