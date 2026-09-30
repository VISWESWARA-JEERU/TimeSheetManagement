import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  Users,
} from "lucide-react";

import { teamService } from "../services/teamService";

function TeamPage() {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedDate, setSelectedDate] = useState(getLocalDateInputValue);
  const [attendanceResult, setAttendanceResult] = useState(null);
  const [expandedTimelineKey, setExpandedTimelineKey] = useState("");
  const [timelines, setTimelines] = useState({});
  const [timelineLoading, setTimelineLoading] = useState({});
  const [timelineErrors, setTimelineErrors] = useState({});
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teamsError, setTeamsError] = useState("");
  const [attendanceFailure, setAttendanceFailure] = useState(null);
  const attendanceRequest = useRef(0);

  const loadTeams = useCallback(async () => {
    try {
      const result = await teamService.getManaged();
      const managedTeams = Array.isArray(result) ? result : [];
      setTeams(managedTeams);
      setTeamsError("");
      setSelectedTeam((currentTeamId) =>
        managedTeams.some((team) => team.id === currentTeamId)
          ? currentTeamId
          : managedTeams[0]?.id || ""
      );
    } catch (requestError) {
      console.error("Failed to load managed teams:", requestError);
      setTeams([]);
      setSelectedTeam("");
      setAttendanceResult(null);
      setTeamsError(
        requestError.message || "Unable to load your managed teams."
      );
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  const loadAttendance = useCallback(
    async (isRefresh = false) => {
      const requestId = ++attendanceRequest.current;

      if (!selectedTeam || !selectedDate) {
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      }

      try {
        const result = await teamService.getAttendance(
          selectedTeam,
          selectedDate
        );
        if (requestId === attendanceRequest.current) {
          setAttendanceResult({
            teamId: selectedTeam,
            workDate: selectedDate,
            rows: Array.isArray(result) ? result : [],
          });
          setAttendanceFailure(null);
        }
      } catch (requestError) {
        console.error("Failed to load team attendance:", requestError);
        if (requestId === attendanceRequest.current) {
          setAttendanceResult(null);
          setAttendanceFailure({
            teamId: selectedTeam,
            workDate: selectedDate,
            message:
              requestError.message || "Unable to load team attendance.",
          });
        }
      } finally {
        if (requestId === attendanceRequest.current) {
          setRefreshing(false);
        }
      }
    },
    [selectedDate, selectedTeam]
  );

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (selectedTeam && selectedDate) {
      void loadAttendance();
    }
  }, [loadAttendance, selectedDate, selectedTeam]);

  async function toggleDetails(userId, forceReload = false) {
    const cacheKey = getTimelineCacheKey(selectedTeam, userId, selectedDate);
    if (expandedTimelineKey === cacheKey && !forceReload) {
      setExpandedTimelineKey("");
      return;
    }

    setExpandedTimelineKey(cacheKey);
    if (
      !forceReload &&
      Object.prototype.hasOwnProperty.call(timelines, cacheKey)
    ) {
      return;
    }

    setTimelineErrors((current) => ({ ...current, [cacheKey]: "" }));
    setTimelineLoading((current) => ({ ...current, [cacheKey]: true }));
    try {
      const events = await teamService.getAttendanceEvents(
        selectedTeam,
        userId,
        selectedDate
      );
      setTimelines((current) => ({
        ...current,
        [cacheKey]: Array.isArray(events) ? events : [],
      }));
    } catch (requestError) {
      console.error("Failed to load attendance event timeline:", requestError);
      setTimelineErrors((current) => ({
        ...current,
        [cacheKey]: requestError.message || "Unable to load event timeline.",
      }));
    } finally {
      setTimelineLoading((current) => ({ ...current, [cacheKey]: false }));
    }
  }

  async function handleRefresh() {
    await loadAttendance(true);
  }

  const currentTeam = teams.find((team) => team.id === selectedTeam);
  const hasCurrentAttendance =
    attendanceResult?.teamId === selectedTeam &&
    attendanceResult?.workDate === selectedDate;
  const attendance = hasCurrentAttendance ? attendanceResult.rows : [];
  const attendanceError =
    attendanceFailure?.teamId === selectedTeam &&
    attendanceFailure?.workDate === selectedDate
      ? attendanceFailure.message
      : "";
  const attendanceLoading = Boolean(
    selectedTeam &&
      selectedDate &&
      !hasCurrentAttendance &&
      !attendanceError &&
      !teamsError
  );
  const pageError = teamsError || attendanceError;

  if (teamsLoading) {
    return <TeamPageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-indigo-600">
            <Users size={17} />
            Team Attendance
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Team Attendance
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review daily attendance, logged time, locations, and work sessions
            for your team.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="team-select">
            Team
          </label>
          <select
            id="team-select"
            value={selectedTeam}
            onChange={(event) => {
              setExpandedTimelineKey("");
              setSelectedTeam(event.target.value);
            }}
            disabled={teams.length === 0}
            className="min-w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
          >
            <option value="">Select managed team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="work-date">
            Work date
          </label>
          <div className="relative">
            <CalendarDays
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              id="work-date"
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setExpandedTimelineKey("");
                setSelectedDate(event.target.value);
              }}
              className="rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || attendanceLoading || !selectedTeam}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>
      </section>

      {pageError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Unable to load team attendance</p>
            <p className="mt-1">{pageError}</p>
          </div>
        </div>
      )}

      {teams.length === 0 && !teamsError ? (
        <EmptyState
          title="No managed teams"
          description="Teams assigned to you will appear here."
        />
      ) : null}

      {currentTeam ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">
                {currentTeam.name}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Attendance for {formatDateLabel(selectedDate)}
              </p>
            </div>
            {!attendanceLoading && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {attendance.length}{" "}
                {attendance.length === 1 ? "member" : "members"}
              </span>
            )}
          </div>

            {!attendanceLoading &&
            attendance.length > 0 &&
            !attendance.some((row) => row.attendance_day) ? (
              <p className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm text-slate-600">
                No attendance has been recorded for this work date. Team members
                are still listed below.
              </p>
            ) : null}

          {attendanceLoading && attendance.length === 0 ? (
            <TableLoading />
          ) : attendanceError ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              Attendance data could not be loaded.
            </p>
          ) : attendance.length === 0 && !attendanceError ? (
            <EmptyState
              title="No team members found"
              description="This team currently has no members."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px]">
                <thead className="bg-slate-50">
                  <tr>
                    <TableHeading>Member</TableHeading>
                    <TableHeading>First Login</TableHeading>
                    <TableHeading>Last Logout</TableHeading>
                    <TableHeading>Session</TableHeading>
                    <TableHeading>Logged</TableHeading>
                    <TableHeading>Entries</TableHeading>
                    <TableHeading>Status</TableHeading>
                    <TableHeading>Flags</TableHeading>
                    <TableHeading>Details</TableHeading>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((row) => {
                    const cacheKey = getTimelineCacheKey(
                      selectedTeam,
                      row.user_id,
                      selectedDate
                    );
                    const expanded = expandedTimelineKey === cacheKey;
                    return (
                      <AttendanceTableRows
                        key={row.user_id}
                        row={row}
                        expanded={expanded}
                        cacheKey={cacheKey}
                        events={timelines[cacheKey]}
                        loading={Boolean(timelineLoading[cacheKey])}
                        error={timelineErrors[cacheKey]}
                        onToggle={() => void toggleDetails(row.user_id)}
                        onRetry={() => void toggleDetails(row.user_id, true)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function AttendanceTableRows({
  row,
  expanded,
  cacheKey,
  events,
  loading,
  error,
  onToggle,
  onRetry,
}) {
  return (
    <>
      <tr className="border-t border-slate-100 transition hover:bg-slate-50">
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <MemberAvatar name={row.full_name} />
            <div>
              <p className="font-semibold text-slate-800">
                {row.full_name || "Unnamed user"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{row.email}</p>
            </div>
          </div>
        </td>
        <td className="px-5 py-4 text-sm text-slate-600">
          {formatTime(row.attendance_day?.first_login_at)}
        </td>
        <td className="px-5 py-4 text-sm text-slate-600">
          {formatTime(row.attendance_day?.last_logout_at)}
        </td>
        <td className="px-5 py-4 text-sm text-slate-600">
          {formatDuration(row.attendance_day?.total_session_seconds)}
        </td>
        <td className="px-5 py-4 text-sm text-slate-600">
          {formatDuration(row.attendance_day?.logged_seconds)}
        </td>
        <td className="px-5 py-4 text-sm text-slate-600">
          {row.entry_count ?? 0}
        </td>
        <td className="px-5 py-4">
          <StatusBadge
            status={
              row.attendance_day?.status || ""
            }
            active={row.active_session}
          />
        </td>
        <td className="px-5 py-4">
          <FlagBadges flags={row.flags || []} />
        </td>
        <td className="px-5 py-4">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={`attendance-events-${row.user_id}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            {expanded ? "Hide" : "View"}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-t border-slate-100 bg-slate-50/70">
          <td
            id={`attendance-events-${row.user_id}`}
            colSpan={9}
            className="px-5 py-5"
          >
            <AttendanceTimeline
              events={events}
              loading={loading}
              error={error}
              cacheKey={cacheKey}
              onRetry={onRetry}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function AttendanceTimeline({ events, loading, error, cacheKey, onRetry }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin text-indigo-600" />
        Loading attendance events...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <span>{error}</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-semibold underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!events?.length) {
    return (
      <p className="py-2 text-sm text-slate-500">
        No login or logout events for this work date.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li
          key={`${cacheKey}-${event.id}`}
          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="mt-0.5 rounded-full bg-indigo-50 p-2 text-indigo-700">
            {event.event_type === "login" ? (
              <LogIn size={16} />
            ) : (
              <LogOut size={16} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-slate-800">
                {formatEventType(event.event_type)}
              </span>
              <span className="text-sm text-slate-500">
                {formatTime(event.occurred_at)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} />
                {getLocationDescription(event)}
              </span>
              {event.geo_permission ? (
                <span>Permission: {formatPermission(event.geo_permission)}</span>
              ) : null}
              {hasCoordinates(event) ? (
                <span>
                  {event.latitude}, {event.longitude}
                  {event.accuracy_m != null
                    ? ` (±${event.accuracy_m} m)`
                    : ""}
                </span>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TableHeading({ children }) {
  return (
    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function MemberAvatar({ name }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
      {getInitials(name)}
    </div>
  );
}

function FlagBadges({ flags }) {
  if (!flags.length) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  const labels = {
    LOCATION_DENIED: "Location denied",
    LOCATION_UNAVAILABLE: "Location unavailable",
    OUTSIDE_SITE: "Outside work site",
    MISSING_LOGOUT: "Missing logout",
    RECORDING_VARIANCE: "Time variance",
  };

  return (
    <div className="flex max-w-64 flex-wrap gap-1.5">
      {flags.map((flag) => (
        <span
          key={flag}
          className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200"
        >
          {labels[flag] || flag.replace(/_/g, " ").toLowerCase()}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status, active }) {
  if (!status) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
        No attendance
      </span>
    );
  }

  const normalized = String(status).toLowerCase();
  const appearance =
    normalized === "open" || active
      ? "bg-emerald-50 text-emerald-700"
      : normalized === "rejected"
        ? "bg-red-50 text-red-700"
        : normalized === "approved"
          ? "bg-indigo-50 text-indigo-700"
          : "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${appearance}`}
    >
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Users size={22} />
      </div>
      <h3 className="mt-4 font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function TableLoading() {
  return (
    <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
      <Loader2 size={18} className="animate-spin text-indigo-600" />
      Loading attendance...
    </div>
  );
}

function TeamPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <div className="space-y-3">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-8 w-52 rounded bg-slate-200" />
          <div className="h-4 w-80 rounded bg-slate-100" />
        </div>
        <div className="h-10 w-64 rounded-lg bg-slate-200" />
      </div>
      <div className="h-96 rounded-xl bg-slate-200" />
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

function getLocalDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTimelineCacheKey(teamId, userId, workDate) {
  return `${teamId}:${userId}:${workDate}`;
}

function formatDateLabel(value) {
  if (!value) {
    return "selected date";
  }
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatTime(value) {
  if (!value) {
    return "—";
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function formatDuration(seconds) {
  if (seconds == null) {
    return "—";
  }
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) {
    parts.push(`${days}d`);
  }
  if (hours || days) {
    parts.push(`${hours}h`);
  }
  if (minutes || (!hours && !days)) {
    parts.push(`${minutes}m`);
  }
  return parts.join(" ");
}

function formatEventType(value) {
  if (value === "login") {
    return "Login";
  }
  if (value === "logout") {
    return "Logout";
  }
  return value || "Attendance event";
}

function formatPermission(value) {
  if (value === "denied") {
    return "Denied";
  }
  if (value === "unavailable") {
    return "Unavailable";
  }
  if (value === "granted") {
    return "Granted";
  }
  return value;
}

function getLocationDescription(event) {
  if (event.place_label) {
    return event.place_label;
  }
  if (event.inside_site === true) {
    return "Inside work site";
  }
  if (event.inside_site === false) {
    return "Outside work site";
  }
  if (event.geo_permission === "denied") {
    return "Location denied";
  }
  if (event.geo_permission === "unavailable") {
    return "Location unavailable";
  }
  return "Location not available";
}

function hasCoordinates(event) {
  return event.latitude != null && event.longitude != null;
}

export default TeamPage;
