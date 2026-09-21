import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

// Layout
import AppLayout from "./layouts/AppLayout";

// Route protection
import RoleGuard from "./components/common/RoleGuard";

// Pages
import LoginPage from "./pages/LoginPage";
import TodayPage from "./pages/TodayPage";
import TimesheetPage from "./pages/TimesheetPage";
import TasksPage from "./pages/TasksPage";
import ReportsPage from "./pages/ReportsPage";
import TeamPage from "./pages/TeamPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import AdminPage from "./pages/AdminPage";
import NotFoundPage from "./pages/NotFoundPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* =====================================
            PUBLIC ROUTES
        ====================================== */}

        <Route
          path="/login"
          element={<LoginPage />}
        />

        {/* =====================================
            AUTHENTICATED ROUTES

            AppLayout checks whether the user
            is logged in.

            RoleGuard handles role-based
            page access.
        ====================================== */}

        <Route element={<AppLayout />}>
          {/* Default route */}

          <Route
            index
            element={
              <Navigate
                to="/today"
                replace
              />
            }
          />

          {/* =================================
              ALL AUTHENTICATED USERS
          ================================== */}

          <Route
            path="/today"
            element={<TodayPage />}
          />

          <Route
            path="/timesheet"
            element={<TimesheetPage />}
          />

          <Route
            path="/tasks"
            element={<TasksPage />}
          />

          <Route
            path="/reports"
            element={<ReportsPage />}
          />

          {/* =================================
              MANAGER + ADMIN
          ================================== */}

          <Route
            path="/team"
            element={
              <RoleGuard
                allowedRoles={[
                  "manager",
                  "admin",
                ]}
              >
                <TeamPage />
              </RoleGuard>
            }
          />

          <Route
            path="/approvals"
            element={
              <RoleGuard
                allowedRoles={[
                  "manager",
                  "admin",
                ]}
              >
                <ApprovalsPage />
              </RoleGuard>
            }
          />

          {/* =================================
              ADMIN ONLY
          ================================== */}

          <Route
            path="/admin"
            element={
              <RoleGuard
                allowedRoles={["admin"]}
              >
                <AdminPage />
              </RoleGuard>
            }
          />
        </Route>

        {/* =====================================
            NOT FOUND
        ====================================== */}

        <Route
          path="*"
          element={<NotFoundPage />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;