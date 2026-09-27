# Research and design evidence

Research date: 28 September 2026. Distinguish observations, external facts and implementation choices.

## Course contract and upstream

[C7](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/07-anu-system/) requires a real ANU-system slice, persistent creation, Fly deployment, incremental history, PROCESS and crit-7 reflection. It is still labelled Draft. [Week 7](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-7/) confirms browser/server/database end-to-end work. [Assessment](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/) fixes desktop/phone viewports, evidence and indicative word counts; its Pages-through-C7 line conflicts with C7 and hosting. Follow the specific requirement.

[Upstream change acbb4e7](https://github.com/comp4020-agentic-coding-studio/template-dynamic/commit/acbb4e7dcc77de9f479fa8488042447c23642882) removed Astro/Drizzle for final-project stack choice. This is not an upgrade to apply blindly to C7. Local baseline remains the provided Astro starter with student harness at 9aed042. Its CI needs /api/events, HTTPS-aware same-origin forms, foreign-origin rejection and links. Its README route must publish all of README.md.

## Existing booking experience

User-provided screenshot 1: a library-by-library entry page, booking conditions and room information. It states study rooms can be booked for up to two hours/day and up to two weeks ahead, using ANU email; lateness beyond 15 minutes may cancel a room booking. These are observed screenshot statements, not universal rules for every space type.

Screenshots 2-4: current Chifley availability shows Location, Category and Capacity controls, a multi-day room/time grid, rows for study rooms, The Deck, accessibility computer, booths and many computer desks. Info buttons and equipment icons exist. The horizontal scrollbars and availability legend appear at the bottom of a long mixed-category list. The screenshot does not prove any control is broken or that an unseen feature is absent. No real booking was submitted or cancelled.

Observed design opportunity: reduce visual searching for a contiguous period, surface facilities alongside the decision, and make the next action/availability meaning readable near each result. Hypothesis to test: demand-first results reduce scrolling and make a complete requested interval easier to understand than a wide slot matrix. We will compare task steps and rendered outcomes; this is not a participant study or a statistical claim.

[Official Chifley notice, 23 July 2026](https://anulib.anu.edu.au/news-events/news/bookable-spaces-chifley-library) separately covers the new desk/booth trial, two-week advance booking and 30-minute check-in cancellation. Do not conflate that with the screenshot's 15-minute study-room warning. The live LibCal URL returned 429 to web fetch; Computer Use refused to identify the Edge URL confidently before inspection. Authenticated interaction audit remains unverified until a later successful observation.

## Architecture evidence

[Astro origin configuration](https://docs.astro.build/en/reference/configuration-reference/#securitycheckorigin) covers form/text mutation requests; JSON routes need an explicit same-origin guard. [Cookies](https://docs.astro.build/en/reference/api-reference/#cookies) support HttpOnly, Secure, SameSite and lifetime. [Node adapter](https://docs.astro.build/en/guides/integrations-guide/node/#sessions) defaults sessions to filesystem, which is not the Fly volume. Choice: opaque browser ownership cookie with hashed owner in SQLite, avoiding claims of real ANU identity.

[Drizzle 0.45.2 transaction implementation](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/better-sqlite3/session.ts) supports synchronous immediate transactions. [SQLite transactions](https://www.sqlite.org/lang_transaction.html) explain immediate writer acquisition and busy errors. Choice: overlap check and insert in one immediate transaction, half-open intervals to permit adjacent reservations; validate busy/conflict and duplicate submissions.

[Fly volumes](https://docs.fly.io/volumes/overview/) are available to the running machine, not Docker build/release commands. Keep migrations at application boot and DATABASE_PATH=/data/app.db. Preserve the course's one 256MB machine, one 1GB volume, auto-stop and port4321 from local fly.toml.

## A2 standards transferred

Read local A2 docs/planning/implementation-goals.md, its harness and evidence references. Transfer requirements vs choices, a complete journey, actual rendered checks, parent validation of independent findings, meaningful design comparisons, and trigger->decision->verification->commit evidence. Do not transfer the SAO identity, twelve-week scope, animation workload or human gates that applied specifically to A2. Keep C7 planning proportionate while meeting the user's request for careful research.

## Product choices and data boundary

Common Room is an independent student prototype with illustrative space inventory, facilities, hours and availability. Real library names provide context; fixture metadata is not an authoritative ANU room catalogue. No ANU authentication, real booking writes, personal data or confirmation email. The display must make that boundary clear without exposing implementation jargon in the booking flow. All reservations in the prototype are real persisted prototype state, not a success animation.

## Edge follow-up observation

After the user selected the correct tab, Computer Use successfully identified https://anu.libcal.com/spaces?lid=6922 and read the Chifley page in the user's existing Edge session. Confirmed Location, Category, Capacity, date navigation, an interactive availability grid, legend and a screen-reader/keyboard alternative link to /r/accessible?lid=6922&gid=0. The main accessibility tree omits individual grid slots while pointing to that alternative. Screenshot confirms long mixed-type list and horizontal calendar scrolling. This is a limited page observation; reservation submission, cancellation and accessible alternative have not yet been verified. Tool focus/window positioning caused navigation difficulty, which must not be misreported as a site defect. No ANU reservation was created/cancelled.

## Confirmed Edge search comparison

The accessible alternative loaded successfully in the existing Edge session. It has Location, Zone, Category, Capacity and Space controls plus equipment/accessibility checkboxes (accessible, Macintosh, no computer/screen, power, screen-only and Windows). Equipment filtering is therefore an existing feature, not a discovery unique to this prototype. A room information dialog for Chifley1.01 showed capacity4, accessible and power, with a dash under Details. It opened successfully; tool focus/response delays are not a site defect.

On the accessible form, Capacity choices were buckets: Space For1-4 people and Space For5-8 people. Selecting1-4 and Show Availability (read-only search) returned63 options across all categories/zones, including capacity1 computers, capacity2 rooms/booths, and capacity4 spaces. Date selection precedes many per-space time options, ending in Submit Times. No time selection or reservation submission was performed.

For the declared task of finding space for4 people for one uninterrupted hour, the broad bucket leaves users to reject smaller spaces and inspect intervals. The design response is exact party-size compatibility plus full-interval availability, one consistent interface for keyboard and pointer, and retained query filters on errors. This is an observed task mismatch, not a claim that LibCal's range filter malfunctions.
