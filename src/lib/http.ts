import { BookingError } from "./errors";

export const MAX_BODY_BYTES = 4096;
const windows = new Map<string, { count: number; resetAt: number }>();

export function withinRateLimit(key: string, limit: number, now = Date.now()): boolean {
  if (windows.size > 512) {
    for (const [storedKey, value] of windows) if (value.resetAt <= now) windows.delete(storedKey);
  }
  const previous = windows.get(key);
  if (!previous || previous.resetAt <= now) {
    if (windows.size >= 5000 && !previous) return false;
    windows.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (previous.count >= limit) return false;
  previous.count++;
  return true;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", ...headers },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof BookingError) {
    return json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } }, error.status,
      error.status === 429 ? { "retry-after": "60" } : {});
  }
  // Do not expose SQL, request data or ownership details in public errors/logs.
  console.error("Booking operation failed", error instanceof Error ? error.name : "unknown error");
  return json({ error: { code: "unavailable", message: "Bookings are temporarily unavailable. Please try again shortly." } }, 503, { "retry-after": "5" });
}

export const isJson = (request: Request) => request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json";

export async function readMutation(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (!["application/json", "application/x-www-form-urlencoded", "multipart/form-data"].includes(type)) {
    throw new BookingError("invalid_request", "Send a booking form or JSON request.", 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new BookingError("invalid_request", "This request is too large.", 413);
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BODY_BYTES) {
          await reader.cancel();
          throw new BookingError("invalid_request", "This request is too large.", 413);
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof BookingError) throw error;
      if (error instanceof Error && error.message.startsWith("Body size limit exceeded")) {
        throw new BookingError("invalid_request", "This request is too large.", 413);
      }
      throw new BookingError("invalid_request", "The request body could not be read. Please try again.");
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    if (type === "application/json") {
      const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length > 24) throw new Error("Invalid request shape");
      return data as Record<string, unknown>;
    }
    const form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
    const data: Record<string, unknown> = {};
    if ([...form.keys()].length > 24) throw new Error("Too many fields");
    for (const [key, value] of form.entries()) {
      if (typeof value !== "string") throw new Error("File uploads are not supported");
      if (key === "features") {
        data.features = form.getAll("features").filter((feature) => typeof feature === "string");
      } else {
        if (form.getAll(key).length !== 1) throw new Error("Duplicate field");
        Object.defineProperty(data, key, { value, enumerable: true, configurable: true });
      }
    }
    return data;
  } catch {
    throw new BookingError("invalid_request", "The booking request could not be read. Reload the page and try again.");
  }
}

export function formError(input: Record<string, unknown>, error: BookingError, cancellation = false): Response {
  const params = new URLSearchParams();
  if (!cancellation) {
    for (const key of ["date", "start", "duration", "people", "library", "kind"]) {
      const value = input[key];
      if (typeof value === "string" || typeof value === "number") params.set(key, String(value).slice(0, 100));
    }
    const features = Array.isArray(input.features) ? input.features : [input.features];
    for (const feature of features.slice(0, 8)) if (typeof feature === "string") params.append("features", feature.slice(0, 100));
  }
  params.set("error", error.code);
  return new Response(null, { status: 303, headers: { location: `${cancellation ? "/bookings/" : "/"}?${params}`, "cache-control": "private, no-store" } });
}
