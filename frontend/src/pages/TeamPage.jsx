import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

import { teamService } from "../services/teamService";

function TeamPage() {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [members, setMembers] = useState([]);

  const [teamsLoading, setTeamsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const loadTeams = useCallback(async () => {
    setError("");

    try {
      const result = await teamService.getManaged();

      const managedTeams = Array.isArray(result)
        ? result
        : [];

      setTeams(managedTeams);

      setSelectedTeam((currentTeamId) => {
        const currentTeamStillExists =
          managedTeams.some(
            (team) => team.id === currentTeamId
          );

        if (currentTeamStillExists) {
          return currentTeamId;
        }

        return managedTeams[0]?.id || "";
      });
    } catch (requestError) {
      console.error(
        "Failed to load managed teams:",
        requestError
      );

      setTeams([]);
      setSelectedTeam("");
      setMembers([]);

      setError(
        requestError.message ||
          "Unable to load your managed teams."
      );
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  const loadMembers = useCallback(
    async (teamId) => {
      if (!teamId) {
        setMembers([]);
        return;
      }

      setMembersLoading(true);
      setError("");
      setMembers([]);

      try {
        const result =
          await teamService.getMembers(teamId);

        setMembers(
          Array.isArray(result) ? result : []
        );
      } catch (requestError) {
        console.error(
          "Failed to load team members:",
          requestError
        );

        setMembers([]);

        setError(
          requestError.message ||
            "Unable to load team members."
        );
      } finally {
        setMembersLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    async function initializePage() {
      setTeamsLoading(true);
      await loadTeams();
    }

    initializePage();
  }, [loadTeams]);

  useEffect(() => {
    if (!selectedTeam) {
      setMembers([]);
      return;
    }

    loadMembers(selectedTeam);
  }, [selectedTeam, loadMembers]);

  async function handleRefresh() {
    setRefreshing(true);
    setError("");

    try {
      await loadTeams();

      if (selectedTeam) {
        await loadMembers(selectedTeam);
      }
    } finally {
      setRefreshing(false);
    }
  }

  const currentTeam = teams.find(
    (team) => team.id === selectedTeam
  );

  if (teamsLoading) {
    return <TeamPageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Page heading */}

      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-indigo-600">
            <Users size={17} />

            Team Management
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Team
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            View the teams you manage and their
            members.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedTeam}
            onChange={(event) =>
              setSelectedTeam(event.target.value)
            }
            disabled={teams.length === 0}
            className="min-w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
          >
            <option value="">
              Select managed team
            </option>

            {teams.map((team) => (
              <option
                key={team.id}
                value={team.id}
              >
                {team.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={
                refreshing ? "animate-spin" : ""
              }
            />

            Refresh
          </button>
        </div>
      </section>

      {/* Error */}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle
            size={18}
            className="mt-0.5 shrink-0"
          />

          <div>
            <p className="font-semibold">
              Unable to load team data
            </p>

            <p className="mt-1">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* No managed teams */}

      {teams.length === 0 && !error && (
        <EmptyTeamState />
      )}

      {/* Selected team */}

      {currentTeam && (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Selected Team
              </p>

              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                  <Users size={20} />
                </div>

                <div>
                  <p className="font-semibold text-slate-900">
                    {currentTeam.name}
                  </p>

                  <p className="text-xs text-slate-500">
                    Managed team
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Team Members
              </p>

              <p className="mt-2 text-3xl font-bold text-slate-900">
                {membersLoading
                  ? "—"
                  : members.length}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Members in this team
              </p>
            </div>
          </section>

          {/* Members */}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Members
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  People assigned to{" "}
                  {currentTeam.name}
                </p>
              </div>

              {!membersLoading && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {members.length}{" "}
                  {members.length === 1
                    ? "member"
                    : "members"}
                </span>
              )}
            </div>

            {membersLoading ? (
              <MembersLoading />
            ) : members.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <Users size={22} />
                </div>

                <h3 className="mt-4 font-semibold text-slate-800">
                  No members found
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  This team currently has no
                  members.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <TableHeading>
                        Member
                      </TableHeading>

                      <TableHeading>
                        Email
                      </TableHeading>

                      <TableHeading>
                        Team Role
                      </TableHeading>

                      <TableHeading>
                        Joined
                      </TableHeading>
                    </tr>
                  </thead>

                  <tbody>
                    {members.map((member) => (
                      <tr
                        key={member.id}
                        className="border-t border-slate-100 transition hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <MemberAvatar
                              name={
                                member.full_name
                              }
                            />

                            <div>
                              <p className="font-semibold text-slate-800">
                                {member.full_name ||
                                  "Unnamed user"}
                              </p>

                              {member.is_manager && (
                                <p className="mt-0.5 text-xs text-indigo-600">
                                  Team manager
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {member.email}
                        </td>

                        <td className="px-5 py-4">
                          {member.is_manager ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                              <ShieldCheck
                                size={13}
                              />

                              Manager
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                              Member
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-500">
                          {formatDate(
                            member.created_at
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
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

function MemberAvatar({ name }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
      {getInitials(name)}
    </div>
  );
}

function EmptyTeamState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Users size={24} />
      </div>

      <h2 className="mt-4 text-lg font-semibold text-slate-900">
        No managed teams
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        You don't currently manage any teams.
        Teams assigned to you will appear here.
      </p>
    </div>
  );
}

function MembersLoading() {
  return (
    <div className="space-y-3 p-5">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="flex animate-pulse items-center gap-4"
        >
          <div className="h-10 w-10 rounded-full bg-slate-200" />

          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-slate-200" />
            <div className="h-3 w-56 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6">
      <div className="flex justify-between">
        <div className="space-y-3">
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="h-8 w-48 rounded bg-slate-200" />
          <div className="h-4 w-64 rounded bg-slate-100" />
        </div>

        <div className="h-10 w-52 rounded-lg bg-slate-200" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-28 rounded-xl bg-slate-200" />
        <div className="h-28 rounded-xl bg-slate-200" />
      </div>

      <div className="h-80 rounded-xl bg-slate-200" />
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

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export default TeamPage;