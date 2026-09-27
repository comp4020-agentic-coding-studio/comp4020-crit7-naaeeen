import { describe, expect, it } from "vitest";
import { addDays, canberraNow, defaultSlot, isCalendarDate, isFuture, todayInCanberra } from "../src/lib/dates";

describe("Canberra booking calendar boundaries", () => {
  it("uses the Canberra day while the UTC day is still yesterday", () => {
    expect(todayInCanberra(new Date("2026-09-27T15:15:00Z"))).toBe("2026-09-28");
  });

  it("keeps the calendar window stable across the October daylight-saving transition", () => {
    expect(addDays("2026-09-28", 14)).toBe("2026-10-12");
    expect(addDays("2026-10-03", 1)).toBe("2026-10-04");
    expect(addDays("2026-10-04", 1)).toBe("2026-10-05");
    expect(canberraNow(new Date("2026-10-03T20:00:00Z"))).toMatchObject({ date: "2026-10-04", minutes: 420 });
  });

  it("distinguishes real calendar dates and leap days", () => {
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
  });

  it("rejects a start at or before now and advances the default to a future quarter-hour", () => {
    const now = new Date("2026-09-28T00:00:30Z");
    expect(isFuture("2026-09-28", 600, now)).toBe(false);
    expect(isFuture("2026-09-28", 615, now)).toBe(true);
    expect(defaultSlot(now)).toEqual({ date: "2026-09-28", start: "10:15" });
  });

  it("moves a default hour-long booking to tomorrow when closing is too near", () => {
    expect(defaultSlot(new Date("2026-09-28T12:15:00Z"))).toEqual({ date: "2026-09-29", start: "07:00" });
  });
});
