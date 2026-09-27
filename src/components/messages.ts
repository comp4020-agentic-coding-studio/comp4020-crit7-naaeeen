export const errorMessages: Record<string, string> = {
  validation: "Some booking details need another look. Check the date, time and number of people below.",
  conflict: "That space was just taken for part of your session. Your booking was not made. Choose another space or try one of the nearby times.",
  daily_limit: "You have reached the demo limit of two booked hours on this date. Choose another day, or cancel a booking in My bookings.",
  idempotency_conflict: "This booking request has already been used. Please review your space again before confirming.",
  not_found: "We could not find that space or booking. Please choose from the spaces below.",
  too_late: "That session has already started. Choose a later time and try again.",
  rate_limited: "You have made several requests in a short time. Wait a moment, then try again.",
  unavailable: "We could not complete that request right now. Please try again in a moment.",
  invalid_request: "We could not read that request. Please check your details and try again.",
};

export function getErrorMessage(code: string | null): string | undefined {
  return code && Object.hasOwn(errorMessages, code) ? errorMessages[code] : undefined;
}
