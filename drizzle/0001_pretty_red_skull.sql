CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`owner_hash` text NOT NULL,
	`request_id` text NOT NULL,
	`space_id` text NOT NULL,
	`date` text NOT NULL,
	`start_minutes` integer NOT NULL,
	`end_minutes` integer NOT NULL,
	`people` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` text NOT NULL,
	`cancelled_at` text,
	CONSTRAINT "bookings_interval" CHECK("bookings"."start_minutes" >= 420 AND "bookings"."end_minutes" <= 1380 AND "bookings"."start_minutes" % 15 = 0 AND ("bookings"."end_minutes" - "bookings"."start_minutes") IN (30, 60, 90, 120)),
	CONSTRAINT "bookings_people" CHECK("bookings"."people" BETWEEN 1 AND 8),
	CONSTRAINT "bookings_status" CHECK("bookings"."status" IN ('confirmed', 'cancelled')),
	CONSTRAINT "bookings_owner" CHECK(length("bookings"."owner_hash") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_reference_unique` ON `bookings` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_owner_request` ON `bookings` (`owner_hash`,`request_id`);--> statement-breakpoint
CREATE INDEX `bookings_space_date` ON `bookings` (`space_id`,`date`,`status`,`start_minutes`);--> statement-breakpoint
CREATE INDEX `bookings_owner_date` ON `bookings` (`owner_hash`,`date`,`status`);--> statement-breakpoint
DROP TABLE `messages`;