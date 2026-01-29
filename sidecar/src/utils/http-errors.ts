/**
 * Base class for HTTP errors with status codes.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

/**
 * 401 Unauthorized - API key not configured or invalid
 */
export class UnauthorizedError extends HttpError {
  constructor(message: string, code = "UNAUTHORIZED") {
    super(message, 401, code)
  }
}

/**
 * 400 Bad Request - Invalid request parameters
 */
export class BadRequestError extends HttpError {
  constructor(message: string, code = "BAD_REQUEST") {
    super(message, 400, code)
  }
}

/**
 * 500 Internal Server Error - Server-side error
 */
export class InternalServerError extends HttpError {
  constructor(message: string, code = "INTERNAL_ERROR") {
    super(message, 500, code)
  }
}

/**
 * Map error to HTTP status code and response.
 *
 * @param error - Error to map
 * @returns Object with status code and error response
 */
export function mapErrorToResponse(error: unknown): {
  statusCode: 400 | 401 | 500
  body: { error: string; code?: string }
} {
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode as 400 | 401 | 500,
      body: { error: error.message, code: error.code }
    }
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return {
        statusCode: 400,
        body: { error: "Request cancelled", code: "REQUEST_CANCELLED" }
      }
    }

    return {
      statusCode: 500,
      body: { error: error.message, code: "UNKNOWN_ERROR" }
    }
  }

  return {
    statusCode: 500,
    body: { error: "Unknown error occurred", code: "UNKNOWN_ERROR" }
  }
}
