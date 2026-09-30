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
  Download,
  FileText,
  RefreshCw,
  WalletCards,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { projectService } from "../services/projectService";
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

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(rows, filename) {
  const content = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${content}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
  const { isManager, isAdmin } = useAuth();
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

  const [memberReport, setMemberReport] = useState([]);
  const [dailyReport, setDailyReport] = useState([]);
  const [attendanceReport, setAttendanceReport] = useState([]);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [billable, setBillable] = useState("");
  const [optionsError, setOptionsError] = useState("");

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
          const filters = {
            periodStart,
            periodEnd,
            projectId,
            userId,
            billable,
          };
          const [
            summaryData,
            projectData,
            memberData,
            dailyData,
            attendanceData,
          ] = await Promise.all([
            reportService.getSummary(filters),
            reportService.getProjects(filters),
            reportService.getMembers(filters),
            reportService.getDaily(filters),
            reportService.getAttendance(filters),
          ]);

          setReport(summaryData);
          setProjectReport(projectData);
          setMemberReport(memberData);
          setDailyReport(dailyData);
          setAttendanceReport(attendanceData);

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
        projectId,
        userId,
        billable,
      ]
    );

  const loadFilterOptions = useCallback(async () => {
    setOptionsError("");
    try {
      const projectData = await projectService.getAll({ activeOnly: false });
      setAvailableProjects(Array.isArray(projectData) ? projectData : []);

      if (isManager || isAdmin) {
        const members = await reportService.getMembers({
          periodStart,
          periodEnd,
          projectId: "",
          userId: "",
          billable: "",
        });
        setAvailableUsers(members);
      }
    } catch (requestError) {
      console.error("Failed to load report filter options:", requestError);
      setOptionsError(
        requestError.message || "Unable to load report filter options."
      );
    }
  }, [isAdmin, isManager, periodStart, periodEnd]);


  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);


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
    report?.variance_minutes ??
    loggedMinutes - attendanceMinutes;


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

  const attendanceByUserId = new Map(
    attendanceReport.map((member) => [member.user_id, member])
  );
  const downloadReport = () => {
    const rows = [
      ["Section", "Date", "Member", "Project", "Logged minutes", "Attendance seconds", "Variance minutes", "Entries"],
      ...dailyReport.map((day) => [
        "Daily",
        day.work_date,
        "",
        "",
        day.logged_minutes,
        day.attendance_seconds,
        day.variance_minutes,
        "",
      ]),
      ...projects.map((project) => [
        "Project",
        "",
        "",
        project.project_name,
        project.total_minutes,
        "",
        "",
        project.entry_count,
      ]),
      ...memberReport.map((member) => {
        const attendance = attendanceByUserId.get(member.user_id);
        return [
        "Member",
        "",
        `${member.full_name} (${member.email})`,
        "",
        member.logged_minutes,
        attendance?.attendance_seconds ?? 0,
        attendance?.variance_minutes ?? member.logged_minutes,
        member.entry_count,
        ];
      }),
    ];
    downloadCsv(rows, `timesheet-report_${periodStart}_${periodEnd}.csv`);
  };

  const dailyMaxMinutes = Math.max(
    1,
    ...dailyReport.flatMap((day) => [
      day.logged_minutes,
      Math.floor(day.attendance_seconds / 60),
    ])
  );
  const comparisonMaxMinutes = Math.max(
    1,
    ...memberReport.flatMap((member) => [
      member.logged_minutes,
      Math.floor((attendanceByUserId.get(member.user_id)?.attendance_seconds ?? 0) / 60),
    ])
  );

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


        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadReport}
            disabled={!report || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button
            type="button"
            onClick={loadReports}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

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

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="report-project">
              Project
            </label>
            <select
              id="report-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All projects</option>
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}{project.code ? ` (${project.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          {(isManager || isAdmin) && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="report-member">
                Team member
              </label>
              <select
                id="report-member"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">All accessible members</option>
                {availableUsers.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name} ({member.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="report-billable">
              Billable status
            </label>
            <select
              id="report-billable"
              value={billable}
              onChange={(event) => setBillable(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All entries</option>
              <option value="true">Billable only</option>
              <option value="false">Non-billable only</option>
            </select>
          </div>
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

      {optionsError && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle size={20} className="mt-0.5 text-amber-600" />
          <p className="text-sm text-amber-800">{optionsError}</p>
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

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Daily logged-time trend</h2>
              <p className="mt-1 text-sm text-slate-500">Daily time entries with attendance comparison.</p>
              <div className="mt-4 flex gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-600" />Logged</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" />Attendance</span>
              </div>
              <div className="mt-6 space-y-3">
                {dailyReport.map((day) => (
                  <div key={day.work_date} className="grid grid-cols-[5rem_1fr_auto] items-center gap-3">
                    <span className="text-xs text-slate-500">{formatDisplayDate(day.work_date)}</span>
                    <div className="space-y-1.5">
                      <div
                        className="h-2 overflow-hidden rounded-full bg-slate-100"
                        role="img"
                        aria-label={`${formatDisplayDate(day.work_date)}: ${formatMinutes(day.logged_minutes)} logged`}
                      >
                        <div
                          className="h-full rounded-full bg-indigo-600"
                          style={{ width: `${(day.logged_minutes / dailyMaxMinutes) * 100}%` }}
                        />
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-slate-100"
                        role="img"
                        aria-label={`${formatDisplayDate(day.work_date)}: ${formatSeconds(day.attendance_seconds)} attendance`}
                      >
                        <div
                          className="h-full rounded-full bg-emerald-600"
                          style={{ width: `${((day.attendance_seconds / 60) / dailyMaxMinutes) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-right text-xs font-semibold text-slate-700">
                      {formatMinutes(day.logged_minutes)}<br />
                      {formatSeconds(day.attendance_seconds)}
                    </span>
                  </div>
                ))}
                {dailyReport.length === 0 && (
                  <p className="text-sm text-slate-500">No daily data for this period.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Member logged vs attendance</h2>
              <p className="mt-1 text-sm text-slate-500">Attendance remains unfiltered by project and billable status.</p>
              <div className="mt-6 space-y-5">
                {memberReport.map((member) => {
                  const attendance = attendanceByUserId.get(member.user_id);
                  const memberAttendance = Math.floor((attendance?.attendance_seconds ?? 0) / 60);
                  return (
                    <div key={member.user_id}>
                      <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-800">{member.full_name}</span>
                        <span className="text-slate-500">
                          Logged {formatMinutes(member.logged_minutes)} · Attendance {formatMinutes(memberAttendance)}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <div
                          className="h-2 overflow-hidden rounded-full bg-slate-100"
                          role="img"
                          aria-label={`${member.full_name}: ${formatMinutes(member.logged_minutes)} logged`}
                        >
                          <div
                            className="h-full rounded-full bg-indigo-600"
                            style={{ width: `${(member.logged_minutes / comparisonMaxMinutes) * 100}%` }}
                          />
                        </div>
                        <div
                          className="h-2 overflow-hidden rounded-full bg-slate-100"
                          role="img"
                          aria-label={`${member.full_name}: ${formatMinutes(memberAttendance)} attendance`}
                        >
                          <div
                            className="h-full rounded-full bg-emerald-600"
                            style={{ width: `${(memberAttendance / comparisonMaxMinutes) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {memberReport.length === 0 && (
                  <p className="text-sm text-slate-500">No member data for this period.</p>
                )}
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