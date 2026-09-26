import { apiClient } from "../lib/apiClient";

export const timesheetService = {
  // =====================================================
  // GET WEEK SUMMARY
  // =====================================================

  async getWeek({
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
      `/timesheets/week?${params.toString()}`
    );
  },


  // =====================================================
  // SUBMIT WEEK
  // =====================================================

  async submit({
    periodStart,
    periodEnd,
  }) {
    return apiClient.post(
      "/timesheets/submit",
      {
        period_start:
          periodStart,

        period_end:
          periodEnd,
      }
    );
  },


  // =====================================================
  // GET PENDING APPROVALS
  // =====================================================

  async getApprovals() {
    return apiClient.get(
      "/approvals"
    );
  },


  // =====================================================
  // APPROVE TIMESHEET
  // =====================================================

  async approve(
    periodId,
    {
      version,
      comment = null,
    }
  ) {
    return apiClient.post(
      `/approvals/${periodId}/approve`,
      {
        version,
        comment,
      }
    );
  },


  // =====================================================
  // REJECT / REQUEST CHANGES
  // =====================================================

  async reject(
    periodId,
    {
      version,
      comment,
    }
  ) {
    return apiClient.post(
      `/approvals/${periodId}/reject`,
      {
        version,
        comment,
      }
    );
  },
};