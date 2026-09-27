import { defineMiddleware } from "astro:middleware";
import { BookingError } from "./lib/errors";
import { errorResponse, formError, isJson, json, readMutation, withinRateLimit } from "./lib/http";
import { newOwner, OWNER_COOKIE, ownerHash, validOwner } from "./lib/identity";

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url, cookies, locals } = context;
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (mutation && request.headers.get("origin") !== url.origin) {
    return json({ error: { code: "invalid_request", message: "Submit this request from the Common Room website." } }, 403);
  }

  const path = url.pathname.replace(/\/$/, "") || "/";
  const ownedPage = path === "/" || path === "/bookings" || /^\/spaces\/[^/]+$/.test(path);
  let token = cookies.get(OWNER_COOKIE)?.value;
  if (!validOwner(token)) token = undefined;
  // Bootstrap once on a page or the owner-list endpoint. Assets, public search
  // and parallel SSE connections must never race to assign a new identity.
  if (!token && request.method === "GET" && (ownedPage || path === "/api/bookings")) {
    token = newOwner();
    cookies.set(OWNER_COOKIE, token, {
      httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60,
    });
  }
  locals.bookingOwner = token;

  if (mutation && path.startsWith("/api/bookings")) {
    const address = context.clientAddress;
    if (!withinRateLimit("all-booking-writes", 600) || !withinRateLimit(`address:${address}`, 250) || !withinRateLimit(`owner:${token ? ownerHash(token) : address}`, 30)) {
      const error = new BookingError("rate_limited", "Too many booking attempts. Please wait a minute and try again.", 429);
      if (!isJson(request)) {
        try {
          const response = formError(await readMutation(request), error, path.endsWith("/cancel"));
          response.headers.set("retry-after", "60");
          return response;
        } catch (bodyError) {
          return errorResponse(bodyError);
        }
      }
      return errorResponse(error);
    }
  }
  const response = await next();
  if (ownedPage || path.startsWith("/api/bookings")) {
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("vary", "Cookie");
  }
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "same-origin");
  return response;
});
