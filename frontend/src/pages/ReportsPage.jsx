import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  FileText,
  RefreshCw,
  WalletCards,
} from "lucide-react";

import { reportService } from "../services/reportService";


// =========================================================
// DATE HELPERS
// =========================================================

function formatDateForApi(date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function getCurrentMonthRange() {
  const now = new Date();

  const firstDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  const lastDay = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  );

  return {
    start: formatDateForApi(firstDay),
    end: formatDateForApi(lastDay),
  };
}


function getCurrentWeekRange() {
  const now = new Date();

  const day = now.getDay();

  const difference =
    day === 0
      ? -6
      : 1 - day;

  const monday = new Date(now);

  monday.setDate(
    now.getDate() + difference
  );

  const sunday = new Date(monday);

  sunday.setDate(
    monday.getDate() + 6
  );

  return {
    start: formatDateForApi(monday),
    end: formatDateForApi(sunday),
  };
}


// =========================================================
// FORMAT HELPERS
// =========================================================

function formatMinutes(minutes = 0) {
  const safeMinutes = Number(
    minutes || 0
  );

  const hours = Math.floor(
    safeMinutes / 60
  );

  const remainingMinutes =
    safeMinutes % 60;

  if (
    hours > 0 &&
    remainingMinutes > 0
  ) {
    return `${hours}h ${remainingMinutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${remainingMinutes}m`;
}


function formatSeconds(seconds = 0) {
  const totalMinutes = Math.floor(
    Number(seconds || 0) / 60
  );

  return formatMinutes(
    totalMinutes
  );
}


function formatDisplayDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(
    `${value}T00:00:00`
  );

  return date.toLocaleDateString(
    undefined,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}


// =========================================================
// SUMMARY CARD
// =========================================================

function ReportCard({
  title,
  value,
  description,
  icon: Icon,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <div className="flex items-start justify-between gap-4">

        <div>
          <p className="text-sm font-medium text-slate-500">
            {title}
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {value}
          </p>

          {description && (
            <p className="mt-1 text-xs text-slate-500">
              {description}
            </p>
          )}
        </div>


        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Icon size={21} />
        </div>

      </div>

    </div>
  );
}


// =========================================================
// PROJECT ROW
// =========================================================

function ProjectRow({ project }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">

      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">

        {/* PROJECT */}

        <div className="min-w-0">

          <div className="flex flex-wrap items-center gap-2">

            <h3 className="font-semibold text-slate-900">
              {project.project_name}
            </h3>

            {project.project_code && (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                {project.project_code}
              </span>
            )}

          </div>


          <p className="mt-1 text-xs text-slate-500">
            {project.entry_count}{" "}
            {project.entry_count === 1
              ? "entry"
              : "entries"}
          </p>

        </div>


        {/* TIME */}

        <div className="text-left md:text-right">

          <p className="text-lg font-bold text-slate-900">
            {formatMinutes(
              project.total_minutes
            )}
          </p>

          <p className="text-xs text-slate-500">
            {project.percentage}% of total
          </p>

        </div>

      </div>


      {/* PROGRESS */}

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">

        <div
          className="h-full rounded-full bg-slate-800"
          style={{
            width: `${Math.min(
              100,
              project.percentage || 0
            )}%`,
          }}
        />

      </div>


      {/* DETAILS */}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">

        <div className="rounded-lg bg-slate-50 p-3">

          <p className="text-xs text-slate-500">
            Billable
          </p>

          <p className="mt-1 font-semibold text-slate-900">
            {formatMinutes(
              project.billable_minutes
            )}
          </p>

        </div>


        <div className="rounded-lg bg-slate-50 p-3">

          <p className="text-xs text-slate-500">
            Non-Billable
          </p>

          <p className="mt-1 font-semibold text-slate-900">
            {formatMinutes(
              project.non_billable_minutes
            )}
          </p>

        </div>

      </div>

    </div>
  );
}


// =========================================================
// REPORTS PAGE
// =========================================================

function ReportsPage() {
  const defaultRange =
    getCurrentMonthRange();


  const [
    periodStart,
    setPeriodStart,
  ] = useState(
    defaultRange.start
  );


  const [
    periodEnd,
    setPeriodEnd,
  ] = useState(
    defaultRange.end
  );


  const [
    report,
    setReport,
  ] = useState(null);


  const [
    projectReport,
    setProjectReport,
  ] = useState(null);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    error,
    setError,
  ] = useState("");


  // =====================================================
  // LOAD REPORTS
  // =====================================================

  const loadReports =
    useCallback(
      async () => {
        if (
          !periodStart ||
          !periodEnd
        ) {
          return;
        }

        if (
          periodStart >
          periodEnd
        ) {
          setError(
            "Start date cannot be after end date."
          );

          return;
        }

        setLoading(true);

        setError("");

        try {
          const [
            summaryData,
            projectData,
          ] = await Promise.all([
            reportService.getSummary({
              periodStart,
              periodEnd,
            }),

            reportService.getProjects({
              periodStart,
              periodEnd,
            }),
          ]);

          setReport(
            summaryData
          );

          setProjectReport(
            projectData
          );

        } catch (requestError) {
          console.error(
            "Failed to load reports:",
            requestError
          );

          setError(
            requestError.message ||
              "Unable to load reports."
          );

        } finally {
          setLoading(false);
        }
      },
      [
        periodStart,
        periodEnd,
      ]
    );


  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    loadReports();
  }, [loadReports]);


  // =====================================================
  // QUICK FILTERS
  // =====================================================

  function selectThisWeek() {
    const range =
      getCurrentWeekRange();

    setPeriodStart(
      range.start
    );

    setPeriodEnd(
      range.end
    );
  }


  function selectThisMonth() {
    const range =
      getCurrentMonthRange();

    setPeriodStart(
      range.start
    );

    setPeriodEnd(
      range.end
    );
  }


  // =====================================================
  // SUMMARY VALUES
  // =====================================================

  const loggedMinutes =
    report?.total_minutes ?? 0;

  const billableMinutes =
    report?.billable_minutes ?? 0;

  const nonBillableMinutes =
    report?.non_billable_minutes ?? 0;

  const expectedMinutes =
    report?.expected_minutes ?? 0;

  const attendanceSeconds =
    report?.attendance_seconds ?? 0;

  const entryCount =
    report?.entry_count ?? 0;


  const attendanceMinutes =
    Math.floor(
      attendanceSeconds / 60
    );


  const workVarianceMinutes =
    loggedMinutes -
    expectedMinutes;


  const attendanceVarianceMinutes =
    attendanceMinutes -
    loggedMinutes;


  const billablePercentage =
    useMemo(() => {
      if (
        loggedMinutes <= 0
      ) {
        return 0;
      }

      return Math.round(
        (
          billableMinutes /
          loggedMinutes
        ) * 100
      );
    }, [
      billableMinutes,
      loggedMinutes,
    ]);


  const projects =
    projectReport?.projects ?? [];


  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-5 md:p-8">

      {/* HEADER */}

      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-center">

        <div>

          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Reports
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Review your logged work,
            attendance and project activity.
          </p>

        </div>


        <button
          type="button"
          onClick={loadReports}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={
              loading
                ? "animate-spin"
                : ""
            }
          />

          Refresh
        </button>

      </section>


      {/* DATE FILTER */}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

        <div className="mb-4 flex items-center gap-2">

          <CalendarDays
            size={19}
            className="text-slate-600"
          />

          <h2 className="font-semibold text-slate-900">
            Report Period
          </h2>

        </div>


        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">

          <div>

            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Start date
            </label>

            <input
              type="date"
              value={periodStart}
              onChange={(event) =>
                setPeriodStart(
                  event.target.value
                )
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />

          </div>


          <div>

            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              End date
            </label>

            <input
              type="date"
              value={periodEnd}
              onChange={(event) =>
                setPeriodEnd(
                  event.target.value
                )
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />

          </div>


          <div className="flex items-end">

            <button
              type="button"
              onClick={loadReports}
              disabled={loading}
              className="w-full rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 lg:w-auto"
            >
              Apply
            </button>

          </div>

        </div>


        <div className="mt-4 flex flex-wrap gap-2">

          <button
            type="button"
            onClick={selectThisWeek}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            This Week
          </button>


          <button
            type="button"
            onClick={selectThisMonth}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            This Month
          </button>

        </div>

      </section>


      {/* ERROR */}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">

          <AlertCircle
            size={20}
            className="mt-0.5 text-red-600"
          />

          <p className="text-sm text-red-700">
            {error}
          </p>

        </div>
      )}


      {/* PERIOD */}

      <div className="flex items-center gap-2 text-sm text-slate-500">

        <CalendarDays size={16} />

        <span>
          {formatDisplayDate(
            report?.period_start ||
              periodStart
          )}

          {" — "}

          {formatDisplayDate(
            report?.period_end ||
              periodEnd
          )}
        </span>

      </div>


      {/* LOADING */}

      {loading ? (

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">

          {Array.from({
            length: 6,
          }).map((_, index) => (

            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
            >

              <div className="h-4 w-28 rounded bg-slate-200" />

              <div className="mt-4 h-8 w-24 rounded bg-slate-200" />

            </div>

          ))}

        </div>

      ) : (

        <>
          {/* SUMMARY CARDS */}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">

            <ReportCard
              title="Total Logged"
              value={formatMinutes(
                loggedMinutes
              )}
              description={`${entryCount} time entries`}
              icon={Clock3}
            />


            <ReportCard
              title="Billable Time"
              value={formatMinutes(
                billableMinutes
              )}
              description={`${billablePercentage}% of logged time`}
              icon={CircleDollarSign}
            />


            <ReportCard
              title="Non-Billable Time"
              value={formatMinutes(
                nonBillableMinutes
              )}
              description="Internal or non-billable work"
              icon={BriefcaseBusiness}
            />


            <ReportCard
              title="Attendance"
              value={formatSeconds(
                attendanceSeconds
              )}
              description="Recorded attendance"
              icon={FileText}
            />


            <ReportCard
              title="Expected Time"
              value={formatMinutes(
                expectedMinutes
              )}
              description="Based on organization policy"
              icon={WalletCards}
            />


            <ReportCard
              title="Entries"
              value={entryCount}
              description="Entries in selected period"
              icon={FileText}
            />

          </section>


          {/* SUMMARY COMPARISON */}

          <section className="grid gap-6 lg:grid-cols-2">

            {/* LOGGED VS EXPECTED */}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

              <h2 className="text-lg font-semibold text-slate-900">
                Logged vs Expected
              </h2>


              <div className="mt-6">

                <div className="mb-2 flex justify-between text-sm">

                  <span className="text-slate-600">
                    Logged
                  </span>

                  <span className="font-semibold text-slate-900">
                    {formatMinutes(
                      loggedMinutes
                    )}
                  </span>

                </div>


                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">

                  <div
                    className="h-full rounded-full bg-slate-800"
                    style={{
                      width: `${
                        expectedMinutes > 0
                          ? Math.min(
                              100,
                              (
                                loggedMinutes /
                                expectedMinutes
                              ) * 100
                            )
                          : 0
                      }%`,
                    }}
                  />

                </div>


                <div className="mt-5 flex justify-between border-t border-slate-100 pt-4">

                  <span className="text-sm text-slate-500">
                    Variance
                  </span>

                  <span className="text-sm font-semibold text-slate-800">
                    {workVarianceMinutes >= 0
                      ? "+"
                      : "-"}

                    {formatMinutes(
                      Math.abs(
                        workVarianceMinutes
                      )
                    )}
                  </span>

                </div>

              </div>

            </div>


            {/* ATTENDANCE VS LOGGED */}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

              <h2 className="text-lg font-semibold text-slate-900">
                Attendance vs Logged Work
              </h2>


              <div className="mt-6 space-y-3">

                <div className="flex justify-between rounded-xl bg-slate-50 p-4">

                  <span className="text-sm text-slate-500">
                    Attendance
                  </span>

                  <strong>
                    {formatSeconds(
                      attendanceSeconds
                    )}
                  </strong>

                </div>


                <div className="flex justify-between rounded-xl bg-slate-50 p-4">

                  <span className="text-sm text-slate-500">
                    Logged Work
                  </span>

                  <strong>
                    {formatMinutes(
                      loggedMinutes
                    )}
                  </strong>

                </div>


                <div className="flex justify-between border-t border-slate-100 pt-4">

                  <span className="text-sm text-slate-500">
                    Difference
                  </span>

                  <span className="text-sm font-semibold">
                    {attendanceVarianceMinutes >= 0
                      ? "+"
                      : "-"}

                    {formatMinutes(
                      Math.abs(
                        attendanceVarianceMinutes
                      )
                    )}
                  </span>

                </div>

              </div>

            </div>

          </section>


          {/* =================================================
              PHASE 5.2
              PROJECT-WISE REPORT
          ================================================= */}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">

              <div>

                <h2 className="text-lg font-semibold text-slate-900">
                  Project-wise Breakdown
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  See how your logged time is distributed
                  across projects.
                </p>

              </div>


              <div className="text-left sm:text-right">

                <p className="text-xs text-slate-500">
                  Total Project Time
                </p>

                <p className="text-xl font-bold text-slate-900">
                  {formatMinutes(
                    projectReport?.total_minutes ??
                      0
                  )}
                </p>

              </div>

            </div>


            {/* PROJECT LIST */}

            {projects.length > 0 ? (

              <div className="mt-6 space-y-4">

                {projects.map(
                  (project) => (
                    <ProjectRow
                      key={project.project_id}
                      project={project}
                    />
                  )
                )}

              </div>

            ) : (

              <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center">

                <BriefcaseBusiness
                  size={32}
                  className="mx-auto text-slate-400"
                />

                <h3 className="mt-3 font-semibold text-slate-800">
                  No project activity
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  No time entries were found for
                  projects in this date range.
                </p>

              </div>

            )}

          </section>


          {/* BILLABLE BREAKDOWN */}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex justify-between gap-4">

              <div>

                <h2 className="text-lg font-semibold text-slate-900">
                  Billable Breakdown
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Distribution of logged work.
                </p>

              </div>


              <p className="text-2xl font-bold text-slate-900">
                {billablePercentage}%
              </p>

            </div>


            <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">

              <div
                className="h-full rounded-full bg-slate-800"
                style={{
                  width: `${billablePercentage}%`,
                }}
              />

            </div>


            <div className="mt-5 grid gap-4 sm:grid-cols-2">

              <div className="rounded-xl border border-slate-200 p-4">

                <p className="text-sm text-slate-500">
                  Billable
                </p>

                <p className="mt-1 text-xl font-bold text-slate-900">
                  {formatMinutes(
                    billableMinutes
                  )}
                </p>

              </div>


              <div className="rounded-xl border border-slate-200 p-4">

                <p className="text-sm text-slate-500">
                  Non-Billable
                </p>

                <p className="mt-1 text-xl font-bold text-slate-900">
                  {formatMinutes(
                    nonBillableMinutes
                  )}
                </p>

              </div>

            </div>

          </section>
        </>
      )}

    </div>
  );
}

export default ReportsPage;