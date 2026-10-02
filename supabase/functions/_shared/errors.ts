/**
 * Maps database errors to what the caller should see. Our SQL functions raise
 * SQLSTATE P0001 with a machine-readable HINT and a message written for the
 * user, and P0002 for anything the caller may not see.
 */
import { ApiError } from "./http.ts";

export interface DbError {
  code?: string;
  message?: string;
  hint?: string | null;
}

export function fromDbError(error: DbError): ApiError {
  switch (error.code) {
    case "P0002":
    case "42501":
      // "Not yours" and "doesn't exist" look the same from outside.
      return new ApiError(404, "NOT_FOUND", "We couldn't find that session.");
    case "P0001":
      return new ApiError(409, error.hint || "REJECTED", error.message || "That request could not be completed.");
  }
  console.error("Database error", error.code ?? "unknown");
  return new ApiError(500, "DATABASE_ERROR", "Something went wrong on our side. Please try again.");
}

/** Unwraps a supabase-js result, converting errors. */
export function unwrap<T>(result: { data: T | null; error: DbError | null }): T {
  if (result.error) throw fromDbError(result.error);
  return result.data as T;
}
