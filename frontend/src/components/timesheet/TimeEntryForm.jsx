import {
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  Link2,
  Plus,
  RefreshCw,
  Save,
  X,
} from "lucide-react";

import { projectService } from "../../services/projectService";
import { taskService } from "../../services/taskService";
import { timeEntryService } from "../../services/timeEntryService";


function TimeEntryForm({
  onClose,
  onSaved,
  initialDate = null,
  entry = null,
}) {
  const isEditing = Boolean(entry);

  const [projects, setProjects] =
    useState([]);

  const [tasks, setTasks] =
    useState([]);

  const [loadingProjects, setLoadingProjects] =
    useState(true);

  const [loadingTasks, setLoadingTasks] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");


  // =====================================================
  // FORM STATE
  // =====================================================

  const [form, setForm] =
    useState(() =>
      createInitialForm(
        entry,
        initialDate
      )
    );

  const [codeLinks, setCodeLinks] =
    useState(() =>
      createInitialCodeLinks(entry)
    );


  // =====================================================
  // LOAD PROJECTS
  // =====================================================

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      setLoadingProjects(true);

      try {
        const data =
          await projectService.getAll({
            activeOnly: false,
          });

        if (!cancelled) {
          setProjects(
            Array.isArray(data)
              ? data
              : []
          );
        }
      } catch (requestError) {
        console.error(
          "Failed to load projects:",
          requestError
        );

        if (!cancelled) {
          setError(
            requestError.message ||
              "Unable to load projects."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProjects(false);
        }
      }
    }

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, []);


  // =====================================================
  // LOAD TASKS FOR SELECTED PROJECT
  // =====================================================

  useEffect(() => {
    if (!form.project_id) {
      setTasks([]);
      return;
    }

    let cancelled = false;

    async function loadTasks() {
      setLoadingTasks(true);

      try {
        const data =
          await taskService.getAll({
            projectId:
              form.project_id,

            activeOnly: true,
          });

        if (!cancelled) {
          setTasks(
            Array.isArray(data)
              ? data
              : []
          );
        }
      } catch (requestError) {
        console.error(
          "Failed to load tasks:",
          requestError
        );

        if (!cancelled) {
          setTasks([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingTasks(false);
        }
      }
    }

    loadTasks();

    return () => {
      cancelled = true;
    };
  }, [form.project_id]);


  // =====================================================
  // INPUT CHANGE
  // =====================================================

  function handleChange(event) {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setForm((previous) => ({
      ...previous,

      [name]:
        type === "checkbox"
          ? checked
          : value,

      ...(name === "project_id"
        ? {
            task_id: "",
          }
        : {}),
    }));
  }


  // =====================================================
  // CODE LINKS
  // =====================================================

  function changeLink(
    index,
    value
  ) {
    setCodeLinks((current) =>
      current.map(
        (link, currentIndex) =>
          currentIndex === index
            ? value
            : link
      )
    );
  }


  function addLink() {
    setCodeLinks((current) => [
      ...current,
      "",
    ]);
  }


  function removeLink(index) {
    setCodeLinks((current) => {
      const updated =
        current.filter(
          (_, currentIndex) =>
            currentIndex !== index
        );

      return updated.length > 0
        ? updated
        : [""];
    });
  }


  // =====================================================
  // SUBMIT
  // =====================================================

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");

    // ---------------------------------------------------
    // Date validation
    // ---------------------------------------------------

    if (!form.work_date) {
      setError(
        "Please select a work date."
      );

      return;
    }

    if (
      isFutureDate(
        form.work_date
      )
    ) {
      setError(
        "You cannot add a time entry for a future date."
      );

      return;
    }


    // ---------------------------------------------------
    // Project validation
    // ---------------------------------------------------

    if (!form.project_id) {
      setError(
        "Please select a project."
      );

      return;
    }


    // ---------------------------------------------------
    // Duration validation
    // ---------------------------------------------------

    const hours =
      Number(
        form.duration_hours || 0
      );

    const minutes =
      Number(
        form.duration_minutes || 0
      );

    if (
      hours < 0 ||
      minutes < 0 ||
      minutes > 59
    ) {
      setError(
        "Please enter a valid duration."
      );

      return;
    }

    const durationMinutes =
      hours * 60 + minutes;

    if (
      durationMinutes < 1 ||
      durationMinutes > 1440
    ) {
      setError(
        "Duration must be between 1 minute and 24 hours."
      );

      return;
    }


    // ---------------------------------------------------
    // Code links
    // ---------------------------------------------------

    const cleanLinks =
      codeLinks
        .map((link) =>
          link.trim()
        )
        .filter(Boolean);

    for (const link of cleanLinks) {
      if (!isValidUrl(link)) {
        setError(
          "Please enter a valid code link URL."
        );

        return;
      }
    }


    // ---------------------------------------------------
    // Save
    // ---------------------------------------------------

    setSaving(true);

    try {
      const commonPayload = {
        work_date:
          form.work_date,

        project_id:
          form.project_id,

        task_id:
          form.task_id || null,

        description:
          form.description.trim(),

        duration_minutes:
          durationMinutes,

        billable:
          form.billable,

        code_links:
          cleanLinks.map(
            (url) => ({
              url,
              link_type: "other",
              repo: null,
              ref: null,
              number: null,
              note: null,
            })
          ),
      };


      let savedEntry;


      // -------------------------------------------------
      // EDIT
      // -------------------------------------------------

      if (isEditing) {
        savedEntry =
          await timeEntryService.update(
            entry.id,
            {
              version:
                entry.version,

              ...commonPayload,
            }
          );
      }


      // -------------------------------------------------
      // CREATE
      // -------------------------------------------------

      else {
        savedEntry =
          await timeEntryService.create({
            ...commonPayload,

            client_idempotency_key:
              createIdempotencyKey(),
          });
      }


      /*
       * Parent can reload the Today page
       * or Timesheet page after save.
       */
      await onSaved?.(
        savedEntry
      );

      onClose?.();

    } catch (requestError) {
      console.error(
        "Failed to save time entry:",
        requestError
      );

      setError(
        requestError.message ||
          "Unable to save time entry."
      );

    } finally {
      setSaving(false);
    }
  }


  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40">

      <div className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-white shadow-2xl">


        {/* ==========================================
            HEADER
        ========================================== */}

        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">

          <div>

            <h2 className="text-lg font-bold text-slate-900">

              {isEditing
                ? "Edit Time Entry"
                : "Add Time Entry"}

            </h2>

            <p className="mt-1 text-sm text-slate-500">

              {isEditing
                ? "Update your logged work."
                : "Log the work you completed."}

            </p>

          </div>


          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 disabled:opacity-50"
          >
            <X size={20} />
          </button>

        </div>


        {/* ==========================================
            FORM
        ========================================== */}

        <form
          onSubmit={handleSubmit}
          className="space-y-6 p-6"
        >


          {/* ERROR */}

          {error && (

            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">

              <AlertCircle
                size={18}
                className="mt-0.5 shrink-0 text-red-600"
              />

              <p className="text-sm text-red-700">
                {error}
              </p>

            </div>

          )}


          {/* ========================================
              WORK DATE
          ======================================== */}

          <div>

            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Work date *
            </label>

            <input
              type="date"
              name="work_date"
              value={form.work_date}
              max={getTodayDateString()}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />

            <p className="mt-1.5 text-xs text-slate-400">
              Future dates are not allowed.
            </p>

          </div>


          {/* ========================================
              PROJECT
          ======================================== */}

          <div>

            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Project *
            </label>

            <select
              required
              name="project_id"
              value={form.project_id}
              onChange={handleChange}
              disabled={
                loadingProjects
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
            >

              <option value="">

                {loadingProjects
                  ? "Loading projects..."
                  : "Select project"}

              </option>


              {projects.map(
                (project) => (

                  <option
                    key={project.id}
                    value={project.id}
                  >

                    {project.name}

                    {project.code
                      ? ` (${project.code})`
                      : ""}

                  </option>

                )
              )}

            </select>

          </div>


          {/* ========================================
              TASK
          ======================================== */}

          <div>

            <label className="mb-2 block text-sm font-semibold text-slate-700">

              Task

              <span className="ml-1 font-normal text-slate-400">
                Optional
              </span>

            </label>


            <select
              name="task_id"
              value={form.task_id}
              onChange={handleChange}
              disabled={
                !form.project_id ||
                loadingTasks
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
            >

              <option value="">

                {!form.project_id
                  ? "Select a project first"
                  : loadingTasks
                    ? "Loading tasks..."
                    : "No task selected"}

              </option>


              {tasks.map(
                (task) => (

                  <option
                    key={task.id}
                    value={task.id}
                  >

                    {task.title}

                  </option>

                )
              )}

            </select>

          </div>


          {/* ========================================
              DESCRIPTION
          ======================================== */}

          <div>

            <div className="mb-2 flex items-center justify-between">

              <label className="text-sm font-semibold text-slate-700">
                Description
              </label>

              <span className="text-xs text-slate-400">
                {form.description.length}/5000
              </span>

            </div>


            <textarea
              name="description"
              rows={5}
              maxLength={5000}
              value={form.description}
              onChange={handleChange}
              placeholder="Describe what you worked on..."
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />

          </div>


          {/* ========================================
              DURATION
          ======================================== */}

          <div>

            <label className="mb-3 block text-sm font-semibold text-slate-700">
              Duration *
            </label>


            {/* QUICK SELECT */}

            <div className="mb-4 flex flex-wrap gap-2">

              {[
                {
                  label: "15m",
                  minutes: 15,
                },
                {
                  label: "30m",
                  minutes: 30,
                },
                {
                  label: "1h",
                  minutes: 60,
                },
                {
                  label: "2h",
                  minutes: 120,
                },
                {
                  label: "4h",
                  minutes: 240,
                },
              ].map((option) => (

                <button
                  key={option.minutes}
                  type="button"
                  onClick={() =>
                    setDurationFromMinutes(
                      option.minutes,
                      setForm
                    )
                  }
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                >

                  {option.label}

                </button>

              ))}

            </div>


            {/* CUSTOM HOURS + MINUTES */}

            <div className="grid grid-cols-2 gap-3">

              <div>

                <input
                  type="number"
                  name="duration_hours"
                  min="0"
                  max="24"
                  value={
                    form.duration_hours
                  }
                  onChange={handleChange}
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />

                <p className="mt-1 text-xs text-slate-400">
                  Hours
                </p>

              </div>


              <div>

                <input
                  type="number"
                  name="duration_minutes"
                  min="0"
                  max="59"
                  value={
                    form.duration_minutes
                  }
                  onChange={handleChange}
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />

                <p className="mt-1 text-xs text-slate-400">
                  Minutes
                </p>

              </div>

            </div>

          </div>


          {/* ========================================
              CODE LINKS
          ======================================== */}

          <div>

            <label className="mb-2 block text-sm font-semibold text-slate-700">

              Code links

              <span className="ml-1 font-normal text-slate-400">
                Optional
              </span>

            </label>


            <p className="mb-3 text-xs leading-5 text-slate-500">
              Add GitHub commits, pull requests,
              branches or other related URLs.
            </p>


            <div className="space-y-2">

              {codeLinks.map(
                (link, index) => (

                  <div
                    key={index}
                    className="flex gap-2"
                  >

                    <div className="relative flex-1">

                      <Link2
                        size={16}
                        className="absolute left-3 top-3 text-slate-400"
                      />

                      <input
                        type="url"
                        value={link}
                        onChange={(event) =>
                          changeLink(
                            index,
                            event.target.value
                          )
                        }
                        placeholder="https://github.com/..."
                        className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      />

                    </div>


                    <button
                      type="button"
                      onClick={() =>
                        removeLink(index)
                      }
                      className="rounded-lg border border-slate-200 px-3 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                      title="Remove link"
                    >
                      <X size={16} />
                    </button>

                  </div>

                )
              )}

            </div>


            <button
              type="button"
              onClick={addLink}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >

              <Plus size={15} />

              Add another link

            </button>

          </div>


          {/* ========================================
              BILLABLE
          ======================================== */}

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-4">

            <div>

              <p className="text-sm font-semibold text-slate-700">
                Billable
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Count this time as billable work.
              </p>

            </div>


            <input
              type="checkbox"
              name="billable"
              checked={form.billable}
              onChange={handleChange}
              className="h-4 w-4 accent-indigo-600"
            />

          </label>


          {/* ========================================
              ACTION BUTTONS
          ======================================== */}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>


            <button
              type="submit"
              disabled={
                saving ||
                loadingProjects
              }
              className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >

              {saving ? (

                <RefreshCw
                  size={17}
                  className="animate-spin"
                />

              ) : (

                <Save size={17} />

              )}

              {saving
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Save Entry"}

            </button>

          </div>

        </form>

      </div>

    </div>
  );
}


// =========================================================
// INITIAL FORM
// =========================================================

function createInitialForm(
  entry,
  initialDate
) {
  if (entry) {
    const totalMinutes =
      Number(
        entry.duration_minutes || 0
      );

    return {
      work_date:
        entry.work_date,

      project_id:
        entry.project_id || "",

      task_id:
        entry.task_id || "",

      description:
        entry.description || "",

      duration_hours:
        String(
          Math.floor(
            totalMinutes / 60
          )
        ),

      duration_minutes:
        String(
          totalMinutes % 60
        ),

      billable:
        Boolean(
          entry.billable
        ),
    };
  }


  let workDate =
    initialDate
      ? normalizeDate(initialDate)
      : getTodayDateString();


  /*
   * Protect against a parent accidentally
   * passing a future day.
   */
  if (isFutureDate(workDate)) {
    workDate =
      getTodayDateString();
  }


  return {
    work_date: workDate,
    project_id: "",
    task_id: "",
    description: "",
    duration_hours: "1",
    duration_minutes: "0",
    billable: false,
  };
}


// =========================================================
// INITIAL CODE LINKS
// =========================================================

function createInitialCodeLinks(
  entry
) {
  if (
    entry?.code_links?.length
  ) {
    return entry.code_links.map(
      (link) =>
        link.url || ""
    );
  }

  return [""];
}


// =========================================================
// QUICK DURATION
// =========================================================

function setDurationFromMinutes(
  totalMinutes,
  setForm
) {
  setForm((previous) => ({
    ...previous,

    duration_hours:
      String(
        Math.floor(
          totalMinutes / 60
        )
      ),

    duration_minutes:
      String(
        totalMinutes % 60
      ),
  }));
}


// =========================================================
// DATE HELPERS
// =========================================================

function getTodayDateString() {
  return formatDate(
    new Date()
  );
}


function normalizeDate(value) {
  if (
    typeof value === "string"
  ) {
    return value;
  }

  return formatDate(value);
}


function formatDate(value) {
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


function isFutureDate(
  workDate
) {
  if (!workDate) {
    return false;
  }

  const selected =
    new Date(
      `${workDate}T00:00:00`
    );

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  return selected > today;
}


// =========================================================
// URL VALIDATION
// =========================================================

function isValidUrl(value) {
  try {
    const url =
      new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
}


// =========================================================
// IDEMPOTENCY
// =========================================================

function createIdempotencyKey() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return `time-entry-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}


export default TimeEntryForm;