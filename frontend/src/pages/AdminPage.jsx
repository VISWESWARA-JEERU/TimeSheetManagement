import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  FileClock,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";

import { adminService } from "../services/adminService";

const TABS = {
  USERS: "users",
  TEAMS: "teams",
  AUDIT: "audit",
};

const AVAILABLE_ROLES = [
  "member",
  "manager",
  "admin",
];

function AdminPage() {
  const [activeTab, setActiveTab] = useState(
    TABS.USERS
  );

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function showError(error) {
    setMessage("");
    setError(
      error?.message ||
        "Something went wrong. Please try again."
    );
  }

  function showMessage(value) {
    setError("");
    setMessage(value);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}

      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-indigo-600">
            <ShieldCheck size={17} />
            Administration
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Admin
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Manage organization users, roles,
            teams, and audit activity.
          </p>
        </div>
      </section>

      {/* Feedback */}

      {error && (
        <FeedbackMessage
          type="error"
          message={error}
        />
      )}

      {message && (
        <FeedbackMessage
          type="success"
          message={message}
        />
      )}

      {/* Tabs */}

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          <TabButton
            active={
              activeTab === TABS.USERS
            }
            onClick={() => {
              setActiveTab(TABS.USERS);
              setError("");
              setMessage("");
            }}
            icon={UserCog}
          >
            Users
          </TabButton>

          <TabButton
            active={
              activeTab === TABS.TEAMS
            }
            onClick={() => {
              setActiveTab(TABS.TEAMS);
              setError("");
              setMessage("");
            }}
            icon={Users}
          >
            Teams
          </TabButton>

          <TabButton
            active={
              activeTab === TABS.AUDIT
            }
            onClick={() => {
              setActiveTab(TABS.AUDIT);
              setError("");
              setMessage("");
            }}
            icon={FileClock}
          >
            Audit Logs
          </TabButton>
        </nav>
      </div>

      {/* Tab content */}

      {activeTab === TABS.USERS && (
        <UsersTab
          showError={showError}
          showMessage={showMessage}
        />
      )}

      {activeTab === TABS.TEAMS && (
        <TeamsTab
          showError={showError}
          showMessage={showMessage}
        />
      )}

      {activeTab === TABS.AUDIT && (
        <AuditTab showError={showError} />
      )}
    </div>
  );
}

/* ==========================================
   USERS
========================================== */

function UsersTab({
  showError,
  showMessage,
}) {
  const [users, setUsers] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] =
    useState("");

  const [status, setStatus] = useState("");

  const [pagination, setPagination] =
    useState({
      page: 1,
      page_size: 20,
      total: 0,
      has_next: false,
    });

  const [workingUserId, setWorkingUserId] =
    useState(null);

  const loadUsers = useCallback(
    async ({
      page = 1,
      search = searchQuery,
      userStatus = status,
    } = {}) => {
      try {
        const result =
          await adminService.listUsers({
            page,
            pageSize: 20,
            query: search,
            status: userStatus,
          });

        setUsers(
          Array.isArray(result?.data)
            ? result.data
            : []
        );

        if (result?.pagination) {
          setPagination(result.pagination);
        }
      } catch (error) {
        setUsers([]);
        showError(error);
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, status, showError]
  );

  useEffect(() => {
    setLoading(true);
    loadUsers();
  }, [loadUsers]);

  async function handleSearch(event) {
    event.preventDefault();

    const cleanQuery = query.trim();

    setSearchQuery(cleanQuery);
    setLoading(true);

    await loadUsers({
      page: 1,
      search: cleanQuery,
      userStatus: status,
    });
  }

  async function handleStatusChange(event) {
    const value = event.target.value;

    setStatus(value);
    setLoading(true);

    await loadUsers({
      page: 1,
      search: searchQuery,
      userStatus: value,
    });
  }

  async function refreshUsers() {
    setRefreshing(true);

    await loadUsers({
      page: pagination.page,
    });

    setRefreshing(false);
  }

  async function changeUserStatus(user) {
    const nextStatus =
      user.status === "active"
        ? "disabled"
        : "active";

    setWorkingUserId(user.id);

    try {
      await adminService.updateUser(
        user.id,
        {
          status: nextStatus,
        }
      );

      showMessage(
        `${user.full_name} is now ${nextStatus}.`
      );

      await loadUsers({
        page: pagination.page,
      });
    } catch (error) {
      showError(error);
    } finally {
      setWorkingUserId(null);
    }
  }

  async function grantRole(user, role) {
    if (user.roles.includes(role)) {
      return;
    }

    setWorkingUserId(user.id);

    try {
      await adminService.grantRole(
        user.id,
        role
      );

      showMessage(
        `${role} role added to ${user.full_name}.`
      );

      await loadUsers({
        page: pagination.page,
      });
    } catch (error) {
      showError(error);
    } finally {
      setWorkingUserId(null);
    }
  }

  async function revokeRole(user, role) {
    setWorkingUserId(user.id);

    try {
      await adminService.revokeRole(
        user.id,
        role
      );

      showMessage(
        `${role} role removed from ${user.full_name}.`
      );

      await loadUsers({
        page: pagination.page,
      });
    } catch (error) {
      showError(error);
    } finally {
      setWorkingUserId(null);
    }
  }

  return (
    <section className="space-y-4">
      {/* Controls */}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form
          onSubmit={handleSearch}
          className="flex w-full max-w-lg gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search users..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Search
          </button>
        </form>

        <div className="flex gap-2">
          <select
            value={status}
            onChange={handleStatusChange}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="">
              All statuses
            </option>

            <option value="active">
              Active
            </option>

            <option value="disabled">
              Disabled
            </option>
          </select>

          <button
            type="button"
            onClick={refreshUsers}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
            />

            Refresh
          </button>
        </div>
      </div>

      {/* User table */}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <LoadingRows />
        ) : users.length === 0 ? (
          <EmptySection
            icon={Users}
            title="No users found"
            description="No organization users matched the current filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px]">
              <thead className="bg-slate-50">
                <tr>
                  <TableHeading>
                    User
                  </TableHeading>

                  <TableHeading>
                    Status
                  </TableHeading>

                  <TableHeading>
                    Roles
                  </TableHeading>

                  <TableHeading>
                    Account
                  </TableHeading>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => {
                  const working =
                    workingUserId ===
                    user.id;

                  return (
                    <tr
                      key={user.id}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={
                              user.full_name
                            }
                          />

                          <div>
                            <p className="font-semibold text-slate-900">
                              {user.full_name}
                            </p>

                            <p className="text-sm text-slate-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge
                          status={
                            user.status
                          }
                        />
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex max-w-md flex-wrap gap-2">
                          {AVAILABLE_ROLES.map(
                            (role) => {
                              const assigned =
                                user.roles.includes(
                                  role
                                );

                              return (
                                <button
                                  key={role}
                                  type="button"
                                  disabled={
                                    working
                                  }
                                  onClick={() =>
                                    assigned
                                      ? revokeRole(
                                          user,
                                          role
                                        )
                                      : grantRole(
                                          user,
                                          role
                                        )
                                  }
                                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                    assigned
                                      ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-red-50 hover:text-red-600"
                                      : "border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                                  }`}
                                >
                                  {role}
                                  {assigned
                                    ? " ✓"
                                    : " +"}
                                </button>
                              );
                            }
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <button
                          type="button"
                          disabled={working}
                          onClick={() =>
                            changeUserStatus(
                              user
                            )
                          }
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                            user.status ===
                            "active"
                              ? "bg-red-50 text-red-600 hover:bg-red-100"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          }`}
                        >
                          {working
                            ? "Updating..."
                            : user.status ===
                                "active"
                              ? "Disable"
                              : "Enable"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <Pagination
            pagination={pagination}
            onPageChange={(page) => {
              setLoading(true);
              loadUsers({ page });
            }}
          />
        )}
      </div>
    </section>
  );
}

/* ==========================================
   TEAMS
========================================== */

function TeamsTab({
  showError,
  showMessage,
}) {
  const [teams, setTeams] = useState([]);
  const [teamName, setTeamName] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [creating, setCreating] =
    useState(false);

  const [deletingTeamId, setDeletingTeamId] =
    useState(null);

  const loadTeams = useCallback(async () => {
    try {
      const result =
        await adminService.listTeams();

      setTeams(
        Array.isArray(result) ? result : []
      );
    } catch (error) {
      setTeams([]);
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  async function createTeam(event) {
    event.preventDefault();

    const cleanName = teamName.trim();

    if (!cleanName) {
      return;
    }

    setCreating(true);

    try {
      await adminService.createTeam(
        cleanName
      );

      setTeamName("");

      showMessage(
        `Team "${cleanName}" created.`
      );

      await loadTeams();
    } catch (error) {
      showError(error);
    } finally {
      setCreating(false);
    }
  }

  async function deleteTeam(team) {
    const confirmed = window.confirm(
      `Delete "${team.name}"? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingTeamId(team.id);

    try {
      await adminService.deleteTeam(
        team.id
      );

      showMessage(
        `Team "${team.name}" deleted.`
      );

      await loadTeams();
    } catch (error) {
      showError(error);
    } finally {
      setDeletingTeamId(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-900">
            Create Team
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Add a new team to the
            organization.
          </p>
        </div>

        <form
          onSubmit={createTeam}
          className="flex max-w-xl flex-col gap-2 sm:flex-row"
        >
          <input
            value={teamName}
            onChange={(event) =>
              setTeamName(event.target.value)
            }
            placeholder="Example: Engineering"
            maxLength={255}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />

          <button
            type="submit"
            disabled={
              creating ||
              !teamName.trim()
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? (
              <Loader2
                size={16}
                className="animate-spin"
              />
            ) : (
              <Plus size={16} />
            )}

            Add Team
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">
            Organization Teams
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            {teams.length}{" "}
            {teams.length === 1
              ? "team"
              : "teams"}
          </p>
        </div>

        {loading ? (
          <LoadingRows />
        ) : teams.length === 0 ? (
          <EmptySection
            icon={Users}
            title="No teams found"
            description="Create your first organization team above."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {teams.map((team) => (
              <div
                key={team.id}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Users size={19} />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {team.name}
                    </p>

                    <p className="truncate text-xs text-slate-400">
                      {team.id}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  title="Delete team"
                  disabled={
                    deletingTeamId ===
                    team.id
                  }
                  onClick={() =>
                    deleteTeam(team)
                  }
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  {deletingTeamId ===
                  team.id ? (
                    <Loader2
                      size={17}
                      className="animate-spin"
                    />
                  ) : (
                    <Trash2 size={17} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">
        Team creation and deletion are enabled
        here. Team membership management will use
        the backend's existing admin membership
        endpoints in the next Admin UI increment.
      </div>
    </section>
  );
}

/* ==========================================
   AUDIT LOGS
========================================== */

function AuditTab({ showError }) {
  const [logs, setLogs] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [pagination, setPagination] =
    useState({
      page: 1,
      page_size: 20,
      total: 0,
      has_next: false,
    });

  const loadLogs = useCallback(
    async (page = 1) => {
      try {
        const result =
          await adminService.listAuditLogs({
            page,
            pageSize: 20,
          });

        setLogs(
          Array.isArray(result?.data)
            ? result.data
            : []
        );

        if (result?.pagination) {
          setPagination(result.pagination);
        }
      } catch (error) {
        setLogs([]);
        showError(error);
      } finally {
        setLoading(false);
      }
    },
    [showError]
  );

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold text-slate-900">
          Audit Logs
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Administrative and system activity.
        </p>
      </div>

      {loading ? (
        <LoadingRows />
      ) : logs.length === 0 ? (
        <EmptySection
          icon={FileClock}
          title="No audit logs"
          description="Audit activity will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-50">
              <tr>
                <TableHeading>
                  Action
                </TableHeading>

                <TableHeading>
                  Entity
                </TableHeading>

                <TableHeading>
                  Actor
                </TableHeading>

                <TableHeading>
                  Time
                </TableHeading>
              </tr>
            </thead>

            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-t border-slate-100"
                >
                  <td className="px-5 py-4">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {log.action}
                    </span>
                  </td>

                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-slate-700">
                      {log.entity}
                    </p>

                    <p className="mt-1 max-w-xs truncate text-xs text-slate-400">
                      {log.entity_id || "—"}
                    </p>
                  </td>

                  <td className="px-5 py-4 text-sm text-slate-600">
                    {log.actor_user_id ||
                      "System"}
                  </td>

                  <td className="px-5 py-4 text-sm text-slate-500">
                    {formatDateTime(
                      log.created_at
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <Pagination
          pagination={pagination}
          onPageChange={(page) => {
            setLoading(true);
            loadLogs(page);
          }}
        />
      )}
    </section>
  );
}

/* ==========================================
   COMMON COMPONENTS
========================================== */

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold transition ${
        active
          ? "border-indigo-600 text-indigo-600"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
      }`}
    >
      <Icon size={17} />
      {children}
    </button>
  );
}

function FeedbackMessage({
  type,
  message,
}) {
  const error = type === "error";

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
        error
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {error ? (
        <AlertCircle
          size={18}
          className="mt-0.5 shrink-0"
        />
      ) : (
        <ShieldCheck
          size={18}
          className="mt-0.5 shrink-0"
        />
      )}

      <p>{message}</p>
    </div>
  );
}

function TableHeading({ children }) {
  return (
    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function StatusBadge({ status }) {
  const active = status === "active";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function UserAvatar({ name }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
      {getInitials(name)}
    </div>
  );
}

function EmptySection({
  icon: Icon,
  title,
  description,
}) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon size={21} />
      </div>

      <h3 className="mt-4 font-semibold text-slate-800">
        {title}
      </h3>

      <p className="mt-1 text-sm text-slate-500">
        {description}
      </p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-4 p-5">
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className="flex animate-pulse items-center gap-4"
        >
          <div className="h-10 w-10 rounded-full bg-slate-200" />

          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-slate-200" />
            <div className="h-3 w-64 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Pagination({
  pagination,
  onPageChange,
}) {
  const page = pagination?.page || 1;

  const hasNext =
    pagination?.has_next || false;

  const total = pagination?.total || 0;

  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
      <p className="text-xs text-slate-500">
        {total} total
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() =>
            onPageChange(page - 1)
          }
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>

        <span className="px-2 text-xs font-semibold text-slate-600">
          Page {page}
        </span>

        <button
          type="button"
          disabled={!hasNext}
          onClick={() =>
            onPageChange(page + 1)
          }
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function getInitials(name) {
  if (!name) {
    return "U";
  }

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(date);
}

export default AdminPage;