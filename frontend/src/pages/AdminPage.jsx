import { useEffect, useState } from "react";
import { Plus, ShieldCheck, Trash2, Users } from "lucide-react";

import Header from "../components/common/Header";
import EmptyState from "../components/common/EmptyState";
import { adminService } from "../services/adminService";
import { teamService } from "../services/teamService";

function AdminPage() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");

  function loadData() {
    Promise.all([adminService.listUsers(), teamService.getAll()])
      .then(([userResult, teamResult]) => {
        setUsers(userResult.data);
        setTeams(teamResult);
      })
      .catch((requestError) => setError(requestError.message));
  }

  useEffect(loadData, []);

  async function createTeam(event) {
    event.preventDefault();
    if (!teamName.trim()) return;
    try {
      await teamService.create(teamName.trim());
      setTeamName("");
      loadData();
    } catch (requestError) { setError(requestError.message); }
  }

  async function deleteTeam(teamId) {
    try {
      await teamService.remove(teamId);
      loadData();
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <div className="mx-auto max-w-7xl p-5 md:p-8">
      <Header title="Admin" subtitle="Manage organization users and teams" />
      {error && <p className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <ShieldCheck className="text-indigo-600" size={22} />
            <div><h2 className="font-bold text-slate-600">Users-</h2><p className="text-sm text-slate-500">Live users from the organization.</p></div>
          </div>
          {users.length === 0 ? <EmptyState title="No users found" /> : <div className="divide-y divide-slate-100">{users.map((user) => <div key={user.id} className="flex items-center justify-between py-3"><div><p className="font-semibold text-slate-800">{user.full_name}</p><p className="text-sm text-slate-500">{user.email}</p></div><span className="text-xs font-semibold uppercase text-slate-500">{user.roles.join(", ")}</span></div>)}</div>}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3"><Users className="text-indigo-600" size={22} /><div><h2 className="font-bold text-slate-900">Teams</h2><p className="text-sm text-slate-500">Create and remove organization teams.</p></div></div>
          <form onSubmit={createTeam} className="mb-5 flex gap-2"><input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none" /><button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"><Plus size={16} />Add</button></form>
          {teams.length === 0 ? <EmptyState title="No teams found" /> : <div className="divide-y divide-slate-100">{teams.map((team) => <div key={team.id} className="flex items-center justify-between py-3"><span className="font-semibold text-slate-800">{team.name}</span><button title="Delete team" onClick={() => deleteTeam(team.id)} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button></div>)}</div>}
        </section>
      </div>
    </div>
  );
}

export default AdminPage;
