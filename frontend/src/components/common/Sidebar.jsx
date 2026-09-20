import { NavLink } from "react-router-dom";
import {
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Clock3,
  FileBarChart,
  LayoutDashboard,
  Settings,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";

function Sidebar({ open, onClose }) {
  const { user, isManager, isAdmin } = useAuth();

  const navigation = [
    {
      name: "Today",
      path: "/today",
      icon: LayoutDashboard,
      show: true,
    },
    {
      name: "My Timesheet",
      path: "/timesheet",
      icon: CalendarDays,
      show: true,
      comingSoon: true,
    },
    {
      name: "Tasks",
      path: "/tasks",
      icon: CheckSquare,
      show: true,
      comingSoon: true,
    },
    {
      name: "Reports",
      path: "/reports",
      icon: FileBarChart,
      show: true,
      comingSoon: true,
    },
    {
      name: "Team",
      path: "/team",
      icon: Users,
      show: isManager,
    },
    {
      name: "Approvals",
      path: "/approvals",
      icon: ClipboardCheck,
      show: isManager,
      comingSoon: true,
    },
    {
      name: "Admin",
      path: "/admin",
      icon: Settings,
      show: isAdmin,
    },
  ];

  const visibleNavigation = navigation.filter(
    (item) => item.show
  );

  return (
    <>
      {/* Mobile background overlay */}

      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          flex w-64 flex-col
          border-r border-slate-800
          bg-slate-950 text-white
          transition-transform duration-200
          lg:static lg:translate-x-0
          ${
            open
              ? "translate-x-0"
              : "-translate-x-full"
          }
        `}
      >
        {/* Header */}

        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
              <Clock3 size={20} />
            </div>

            <div>
              <p className="text-sm font-bold">
                Team Timesheet
              </p>

              <p className="text-xs text-slate-400">
                Workspace
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}

        <nav className="flex-1 overflow-y-auto p-3">
          <p className="px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Workspace
          </p>

          <div className="space-y-1">
            {visibleNavigation.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `
                    flex items-center justify-between
                    rounded-lg px-3 py-2.5
                    text-sm font-medium
                    transition
                    ${
                      isActive
                        ? "bg-indigo-600 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }
                    `
                  }
                >
                  <div className="flex items-center gap-3">
                    <Icon size={18} />

                    <span>{item.name}</span>
                  </div>

                  {item.comingSoon && (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                      Soon
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>

        {/* User */}

        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <UserAvatar name={user?.full_name} />

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {user?.full_name || "User"}
              </p>

              <p className="truncate text-xs text-slate-400">
                {user?.email}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function UserAvatar({ name }) {
  const initials = getInitials(name);

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
      {initials}
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

export default Sidebar;