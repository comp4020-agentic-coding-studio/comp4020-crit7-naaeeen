import type { APIRoute } from "astro";
import { createBooking, listBookings } from "../../../lib/booking";
import { BookingError } from "../../../lib/errors";
import { errorResponse, formError, isJson, json, readMutation } from "../../../lib/http";

export const GET: APIRoute = ({ locals }) => {
  try { return json({ bookings: listBookings(locals.bookingOwner) }); }
  catch (error) { return errorResponse(error); }
};

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  let input: Record<string, unknown> = {};
  try {
    input = await readMutation(request);
    const { booking, replayed } = createBooking(input, locals.bookingOwner);
    return isJson(request) ? json({ booking }, replayed ? 200 : 201) : redirect(`/bookings/?created=${booking.id}`, 303);
  } catch (error) {
    if (!isJson(request) && error instanceof BookingError && [400, 404, 409].includes(error.status)) return formError(input, error);
    return errorResponse(error);
  }
};
