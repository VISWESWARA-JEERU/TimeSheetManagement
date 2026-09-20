import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  Timer,
  CalendarDays,
  CircleCheck,
  AlertCircle,
} from "lucide-react";

import { attendanceService } from "../services/attendanceService";
import { useAuth } from "../context/AuthContext";

function TodayPage() {
  const { user } = useAuth();

  const [attendance, setAttendance] = useState(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  /**
   * Load today's attendance from backend.
   */
  const loadToday = useCallback(async () => {
    try {
      setError("");

      const data = await attendanceService.getToday();

      setAttendance(data);
    } catch (err) {
      console.error("Failed to load attendance:", err);

      setError(
        err.message || "Unable to load today's attendance."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Initial attendance load.
   */
  useEffect(() => {
    loadToday();
  }, [loadToday]);

  /**
   * Refresh periodically.
   *
   * This is useful because the backend may automatically
   * close an inactive work session.
   */
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadToday();
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadToday]);

  /**
   * Check in.
   */
  async function handleCheckIn() {
    setActionLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await attendanceService.checkIn();

      if (result?.is_duplicate) {
        setMessage("You are already checked in.");
      } else {
        setMessage("Check-in successful.");
      }

      await loadToday();
    } catch (err) {
      console.error("Check-in failed:", err);

      setError(
        err.message || "Unable to check in."
      );
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * Check out.
   */
  async function handleCheckOut() {
    setActionLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await attendanceService.checkOut();

      if (result?.is_duplicate) {
        setMessage("You are already checked out.");
      } else {
        setMessage("Check-out successful.");
      }

      await loadToday();
    } catch (err) {
      console.error("Check-out failed:", err);

      setError(
        err.message || "Unable to check out."
      );
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return <TodayPageSkeleton />;
  }

  const attendanceDay = attendance?.attendance_day ?? null;
  const activeSession = attendance?.active_session ?? null;

  const firstLoginEvent =
    attendance?.first_login_event ?? null;

  const lastLogoutEvent =
    attendance?.last_logout_event ?? null;

  const isCheckedIn = Boolean(activeSession);

  const totalSessionSeconds =
    attendanceDay?.total_session_seconds ?? 0;

  const loggedSeconds =
    attendanceDay?.logged_seconds ?? 0;

  const expectedWorkSeconds = 8 * 60 * 60;

  const progress = Math.min(
    100,
    Math.round(
      (totalSessionSeconds / expectedWorkSeconds) * 100
    )
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* ==========================================
          HEADER
      ========================================== */}

      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {getGreeting()}
          </p>

          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
            {user?.full_name || "Today"}
          </h1>

          <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <CalendarDays size={16} />

            <span>
              {formatWorkDate(attendanceDay?.work_date)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={loadToday}
          disabled={actionLoading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={16} />

          Refresh
        </button>
      </section>

      {/* ==========================================
          ERROR / SUCCESS MESSAGES
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
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CircleCheck
            size={20}
            className="mt-0.5 shrink-0 text-emerald-600"
          />

          <p className="text-sm text-emerald-700">
            {message}
          </p>
        </div>
      )}

      {/* ==========================================
          ATTENDANCE STATUS
      ========================================== */}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full ${
                  isCheckedIn
                    ? "bg-emerald-500"
                    : "bg-slate-300"
                }`}
              />

              <p className="text-sm font-semibold text-slate-600">
                {isCheckedIn
                  ? "Currently checked in"
                  : "Not checked in"}
              </p>
            </div>

            {isCheckedIn && (
              <p className="mt-2 text-sm text-slate-500">
                Current session started at{" "}
                <span className="font-semibold text-slate-700">
                  {formatTime(activeSession?.login_at)}
                </span>
              </p>
            )}

            {!isCheckedIn &&
              lastLogoutEvent?.occurred_at && (
                <p className="mt-2 text-sm text-slate-500">
                  Last checkout at{" "}
                  <span className="font-semibold text-slate-700">
                    {formatTime(
                      lastLogoutEvent.occurred_at
                    )}
                  </span>
                </p>
              )}
          </div>

          {isCheckedIn ? (
            <button
              type="button"
              onClick={handleCheckOut}
              disabled={actionLoading}
              className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLoading ? (
                <RefreshCw
                  size={18}
                  className="animate-spin"
                />
              ) : (
                <LogOut size={18} />
              )}

              {actionLoading
                ? "Checking out..."
                : "Check out"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={actionLoading}
              className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLoading ? (
                <RefreshCw
                  size={18}
                  className="animate-spin"
                />
              ) : (
                <LogIn size={18} />
              )}

              {actionLoading
                ? "Checking in..."
                : "Check in"}
            </button>
          )}
        </div>
      </section>

      {/* ==========================================
          SUMMARY CARDS
      ========================================== */}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={LogIn}
          title="First login"
          value={formatTime(
            attendanceDay?.first_login_at
          )}
          description={getLocationText(
            firstLoginEvent
          )}
        />

        <SummaryCard
          icon={LogOut}
          title="Last logout"
          value={formatTime(
            attendanceDay?.last_logout_at
          )}
          description={getLocationText(
            lastLogoutEvent
          )}
        />

        <SummaryCard
          icon={Timer}
          title="Session time"
          value={formatDuration(
            totalSessionSeconds
          )}
          description="Attendance session total"
        />

        <SummaryCard
          icon={Clock}
          title="Logged time"
          value={formatDuration(loggedSeconds)}
          description="Timesheet logged duration"
        />
      </section>

      {/* ==========================================
          WORKDAY PROGRESS
      ========================================== */}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">
              Today's progress
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Attendance session time against an
              8-hour workday
            </p>
          </div>

          <p className="text-sm font-bold text-slate-700">
            {progress}%
          </p>
        </div>

        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-500"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <div className="mt-3 flex justify-between text-xs text-slate-500">
          <span>
            {formatDuration(totalSessionSeconds)}
          </span>

          <span>8h 00m</span>
        </div>
      </section>

      {/* ==========================================
          TODAY ENTRIES
      ========================================== */}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Today's entries
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Work logged for this workday
              </p>
            </div>
          </div>
        </div>

        <div className="flex min-h-52 flex-col items-center justify-center p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Clock size={22} />
          </div>

          <h3 className="mt-4 font-semibold text-slate-800">
            Time entries are not available yet
          </h3>

          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
            The current backend provides attendance
            APIs, but it does not currently expose a
            time-entry API. This section will connect
            to real entries when that backend endpoint
            is available.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ==========================================
   SUMMARY CARD
========================================== */

function SummaryCard({
  icon: Icon,
  title,
  value,
  description,
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Icon size={19} />
        </div>
      </div>

      <p className="mt-4 text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-1 text-2xl font-bold text-slate-900">
        {value}
      </p>

      <p
        className="mt-2 truncate text-xs text-slate-500"
        title={description}
      >
        {description}
      </p>
    </article>
  );
}

/* ==========================================
   LOADING STATE
========================================== */

function TodayPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="animate-pulse">
        <div className="h-4 w-28 rounded bg-slate-200" />

        <div className="mt-3 h-8 w-52 rounded bg-slate-200" />

        <div className="mt-3 h-4 w-36 rounded bg-slate-200" />
      </div>

      <div className="h-32 animate-pulse rounded-2xl bg-slate-200" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-36 animate-pulse rounded-2xl bg-slate-200"
          />
        ))}
      </div>
    </div>
  );
}

/* ==========================================
   FORMAT HELPERS
========================================== */

function formatTime(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatWorkDate(value) {
  if (!value) {
    return "Today's workday";
  }

  /*
   * work_date comes from the backend as YYYY-MM-DD.
   *
   * Add T00:00:00 so JavaScript treats it as a
   * local calendar date rather than converting
   * midnight UTC into another date.
   */
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDuration(seconds = 0) {
  const safeSeconds = Math.max(
    0,
    Number(seconds) || 0
  );

  const totalMinutes = Math.floor(
    safeSeconds / 60
  );

  const hours = Math.floor(
    totalMinutes / 60
  );

  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function getLocationText(event) {
  if (!event) {
    return "No location recorded";
  }

  if (event.place_label) {
    return event.place_label;
  }

  if (event.geo_permission === "denied") {
    return "Location permission denied";
  }

  if (
    event.geo_permission === "unavailable"
  ) {
    return "Location unavailable";
  }

  if (
    event.latitude != null &&
    event.longitude != null
  ) {
    return "Location recorded";
  }

  return "No location recorded";
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

export default TodayPage;