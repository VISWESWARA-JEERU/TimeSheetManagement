import { API_BASE_URL } from "../config/env";

/**
 * Custom error class for all backend API errors.
 */
export class ApiError extends Error {
  constructor(message, status, code = null, details = null) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Main request function used by GET, POST, PATCH and DELETE.
 */
async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;

  try {
    const response = await fetch(url, {
      ...options,

      // Required because backend authentication uses
      // an HttpOnly session cookie.
      credentials: "include",

      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });

    const contentType = response.headers.get("content-type") || "";

    let body = null;

    if (contentType.includes("application/json")) {
      body = await response.json();
    }

    // -----------------------------
    // Handle unsuccessful responses
    // -----------------------------
    if (!response.ok) {
      const backendError = body?.error;

      throw new ApiError(
        backendError?.message ||
          `Request failed with status ${response.status}`,
        response.status,
        backendError?.code || null,
        backendError?.details || null
      );
    }

    return body;
  } catch (error) {
    // Already converted to our custom ApiError.
    if (error instanceof ApiError) {
      throw error;
    }

    // Network errors, backend offline, CORS problems, etc.
    throw new ApiError(
      "Unable to connect to the server. Please check your connection.",
      0,
      "NETWORK_ERROR",
      {
        originalMessage: error.message,
      }
    );
  }
}

/**
 * Shared API client used by all frontend services.
 */
export const apiClient = {
  get(path, options = {}) {
    return request(path, {
      ...options,
      method: "GET",
    });
  },

  post(path, body, options = {}) {
    return request(path, {
      ...options,
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },

  patch(path, body, options = {}) {
    return request(path, {
      ...options,
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },

  delete(path, options = {}) {
    return request(path, {
      ...options,
      method: "DELETE",
    });
  },
};