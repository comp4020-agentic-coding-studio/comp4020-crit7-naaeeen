import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const entry = join(root, "dist/server/entry.mjs");
const children = new Set<ChildProcess>();
const directories = new Set<string>();
const delay = (milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds));

async function exited(child: ChildProcess, milliseconds: number): Promise<boolean> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((done) => {
    const finish = (result: boolean) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      done(result);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), milliseconds);
    child.once("exit", onExit);
  });
}

async function stop(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  if (!(await exited(child, 2_000))) {
    child.kill("SIGKILL");
    if (!(await exited(child, 2_000))) throw new Error("Owned test server did not exit.");
  }
  children.delete(child);
}

afterEach(async () => {
  try { await Promise.all([...children].map(stop)); }
  finally {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
    directories.clear();
  }
});

async function start(databasePath: string) {
  if (!existsSync(entry)) throw new Error("Run pnpm test so the production server is built first.");
  const port = await new Promise<number>((done, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address() as AddressInfo;
      probe.close((error) => error ? reject(error) : done(address.port));
    });
  });
  let output = "";
  let startupError: Error | undefined;
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATABASE_PATH: databasePath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.once("error", (error) => { startupError = error; });
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on("data", (chunk: Buffer) => { output = (output + chunk.toString()).slice(-4_000); });
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (startupError || child.exitCode !== null || child.signalCode !== null) break;
    try {
      const response = await fetch(`${baseUrl}/readme/`, { signal: AbortSignal.timeout(700) });
      await response.body?.cancel();
      if (response.ok) return { baseUrl, child };
    } catch { /* Only the owned server is being polled, with a bounded deadline. */ }
    await delay(100);
  }
  await stop(child);
  throw new Error(`Built server failed readiness: ${startupError?.message ?? output}`);
}

function tomorrowInCanberra() {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const field = (name: string) => Number(parts.find((part) => part.type === name)!.value);
  return new Date(Date.UTC(field("year"), field("month") - 1, field("day") + 1, 12)).toISOString().slice(0, 10);
}

const get = (baseUrl: string, path: string, cookie?: string) => fetch(new URL(path, baseUrl), {
  headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(3_000),
});
const post = (baseUrl: string, path: string, cookie: string, body: Record<string, unknown>) =>
  fetch(new URL(path, baseUrl), {
    method: "POST", headers: { cookie, origin: baseUrl, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(3_000),
  });

function seedStarter(directory: string, databasePath: string) {
  // Apply the actual starter migration and journal, not a hand-written imitation.
  const journal = JSON.parse(readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8"));
  const first = journal.entries[0];
  const fixtureMigrations = join(directory, "starter-migrations");
  mkdirSync(join(fixtureMigrations, "meta"), { recursive: true });
  copyFileSync(join(root, "drizzle", `${first.tag}.sql`), join(fixtureMigrations, `${first.tag}.sql`));
  writeFileSync(join(fixtureMigrations, "meta/_journal.json"), JSON.stringify({ ...journal, entries: [first] }));
  const client = new Database(databasePath);
  try {
    migrate(drizzle(client), { migrationsFolder: fixtureMigrations });
    client.prepare("INSERT INTO messages (body) VALUES (?)").run("Anonymous starter migration fixture");
    expect(client.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get()).toEqual({ count: 1 });
    expect(client.prepare("SELECT count(*) AS count FROM messages").get()).toEqual({ count: 1 });
  } finally { client.close(); }
  return journal.entries.length;
}

describe("built-server database lifecycle", () => {
  it.each(["fresh", "starter"] as const)("keeps owned bookings and cancellations through restarts with a %s database", async (fixture) => {
    const directory = mkdtempSync(join(tmpdir(), "common-room-restart-"));
    directories.add(directory);
    const databasePath = join(directory, "booking.db");
    const expectedMigrations = fixture === "starter" ? seedStarter(directory, databasePath) : undefined;
    let running = await start(databasePath);
    const bootstrap = await get(running.baseUrl, "/api/bookings");
    expect(bootstrap.status).toBe(200);
    const cookie = bootstrap.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toMatch(/^common_room_owner=[a-f0-9]{64}$/);
    const input = {
      spaceId: "chifley-room-1", date: tomorrowInCanberra(), start: "10:00", duration: 60,
      people: 2, requestId: randomUUID(),
    };
    const created = await post(running.baseUrl, "/api/bookings", cookie!, input);
    expect(created.status).toBe(201);
    const { booking } = await created.json();
    expect(booking.status).toBe("confirmed");
    await stop(running.child);

    if (expectedMigrations !== undefined) {
      const client = new Database(databasePath, { readonly: true });
      try {
        expect(client.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get())
          .toEqual({ count: expectedMigrations });
      } finally { client.close(); }
    }
    running = await start(databasePath);
    const restored = await get(running.baseUrl, "/api/bookings", cookie);
    expect(restored.status).toBe(200);
    expect((await restored.json()).bookings).toEqual([booking]);
    const stranger = await get(running.baseUrl, "/api/bookings");
    expect((await stranger.json()).bookings).toEqual([]);
    const cancelled = await post(running.baseUrl, `/api/bookings/${booking.id}/cancel`, cookie!, {});
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).booking.status).toBe("cancelled");
    await stop(running.child);

    running = await start(databasePath);
    const final = await get(running.baseUrl, "/api/bookings", cookie);
    expect((await final.json()).bookings).toMatchObject([{ id: booking.id, status: "cancelled", canCancel: false }]);
    const query = new URLSearchParams({ date: input.date, start: input.start, duration: "60", people: "2" });
    const availability = await get(running.baseUrl, `/api/availability?${query}`);
    expect(availability.status).toBe(200);
    const item = (await availability.json()).results.find((value: { space: { id: string } }) => value.space.id === input.spaceId);
    expect(item?.available).toBe(true);
    await stop(running.child);
  }, 45_000);
});
