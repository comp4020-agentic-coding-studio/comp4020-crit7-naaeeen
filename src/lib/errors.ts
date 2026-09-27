export type ErrorCode = "validation" | "conflict" | "daily_limit" | "active_limit" | "idempotency_conflict" | "not_found" | "too_late" | "rate_limited" | "unavailable" | "invalid_request";

export class BookingError extends Error {
  constructor(public code: ErrorCode, message: string, public status = 400, public fields?: Record<string, string>) {
    super(message);
    this.name = "BookingError";
  }
}
