import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");
const url = (path: string) => new URL(path, baseUrl);
const localDate = (days = 1) => {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const read = (key: string) => Number(parts.find((part) => part.type === key)?.value);
  return new Date(Date.UTC(read("year"), read("month") - 1, read("day") + days, 12))
    .toISOString().slice(0, 10);
};
async function owner() {
  const response = await fetch(url("/api/bookings"));
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  expect(cookie, "booking bootstrap issues an opaque owner cookie").toBeTruthy();
  return cookie!;
}
const input = (overrides: Record<string, unknown> = {}) => ({
  spaceId: "chifley-room-1", date: localDate(), start: "10:00", duration: 60,
  people: 2, requestId: randomUUID(), ...overrides,
});
const post = (cookie: string, body: Record<string, unknown>, path = "/api/bookings") =>
  fetch(url(path), {
    method: "POST", headers: { origin: baseUrl, cookie, "content-type": "application/json" },
    body: JSON.stringify(body), redirect: "manual",
  });
const availability = async (overrides: Record<string, string> = {}) => {
  const params = new URLSearchParams({ date: localDate(), start: "10:00", duration: "60", people: "2", ...overrides });
  const response = await fetch(url(`/api/availability?${params}`));
  expect(response.status).toBe(200);
  return response.json();
};

describe("booking HTTP contracts", () => {
  it("serves a complete interval across an illustrative multi-library catalogue", async () => {
    const response = await availability({ people: "1" });
    expect(response.totalSpaces).toBeGreaterThanOrEqual(12);
    expect(response.totalSpaces).toBeLessThanOrEqual(20);
    expect(new Set(response.results.map((item: any) => item.space.library)).size).toBe(4);
    expect(new Set(response.results.map((item: any) => item.space.kind))).toEqual(new Set(["room", "booth", "desk"]));
    expect(response.errors).toEqual({});
    expect(response.results.every((item: any) => item.start === "10:00" && item.end === "11:00")).toBe(true);
  });

  it("persists a booking, keeps it owner-scoped, and never returns the owner secret", async () => {
    const cookie = await owner();
    const response = await post(cookie, input());
    expect(response.status).toBe(201);
    const { booking } = await response.json();
    expect(booking).toMatchObject({ date: localDate(), start: "10:00", end: "11:00", status: "confirmed" });
    const fresh = await fetch(url("/api/bookings"), { headers: { cookie } });
    expect(fresh.headers.get("cache-control")).toContain("no-store");
    const text = await fresh.text();
    expect(text).toContain(booking.id);
    expect(text).not.toContain(cookie.split("=")[1]);
    expect(text).not.toMatch(/ownerHash|ownerToken|requestId/);
    const stranger = await fetch(url("/api/bookings"), { headers: { cookie: await owner() } });
    expect((await stranger.json()).bookings).toEqual([]);
  });

  it("rejects partially overlapping intervals and suggests genuinely free alternatives", async () => {
    const cookie = await owner();
    const response = await post(cookie, input({ spaceId: "hancock-room-1", start: "13:00", duration: 90 }));
    expect(response.status).toBe(201);
    const conflict = await post(await owner(), input({ spaceId: "hancock-room-1", start: "12:30" }));
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("conflict");
    const responseBody = await availability({ start: "12:30" });
    const item = responseBody.results.find((value: any) => value.space.id === "hancock-room-1");
    expect(item.available).toBe(false);
    expect(item.alternatives.length).toBeGreaterThan(0);
    for (const alternative of item.alternatives) {
      expect(alternative.end <= "13:00" || alternative.start >= "14:30").toBe(true);
    }
  });

  it("allows immediately adjacent intervals", async () => {
    const first = await post(await owner(), input({ spaceId: "law-room-1", start: "09:00" }));
    const second = await post(await owner(), input({ spaceId: "law-room-1", start: "10:00" }));
    expect([first.status, second.status]).toEqual([201, 201]);
  });

  it("allows exactly one winner under concurrent overlapping requests", async () => {
    const cookies = await Promise.all(Array.from({ length: 10 }, owner));
    const responses = await Promise.all(cookies.map((cookie) => post(cookie, input({
      date: localDate(2), spaceId: "menzies-room-1", start: "14:00",
    }))));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(9);
    for (const response of responses.filter((value) => value.status === 409)) {
      expect((await response.json()).error.code).toBe("conflict");
    }
  });

  it("deduplicates a repeated request and rejects a changed payload for its identifier", async () => {
    const cookie = await owner();
    const body = input({ date: localDate(3), spaceId: "chifley-room-2" });
    const responses = await Promise.all([post(cookie, body), post(cookie, body)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    const values = await Promise.all(responses.map((response) => response.json()));
    expect(values[0].booking.id).toBe(values[1].booking.id);
    const changed = await post(cookie, { ...body, start: "12:00" });
    expect(changed.status).toBe(409);
    expect((await changed.json()).error.code).toBe("idempotency_conflict");
  });

  it("enforces the daily allowance atomically across different spaces", async () => {
    const cookie = await owner();
    const bodies = ["hancock-room-1", "hancock-room-2"].map((spaceId) => input({
      date: localDate(4), spaceId, duration: 90,
    }));
    const responses = await Promise.all(bodies.map((body) => post(cookie, body)));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect((await responses.find((response) => response.status === 409)!.json()).error.code).toBe("daily_limit");
  });

  it("limits an account to two active bookings, replays at the cap, and releases a slot on cancellation", async () => {
    const cookie = await owner();
    const firstRequest = input({ date: localDate(8), spaceId: "chifley-room-1", duration: 30 });
    const secondRequest = input({ date: localDate(9), spaceId: "chifley-room-1", duration: 30 });
    const thirdRequest = input({ date: localDate(10), spaceId: "chifley-room-1", duration: 30 });
    const first = await post(cookie, firstRequest);
    expect(first.status).toBe(201);
    const { booking } = await first.json();
    expect((await post(cookie, secondRequest)).status).toBe(201);
    const third = await post(cookie, thirdRequest);
    expect(third.status).toBe(409);
    expect((await third.json()).error.code).toBe("active_limit");
    const replay = await post(cookie, firstRequest);
    expect(replay.status).toBe(200);
    expect((await replay.json()).booking.id).toBe(booking.id);
    const native = await fetch(url("/api/bookings"), {
      method: "POST", headers: { cookie, origin: baseUrl }, redirect: "manual",
      body: new URLSearchParams(Object.entries({ ...thirdRequest, library: "Chifley Library", kind: "room" }).map(([key, value]) => [key, String(value)])),
    });
    expect(native.status).toBe(303);
    const recovery = new URL(native.headers.get("location")!, baseUrl);
    expect(recovery.searchParams.get("error")).toBe("active_limit");
    expect(recovery.searchParams.get("date")).toBe(localDate(10));
    expect(recovery.searchParams.get("library")).toBe("Chifley Library");
    expect((await post(cookie, {}, `/api/bookings/${booking.id}/cancel`)).status).toBe(200);
    expect((await post(cookie, thirdRequest)).status).toBe(201);
  });

  it("enforces the active-booking cap during concurrent requests for different days and spaces", async () => {
    const cookie = await owner();
    const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => post(cookie, input({
      date: localDate(index + 1), spaceId: index % 2 === 0 ? "hancock-room-2" : "law-room-2", start: "19:00", duration: 30,
    }))));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(2);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(4);
    for (const response of responses.filter((value) => value.status === 409)) {
      expect((await response.json()).error.code).toBe("active_limit");
    }
    const listing = await (await fetch(url("/api/bookings"), { headers: { cookie } })).json();
    expect(listing.bookings).toHaveLength(2);
  });

  it("persists owned cancellation, releases availability and restores the allowance", async () => {
    const cookie = await owner();
    const body = input({ date: localDate(5), spaceId: "law-room-2", duration: 120 });
    const { booking } = await (await post(cookie, body)).json();
    const stranger = await post(await owner(), {}, `/api/bookings/${booking.id}/cancel`);
    expect(stranger.status).toBe(404);
    const cancelled = await post(cookie, {}, `/api/bookings/${booking.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).booking.status).toBe("cancelled");
    const repeated = await post(cookie, {}, `/api/bookings/${booking.id}/cancel`);
    expect(repeated.status).toBe(200);
    const listing = await (await fetch(url("/api/bookings"), { headers: { cookie } })).json();
    expect(listing.bookings.find((value: any) => value.id === booking.id).status).toBe("cancelled");
    const free = await availability({ date: localDate(5), duration: "120" });
    expect(free.results.find((value: any) => value.space.id === "law-room-2").available).toBe(true);
    expect((await post(cookie, { ...body, requestId: randomUUID() })).status).toBe(201);
  });

  it.each([
    ["capacity", { spaceId: "chifley-desk-1", people: 2 }, "people"],
    ["impossible date", { date: "2026-02-30" }, "date"],
    ["past date", { date: localDate(-1) }, "date"],
    ["distant date", { date: localDate(15) }, "date"],
    ["non-quarter-hour start", { start: "10:07" }, "start"],
    ["closing-time overflow", { start: "22:30", duration: 60 }, "duration"],
    ["unsupported duration", { duration: 45 }, "duration"],
    ["zero people", { people: 0 }, "people"],
    ["missing identifier", { requestId: "" }, "requestId"],
    ["unknown space", { spaceId: "made-up" }, "spaceId"],
  ])("rejects %s without creating a booking", async (_label, overrides, field) => {
    const cookie = await owner();
    const response = await post(cookie, input(overrides));
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toHaveProperty(field);
    const bookings = await (await fetch(url("/api/bookings"), { headers: { cookie } })).json();
    expect(bookings.bookings).toEqual([]);
  });

  it("rejects midnight outside the prototype opening hours", async () => {
    const response = await post(await owner(), input({ date: localDate(0), start: "00:00" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toHaveProperty("start");
  });

  it("returns field errors for invalid search and applies capacity and facilities filters", async () => {
    const invalid = await availability({ date: "not-a-date", duration: "45" });
    expect(invalid.errors).toHaveProperty("date");
    expect(invalid.errors).toHaveProperty("duration");
    expect(invalid.results).toEqual([]);
    const valid = await availability({ library: "Chifley Library", kind: "room", people: "4", features: "Screen" });
    expect(valid.results.length).toBeGreaterThan(0);
    expect(valid.results.every((item: any) => item.space.library === "Chifley Library" && item.space.kind === "room" && item.space.capacity >= 4 && item.space.features.includes("Screen"))).toBe(true);
  });

  it("requires an exact same-origin header for JSON and forms", async () => {
    const cookie = await owner();
    for (const origin of ["https://hostile.invalid", "null", ""]) {
      for (const json of [true, false]) {
        const response = await fetch(url("/api/bookings"), {
          method: "POST", redirect: "manual",
          headers: { cookie, ...(origin ? { origin } : {}), "content-type": json ? "application/json" : "application/x-www-form-urlencoded" },
          body: json ? JSON.stringify(input()) : new URLSearchParams({ probe: "1" }),
        });
        expect(response.status).toBe(403);
      }
    }
  });

  it("bounds mutation bodies and refuses malformed JSON", async () => {
    const cookie = await owner();
    expect((await post(cookie, { padding: "x".repeat(9000) })).status).toBe(413);
    for (const size of [9000, 20_000]) {
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ padding: "x".repeat(size) })));
        controller.close();
      } });
      const streamed = await fetch(url("/api/bookings"), {
        method: "POST", headers: { cookie, origin: baseUrl, "content-type": "application/json" }, body, duplex: "half",
      } as RequestInit & { duplex: "half" });
      expect(streamed.status).toBe(413);
    }
    const malformed = await fetch(url("/api/bookings"), {
      method: "POST", headers: { cookie, origin: baseUrl, "content-type": "application/json" }, body: "{",
    });
    expect(malformed.status).toBe(400);
  });

  it("rate-limits repeated writes from one browser", async () => {
    const cookie = await owner();
    const responses = [];
    for (let count = 0; count < 31; count++) responses.push(await post(cookie, {}));
    expect(responses.slice(0, 30).every((response) => response.status === 400)).toBe(true);
    expect(responses[30].status).toBe(429);
    expect(responses[30].headers.get("retry-after")).toBe("60");
    const form = await fetch(url("/api/bookings"), {
      method: "POST", headers: { cookie, origin: baseUrl }, redirect: "manual",
      body: new URLSearchParams({ date: localDate(), start: "10:00", duration: "60", people: "2" }),
    });
    expect(form.status).toBe(303);
    const location = new URL(form.headers.get("location")!, baseUrl);
    expect(location.searchParams.get("error")).toBe("rate_limited");
    expect(location.searchParams.get("date")).toBe(localDate());
  });

  it("makes native forms work and preserves filters after a recoverable error", async () => {
    const cookie = await owner();
    const body = input({ date: localDate(6), spaceId: "chifley-room-2", people: 4 });
    const formPost = (value: Record<string, unknown>, path = "/api/bookings") => fetch(url(path), {
      method: "POST", headers: { cookie, origin: baseUrl }, redirect: "manual",
      body: new URLSearchParams(Object.entries(value).map(([key, item]) => [key, String(item)])),
    });
    const success = await formPost(body);
    expect(success.status).toBe(303);
    const location = success.headers.get("location")!;
    expect(location).toMatch(/^\/bookings\/\?created=/);
    const id = new URL(location, baseUrl).searchParams.get("created");
    const cancelled = await formPost({}, `/api/bookings/${id}/cancel`);
    expect(cancelled.status).toBe(303);
    expect(cancelled.headers.get("location")).toBe(`/bookings/?cancelled=${id}`);
    const failed = await formPost({ ...body, duration: 45, library: "Chifley Library", kind: "room", features: "Screen" });
    expect(failed.status).toBe(303);
    const returnTo = new URL(failed.headers.get("location")!, baseUrl);
    expect(returnTo.pathname).toBe("/");
    expect(returnTo.searchParams.get("error")).toBe("validation");
    for (const [key, value] of Object.entries({ date: localDate(6), start: "10:00", duration: "45", people: "4", library: "Chifley Library", kind: "room", features: "Screen" })) {
      expect(returnTo.searchParams.get(key)).toBe(value);
    }
  });

  it("sets a private HttpOnly cookie without minting identities for availability or SSE", async () => {
    const bootstrap = await fetch(url("/api/bookings"));
    const cookie = bootstrap.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie.split(";")[0]).toMatch(/^common_room_owner=[a-f0-9]{64}$/);
    const search = await fetch(url("/api/availability"));
    expect(search.headers.get("set-cookie")).toBeNull();
    const stream = await fetch(url("/api/events"));
    try { expect(stream.headers.get("set-cookie")).toBeNull(); }
    finally { await stream.body?.cancel(); }
  });

  it("uses Secure cookies and accepts the correct HTTPS origin behind the trusted Fly proxy", async () => {
    const proxyHeaders = { "x-forwarded-host": "common-room-spec.fly.dev", "x-forwarded-proto": "https" };
    const bootstrap = await fetch(url("/api/bookings"), { headers: proxyHeaders });
    expect(bootstrap.status).toBe(200);
    const setCookie = bootstrap.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/; Secure/i);
    const response = await fetch(url("/api/bookings"), {
      method: "POST", headers: { ...proxyHeaders, origin: "https://common-room-spec.fly.dev", cookie: setCookie.split(";")[0], "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("validation");
  });

  it("releases SSE connections after clients disconnect", async () => {
    for (let count = 0; count < 205; count++) {
      const response = await fetch(url("/api/events"));
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain(": connected");
      await reader.cancel();
    }
  }, 15_000);

  it("streams immediately and broadcasts only availability keys on creation and cancellation", async () => {
    const abort = new AbortController();
    const stream = await fetch(url("/api/events"), { signal: abort.signal });
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    try {
      const opening = await reader.read();
      expect(decoder.decode(opening.value)).toContain(": connected");
      const cookie = await owner();
      const request = input({ date: localDate(7), spaceId: "menzies-room-2" });
      const created = await post(cookie, request);
      expect(created.status).toBe(201);
      const { booking } = await created.json();
      for (let index = 0; index < 2; index++) {
        if (index === 1) await post(cookie, {}, `/api/bookings/${booking.id}/cancel`);
        let received = "";
        while (!received.includes("event: availability")) {
          const { value, done } = await reader.read();
          if (done) throw new Error("stream ended before availability update");
          received += decoder.decode(value, { stream: true });
        }
        const data = JSON.parse(received.split("\n").find((line) => line.startsWith("data: "))!.slice(6));
        expect(data).toEqual({ spaceId: "menzies-room-2", date: localDate(7) });
        expect(received).not.toContain(booking.id);
        expect(received).not.toContain(cookie.split("=")[1]);
        expect(received).not.toContain(request.requestId);
      }
    } finally {
      await reader.cancel();
      abort.abort();
    }
  }, 10_000);
});
