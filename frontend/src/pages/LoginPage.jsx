import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import {
  Building2,
  CheckCircle2,
  Loader2,
  LocateFixed,
  LockKeyhole,
  MapPin,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

function LoginPage() {
  const location = useLocation();

  const {
    user,
    authConfig,
    loading,
    authError,
    devLogin,
    loginWithIMS,
    clearAuthError,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [locationStatus, setLocationStatus] =
    useState("idle");

  const [localError, setLocalError] = useState("");

  /*
   * If a protected page redirected the user to login,
   * we can return them there after local development login.
   */
  const returnTo =
    location.state?.from?.pathname || "/today";

  /*
   * Clear old authentication errors when the
   * Login page first loads.
   */
  useEffect(() => {
    clearAuthError?.();
  }, [clearAuthError]);

  /*
   * Ask browser for location permission.
   *
   * We are NOT storing the location here.
   * Attendance check-in/check-out will request
   * the actual coordinates when required.
   */
  function requestLocationPermission() {
    setLocalError("");

    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }

    setLocationStatus("requesting");

    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationStatus("granted");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus("denied");
        } else {
          setLocationStatus("unavailable");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }

  /*
   * Local development authentication.
   *
   * Backend requires only the email address.
   */
  async function handleDevLogin(event) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setLocalError("Please enter your email address.");
      return;
    }

    setLocalError("");
    setIsSigningIn(true);

    try {
      await devLogin(normalizedEmail);

      /*
       * AuthContext updates the user.
       * Once user exists, <Navigate /> below
       * moves us into the application.
       */
    } catch (error) {
      setLocalError(
        error.message || "Unable to sign in."
      );
    } finally {
      setIsSigningIn(false);
    }
  }

  /*
   * Production IMS / OIDC authentication.
   */
  async function handleIMSLogin() {
    setLocalError("");
    setIsSigningIn(true);

    try {
      const returnUrl =
        returnTo === "/today"
          ? `${window.location.origin}/today`
          : `${window.location.origin}${returnTo}`;

      await loginWithIMS(returnUrl);

      /*
       * loginWithIMS redirects the browser to
       * the authorization URL, so normally this
       * function will leave the current page.
       */
    } catch (error) {
      setLocalError(
        error.message || "Unable to start IMS login."
      );

      setIsSigningIn(false);
    }
  }

  /*
   * Already authenticated?
   * Don't show the login page again.
   */
  if (user) {
    return <Navigate to={returnTo} replace />;
  }

  /*
   * Wait until AuthContext has checked:
   *   /auth/config
   *   /auth/me
   */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Loader2
            size={20}
            className="animate-spin text-indigo-600"
          />

          Loading authentication...
        </div>
      </div>
    );
  }

  const isLocalDev = Boolean(
    authConfig?.local_dev_auth
  );

  const isOIDCEnabled = Boolean(
    authConfig?.oidc_enabled
  );

  const displayedError =
    localError || authError;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* --------------------------------
          LEFT SIDE
      --------------------------------- */}

      <section className="hidden w-1/2 flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-600 p-3">
              <Building2 size={24} />
            </div>

            <div>
              <p className="text-xl font-semibold">
                {authConfig?.app_name ||
                  "Team Timesheet"}
              </p>

              <p className="text-xs text-slate-400">
                Workforce management
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-lg">
          <h1 className="text-4xl font-bold leading-tight">
            Track your work.
            <br />
            Keep your team aligned.
          </h1>

          <p className="mt-5 text-lg leading-8 text-slate-300">
            Manage attendance, work sessions and
            timesheets from one secure workspace.
          </p>

          <div className="mt-8 space-y-4">
            <Feature
              icon={ShieldCheck}
              title="Secure authentication"
              description="Access is managed through your organization."
            />

            <Feature
              icon={MapPin}
              title="Attendance location"
              description="Location can be recorded during check-in and check-out."
            />

            <Feature
              icon={CheckCircle2}
              title="One workspace"
              description="Attendance and team activity stay connected."
            />
          </div>
        </div>

        <p className="text-sm text-slate-500">
          Secure company access through IMS
        </p>
      </section>

      {/* --------------------------------
          RIGHT SIDE
      --------------------------------- */}

      <section className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          {/* Mobile logo */}

          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-indigo-600 p-3 text-white">
                <Building2 size={22} />
              </div>

              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  {authConfig?.app_name ||
                    "Team Timesheet"}
                </h1>

                <p className="text-xs text-slate-500">
                  Workforce management
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-7">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <LockKeyhole size={24} />
              </div>

              <h2 className="text-2xl font-bold text-slate-900">
                Welcome back
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Sign in to access your Team Timesheet
                workspace.
              </p>
            </div>

            {/* ----------------------------
                LOCAL DEVELOPMENT LOGIN
            ----------------------------- */}

            {isLocalDev && (
              <form
                onSubmit={handleDevLogin}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-semibold text-slate-700"
                  >
                    Email address
                  </label>

                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    placeholder="member@example.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSigningIn}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSigningIn && (
                    <Loader2
                      size={17}
                      className="animate-spin"
                    />
                  )}

                  {isSigningIn
                    ? "Signing in..."
                    : "Sign in locally"}
                </button>

                <p className="text-center text-xs text-slate-400">
                  Local development authentication
                </p>
              </form>
            )}

            {/* ----------------------------
                IMS / OIDC LOGIN
            ----------------------------- */}

            {!isLocalDev && isOIDCEnabled && (
              <button
                type="button"
                onClick={handleIMSLogin}
                disabled={isSigningIn}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSigningIn && (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                )}

                {isSigningIn
                  ? "Connecting..."
                  : "Continue with IMS"}
              </button>
            )}

            {/* ----------------------------
                AUTH NOT CONFIGURED
            ----------------------------- */}

            {!isLocalDev && !isOIDCEnabled && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800">
                  Authentication is unavailable
                </p>

                <p className="mt-1 text-sm leading-5 text-amber-700">
                  Local development login and IMS
                  authentication are currently disabled.
                </p>
              </div>
            )}

            {/* ----------------------------
                ERRORS
            ----------------------------- */}

            {displayedError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">
                  {displayedError}
                </p>
              </div>
            )}

            {/* ----------------------------
                LOCATION PERMISSION
            ----------------------------- */}

            <div className="my-7 border-t border-slate-200" />

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="flex gap-3">
                <LocateFixed
                  size={20}
                  className="mt-0.5 shrink-0 text-slate-600"
                />

                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Location permission
                  </h3>

                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    Location may be recorded when you
                    check in or check out.
                  </p>

                  <LocationStatus
                    status={locationStatus}
                    onRequest={
                      requestLocationPermission
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            Your session is securely managed by the
            server.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------------------
   Small reusable feature row
----------------------------------------- */

function Feature({
  icon: Icon,
  title,
  description,
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Icon size={18} />
      </div>

      <div>
        <p className="font-semibold">
          {title}
        </p>

        <p className="mt-1 text-sm leading-5 text-slate-400">
          {description}
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------
   Location permission UI
----------------------------------------- */

function LocationStatus({
  status,
  onRequest,
}) {
  if (status === "granted") {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-600">
        <CheckCircle2 size={17} />

        Location enabled
      </div>
    );
  }

  if (status === "requesting") {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
        <Loader2
          size={16}
          className="animate-spin"
        />

        Requesting permission...
      </div>
    );
  }

  if (status === "denied") {
    return (
      <p className="mt-3 text-sm font-medium text-amber-600">
        Location permission denied. You can change
        this from your browser settings.
      </p>
    );
  }

  if (status === "unavailable") {
    return (
      <p className="mt-3 text-sm font-medium text-amber-600">
        Location is currently unavailable.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onRequest}
      className="mt-3 text-sm font-semibold text-indigo-600 transition hover:text-indigo-700"
    >
      Allow location
    </button>
  );
}

export default LoginPage;