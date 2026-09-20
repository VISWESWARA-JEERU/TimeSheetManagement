export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export const APP_NAME = import.meta.env.VITE_APP_NAME || "Team Timesheet";

// Demo mode keeps the frontend viewable while the backend is offline.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== "true";

// export const DEMO_USER = {
// 	id: "demo-user",
// 	email: "demo@company.com",
// 	full_name: "Demo Admin",
// 	timezone: "Asia/Kolkata",
// 	org_id: "demo-org",
// 	github_login: null,
// 	roles: ["admin"],
// 	permissions: [
// 		"profile:read",
// 		"attendance:read_self",
// 		"attendance:write_self",
// 		"users:manage",
// 		"roles:manage",
// 		"audit:read",
// 	],
// };

// export const DEMO_MEMBER = {
// 	...DEMO_USER,
// 	id: "demo-member",
// 	email: "member@company.com",
// 	full_name: "Demo Member",
// 	roles: ["member"],
// 	permissions: [
// 		"profile:read",
// 		"attendance:read_self",
// 		"attendance:write_self",
// 		"time_entry:write_self",
// 		"timesheet:submit_self",
// 	],
// };
