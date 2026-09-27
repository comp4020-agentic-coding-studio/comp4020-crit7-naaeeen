import type { APIRoute } from "astro";
import { searchAvailability } from "../../lib/booking";
import { errorResponse, json } from "../../lib/http";

export const GET: APIRoute = ({ url }) => {
  try { return json(searchAvailability(url.searchParams)); }
  catch (error) { return errorResponse(error); }
};
