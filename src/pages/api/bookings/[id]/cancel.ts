import type { APIRoute } from "astro";
import { cancelBooking } from "../../../../lib/booking";
import { BookingError } from "../../../../lib/errors";
import { errorResponse, formError, isJson, json, readMutation } from "../../../../lib/http";

export const POST: APIRoute = async ({ request, locals, params, redirect }) => {
  try {
    await readMutation(request);
    const booking = cancelBooking(params.id ?? "", locals.bookingOwner);
    return isJson(request) ? json({ booking }) : redirect(`/bookings/?cancelled=${booking.id}`, 303);
  } catch (error) {
    if (!isJson(request) && error instanceof BookingError && [400, 404, 409].includes(error.status)) return formError({}, error, true);
    return errorResponse(error);
  }
};
