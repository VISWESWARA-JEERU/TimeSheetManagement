import { useEffect, useState } from "react";

import Header from "../components/common/Header";
import EmptyState from "../components/common/EmptyState";
import { attendanceService } from "../services/attendanceService";

function TimesheetPage() {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    attendanceService.getSessions(50).then(setSessions).catch((requestError) => setError(requestError.message));
  }, []);

  const totalSeconds = sessions.reduce((total, session) => total + (session.session_seconds || 0), 0);

  return <div className="mx-auto max-w-7xl p-5 md:p-8">
    <Header title="My Timesheet" subtitle="Attendance sessions recorded by the backend" />
    {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {sessions.length === 0 ? <EmptyState title="No sessions recorded" description="Your completed and active attendance sessions will appear here." /> : <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5"><p className="text-sm text-slate-500">Total recorded time</p><p className="mt-1 text-2xl font-bold text-slate-900">{Math.floor(totalSeconds / 3600)}h {Math.floor((totalSeconds % 3600) / 60)}m</p></div>
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Started</th><th className="px-5 py-3">Ended</th><th className="px-5 py-3">Duration</th><th className="px-5 py-3">Reason</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id} className="border-t border-slate-100"><td className="px-5 py-3">{new Date(session.login_at).toLocaleString()}</td><td className="px-5 py-3">{session.logout_at ? new Date(session.logout_at).toLocaleString() : "In progress"}</td><td className="px-5 py-3">{session.session_seconds ? `${Math.floor(session.session_seconds / 3600)}h ${Math.floor((session.session_seconds % 3600) / 60)}m` : "--"}</td><td className="px-5 py-3">{session.logout_reason || "--"}</td></tr>)}</tbody></table></div>
    </div>}
  </div>;
}

export default TimesheetPage;
