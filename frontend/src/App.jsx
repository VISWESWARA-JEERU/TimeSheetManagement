import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

// Layout
import AppLayout from "./layouts/AppLayout";

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
            PROTECTED APPLICATION ROUTES

            AppLayout checks authentication.
            All child pages render through
            <Outlet /> inside AppLayout.
        ====================================== */}

        <Route element={<AppLayout />}>
          {/* Default application route */}

          <Route
            index
            element={
              <Navigate
                to="/today"
                replace
              />
            }
          />

          {/* Member routes */}

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

          {/* Manager routes */}

          <Route
            path="/team"
            element={<TeamPage />}
          />

          <Route
            path="/approvals"
            element={<ApprovalsPage />}
          />

          {/* Admin route */}

          <Route
            path="/admin"
            element={<AdminPage />}
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