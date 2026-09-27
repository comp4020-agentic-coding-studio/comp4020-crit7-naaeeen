# Crit 7 implementation plan

Status: backend and frontend implementation underway; baseline green; Edge page observed; Fly credential and assigned app verified.
Updated 2026-09-28. Existing baseline: `9aed042` (preserve); origin baseline `718bf75`.

## Outcome

Build Common Room, an independent ANU study-space booking prototype. A student specifies when, for how long, and for how many people; compares suitable spaces; creates a booking; returns after reload/restart; and cancels only their own booking. A conflicting reservation is rejected atomically and useful nearby alternatives are available. The deployed Fly app is the artefact.

## Evidence and scope

- Current C7 brief, assessment, hosting, Week 7 lecture and upstream history were read. See docs/RESEARCH.md.
- User supplied four screenshots of their logged-in LibCal flow. Edge read failed the Computer Use URL-confidence check before page inspection; do not call this a live interaction audit. User prefers Edge; awaiting a clearly selected booking window before another eligible attempt.
- A2 implementation-goals and evidence docs inform coherent slices, source boundaries, independent review, actual browser checks and contemporary evidence. A2-specific content, aesthetic and approval gates are not copied.
- C7 is still labelled Draft. Specific C7/lecture/hosting require Fly; generic assessment cutover wording disagrees.
- Current upstream main became the final-project placeholder on 24 Sept. Retain this provisioned C7 Astro stack, invariant checks, README check, SSE/HTTPS/CSRF probes and Fly resources.

## Implementation choices

Use the installed Astro 7 / Node adapter 11 / Drizzle 0.45 / SQLite stack. Responsive, server-rendered HTML first; native search and booking forms; optional client enhancement and SSE availability notices. Retain /api/events and full /readme/. No ANU SSO, real booking integration, email or personal student data. Clearly label demo inventory/availability. Browser ownership uses a server-generated opaque HttpOnly cookie; only its hash reaches persisted booking ownership. No token in HTML/URLs/events.

A compact warm-paper and dark-forest interface, strong typography and visible availability text. The first mobile screen contains a useful search action. Filter controls replace scanning a huge timetable; a card states capacity, facilities, requested interval and booking action. All libraries/types can be compared, with understandable empty and conflict states. Motion is brief and respects reduced motion.

Prototype choices (not claims about universal ANU policy): 15-minute start increments; 30/60/90/120-minute durations; 120 confirmed minutes per browser per date; book within the next 14 days; sample opening hours 07:00-23:00 Canberra local time. Distinguish study-room rules from the newer booth/desk check-in policy; do not implement guessed no-show automation.

## Sequence and dependencies

1. Research baseline and this plan. Baseline pnpm check: 28/28 tests, zero typecheck errors/warnings.
2. Backend RED/GREEN: schema/migration, catalogue, validated availability, opaque owner, atomic booking, owned cancellation, rate/body limits and SSE invalidation. Preserve deploy contracts.
3. Frontend vertical flow: search/results, room detail, confirmation/my bookings/cancel, readable project account. Integrate against agreed service interfaces below.
4. Independent review plus adversarial HTTP tests and browser verification against built server. Repair supported findings; rerun affected checks.
5. Verify credential ignored by Git and Docker, use course Fly app with fixed shape, deploy and verify real HTTPS/persistence. Never expose token. Inspect final diff and commit/push coherent verified checkpoints under repo authorization.
6. Prepare accurate process evidence and a clearly identified student-review draft. Do not invent personal reflection or say agent writing is student-authored. Repository publication/course ship requires explicit user approval after a reviewable result.

## Acceptance

- Complete create -> reload -> server restart -> owned view -> cancel journey.
- At most one confirmed overlapping reservation even under concurrent requests; adjacent intervals allowed. Duplicate request identifiers do not create duplicate reservations.
- Backend validates date/time/range/duration/space/capacity/daily allowance and rejects invalid, past and cross-origin writes.
- Another browser cannot list or cancel another owner's bookings. SSE carries no identity or booking secrets. State persists in DATABASE_PATH.
- Keyboard and both 1920x1080 and 390x844 viewports work; no horizontal page overflow, clipped controls, unexplained empty states or console errors. Narrow/resize/reduced-motion checks recorded honestly.
- Required invariant/readme/evidence checks and real Fly HTTPS/CSRF/SSE/link probes pass, with limitations explicit. Record actual coverage only if supported.

## Shared interfaces / file ownership

Backend worker owns src/lib/*, src/middleware.ts, src/env.d.ts if needed, src/pages/api/*, drizzle/*, spec/booking*.test.ts and retirement of spec/guestbook.test.ts. Frontend worker owns src/pages/*.astro and nested non-api pages, src/components/*, src/layouts/*, src/styles.css, src/client/* and public original assets. Parent owns docs, PLAN, README, PROCESS/reflection coordination, routes coverage, browser verification and commits. Do not change package/lock/toolchain/deploy files without parent coordination.

Backend exports from src/lib/booking.ts:
- searchAvailability(params: URLSearchParams, now?: Date): AvailabilityResult (normalised filters + field errors, never throw for invalid search)
- listBookings(ownerToken: string | undefined, now?: Date): BookingView[] (current owner's, including cancelled records)
- getSpace(id: string): Space | undefined
- date helpers/default constants as explicitly exported and coordinated with frontend.

Shared types in src/lib/types.ts: SearchFilters {date,start,duration,people,library,kind,features:string[]}; Space {id,name,library,kind:'room'|'booth'|'desk',capacity,floor,features:string[],description,accessible:boolean}; AvailabilityResult {filters,results:AvailabilityItem[],totalSpaces,availableCount,errors:Record<string,string>,dateMin,dateMax}; AvailabilityItem {space,available,start,end,alternatives:{date,start,end}[]}; BookingView {id,reference,space,date,start,end,duration,people,status:'confirmed'|'cancelled',createdAt,canCancel}.

API: GET /api/availability returns AvailabilityResult; GET /api/bookings returns {bookings}; POST /api/bookings accepts {spaceId,date,start,duration,people,requestId}; POST /api/bookings/[id]/cancel. Mutations accept JSON (explicit same-origin guard) and native form data. JSON success {booking}; JSON error {error:{code,message,fields?}} with appropriate status. Forms redirect 303 to /bookings/?created=<id> or ?cancelled=<id>; recoverable create errors redirect back to filtered search with a whitelisted error code, retaining user inputs. Identity exclusively context.locals.bookingOwner. SSE event availability contains {spaceId,date} only, immediate opening comment preserved.

## Current handoff

No product files changed yet. Baseline green. Parent has read both harnesses and A2 implementation-goals. Remote visibility, Fly credential/deploy and browser environment remain to be checked. All token values must remain out of task notes and output.

## Independent plan review applied

Daily allowance and owner-scoped idempotency are checked inside the same immediate transaction as overlap+insert. Same request identifier with changed inputs fails. Owner cookie is initialized only on HTML entry or explicit API bootstrap; never assets/SSE. Private booking responses use no-store. Calendar arithmetic uses Australia/Sydney date fields across DST. Failed native forms carry whitelisted library/kind/features filters as well as booking inputs. Tests must prove create and cancel broadcasts (not just opening bytes), migration from starter, and restart persistence against the same database.

Deployment feasibility checked early: ignored local token stored mode0600 without displaying it; ignored by Docker too. Only the generated env config was trusted by mise. Fly status verifies assigned app and course owner; no image deployed yet. Existing Fly CLI is installed under mise 0.4.108, outside login PATH. Existing Playwright package found under ~/.local/share/codex-mcp/20260926-v3/packages/node_modules/playwright.

User further requested more meaningful motion/UX and permits suitable project packages or APIs if compatible. Preserve reduced motion, keyboard control, no blocked content, and document dependencies actually chosen.
