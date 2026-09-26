import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  CalendarDays,
  Check,
  Clock,
  RefreshCw,
  Timer,
  TrendingDown,
  TrendingUp,
  User,
  X,
} from "lucide-react";

import Header from "../components/common/Header";
import EmptyState from "../components/common/EmptyState";

import { timesheetService } from "../services/timesheetService";


function ApprovalsPage() {
  const [approvals, setApprovals] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [actionLoading, setActionLoading] =
    useState(null);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [rejectingPeriod, setRejectingPeriod] =
    useState(null);

  const [rejectComment, setRejectComment] =
    useState("");


  // =====================================================
  // LOAD APPROVALS
  // =====================================================

  const loadApprovals =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const data =
          await timesheetService.getApprovals();

        setApprovals(
          Array.isArray(data)
            ? data
            : []
        );

      } catch (requestError) {
        console.error(
          "Failed to load approvals:",
          requestError
        );

        setError(
          requestError.message ||
            "Unable to load submitted timesheets."
        );

      } finally {
        setLoading(false);
      }
    }, []);


  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);


  // =====================================================
  // APPROVE
  // =====================================================

  async function handleApprove(period) {
    let message =
      "Approve this weekly timesheet?";

    if (!period.threshold_satisfied) {
      message =
        "This employee has not satisfied the expected working-hours threshold.\n\nDo you still want to approve this timesheet?";
    }

    if (
      period.variance_within_policy === false
    ) {
      message =
        "This timesheet has a recording variance outside the allowed policy threshold.\n\nDo you still want to approve it?";
    }

    const confirmed =
      window.confirm(message);

    if (!confirmed) {
      return;
    }

    setActionLoading(
      period.id
    );

    setError("");
    setMessage("");

    try {
      await timesheetService.approve(
        period.id,
        {
          version:
            period.version,

          comment: null,
        }
      );

      setMessage(
        "Timesheet approved successfully."
      );

      await loadApprovals();

    } catch (requestError) {
      console.error(
        "Failed to approve timesheet:",
        requestError
      );

      setError(
        requestError.message ||
          "Unable to approve timesheet."
      );

    } finally {
      setActionLoading(null);
    }
  }


  // =====================================================
  // OPEN REJECT
  // =====================================================

  function openReject(period) {
    setRejectingPeriod(
      period
    );

    setRejectComment("");

    setError("");
    setMessage("");
  }


  // =====================================================
  // CLOSE REJECT
  // =====================================================

  function closeReject() {
    setRejectingPeriod(null);
    setRejectComment("");
  }


  // =====================================================
  // REJECT
  // =====================================================

  async function handleReject(event) {
    event.preventDefault();

    if (!rejectingPeriod) {
      return;
    }

    const comment =
      rejectComment.trim();

    if (!comment) {
      setError(
        "Please enter a reason for requesting changes."
      );

      return;
    }

    setActionLoading(
      rejectingPeriod.id
    );

    setError("");
    setMessage("");

    try {
      await timesheetService.reject(
        rejectingPeriod.id,
        {
          version:
            rejectingPeriod.version,

          comment,
        }
      );

      setMessage(
        "Timesheet returned for changes."
      );

      closeReject();

      await loadApprovals();

    } catch (requestError) {
      console.error(
        "Failed to reject timesheet:",
        requestError
      );

      setError(
        requestError.message ||
          "Unable to request changes."
      );

    } finally {
      setActionLoading(null);
    }
  }


  // =====================================================
  // PAGE
  // =====================================================

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">

      <Header
        title="Approvals"
        subtitle="Review submitted weekly timesheets and attendance variance"
      />


      {/* ==========================================
          MESSAGES
      ========================================== */}

      {error && (

        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">

          <AlertCircle
            size={20}
            className="mt-0.5 shrink-0 text-red-600"
          />

          <p className="text-sm text-red-700">
            {error}
          </p>

        </div>

      )}


      {message && (

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">

          {message}

        </div>

      )}


      {/* ==========================================
          SUMMARY BAR
      ========================================== */}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

          <div>

            <p className="text-sm font-medium text-slate-500">
              Pending approvals
            </p>

            <p className="mt-1 text-2xl font-bold text-slate-900">
              {approvals.length}
            </p>

          </div>


          <button
            type="button"
            onClick={loadApprovals}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >

            <RefreshCw
              size={17}
              className={
                loading
                  ? "animate-spin"
                  : ""
              }
            />

            Refresh

          </button>

        </div>

      </section>


      {/* ==========================================
          APPROVAL LIST
      ========================================== */}

      {loading ? (

        <ApprovalsSkeleton />

      ) : approvals.length === 0 ? (

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <EmptyState
            title="No pending approvals"
            description="There are currently no submitted weekly timesheets waiting for your review."
          />

        </section>

      ) : (

        <section className="space-y-5">

          {approvals.map(
            (period) => (

              <ApprovalCard
                key={period.id}
                period={period}
                loading={
                  actionLoading ===
                  period.id
                }
                onApprove={() =>
                  handleApprove(
                    period
                  )
                }
                onReject={() =>
                  openReject(
                    period
                  )
                }
              />

            )
          )}

        </section>

      )}


      {/* ==========================================
          REJECT MODAL
      ========================================== */}

      {rejectingPeriod && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">

          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-slate-200 p-5">

              <div>

                <h2 className="text-lg font-bold text-slate-900">
                  Request changes
                </h2>

                <p className="mt-1 text-sm text-slate-500">

                  {rejectingPeriod.employee_name}

                  {" • "}

                  {formatDate(
                    rejectingPeriod.period_start
                  )}

                  {" – "}

                  {formatDate(
                    rejectingPeriod.period_end
                  )}

                </p>

              </div>


              <button
                type="button"
                onClick={closeReject}
                disabled={
                  actionLoading ===
                  rejectingPeriod.id
                }
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>

            </div>


            <form
              onSubmit={handleReject}
              className="space-y-5 p-5"
            >

              {/* QUICK CONTEXT */}

              <div className="grid grid-cols-2 gap-3">

                <SmallMetric
                  title="Attendance"
                  value={formatMinutes(
                    rejectingPeriod.attendance_minutes
                  )}
                />

                <SmallMetric
                  title="Logged"
                  value={formatMinutes(
                    rejectingPeriod.logged_minutes
                  )}
                />

              </div>


              <div>

                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Reason *
                </label>

                <textarea
                  value={rejectComment}
                  onChange={(event) =>
                    setRejectComment(
                      event.target.value
                    )
                  }
                  rows={5}
                  maxLength={2000}
                  required
                  placeholder="Explain what needs to be corrected..."
                  className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />


                <div className="mt-1 flex justify-between gap-3">

                  <p className="text-xs text-slate-400">
                    The employee can edit and resubmit the week.
                  </p>

                  <p className="shrink-0 text-xs text-slate-400">
                    {rejectComment.length}/2000
                  </p>

                </div>

              </div>


              <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">

                <button
                  type="button"
                  onClick={closeReject}
                  disabled={
                    actionLoading ===
                    rejectingPeriod.id
                  }
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>


                <button
                  type="submit"
                  disabled={
                    actionLoading ===
                    rejectingPeriod.id
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >

                  {actionLoading ===
                  rejectingPeriod.id ? (

                    <RefreshCw
                      size={17}
                      className="animate-spin"
                    />

                  ) : (

                    <X size={17} />

                  )}

                  Request changes

                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>
  );
}


// =========================================================
// APPROVAL CARD
// =========================================================

function ApprovalCard({
  period,
  loading,
  onApprove,
  onReject,
}) {
  const coverage =
    Number(
      period.recording_coverage_percent ||
        0
    );

  const thresholdSatisfied =
    Boolean(
      period.threshold_satisfied
    );

  const varianceWithinPolicy =
    period.variance_within_policy;

  const varianceThreshold =
    period.variance_threshold_minutes;


  return (

    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

      {/* ==========================================
          EMPLOYEE HEADER
      ========================================== */}

      <div className="border-b border-slate-200 p-5 sm:p-6">

        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">

          <div className="min-w-0">

            <div className="flex items-center gap-3">

              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">

                <User size={20} />

              </div>


              <div className="min-w-0">

                <p className="font-bold text-slate-900">

                  {period.employee_name ||
                    "Employee"}

                </p>

                <p className="truncate text-sm text-slate-500">

                  {period.employee_email}

                </p>

              </div>

            </div>


            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">

              <div className="flex items-center gap-2">

                <CalendarDays
                  size={16}
                  className="text-slate-400"
                />

                <span>

                  {formatDate(
                    period.period_start
                  )}

                  {" – "}

                  {formatDate(
                    period.period_end
                  )}

                </span>

              </div>


              {period.submitted_at && (

                <div className="flex items-center gap-2">

                  <Clock
                    size={16}
                    className="text-slate-400"
                  />

                  <span>

                    Submitted{" "}

                    {formatDateTime(
                      period.submitted_at
                    )}

                  </span>

                </div>

              )}

            </div>

          </div>


          <div className="flex flex-wrap items-center gap-2">

            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">

              {period.status}

            </span>


            <ThresholdBadge
              satisfied={
                thresholdSatisfied
              }
            />

          </div>

        </div>

      </div>


      {/* ==========================================
          TIME METRICS
      ========================================== */}

      <div className="p-5 sm:p-6">

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

          <MetricCard
            title="Attendance time"
            value={formatMinutes(
              period.attendance_minutes
            )}
            description="Recorded work-session time"
            icon={Clock}
          />


          <MetricCard
            title="Timesheet logged"
            value={formatMinutes(
              period.logged_minutes
            )}
            description="Project and task entries"
            icon={Timer}
          />


          <MetricCard
            title="Expected time"
            value={formatMinutes(
              period.expected_minutes
            )}
            description="Workday-hours requirement"
            icon={CalendarDays}
          />


          <MetricCard
            title="Recording coverage"
            value={`${coverage.toFixed(1)}%`}
            description="Logged time vs attendance"
            icon={Check}
          />

        </div>


        {/* ==========================================
            VARIANCE
        ========================================== */}

        <div className="mt-4 grid gap-3 md:grid-cols-2">

          <VarianceCard
            title="Logged vs attendance"
            value={
              period.variance_minutes
            }
            description={
              getRecordingVarianceText(
                period.variance_minutes
              )
            }
          />


          <VarianceCard
            title="Attendance vs expected"
            value={
              period.attendance_variance_minutes
            }
            description={
              getAttendanceVarianceText(
                period.attendance_variance_minutes
              )
            }
          />

        </div>


        {/* ==========================================
            COVERAGE BAR
        ========================================== */}

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">

          <div className="flex items-center justify-between gap-4">

            <div>

              <p className="text-sm font-semibold text-slate-800">
                Recording coverage
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Percentage of attendance time explained by time entries
              </p>

            </div>

            <p className="text-sm font-bold text-slate-900">
              {coverage.toFixed(1)}%
            </p>

          </div>


          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">

            <div
              className={
                coverage >= 100
                  ? "h-full rounded-full bg-emerald-500"
                  : coverage >= 90
                    ? "h-full rounded-full bg-indigo-500"
                    : "h-full rounded-full bg-amber-500"
              }
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    0,
                    coverage
                  )
                )}%`,
              }}
            />

          </div>

        </div>


        {/* ==========================================
            MANAGER CHECKS
        ========================================== */}

        <div className="mt-5 grid gap-3 md:grid-cols-2">

          <StatusCheck
            title="Working-hours threshold"
            success={
              thresholdSatisfied
            }
            successText="Expected hours satisfied"
            failureText="Expected hours not satisfied"
          />


          {typeof varianceWithinPolicy ===
            "boolean" && (

            <StatusCheck
              title="Recording variance"
              success={
                varianceWithinPolicy
              }
              successText={
                varianceThreshold != null
                  ? `Within ${varianceThreshold}-minute policy`
                  : "Within policy"
              }
              failureText={
                varianceThreshold != null
                  ? `Outside ${varianceThreshold}-minute policy`
                  : "Outside policy"
              }
            />

          )}

        </div>


        {/* ==========================================
            WARNING
        ========================================== */}

        {(
          !thresholdSatisfied ||
          varianceWithinPolicy === false
        ) && (

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">

            <AlertCircle
              size={19}
              className="mt-0.5 shrink-0 text-amber-600"
            />

            <div>

              <p className="text-sm font-semibold text-amber-800">
                Review recommended
              </p>

              <p className="mt-1 text-sm leading-6 text-amber-700">

                {!thresholdSatisfied &&
                  "Attendance is below the expected working-hours requirement. "}

                {varianceWithinPolicy === false &&
                  "The difference between logged time and attendance is outside the configured variance threshold."}

              </p>

            </div>

          </div>

        )}


        {/* ==========================================
            ACTIONS
        ========================================== */}

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">

          <button
            type="button"
            onClick={onReject}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >

            <X size={17} />

            Request changes

          </button>


          <button
            type="button"
            onClick={onApprove}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >

            {loading ? (

              <RefreshCw
                size={17}
                className="animate-spin"
              />

            ) : (

              <Check size={17} />

            )}

            Approve

          </button>

        </div>

      </div>

    </article>

  );
}


// =========================================================
// METRIC CARD
// =========================================================

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
}) {
  return (

    <div className="rounded-xl border border-slate-200 bg-white p-4">

      <div className="flex items-center gap-2 text-slate-500">

        <Icon size={17} />

        <p className="text-xs font-semibold uppercase tracking-wide">
          {title}
        </p>

      </div>

      <p className="mt-3 text-xl font-bold text-slate-900">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {description}
      </p>

    </div>

  );
}


// =========================================================
// SMALL METRIC
// =========================================================

function SmallMetric({
  title,
  value,
}) {
  return (

    <div className="rounded-lg bg-slate-50 p-3">

      <p className="text-xs font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-1 font-bold text-slate-900">
        {value}
      </p>

    </div>

  );
}


// =========================================================
// VARIANCE CARD
// =========================================================

function VarianceCard({
  title,
  value = 0,
  description,
}) {
  const numericValue =
    Number(value) || 0;

  const positive =
    numericValue > 0;

  const negative =
    numericValue < 0;

  const Icon =
    positive
      ? TrendingUp
      : negative
        ? TrendingDown
        : Check;


  return (

    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

      <div className="flex items-start justify-between gap-4">

        <div>

          <p className="text-sm font-semibold text-slate-700">
            {title}
          </p>

          <p className="mt-2 text-xl font-bold text-slate-900">
            {formatSignedMinutes(
              numericValue
            )}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {description}
          </p>

        </div>


        <div
          className={
            negative
              ? "flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600"
              : positive
                ? "flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"
                : "flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500"
          }
        >

          <Icon size={18} />

        </div>

      </div>

    </div>

  );
}


// =========================================================
// STATUS CHECK
// =========================================================

function StatusCheck({
  title,
  success,
  successText,
  failureText,
}) {
  return (

    <div
      className={
        success
          ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4"
          : "rounded-xl border border-red-200 bg-red-50 p-4"
      }
    >

      <div className="flex items-center gap-2">

        <div
          className={
            success
              ? "flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
              : "flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-700"
          }
        >

          {success ? (
            <Check size={15} />
          ) : (
            <X size={15} />
          )}

        </div>


        <div>

          <p
            className={
              success
                ? "text-sm font-semibold text-emerald-800"
                : "text-sm font-semibold text-red-800"
            }
          >
            {title}
          </p>

          <p
            className={
              success
                ? "mt-0.5 text-xs text-emerald-700"
                : "mt-0.5 text-xs text-red-700"
            }
          >
            {success
              ? successText
              : failureText}
          </p>

        </div>

      </div>

    </div>

  );
}


// =========================================================
// THRESHOLD BADGE
// =========================================================

function ThresholdBadge({
  satisfied,
}) {
  return (

    <span
      className={
        satisfied
          ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
          : "inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
      }
    >

      {satisfied ? (
        <Check size={13} />
      ) : (
        <X size={13} />
      )}

      {satisfied
        ? "Threshold satisfied"
        : "Below threshold"}

    </span>

  );
}


// =========================================================
// LOADING
// =========================================================

function ApprovalsSkeleton() {
  return (

    <div className="space-y-5">

      {[1, 2].map(
        (item) => (

          <div
            key={item}
            className="h-96 animate-pulse rounded-2xl bg-slate-200"
          />

        )
      )}

    </div>

  );
}


// =========================================================
// FORMAT DATE
// =========================================================

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(
    new Date(
      `${value}T00:00:00`
    )
  );
}


// =========================================================
// FORMAT DATE TIME
// =========================================================

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(
    new Date(value)
  );
}


// =========================================================
// FORMAT MINUTES
// =========================================================

function formatMinutes(
  totalMinutes = 0
) {
  const safeMinutes =
    Math.max(
      0,
      Math.round(
        Number(totalMinutes) || 0
      )
    );

  const hours =
    Math.floor(
      safeMinutes / 60
    );

  const minutes =
    safeMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}


// =========================================================
// SIGNED MINUTES
// =========================================================

function formatSignedMinutes(
  value = 0
) {
  const numericValue =
    Math.round(
      Number(value) || 0
    );

  if (numericValue === 0) {
    return "0m";
  }

  const prefix =
    numericValue > 0
      ? "+"
      : "-";

  return `${prefix}${formatMinutes(
    Math.abs(numericValue)
  )}`;
}


// =========================================================
// RECORDING VARIANCE TEXT
// =========================================================

function getRecordingVarianceText(
  value
) {
  const variance =
    Number(value) || 0;

  if (variance === 0) {
    return "Logged time exactly matches attendance.";
  }

  if (variance < 0) {
    return "Less time was logged than the recorded attendance time.";
  }

  return "More time was logged than the recorded attendance time.";
}


// =========================================================
// ATTENDANCE VARIANCE TEXT
// =========================================================

function getAttendanceVarianceText(
  value
) {
  const variance =
    Number(value) || 0;

  if (variance === 0) {
    return "Attendance exactly matches the expected working time.";
  }

  if (variance < 0) {
    return "Attendance is below the expected working time.";
  }

  return "Attendance is above the expected working time.";
}


export default ApprovalsPage;