// Maps backend/database errors to safe, user-friendly messages.
// Avoids leaking internal schema details (table/column/constraint names)
// in user-visible toasts. Full details are logged to the console only.

type AnyError = { message?: string; code?: string; details?: string } | null | undefined;

const CODE_MAP: Record<string, string> = {
  "23505": "A record with that value already exists.",
  "23503": "This action conflicts with related records.",
  "23502": "A required field is missing.",
  "23514": "Some values do not meet the required format.",
  "22001": "One of the values is too long.",
  "22P02": "One of the values has an invalid format.",
  "42501": "You don't have permission to perform this action.",
  "PGRST301": "You don't have permission to perform this action.",
  "PGRST116": "The requested record was not found.",
};

/**
 * Returns a safe, user-friendly message for any error.
 * Logs the raw error to the console for developer visibility.
 */
export function safeErrorMessage(error: AnyError, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  // Always log full detail for developers
  // eslint-disable-next-line no-console
  console.error("[error]", error);

  const code = (error as { code?: string }).code;
  if (code && CODE_MAP[code]) return CODE_MAP[code];

  const msg = (error.message || "").toLowerCase();
  if (msg.includes("invalid login credentials")) return "Invalid email or password.";
  if (msg.includes("email not confirmed")) return "Please confirm your email before signing in.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "Too many attempts. Please try again later.";
  if (msg.includes("network") || msg.includes("fetch")) return "Network error. Please check your connection.";
  if (msg.includes("jwt") || msg.includes("not authenticated") || msg.includes("unauthorized")) {
    return "Your session has expired. Please sign in again.";
  }

  return fallback;
}
