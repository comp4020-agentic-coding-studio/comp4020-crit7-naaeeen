import { sql } from "drizzle-orm";
import { check, index, int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Schema changes ship with generated migrations. The mounted SQLite database
// outlives the server process and each deployment.
export const bookings = sqliteTable("bookings", {
  id: text().primaryKey(),
  reference: text().notNull().unique(),
  ownerHash: text("owner_hash").notNull(),
  requestId: text("request_id").notNull(),
  spaceId: text("space_id").notNull(),
  date: text().notNull(),
  startMinutes: int("start_minutes").notNull(),
  endMinutes: int("end_minutes").notNull(),
  people: int().notNull(),
  status: text({ enum: ["confirmed", "cancelled"] }).notNull().default("confirmed"),
  createdAt: text("created_at").notNull(),
  cancelledAt: text("cancelled_at"),
}, (table) => [
  uniqueIndex("bookings_owner_request").on(table.ownerHash, table.requestId),
  index("bookings_space_date").on(table.spaceId, table.date, table.status, table.startMinutes),
  index("bookings_owner_date").on(table.ownerHash, table.date, table.status),
  check("bookings_interval", sql`${table.startMinutes} >= 420 AND ${table.endMinutes} <= 1380 AND ${table.startMinutes} % 15 = 0 AND (${table.endMinutes} - ${table.startMinutes}) IN (30, 60, 90, 120)`),
  check("bookings_people", sql`${table.people} BETWEEN 1 AND 8`),
  check("bookings_status", sql`${table.status} IN ('confirmed', 'cancelled')`),
  check("bookings_owner", sql`length(${table.ownerHash}) = 64`),
]);

export type BookingRecord = typeof bookings.$inferSelect;
