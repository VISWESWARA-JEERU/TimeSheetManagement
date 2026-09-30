import { apiClient } from "../lib/apiClient";

const DEVICE_ID_STORAGE_KEY = "timesheet_device_id";
let inMemoryDeviceId = null;

function createFallbackDeviceId() {
  const bytes = new Uint8Array(16);
  let secureRandomAvailable = false;

  try {
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
      secureRandomAvailable = true;
    }
  } catch (error) {
    console.warn("Unable to generate a secure fallback device ID.", error);
  }

  if (!secureRandomAvailable) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function createDeviceId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch (error) {
    console.warn("Unable to generate a secure attendance device ID.", error);
  }

  return createFallbackDeviceId();
}

function getDeviceId() {
  if (inMemoryDeviceId) {
    return inMemoryDeviceId;
  }

  try {
    const storedDeviceId = window.localStorage.getItem(
      DEVICE_ID_STORAGE_KEY
    );

    if (storedDeviceId) {
      inMemoryDeviceId = storedDeviceId;
      return storedDeviceId;
    }
  } catch (error) {
    console.warn("Unable to read the attendance device ID from storage.", error);
  }

  inMemoryDeviceId = createDeviceId();

  try {
    window.localStorage.setItem(
      DEVICE_ID_STORAGE_KEY,
      inMemoryDeviceId
    );
  } catch (error) {
    console.warn("Unable to persist the attendance device ID.", error);
  }

  return inMemoryDeviceId;
}

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
    device_id: getDeviceId(),
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
    device_id: getDeviceId(),
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