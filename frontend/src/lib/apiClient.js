import { API_BASE_URL } from "../config/env";


/**
 * Custom error class for all backend API errors.
 */
export class ApiError extends Error {
  constructor(
    message,
    status,
    code = null,
    details = null
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}


/**
 * Main request function used by
 * GET, POST, PATCH and DELETE.
 */
async function request(
  path,
  options = {}
) {
  const url =
    `${API_BASE_URL}${path}`;


  // =====================================================
  // REQUEST DEBUGGING
  // =====================================================

  console.log(
    "============================================"
  );

  console.log(
    ">>> FRONTEND API REQUEST"
  );

  console.log(
    "Method:",
    options.method || "GET"
  );

  console.log(
    "API_BASE_URL:",
    API_BASE_URL
  );

  console.log(
    "Path:",
    path
  );

  console.log(
    "Final URL:",
    url
  );


  if (options.body) {
    try {
      console.log(
        "Body:",
        JSON.parse(
          options.body
        )
      );
    } catch {
      console.log(
        "Body:",
        options.body
      );
    }
  }


  console.log(
    "============================================"
  );


  try {
    const response =
      await fetch(
        url,
        {
          ...options,

          // Required because backend authentication
          // uses an HttpOnly session cookie.
          credentials:
            "include",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",

            ...options.headers,
          },
        }
      );


    // ===================================================
    // RESPONSE DEBUGGING
    // ===================================================

    console.log(
      "============================================"
    );

    console.log(
      "<<< FRONTEND API RESPONSE"
    );

    console.log(
      "Method:",
      options.method || "GET"
    );

    console.log(
      "URL:",
      url
    );

    console.log(
      "Status:",
      response.status
    );

    console.log(
      "Status Text:",
      response.statusText
    );

    console.log(
      "============================================"
    );


    const contentType =
      response.headers.get(
        "content-type"
      ) || "";


    let body = null;


    if (
      contentType.includes(
        "application/json"
      )
    ) {
      body =
        await response.json();
    } else {
      const text =
        await response.text();

      if (text) {
        console.log(
          "Non-JSON response:",
          text
        );
      }
    }


    // ===================================================
    // Handle unsuccessful responses
    // ===================================================

    if (!response.ok) {
      const backendError =
        body?.error;


      console.error(
        "API request failed:",
        {
          status:
            response.status,

          statusText:
            response.statusText,

          body,

          backendError,
        }
      );


      throw new ApiError(
        backendError?.message ||
          `Request failed with status ${response.status}`,

        response.status,

        backendError?.code ||
          null,

        backendError?.details ||
          null
      );
    }


    return body;


  } catch (error) {

    // ===================================================
    // DEBUG ERROR
    // ===================================================

    console.error(
      "============================================"
    );

    console.error(
      "!!! API CLIENT ERROR"
    );

    console.error(
      "URL:",
      url
    );

    console.error(
      "Method:",
      options.method || "GET"
    );

    console.error(
      "Error:",
      error
    );

    console.error(
      "============================================"
    );


    // Already converted to our custom ApiError.
    if (
      error instanceof ApiError
    ) {
      throw error;
    }


    // Network errors, backend offline,
    // CORS problems, etc.
    throw new ApiError(
      "Unable to connect to the server. Please check your connection.",

      0,

      "NETWORK_ERROR",

      {
        originalMessage:
          error?.message ||
          "Unknown network error",

        url,

        method:
          options.method ||
          "GET",
      }
    );
  }
}


/**
 * Shared API client used by all
 * frontend services.
 */
export const apiClient = {

  // =====================================================
  // GET
  // =====================================================

  get(
    path,
    options = {}
  ) {
    return request(
      path,
      {
        ...options,
        method: "GET",
      }
    );
  },


  // =====================================================
  // POST
  // =====================================================

  post(
    path,
    body,
    options = {}
  ) {
    return request(
      path,
      {
        ...options,

        method:
          "POST",

        body:
          body === undefined
            ? undefined
            : JSON.stringify(
                body
              ),
      }
    );
  },


  // =====================================================
  // PATCH
  // =====================================================

  patch(
    path,
    body,
    options = {}
  ) {
    return request(
      path,
      {
        ...options,

        method:
          "PATCH",

        body:
          body === undefined
            ? undefined
            : JSON.stringify(
                body
              ),
      }
    );
  },


  // =====================================================
  // DELETE
  // =====================================================

  delete(
    path,
    options = {}
  ) {
    return request(
      path,
      {
        ...options,
        method: "DELETE",
      }
    );
  },
};