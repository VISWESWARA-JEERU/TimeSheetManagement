import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  ListTodo,
  Pencil,
  RefreshCw,
  Save,
  UserRound,
  X,
} from "lucide-react";

import Header from "../components/common/Header";
import EmptyState from "../components/common/EmptyState";

import { useAuth } from "../context/AuthContext";
import { projectService } from "../services/projectService";
import { taskService } from "../services/taskService";


// =========================================================
// HELPERS
// =========================================================

function getStatusStyle(status) {
  const normalized = String(
    status || ""
  ).toLowerCase();

  if (normalized === "done") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (
    normalized === "in progress" ||
    normalized === "in_progress"
  ) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (normalized === "todo") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}


function formatValue(value) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function getSyncLabel(syncState) {
  const labels = {
    synced: "Synced",
    pending_push: "Pending push",
    conflict: "Conflict",
    error: "Sync error",
  };
  return labels[syncState] || formatValue(syncState);
}


function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}


// =========================================================
// TASK CARD
// =========================================================

function TaskCard({
  task,
  projectName,
  onView,
}) {
  const isGithub =
    String(task.source || "")
      .toLowerCase() === "github";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">

        <div className="min-w-0">

          <div className="flex flex-wrap items-center gap-2">

            <h3 className="font-semibold text-slate-900">
              {task.title}
            </h3>

            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyle(
                task.status
              )}`}
            >
              {task.status || "Todo"}
            </span>

          </div>


          <p className="mt-1 text-xs font-medium text-slate-500">
            {projectName || "Unknown Project"}
          </p>


          {task.description && (
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
              {task.description}
            </p>
          )}

        </div>


        <button
          type="button"
          onClick={() =>
            onView(task.id)
          }
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          View Details
        </button>

      </div>


      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">

        {/* SOURCE */}

        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600">

          {isGithub ? (
            <GitBranch size={14} />
          ) : (
            <ListTodo size={14} />
          )}

          {isGithub
            ? "GitHub"
            : "Manual"}

        </span>


        {/* STATUS */}

        <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600">
          {task.status || "Todo"}
        </span>


        {/* REPOSITORY */}

        {task.gh_repo && (
          <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
            {task.gh_repo}
          </span>
        )}


        {/* ISSUE */}

        {task.gh_issue_number != null && (
          <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
            #{task.gh_issue_number}
          </span>
        )}


        {/* SYNC */}

        {task.sync_state && (
          <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs capitalize text-slate-500">
            {getSyncLabel(task.sync_state)}
          </span>
        )}


        {/* GITHUB LINK */}

        {task.gh_url && (
          <a
            href={task.gh_url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            GitHub

            <ExternalLink size={13} />
          </a>
        )}

      </div>

    </article>
  );
}


// =========================================================
// TASK DETAIL MODAL
// =========================================================

function TaskDetailsModal({
  task,
  projectName,
  loading,
  error,
  onClose,
  canEditTask,
  canManageSync,
  onSave,
  onSyncAction,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(task?.description || "");
  const [status, setStatus] = useState(task?.status || "");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  async function saveChanges() {
    setActionLoading(true);
    setActionError("");
    setActionMessage("");
    try {
      const updated = await onSave({ description, status });
      setDescription(updated.description || "");
      setStatus(updated.status || "");
      setIsEditing(false);
    } catch (requestError) {
      setActionError(requestError.message || "Unable to save task changes.");
    } finally {
      setActionLoading(false);
    }
  }

  async function runSyncAction(action) {
    setActionLoading(true);
    setActionError("");
    setActionMessage("");
    try {
      const result = await onSyncAction(action, task.id);
      if (result.task) {
        setDescription(result.task.description || "");
        setStatus(result.task.status || "");
      }
      setActionMessage(
        result.warnings?.length
          ? result.warnings.join(" ")
          : "Synchronization completed."
      );
    } catch (requestError) {
      setActionError(requestError.message || "Unable to synchronize task.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">

      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">

        {/* HEADER */}

        <div className="flex items-start justify-between border-b border-slate-200 p-5">

          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Task Details
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Complete information for this task
            </p>
          </div>


          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={20} />
          </button>

        </div>


        {/* LOADING */}

        {loading && (
          <div className="space-y-4 p-6">

            <div className="h-6 w-2/3 animate-pulse rounded bg-slate-200" />

            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />

            <div className="h-4 w-4/5 animate-pulse rounded bg-slate-100" />

          </div>
        )}


        {/* ERROR */}

        {!loading && error && (
          <div className="m-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">

            <AlertCircle
              size={20}
              className="mt-0.5 shrink-0 text-red-600"
            />

            <p className="text-sm text-red-700">
              {error}
            </p>

          </div>
        )}


        {/* DETAILS */}

        {!loading &&
          !error &&
          task && (

          <div className="space-y-6 p-6">

            {/* TITLE */}

            <section>

              <div className="flex flex-wrap items-center gap-2">

                <h3 className="text-xl font-bold text-slate-900">
                  {task.title}
                </h3>

                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyle(
                    task.status
                  )}`}
                >
                  {task.status}
                </span>

              </div>


              <p className="mt-2 text-sm text-slate-500">
                {projectName ||
                  "Unknown Project"}
              </p>

            </section>


            {/* DESCRIPTION */}

            <section>

              <p className="text-sm font-semibold text-slate-700">
                Description
              </p>

              {isEditing ? (
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={6}
                  maxLength={50000}
                  aria-label="Task description"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {task.description || "No description provided."}
                </p>
              )}
            </section>


            {/* GENERAL */}

            <section className="grid gap-4 sm:grid-cols-2">

              <DetailItem
                label="Source"
                value={formatValue(
                  task.source
                )}
              />

              {isEditing ? (
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Status
                  </span>
                  <input
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    maxLength={200}
                    aria-label="Task status"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              ) : (
                <DetailItem label="Status" value={task.status} />
              )}

              <DetailItem
                label="Active"
                value={
                  task.is_active
                    ? "Yes"
                    : "No"
                }
              />

              <DetailItem
                label="Sync State"
                value={getSyncLabel(task.sync_state)}
              />

              <DetailItem
                label="Assignee User ID"
                value={
                  task.assignee_user_id ||
                  "Unassigned"
                }
              />

              <DetailItem
                label="Project ID"
                value={task.project_id}
              />

            </section>


            {/* GITHUB */}

            {String(
              task.source || ""
            ).toLowerCase() ===
              "github" && (

              <section>

                <div className="mb-3 flex items-center gap-2">

                  <GitBranch size={18} />

                  <h4 className="font-semibold text-slate-900">
                    GitHub Information
                  </h4>

                </div>


                <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">

                  <DetailItem
                    label="Content Type"
                    value={formatValue(
                      task.gh_content_type
                    )}
                  />

                  <DetailItem
                    label="Issue Number"
                    value={
                      task.gh_issue_number !=
                      null
                        ? `#${task.gh_issue_number}`
                        : "—"
                    }
                  />

                  <DetailItem
                    label="Repository"
                    value={
                      task.gh_repo || "—"
                    }
                  />

                  <DetailItem
                    label="GitHub Node ID"
                    value={
                      task.gh_item_node_id ||
                      "—"
                    }
                  />

                  <DetailItem
                    label="GitHub Updated"
                    value={formatDateTime(
                      task.gh_updated_at
                    )}
                  />

                  <DetailItem
                    label="Local Updated"
                    value={formatDateTime(
                      task.local_updated_at
                    )}
                  />

                </div>


                {task.gh_url && (

                  <a
                    href={task.gh_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <GitBranch size={16} />

                    Open on GitHub

                    <ExternalLink
                      size={14}
                    />
                  </a>

                )}

              </section>

            )}


            {actionError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                {actionError}
              </div>
            )}

            {actionMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                {actionMessage}
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={saveChanges}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Save size={16} />
                    {actionLoading ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDescription(task.description || "");
                      setStatus(task.status || "");
                      setIsEditing(false);
                    }}
                    disabled={actionLoading}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </>
              ) : canEditTask ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Pencil size={16} />
                  Edit
                </button>
              ) : null}

              {canManageSync &&
                String(task.source || "").toLowerCase() === "github" &&
                (task.sync_state === "conflict" ? (
                  <>
                    <div className="basis-full rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                      GitHub and local changes conflict. Choose which version to keep.
                    </div>
                    <button
                      type="button"
                      onClick={() => runSyncAction("use-github")}
                      disabled={actionLoading}
                      className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50"
                    >
                      Use GitHub
                    </button>
                    <button
                      type="button"
                      onClick={() => runSyncAction("keep-local")}
                      disabled={actionLoading}
                      className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Keep Mine
                    </button>
                  </>
                ) : ["pending_push", "error"].includes(task.sync_state) ? (
                  <button
                    type="button"
                    onClick={() => runSyncAction("push")}
                    disabled={actionLoading}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {actionLoading ? "Pushing..." : "Push to GitHub"}
                  </button>
                ) : null)}
            </div>


            {/* TIMESTAMPS */}

            <section>

              <h4 className="font-semibold text-slate-900">
                Timestamps
              </h4>


              <div className="mt-3 grid gap-4 sm:grid-cols-2">

                <DetailItem
                  label="Created At"
                  value={formatDateTime(
                    task.created_at
                  )}
                />

                <DetailItem
                  label="Updated At"
                  value={formatDateTime(
                    task.updated_at
                  )}
                />

              </div>

            </section>

          </div>
        )}

      </div>

    </div>
  );
}


function DetailItem({
  label,
  value,
}) {
  return (
    <div>

      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-medium text-slate-700">
        {value || "—"}
      </p>

    </div>
  );
}


// =========================================================
// TASKS PAGE
// =========================================================

function TasksPage() {
  const { isAdmin, isManager, user } = useAuth();
  const [
    tasks,
    setTasks,
  ] = useState([]);


  const [
    projects,
    setProjects,
  ] = useState([]);


  const [
    selectedProjectId,
    setSelectedProjectId,
  ] = useState("");


  const [
    assignedToMe,
    setAssignedToMe,
  ] = useState(false);


  const [
    activeOnly,
    setActiveOnly,
  ] = useState(true);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    projectsLoading,
    setProjectsLoading,
  ] = useState(true);


  const [
    error,
    setError,
  ] = useState("");

  const [projectSyncStatus, setProjectSyncStatus] = useState(null);
  const [syncingProject, setSyncingProject] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncSummary, setSyncSummary] = useState(null);

  // =====================================================
  // TASK DETAIL STATE
  // =====================================================

  const [
    detailsOpen,
    setDetailsOpen,
  ] = useState(false);


  const [
    selectedTask,
    setSelectedTask,
  ] = useState(null);


  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);


  const [
    detailError,
    setDetailError,
  ] = useState("");

  function changeProject(projectId) {
    setSelectedProjectId(projectId);
    setSyncSummary(null);
    setSyncError("");
  }


  // =====================================================
  // PROJECT LOOKUP
  // =====================================================

  const projectMap =
    useMemo(() => {
      return new Map(
        projects.map(
          (project) => [
            project.id,
            project,
          ]
        )
      );
    }, [projects]);


  // =====================================================
  // LOAD PROJECTS
  // =====================================================

  useEffect(() => {
    let cancelled = false;


    async function loadProjects() {
      setProjectsLoading(true);

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
          setProjectsLoading(false);
        }
      }
    }


    loadProjects();


    return () => {
      cancelled = true;
    };

  }, []);


  // =====================================================
  // LOAD TASKS
  // =====================================================

  const loadTasks =
    useCallback(
      async () => {
        setLoading(true);

        setError("");

        try {
          const data =
            await taskService.getAll({
              projectId:
                selectedProjectId ||
                null,

              assignedToMe,

              activeOnly,
            });

          setTasks(
            Array.isArray(data)
              ? data
              : []
          );

        } catch (requestError) {
          console.error(
            "Failed to load tasks:",
            requestError
          );

          setError(
            requestError.message ||
              "Unable to load tasks."
          );

          setTasks([]);

        } finally {
          setLoading(false);
        }
      },
      [
        selectedProjectId,
        assignedToMe,
        activeOnly,
      ]
    );


  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!selectedProjectId) {
      return undefined;
    }
    let cancelled = false;
    taskService.getProjectSyncStatus(selectedProjectId)
      .then((status) => {
        if (!cancelled) setProjectSyncStatus(status);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setSyncError(requestError.message || "Unable to load GitHub link status.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const currentProjectSyncStatus =
    projectSyncStatus?.project_id === selectedProjectId
      ? projectSyncStatus
      : null;


  // =====================================================
  // LOAD SINGLE TASK
  // GET /tasks/{task_id}
  // =====================================================

  async function openTaskDetails(
    taskId
  ) {
    setDetailsOpen(true);

    setSelectedTask(null);

    setDetailError("");

    setDetailLoading(true);

    try {
      const data =
        await taskService.getById(
          taskId
        );

      setSelectedTask(data);

    } catch (requestError) {
      console.error(
        "Failed to load task details:",
        requestError
      );

      setDetailError(
        requestError.message ||
          "Unable to load task details."
      );

    } finally {
      setDetailLoading(false);
    }
  }


  function closeTaskDetails() {
    setDetailsOpen(false);

    setSelectedTask(null);

    setDetailError("");
  }

  async function syncSelectedProject() {
    setSyncingProject(true);
    setSyncError("");
    setSyncSummary(null);
    try {
      const summary = await taskService.pullProject(selectedProjectId);
      setSyncSummary(summary);
      await loadTasks();
      const status = await taskService.getProjectSyncStatus(selectedProjectId);
      setProjectSyncStatus(status);
    } catch (requestError) {
      setSyncError(requestError.message || "GitHub synchronization failed.");
    } finally {
      setSyncingProject(false);
    }
  }

  async function saveTaskChanges(payload) {
    const updated = await taskService.update(selectedTask.id, payload);
    setSelectedTask(updated);
    await loadTasks();
    return updated;
  }

  async function runTaskSyncAction(action, taskId) {
    let result;
    if (action === "push") {
      result = await taskService.pushTask(taskId);
    } else if (action === "use-github") {
      result = await taskService.resolveUseGitHub(taskId);
    } else {
      result = await taskService.resolveKeepLocal(taskId);
    }
    const updated = result.task || result;
    setSelectedTask(updated);
    await loadTasks();
    return { ...result, task: updated };
  }


  // =====================================================
  // COUNTS
  // =====================================================

  const counts =
    useMemo(() => {
      let todo = 0;

      let inProgress = 0;

      let done = 0;

      tasks.forEach((task) => {
        const status = String(
          task.status || ""
        ).toLowerCase();

        if (status === "done") {
          done += 1;

        } else if (
          status === "in progress" ||
          status === "in_progress"
        ) {
          inProgress += 1;

        } else if (
          status === "todo"
        ) {
          todo += 1;
        }
      });

      return {
        todo,
        inProgress,
        done,
      };

    }, [tasks]);


  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="mx-auto max-w-7xl p-5 md:p-8">

      {/* HEADER */}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">

        <Header
          title="Tasks"
          subtitle="View tasks from your organization and GitHub-synced projects"
        />


        <div className="flex flex-wrap items-center gap-2">
        {isAdmin && selectedProjectId && currentProjectSyncStatus?.linked && (
          <button
            type="button"
            onClick={syncSelectedProject}
            disabled={syncingProject || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncingProject ? "animate-spin" : ""} />
            {syncingProject ? "Syncing..." : "Sync Now"}
          </button>
        )}
        {isAdmin && selectedProjectId && currentProjectSyncStatus && !currentProjectSyncStatus.linked && (
          <span className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-500">
            Not linked to GitHub
          </span>
        )}
        <button
          type="button"
          onClick={loadTasks}
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
        </div>

      </div>

      {syncError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {syncError}
        </div>
      )}

      {syncSummary && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Sync complete: Created {syncSummary.created}, updated {syncSummary.updated},
          conflicts {syncSummary.conflicts}, skipped {syncSummary.skipped}.
        </div>
      )}


      {/* FILTERS */}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">

          {/* PROJECT FILTER */}

          <div>

            <label
              htmlFor="task-project-filter"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Project
            </label>


            <select
              id="task-project-filter"
              value={selectedProjectId}
              disabled={projectsLoading}
              onChange={(event) => changeProject(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">
                All Projects
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


          {/* ACTIVE FILTER */}

          <div className="flex items-end">

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">

              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(event) =>
                  setActiveOnly(
                    event.target.checked
                  )
                }
                className="h-4 w-4"
              />

              Active only

            </label>

          </div>

        </div>


        {/* ALL / MY TASKS */}

        <div className="mt-4 flex flex-wrap gap-2">

          <button
            type="button"
            onClick={() =>
              setAssignedToMe(false)
            }
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              !assignedToMe
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            All Tasks
          </button>


          <button
            type="button"
            onClick={() =>
              setAssignedToMe(true)
            }
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              assignedToMe
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <UserRound size={15} />

            My Tasks
          </button>

        </div>

      </section>


      {/* ERROR */}

      {error && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">

          <AlertCircle
            size={20}
            className="mt-0.5 shrink-0 text-red-600"
          />

          <div>

            <p className="font-medium text-red-800">
              Unable to load tasks
            </p>

            <p className="mt-1 text-sm text-red-700">
              {error}
            </p>

          </div>

        </div>
      )}


      {/* SUMMARY */}

      {!loading && !error && (
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

          <SummaryCard
            label="Total Tasks"
            value={tasks.length}
          />

          <SummaryCard
            label="Todo"
            value={counts.todo}
          />

          <SummaryCard
            label="In Progress"
            value={counts.inProgress}
          />

          <SummaryCard
            label="Done"
            value={counts.done}
          />

        </section>
      )}


      {/* LOADING */}

      {loading && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">

          {Array.from({
            length: 4,
          }).map((_, index) => (

            <div
              key={index}
              className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
            >

              <div className="h-5 w-48 rounded bg-slate-200" />

              <div className="mt-4 h-3 w-full rounded bg-slate-100" />

              <div className="mt-2 h-3 w-3/4 rounded bg-slate-100" />

              <div className="mt-8 h-7 w-28 rounded bg-slate-100" />

            </div>

          ))}

        </div>
      )}


      {/* TASKS */}

      {!loading &&
        !error &&
        tasks.length > 0 && (

          <section className="mt-6">

            <div className="mb-4">

              <h2 className="font-semibold text-slate-900">
                {assignedToMe
                  ? "My Tasks"
                  : "All Tasks"}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {tasks.length}{" "}
                {tasks.length === 1
                  ? "task"
                  : "tasks"}{" "}
                found
              </p>

            </div>


            <div className="grid gap-4 lg:grid-cols-2">

              {tasks.map(
                (task) => {

                  const project =
                    projectMap.get(
                      task.project_id
                    );

                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      projectName={
                        project?.name
                      }
                      onView={
                        openTaskDetails
                      }
                    />
                  );
                }
              )}

            </div>

          </section>
        )}


      {/* EMPTY */}

      {!loading &&
        !error &&
        tasks.length === 0 && (

          <div className="mt-6">

            <EmptyState
              title={
                assignedToMe
                  ? "No tasks assigned to you"
                  : "No tasks found"
              }
              description="Try changing the project or active-task filters."
            />

          </div>
        )}


      {/* TASK DETAILS */}

      {detailsOpen && (

        <TaskDetailsModal
          key={selectedTask?.id}
          task={selectedTask}
          loading={detailLoading}
          error={detailError}
          onClose={closeTaskDetails}
          canEditTask={
            isManager || selectedTask?.assignee_user_id === user?.id
          }
          canManageSync={isAdmin}
          onSave={saveTaskChanges}
          onSyncAction={runTaskSyncAction}
          projectName={
            selectedTask
              ? projectMap.get(
                  selectedTask.project_id
                )?.name
              : ""
          }
        />

      )}

    </div>
  );
}


// =========================================================
// SUMMARY CARD
// =========================================================

function SummaryCard({
  label,
  value,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

      <div className="flex items-center justify-between">

        <div>

          <p className="text-xs font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-1 text-2xl font-bold text-slate-900">
            {value}
          </p>

        </div>

        <CheckCircle2
          size={20}
          className="text-slate-400"
        />

      </div>

    </div>
  );
}


export default TasksPage; 