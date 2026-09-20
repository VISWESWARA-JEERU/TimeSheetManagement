import { useEffect, useState } from "react";

import Header from "../components/common/Header";
import EmptyState from "../components/common/EmptyState";
import StatCard from "../components/common/StatCard";
import { attendanceService } from "../services/attendanceService";
import { Clock3, ListChecks, Timer } from "lucide-react";

function ReportsPage() {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    attendanceService.getSessions(200).then(setSessions).catch((requestError) => setError(requestError.message));
  }, []);

  const totalSeconds = sessions.reduce((total, session) => total + (session.session_seconds || 0), 0);
  const completed = sessions.filter((session) => session.logout_at).length;

  return <div className="mx-auto max-w-7xl p-5 md:p-8"><Header title="Reports" subtitle="Summary of your recorded attendance sessions" />
    {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {sessions.length === 0 ? <EmptyState title="No report data yet" description="Attendance summaries will appear after you create a session." /> : <>
      <div className="grid gap-4 md:grid-cols-3"><StatCard title="Recorded sessions" value={sessions.length} subtitle="Latest 200 sessions" icon={ListChecks} /><StatCard title="Completed sessions" value={completed} subtitle="Sessions with a checkout" icon={Clock3} /><StatCard title="Total duration" value={`${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`} subtitle="Recorded session time" icon={Timer} /></div>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">Recent activity</h2><div className="mt-4 space-y-3">{sessions.slice(0, 10).map((session) => <div key={session.id} className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm"><span className="text-slate-600">{new Date(session.login_at).toLocaleDateString()}</span><span className="font-medium text-slate-800">{session.session_seconds ? `${Math.floor(session.session_seconds / 3600)}h ${Math.floor((session.session_seconds % 3600) / 60)}m` : "In progress"}</span></div>)}</div></div>
    </>}
  </div>;
}

export default ReportsPage;
