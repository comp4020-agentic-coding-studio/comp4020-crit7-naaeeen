import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let service: typeof import("../src/lib/booking");
let database: typeof import("../src/lib/db");
let fixture: string;
const originalDatabase = process.env.DATABASE_PATH;
const token = () => randomBytes(32).toString("hex");
const input = (overrides: Record<string, unknown> = {}) => ({
  spaceId: "chifley-room-1", date: "2026-09-28", start: "10:15", duration: 60,
  people: 2, requestId: randomUUID(), ...overrides,
});

beforeAll(async () => {
  fixture = mkdtempSync(join(tmpdir(), "booking-clock-spec-"));
  process.env.DATABASE_PATH = join(fixture, "test.db");
  // Load only after selecting this isolated database; never touch .data/app.db.
  service = await import("../src/lib/booking");
  database = await import("../src/lib/db");
});

afterAll(() => {
  database?.db.$client.close();
  if (originalDatabase === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalDatabase;
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

describe("booking clock decisions with real isolated SQLite", () => {
  it("rejects an otherwise valid within-hours start that has already passed", () => {
    const owner = token();
    const now = new Date("2026-09-28T00:00:00Z"); // 10:00 Canberra.
    expect(() => service.createBooking(input({ start: "09:45" }), owner, now)).toThrow(expect.objectContaining({
      code: "validation", status: 400, fields: expect.objectContaining({ start: expect.any(String) }),
    }));
    expect(service.listBookings(owner, now)).toEqual([]);
  });

  it("replays an identical submission after its start without making a duplicate", () => {
    const owner = token();
    const request = input({ date: "2026-10-04", start: "07:15" });
    const first = service.createBooking(request, owner, new Date("2026-10-03T20:00:00Z")); // 07:00 AEDT.
    const replay = service.createBooking(request, owner, new Date("2026-10-03T21:00:00Z")); // 08:00 AEDT.
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.booking.id).toBe(first.booking.id);
    expect(replay.booking.canCancel).toBe(false);
    expect(service.listBookings(owner)).toHaveLength(1);
  });

  it("counts an ongoing booking until its exact end and excludes ended bookings from the cap", () => {
    const owner = token();
    const before = new Date("2026-09-27T23:00:00Z"); // 09:00 Canberra.
    service.createBooking(input({ spaceId: "menzies-room-1", start: "09:15" }), owner, before);
    service.createBooking(input({ spaceId: "menzies-room-1", date: "2026-09-29" }), owner, before);
    const third = input({ spaceId: "menzies-room-1", date: "2026-09-30" });
    const ongoing = new Date("2026-09-28T00:00:00Z"); // First ends at10:15.
    expect(() => service.createBooking(third, owner, ongoing)).toThrow(expect.objectContaining({ code: "active_limit", status: 409 }));
    expect(service.getBookingAllowance(owner, "2026-09-28", ongoing)).toMatchObject({ activeBookings: 2, remainingActiveBookings: 0, dailyMinutes: 60, remainingDailyMinutes: 60 });
    const ended = new Date("2026-09-28T00:15:00Z");
    expect(service.getBookingAllowance(owner, "2026-09-28", ended)).toMatchObject({ activeBookings: 1, remainingActiveBookings: 1, dailyMinutes: 60 });
    expect(service.createBooking(third, owner, ended).replayed).toBe(false);
    expect(service.getBookingAllowance(owner, "2026-09-28", ended).activeBookings).toBe(2);
  });

  it("cancellation restores both the account slot and its selected-day minutes", () => {
    const owner = token();
    const now = new Date("2026-09-28T00:00:00Z");
    const first = service.createBooking(input({ spaceId: "law-room-2", date: "2026-09-30", duration: 90 }), owner, now);
    service.createBooking(input({ spaceId: "law-room-2", date: "2026-10-01" }), owner, now);
    expect(service.getBookingAllowance(owner, "2026-09-30", now)).toEqual({
      date: "2026-09-30", activeBookings: 2, maxActiveBookings: 2, remainingActiveBookings: 0,
      dailyMinutes: 90, maxDailyMinutes: 120, remainingDailyMinutes: 30,
    });
    service.cancelBooking(first.booking.id, owner, now);
    expect(service.getBookingAllowance(owner, "2026-09-30", now)).toMatchObject({ activeBookings: 1, remainingActiveBookings: 1, dailyMinutes: 0, remainingDailyMinutes: 120 });
    service.createBooking(input({ spaceId: "law-room-2", date: "2026-09-30", duration: 120 }), owner, now);
    expect(service.getBookingAllowance(owner, "2026-09-30", now)).toMatchObject({ activeBookings: 2, dailyMinutes: 120, remainingDailyMinutes: 0 });
  });

  it("rejects cancellation at the start and leaves the confirmed record intact", () => {
    const owner = token();
    const created = service.createBooking(input({ spaceId: "hancock-room-1" }), owner, new Date("2026-09-28T00:00:00Z"));
    const started = new Date("2026-09-28T00:15:00Z"); // Exactly the 10:15 start.
    expect(() => service.cancelBooking(created.booking.id, owner, started)).toThrow(expect.objectContaining({
      code: "too_late", status: 409,
    }));
    expect(service.listBookings(owner, started)[0]).toMatchObject({ status: "confirmed", canCancel: false });
  });
});
