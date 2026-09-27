import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });
const client = new Database(path);
client.pragma("journal_mode = WAL");
client.pragma("busy_timeout = 5000");
client.pragma("foreign_keys = ON");
export const db = drizzle(client);

// Run migrations where the mounted volume is available, at application boot.
migrate(db, { migrationsFolder: "./drizzle" });
