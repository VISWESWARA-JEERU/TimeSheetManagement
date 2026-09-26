import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import Header from "../components/common/Header";
import EmptyState from "../components/common/EmptyState";
import TimeEntryForm from "../components/timesheet/TimeEntryForm";

import { projectService } from "../services/projectService";
import { timeEntryService } from "../services/timeEntryService";
import { timesheetService } from "../services/timesheetService";


function TimesheetPage() {
  const [weekStart, setWeekStart] = useState(
    getMonday(new Date())
  );

  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);

  const [weekSummary, setWeekSummary] =
    useState(null);

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [selectedDate, setSelectedDate] =
    useState(null);

  const [editingEntry, setEditingEntry] =
    useState(null);


  // =====================================================
  // WEEK VALUES
  // =====================================================

  const weekEnd = useMemo(() => {
    return addDays(
      weekStart,
      6
    );
  }, [weekStart]);


  const weekDays = useMemo(() => {
    return Array.from(
      { length: 7 },
      (_, index) =>
        addDays(
          weekStart,
          index
        )
    );
  }, [weekStart]);


  const weekStatus =
    weekSummary?.status || "draft";


  const weekIsFinished =
    isWeekFinished(
      weekEnd
    );


  const weekCanBeEdited =
    weekStatus === "draft" ||
    weekStatus === "rejected";


  const weekCanBeSubmitted =
    weekCanBeEdited &&
    weekIsFinished &&
    entries.length > 0;


  // =====================================================
  // PROJECT LOOKUP
  // =====================================================

  const projectMap = useMemo(() => {
    return new Map(
      projects.map((project) => [
        project.id,
        project,
      ])
    );
  }, [projects]);


  // =====================================================
  // LOAD TIMESHEET
  // =====================================================

  const loadTimesheet =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const startDate =
          formatDateInput(
            weekStart
          );

        const endDate =
          formatDateInput(
            addDays(
              weekStart,
              6
            )
          );

        const [
          projectData,
          entryData,
          summaryData,
        ] = await Promise.all([
          projectService.getAll({
            activeOnly: false,
          }),

          timeEntryService.getAll({
            startDate,
            endDate,
          }),

          timesheetService.getWeek({
            periodStart:
              startDate,

            periodEnd:
              endDate,
          }),
        ]);


        setProjects(
          Array.isArray(projectData)
            ? projectData
            : []
        );


        setEntries(
          Array.isArray(entryData)
            ? entryData
            : []
        );


        setWeekSummary(
          summaryData || null
        );

      } catch (requestError) {
        console.error(
          "Failed to load timesheet:",
          requestError
        );

        setError(
          requestError.message ||
            "Unable to load timesheet."
        );

      } finally {
        setLoading(false);
      }
    }, [weekStart]);


  useEffect(() => {
    loadTimesheet();
  }, [loadTimesheet]);


  // =====================================================
  // WEEK TOTAL
  // =====================================================

  const totalWeekMinutes =
    entries.reduce(
      (total, entry) =>
        total +
        Number(
          entry.duration_minutes || 0
        ),
      0
    );


  // =====================================================
  // OPEN CREATE FORM
  // =====================================================

  function openCreateForm(
    date = new Date()
  ) {
    if (!weekCanBeEdited) {
      setError(
        "This timesheet is locked and cannot be edited."
      );

      return;
    }

    const selected =
      new Date(date);

    const today =
      new Date();

    selected.setHours(
      0,
      0,
      0,
      0
    );

    today.setHours(
      0,
      0,
      0,
      0
    );

    if (selected > today) {
      setError(
        "You cannot add a time entry for a future date."
      );

      return;
    }

    setEditingEntry(null);

    setSelectedDate(
      formatDateInput(
        selected
      )
    );

    setShowForm(true);

    setError("");
    setMessage("");
  }


  // =====================================================
  // OPEN EDIT FORM
  // =====================================================

  function openEditForm(entry) {
    if (!weekCanBeEdited) {
      setError(
        "This timesheet is locked and cannot be edited."
      );

      return;
    }

    setEditingEntry(entry);

    setSelectedDate(
      entry.work_date
    );

    setShowForm(true);

    setError("");
    setMessage("");
  }


  // =====================================================
  // CLOSE FORM
  // =====================================================

  function closeForm() {
    setShowForm(false);

    setEditingEntry(null);

    setSelectedDate(null);
  }


  // =====================================================
  // AFTER SAVE
  // =====================================================

  async function handleEntrySaved() {
    setMessage(
      editingEntry
        ? "Time entry updated successfully."
        : "Time entry added successfully."
    );

    closeForm();

    await loadTimesheet();
  }


  // =====================================================
  // DELETE ENTRY
  // =====================================================

  async function handleDelete(entry) {
    if (!weekCanBeEdited) {
      setError(
        "This timesheet is locked and cannot be edited."
      );

      return;
    }

    if (entry.status !== "draft") {
      setError(
        "Only draft time entries can be deleted."
      );

      return;
    }

    const confirmed =
      window.confirm(
        "Delete this time entry?"
      );

    if (!confirmed) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await timeEntryService.remove(
        entry.id
      );

      setMessage(
        "Time entry deleted successfully."
      );

      await loadTimesheet();

    } catch (requestError) {
      console.error(
        "Failed to delete entry:",
        requestError
      );

      setError(
        requestError.message ||
          "Unable to delete time entry."
      );
    }
  }


  // =====================================================
  // SUBMIT WEEK
  // =====================================================

  async function handleSubmitWeek() {
    if (!weekIsFinished) {
      setError(
        "You cannot submit the timesheet before the week has ended."
      );

      return;
    }

    if (entries.length === 0) {
      setError(
        "You cannot submit an empty timesheet."
      );

      return;
    }

    if (!weekCanBeEdited) {
      setError(
        "This timesheet has already been submitted or approved."
      );

      return;
    }

    const periodStart =
      formatDateInput(
        weekStart
      );

    const periodEnd =
      formatDateInput(
        weekEnd
      );

    const confirmed =
      window.confirm(
        `Submit timesheet for ${formatWeekRange(
          weekStart,
          weekEnd
        )}?`
      );

    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      await timesheetService.submit({
        periodStart,
        periodEnd,
      });

      setMessage(
        "Timesheet submitted successfully."
      );

      await loadTimesheet();

    } catch (requestError) {
      console.error(
        "Failed to submit timesheet:",
        requestError
      );

      setError(
        requestError.message ||
          "Unable to submit timesheet."
      );

    } finally {
      setSubmitting(false);
    }
  }


  // =====================================================
  // WEEK NAVIGATION
  // =====================================================

  function previousWeek() {
    setWeekStart(
      addDays(
        weekStart,
        -7
      )
    );
  }


  function nextWeek() {
    setWeekStart(
      addDays(
        weekStart,
        7
      )
    );
  }


  function currentWeek() {
    setWeekStart(
      getMonday(
        new Date()
      )
    );
  }


  // =====================================================
  // PAGE
  // =====================================================

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">

      <Header
        title="My Timesheet"
        subtitle="Track your project and task work for the week"
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

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">

          {message}

        </div>

      )}


      {/* ==========================================
          REJECTION MESSAGE
      ========================================== */}

      {weekStatus === "rejected" &&
        weekSummary?.period?.comment && (

          <div className="rounded-xl border border-red-200 bg-red-50 p-4">

            <p className="text-sm font-semibold text-red-800">
              Changes requested
            </p>

            <p className="mt-1 text-sm text-red-700">
              {weekSummary.period.comment}
            </p>

          </div>

        )}


      {/* ==========================================
          WEEK HEADER
      ========================================== */}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">

          <div>

            <p className="text-sm font-medium text-slate-500">
              Selected week
            </p>

            <div className="mt-1 flex items-center gap-2">

              <CalendarDays
                size={20}
                className="text-slate-500"
              />

              <h2 className="text-lg font-bold text-slate-900">

                {formatWeekRange(
                  weekStart,
                  weekEnd
                )}

              </h2>

            </div>

          </div>


          <div className="flex flex-wrap items-center gap-2">

            <button
              type="button"
              onClick={previousWeek}
              className="rounded-lg border border-slate-300 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50"
              title="Previous week"
            >
              <ChevronLeft size={18} />
            </button>


            <button
              type="button"
              onClick={currentWeek}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              This week
            </button>


            <button
              type="button"
              onClick={nextWeek}
              className="rounded-lg border border-slate-300 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50"
              title="Next week"
            >
              <ChevronRight size={18} />
            </button>


            <button
              type="button"
              onClick={loadTimesheet}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="Refresh"
            >

              <RefreshCw
                size={18}
                className={
                  loading
                    ? "animate-spin"
                    : ""
                }
              />

            </button>


            {weekCanBeEdited && (

              <button
                type="button"
                onClick={() =>
                  openCreateForm(
                    new Date()
                  )
                }
                disabled={
                  !isDateInsideWeek(
                    new Date(),
                    weekStart,
                    weekEnd
                  )
                }
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >

                <Plus size={17} />

                Add entry

              </button>

            )}


            {weekCanBeEdited && (

              <button
                type="button"
                onClick={handleSubmitWeek}
                disabled={
                  submitting ||
                  !weekCanBeSubmitted
                }
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  !weekIsFinished
                    ? "The week must end before it can be submitted"
                    : entries.length === 0
                      ? "Add at least one time entry before submitting"
                      : "Submit this week for manager approval"
                }
              >

                {submitting ? (

                  <RefreshCw
                    size={17}
                    className="animate-spin"
                  />

                ) : (

                  <Check size={17} />

                )}

                {submitting
                  ? "Submitting..."
                  : weekStatus === "rejected"
                    ? "Resubmit Week"
                    : weekIsFinished
                      ? "Submit Week"
                      : "Week in progress"}

              </button>

            )}

          </div>

        </div>

      </section>


      {/* ==========================================
          SUMMARY
      ========================================== */}

      <section className="grid gap-4 sm:grid-cols-3">

        {/* LOGGED TIME */}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

          <p className="text-sm font-medium text-slate-500">
            Weekly logged time
          </p>

          <div className="mt-2 flex items-center gap-2">

            <Clock
              size={22}
              className="text-indigo-600"
            />

            <p className="text-2xl font-bold text-slate-900">

              {formatMinutes(
                totalWeekMinutes
              )}

            </p>

          </div>

        </div>


        {/* ENTRY COUNT */}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

          <p className="text-sm font-medium text-slate-500">
            Time entries
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {entries.length}
          </p>

        </div>


        {/* STATUS */}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

          <p className="text-sm font-medium text-slate-500">
            Week status
          </p>

          <div className="mt-2">

            <StatusBadge
              status={weekStatus}
            />

          </div>

          {weekStatus === "submitted" && (

            <p className="mt-2 text-xs text-slate-500">
              Waiting for manager review.
            </p>

          )}


          {weekStatus === "approved" && (

            <p className="mt-2 text-xs text-emerald-600">
              This week has been approved.
            </p>

          )}


          {weekStatus === "rejected" && (

            <p className="mt-2 text-xs text-red-600">
              Update the entries and resubmit.
            </p>

          )}

        </div>

      </section>


      {/* ==========================================
          DAYS
      ========================================== */}

      {loading ? (

        <TimesheetSkeleton />

      ) : (

        <section className="space-y-4">

          {weekDays.map((day) => {

            const dateString =
              formatDateInput(
                day
              );

            const dayEntries =
              entries.filter(
                (entry) =>
                  entry.work_date ===
                  dateString
              );

            const dayTotal =
              dayEntries.reduce(
                (total, entry) =>
                  total +
                  Number(
                    entry.duration_minutes ||
                      0
                  ),
                0
              );

            return (

              <DaySection
                key={dateString}
                day={day}
                entries={dayEntries}
                totalMinutes={dayTotal}
                projectMap={projectMap}
                weekStatus={weekStatus}
                onAdd={() =>
                  openCreateForm(
                    day
                  )
                }
                onEdit={openEditForm}
                onDelete={handleDelete}
              />

            );

          })}

        </section>

      )}


      {/* ==========================================
          TIME ENTRY FORM
      ========================================== */}

      {showForm && (

        <TimeEntryForm
          entry={editingEntry}
          initialDate={selectedDate}
          onClose={closeForm}
          onSaved={handleEntrySaved}
        />

      )}

    </div>
  );
}


// =========================================================
// DAY SECTION
// =========================================================

function DaySection({
  day,
  entries,
  totalMinutes,
  projectMap,
  weekStatus,
  onAdd,
  onEdit,
  onDelete,
}) {
  const today =
    formatDateInput(day) ===
    formatDateInput(
      new Date()
    );

  const todayDate =
    new Date();

  todayDate.setHours(
    0,
    0,
    0,
    0
  );

  const dayDate =
    new Date(day);

  dayDate.setHours(
    0,
    0,
    0,
    0
  );

  const isFutureDay =
    dayDate > todayDate;


  const weekEditable =
    weekStatus === "draft" ||
    weekStatus === "rejected";


  const canAdd =
    !isFutureDay &&
    weekEditable;


  return (

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4">

        <div>

          <div className="flex items-center gap-2">

            <h2 className="font-bold text-slate-900">
              {formatDay(day)}
            </h2>


            {today && (

              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                Today
              </span>

            )}

          </div>


          <p className="mt-1 text-xs text-slate-500">

            {formatMinutes(
              totalMinutes
            )} logged

          </p>

        </div>


        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >

          <Plus size={15} />

          {isFutureDay
            ? "Future"
            : !weekEditable
              ? "Locked"
              : "Add"}

        </button>

      </div>


      {entries.length === 0 ? (

        <div className="p-5">

          <EmptyState
            title={
              isFutureDay
                ? "Future day"
                : "No time logged"
            }
            description={
              isFutureDay
                ? "Time entries cannot be added for future dates."
                : !weekEditable
                  ? "This timesheet is locked."
                  : "No work entries have been recorded for this day."
            }
          />

        </div>

      ) : (

        <div className="divide-y divide-slate-100">

          {entries.map((entry) => {

            const project =
              projectMap.get(
                entry.project_id
              );


            const canEdit =
              weekEditable &&
              entry.status === "draft";


            return (

              <div
                key={entry.id}
                className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center"
              >

                <div className="min-w-0">

                  <div className="flex flex-wrap items-center gap-2">

                    <p className="font-semibold text-slate-900">

                      {project?.name ||
                        "Project"}

                    </p>


                    <StatusBadge
                      status={entry.status}
                    />


                    {entry.billable && (

                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        Billable
                      </span>

                    )}

                  </div>


                  {entry.task_title_snapshot && (

                    <p className="mt-1 text-sm font-medium text-slate-600">

                      {entry.task_title_snapshot}

                    </p>

                  )}


                  {entry.description && (

                    <p className="mt-2 text-sm leading-6 text-slate-500">

                      {entry.description}

                    </p>

                  )}

                </div>


                <div className="flex shrink-0 items-center gap-3">

                  <p className="min-w-20 text-right text-base font-bold text-slate-900">

                    {formatMinutes(
                      entry.duration_minutes
                    )}

                  </p>


                  {canEdit && (

                    <>

                      <button
                        type="button"
                        onClick={() =>
                          onEdit(entry)
                        }
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-indigo-600"
                        title="Edit"
                      >

                        <Edit3 size={16} />

                      </button>


                      <button
                        type="button"
                        onClick={() =>
                          onDelete(entry)
                        }
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >

                        <Trash2 size={16} />

                      </button>

                    </>

                  )}

                </div>

              </div>

            );

          })}

        </div>

      )}

    </section>

  );
}


// =========================================================
// STATUS BADGE
// =========================================================

function StatusBadge({
  status,
}) {
  const normalized =
    status?.toLowerCase();

  let style =
    "bg-slate-100 text-slate-600";

  if (normalized === "draft") {
    style =
      "bg-amber-50 text-amber-700";
  }

  if (normalized === "submitted") {
    style =
      "bg-blue-50 text-blue-700";
  }

  if (normalized === "approved") {
    style =
      "bg-emerald-50 text-emerald-700";
  }

  if (normalized === "rejected") {
    style =
      "bg-red-50 text-red-700";
  }

  return (

    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style}`}
    >
      {status || "draft"}
    </span>

  );
}


// =========================================================
// LOADING
// =========================================================

function TimesheetSkeleton() {
  return (

    <div className="space-y-4">

      {[1, 2, 3].map(
        (item) => (

          <div
            key={item}
            className="h-36 animate-pulse rounded-2xl bg-slate-200"
          />

        )
      )}

    </div>

  );
}


// =========================================================
// GET MONDAY
// =========================================================

function getMonday(value) {
  const date =
    new Date(value);

  date.setHours(
    0,
    0,
    0,
    0
  );

  const day =
    date.getDay();

  const difference =
    day === 0
      ? -6
      : 1 - day;

  date.setDate(
    date.getDate() +
      difference
  );

  return date;
}


// =========================================================
// ADD DAYS
// =========================================================

function addDays(
  value,
  days
) {
  const date =
    new Date(value);

  date.setDate(
    date.getDate() +
      days
  );

  return date;
}


// =========================================================
// FORMAT DATE
// =========================================================

function formatDateInput(value) {
  const date =
    new Date(value);

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}


// =========================================================
// FORMAT DAY
// =========================================================

function formatDay(value) {
  return new Intl.DateTimeFormat(
    undefined,
    {
      weekday: "long",
      day: "numeric",
      month: "short",
    }
  ).format(value);
}


// =========================================================
// FORMAT WEEK
// =========================================================

function formatWeekRange(
  start,
  end
) {
  const startText =
    new Intl.DateTimeFormat(
      undefined,
      {
        day: "numeric",
        month: "short",
      }
    ).format(start);

  const endText =
    new Intl.DateTimeFormat(
      undefined,
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    ).format(end);

  return `${startText} – ${endText}`;
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
      Number(totalMinutes) || 0
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
// WEEK FINISHED
// =========================================================

function isWeekFinished(
  weekEnd
) {
  const end =
    new Date(weekEnd);

  const today =
    new Date();

  end.setHours(
    0,
    0,
    0,
    0
  );

  today.setHours(
    0,
    0,
    0,
    0
  );

  return end <= today;
}


// =========================================================
// DATE INSIDE WEEK
// =========================================================

function isDateInsideWeek(
  value,
  start,
  end
) {
  const date =
    new Date(value);

  const startDate =
    new Date(start);

  const endDate =
    new Date(end);

  date.setHours(
    0,
    0,
    0,
    0
  );

  startDate.setHours(
    0,
    0,
    0,
    0
  );

  endDate.setHours(
    0,
    0,
    0,
    0
  );

  return (
    date >= startDate &&
    date <= endDate
  );
}


export default TimesheetPage;