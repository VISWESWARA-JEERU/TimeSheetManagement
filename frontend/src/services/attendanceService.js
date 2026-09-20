import { apiClient } from "../lib/apiClient";

/**
 * Convert browser geolocation result into the
 * format expected by the FastAPI backend.
 */
function createLocationPayload(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy_m: position.coords.accuracy,
    geo_permission: "granted",
    client_reported_at: new Date().toISOString(),
  };
}

/**
 * Payload used when location permission is denied
 * or location cannot be obtained.
 */
function createUnavailablePayload(permission) {
  return {
    latitude: null,
    longitude: null,
    accuracy_m: null,
    geo_permission: permission,
    client_reported_at: new Date().toISOString(),
  };
}

/**
 * Get the user's current location.
 *
 * This function always resolves with a valid
 * backend payload instead of failing the entire
 * check-in/check-out operation.
 */
function getCurrentLocation() {
  return new Promise((resolve) => {
    // Browser does not support geolocation.
    if (!navigator.geolocation) {
      resolve(createUnavailablePayload("unavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(createLocationPayload(position));
      },

      (error) => {
        // User explicitly denied permission.
        if (error.code === error.PERMISSION_DENIED) {
          resolve(createUnavailablePayload("denied"));
          return;
        }

        // Position unavailable or request timed out.
        resolve(createUnavailablePayload("unavailable"));
      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}

/**
 * Attendance API service.
 */
export const attendanceService = {
  /**
   * Get today's attendance information.
   */
  getToday() {
    return apiClient.get("/attendance/today");
  },

  /**
   * Get login/logout attendance events.
   */
  getEvents(limit = 50) {
    return apiClient.get(
      `/attendance/events?limit=${limit}`
    );
  },

  /**
   * Get work sessions.
   */
  getSessions(limit = 50) {
    return apiClient.get(
      `/attendance/sessions?limit=${limit}`
    );
  },

  /**
   * Check in the current user.
   *
   * Location is requested only when the
   * user performs the check-in action.
   */
  async checkIn() {
    const location = await getCurrentLocation();

    return apiClient.post(
      "/attendance/check-in",
      location
    );
  },

  /**
   * Check out the current user.
   *
   * Location is requested only when the
   * user performs the check-out action.
   */
  async checkOut() {
    const location = await getCurrentLocation();

    return apiClient.post(
      "/attendance/check-out",
      location
    );
  },
};