import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

describe("booking page validation recovery", () => {
  for (const date of ["not-a-date", "", "2026-02-30"]) {
    it(`renders a recoverable detail-page error for invalid date ${JSON.stringify(date)}`, async () => {
      const response = await fetch(new URL(`/spaces/chifley-room-1/?date=${encodeURIComponent(date)}`, baseUrl));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Check your session details.");
      expect(html).toContain("Choose a valid date");
      expect(html).toContain("Change session details");
      expect(html).not.toContain("Confirm booking");
    });
  }

  it("does not claim a reservation from an arbitrary confirmation URL", async () => {
    const response = await fetch(new URL("/bookings/?created=not-a-booking&cancelled=not-a-booking", baseUrl));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("No confirmed bookings here yet");
    expect(html).not.toContain("You’re booked in.");
    expect(html).not.toContain("Booking cancelled. Thanks for making room.");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
