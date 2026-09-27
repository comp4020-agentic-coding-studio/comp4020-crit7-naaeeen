import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { addDays, BOOKING_WINDOW_DAYS, CLOSING_MINUTES, defaultSlot, DURATIONS, formatTime, isCalendarDate, isFuture, MAX_DAILY_MINUTES, OPENING_MINUTES, parseTime, todayInCanberra } from "./dates";
import { BookingError } from "./errors";
import { publishAvailability } from "./events";
import { ownerHash, validOwner } from "./identity";
import { bookings, type BookingRecord } from "./schema";
import { FEATURES, getSpace, KINDS, LIBRARIES, SPACES } from "./spaces";
import type { AvailabilityResult, BookingView, SearchFilters } from "./types";

export { addDays, BOOKING_WINDOW_DAYS, CLOSING_MINUTES, DURATIONS, formatTime, MAX_DAILY_MINUTES, OPENING_MINUTES, todayInCanberra } from "./dates";
export { FEATURES, getSpace, KINDS, LIBRARIES } from "./spaces";
export type { AvailabilityItem, AvailabilityResult, BookingView, SearchFilters, Space } from "./types";

const integer = (value: string, fallback: number) => /^\d{1,3}$/.test(value) ? Number(value) : fallback;

function temporalErrors(filters: SearchFilters, now: Date): Record<string, string> {
  const errors: Record<string, string> = {};
  const today = todayInCanberra(now);
  if (filters.date < today || filters.date > addDays(today, BOOKING_WINDOW_DAYS)) {
    errors.date = "Choose a date from today through the next 14 days.";
  }
  const start = parseTime(filters.start);
  if (start !== undefined && !isFuture(filters.date, start, now)) {
    errors.start = "Choose a start time that has not passed in Canberra.";
  }
  return errors;
}

function normaliseFilters(params: URLSearchParams, now: Date, required = false, temporal = true) {
  const defaults = defaultSlot(now);
  const errors: Record<string, string> = {};
  const value = (key: string, fallback: string) => (params.has(key) ? params.get(key)! : required ? "" : fallback).trim().slice(0, 100);
  const durationText = value("duration", "60");
  const peopleText = value("people", "2");
  const filters: SearchFilters = {
    date: value("date", defaults.date),
    start: value("start", defaults.start),
    duration: integer(durationText, 60),
    people: integer(peopleText, 2),
    library: value("library", ""),
    kind: value("kind", ""),
    features: [...new Set(params.getAll("features"))].slice(0, 8),
  };
  if (!isCalendarDate(filters.date)) errors.date = "Choose a valid calendar date.";
  const start = parseTime(filters.start);
  if (start === undefined || start % 15 !== 0 || start < OPENING_MINUTES || start >= CLOSING_MINUTES) {
    errors.start = "Choose a start time in 15-minute steps between 07:00 and 22:45.";
  }
  if (!/^\d{2,3}$/.test(durationText) || !DURATIONS.includes(filters.duration)) {
    errors.duration = "Choose 30, 60, 90 or 120 minutes.";
  } else if (start !== undefined && start + filters.duration > CLOSING_MINUTES) {
    errors.duration = "The whole booking must finish by 23:00.";
  }
  if (!/^\d$/.test(peopleText) || filters.people < 1 || filters.people > 8) {
    errors.people = "Choose between 1 and 8 people.";
  }
  if (filters.library && !LIBRARIES.includes(filters.library)) errors.library = "Choose a library from the list.";
  if (filters.kind && !(KINDS as readonly string[]).includes(filters.kind)) errors.kind = "Choose a room, booth or desk.";
  if (filters.features.some((feature) => !FEATURES.includes(feature)) || params.getAll("features").length > 8) {
    errors.features = "Choose facilities from the list.";
  }
  if (temporal && !errors.date) Object.assign(errors, temporalErrors(filters, now));
  return { filters, errors };
}

const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && aEnd > bStart;

export function searchAvailability(params: URLSearchParams, now = new Date()): AvailabilityResult {
  const { filters, errors } = normaliseFilters(params, now);
  const result: AvailabilityResult = {
    filters, errors, results: [], totalSpaces: SPACES.length, availableCount: 0,
    dateMin: todayInCanberra(now), dateMax: addDays(todayInCanberra(now), BOOKING_WINDOW_DAYS),
  };
  if (Object.keys(errors).length) return result;
  const start = parseTime(filters.start)!;
  const end = start + filters.duration;
  const reservations = db.select({ spaceId: bookings.spaceId, start: bookings.startMinutes, end: bookings.endMinutes })
    .from(bookings).where(and(eq(bookings.date, filters.date), eq(bookings.status, "confirmed"))).all();
  result.results = SPACES.filter((space) =>
    space.capacity >= filters.people && (!filters.library || space.library === filters.library) &&
    (!filters.kind || space.kind === filters.kind) && filters.features.every((feature) => space.features.includes(feature)),
  ).map((space) => {
    const occupied = reservations.filter((reservation) => reservation.spaceId === space.id);
    const free = (candidate: number) => isFuture(filters.date, candidate, now) &&
      !occupied.some((reservation) => overlap(candidate, candidate + filters.duration, reservation.start, reservation.end));
    const available = free(start);
    const candidates: number[] = [];
    if (!available) {
      for (let candidate = OPENING_MINUTES; candidate + filters.duration <= CLOSING_MINUTES; candidate += 15) {
        if (candidate !== start && free(candidate)) candidates.push(candidate);
      }
      candidates.sort((a, b) => Math.abs(a - start) - Math.abs(b - start) || a - b);
    }
    return {
      space, available, start: filters.start, end: formatTime(end),
      alternatives: candidates.slice(0, 3).map((candidate) => ({ date: filters.date, start: formatTime(candidate), end: formatTime(candidate + filters.duration) })),
    };
  }).sort((a, b) => Number(b.available) - Number(a.available) || a.space.capacity - b.space.capacity || a.space.id.localeCompare(b.space.id));
  result.availableCount = result.results.filter((item) => item.available).length;
  return result;
}

function view(record: BookingRecord, now = new Date()): BookingView {
  const space = getSpace(record.spaceId);
  if (!space) throw new Error("Persisted booking references an unknown catalogue space.");
  return {
    id: record.id, reference: record.reference, space, date: record.date,
    start: formatTime(record.startMinutes), end: formatTime(record.endMinutes),
    duration: record.endMinutes - record.startMinutes, people: record.people,
    status: record.status, createdAt: record.createdAt,
    canCancel: record.status === "confirmed" && isFuture(record.date, record.startMinutes, now),
  };
}

export function listBookings(ownerToken: string | undefined, now = new Date()): BookingView[] {
  if (!validOwner(ownerToken)) return [];
  return db.select().from(bookings).where(eq(bookings.ownerHash, ownerHash(ownerToken)))
    .orderBy(asc(bookings.date), asc(bookings.startMinutes), desc(bookings.createdAt)).all().map((record) => view(record, now));
}

export function createBooking(input: Record<string, unknown>, ownerToken: string | undefined, now?: Date): { booking: BookingView; replayed: boolean } {
  if (!validOwner(ownerToken)) throw new BookingError("invalid_request", "Open the booking page in this browser, then try again.");
  const params = new URLSearchParams();
  for (const key of ["date", "start", "duration", "people"]) {
    const value = input[key];
    params.set(key, typeof value === "string" || typeof value === "number" ? String(value) : "");
  }
  // Parse stable fields first. An identical retry still returns its original
  // reservation even if the clock has since moved beyond the requested start.
  const { filters, errors } = normaliseFilters(params, now ?? new Date(), true, false);
  const space = typeof input.spaceId === "string" ? getSpace(input.spaceId) : undefined;
  if (!space) errors.spaceId = "Choose an existing study space.";
  if (space && filters.people > space.capacity) errors.people = `This space holds up to ${space.capacity} ${space.capacity === 1 ? "person" : "people"}.`;
  const requestId = typeof input.requestId === "string" ? input.requestId : "";
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) errors.requestId = "Reload the page before submitting this booking.";
  if (Object.keys(errors).length) throw new BookingError("validation", "Check the booking details and try again.", 400, errors);
  const start = parseTime(filters.start)!;
  const end = start + filters.duration;
  const hash = ownerHash(ownerToken);
  // A synchronous IMMEDIATE transaction holds the writer lock across all three
  // decisions. Different rooms cannot race past an owner's daily allowance.
  const outcome = db.transaction((tx) => {
    const previous = tx.select().from(bookings).where(and(eq(bookings.ownerHash, hash), eq(bookings.requestId, requestId))).get();
    if (previous) {
      if (previous.spaceId !== space!.id || previous.date !== filters.date || previous.startMinutes !== start || previous.endMinutes !== end || previous.people !== filters.people) {
        throw new BookingError("idempotency_conflict", "This submission was already used for different details. Reload and try again.", 409);
      }
      return { record: previous, replayed: true };
    }
    const transactionNow = now ?? new Date();
    const timeErrors = temporalErrors(filters, transactionNow);
    if (Object.keys(timeErrors).length) throw new BookingError("validation", "Choose a future booking time in the next 14 days.", 400, timeErrors);
    const minutes = tx.select({ value: sql<number>`coalesce(sum(${bookings.endMinutes} - ${bookings.startMinutes}), 0)` })
      .from(bookings).where(and(eq(bookings.ownerHash, hash), eq(bookings.date, filters.date), eq(bookings.status, "confirmed"))).get()!.value;
    if (minutes + filters.duration > MAX_DAILY_MINUTES) {
      throw new BookingError("daily_limit", "You can hold up to 120 minutes per day in this browser. Cancel a booking or choose another day.", 409);
    }
    const conflict = tx.select({ id: bookings.id }).from(bookings).where(and(
      eq(bookings.spaceId, space!.id), eq(bookings.date, filters.date), eq(bookings.status, "confirmed"),
      lt(bookings.startMinutes, end), gt(bookings.endMinutes, start),
    )).get();
    if (conflict) throw new BookingError("conflict", "Someone booked part of that time. Choose another space or a nearby time.", 409);
    const record = tx.insert(bookings).values({
      id: randomUUID(), reference: `CR-${randomBytes(5).toString("hex").toUpperCase()}`,
      ownerHash: hash, requestId, spaceId: space!.id, date: filters.date,
      startMinutes: start, endMinutes: end, people: filters.people, createdAt: transactionNow.toISOString(),
    }).returning().get();
    return { record, replayed: false };
  }, { behavior: "immediate" });
  if (!outcome.replayed) publishAvailability({ spaceId: outcome.record.spaceId, date: outcome.record.date });
  return { booking: view(outcome.record, now), replayed: outcome.replayed };
}

export function cancelBooking(id: string, ownerToken: string | undefined, now?: Date): BookingView {
  if (!validOwner(ownerToken)) throw new BookingError("not_found", "This booking is not available in this browser.", 404);
  const outcome = db.transaction((tx) => {
    const record = tx.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.ownerHash, ownerHash(ownerToken)))).get();
    if (!record) throw new BookingError("not_found", "This booking is not available in this browser.", 404);
    if (record.status === "cancelled") return { record, changed: false };
    const transactionNow = now ?? new Date();
    if (!isFuture(record.date, record.startMinutes, transactionNow)) {
      throw new BookingError("too_late", "A booking that has started can no longer be cancelled.", 409);
    }
    const cancelled = tx.update(bookings).set({ status: "cancelled", cancelledAt: transactionNow.toISOString() })
      .where(and(eq(bookings.id, id), eq(bookings.ownerHash, ownerHash(ownerToken)))).returning().get();
    return { record: cancelled, changed: true };
  }, { behavior: "immediate" });
  if (outcome.changed) publishAvailability({ spaceId: outcome.record.spaceId, date: outcome.record.date });
  return view(outcome.record, now);
}
