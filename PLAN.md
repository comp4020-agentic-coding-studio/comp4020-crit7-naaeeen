# Crit 7 implementation plan

Updated 28 September 2026. Status: implementation and local/live verification complete; final authorized GitHub publication is being performed. See docs/VERIFICATION.md and the remote Actions record.

## Outcome and user priorities

Common Room is an independent ANU study-space booking prototype. A visitor chooses a date, time, duration and party size, compares suitable spaces across libraries, books a complete interval, returns to a persisted booking, and cancels only their own future reservation.

The user chose all three priorities: full-interval matching, cross-library comparison, and clear facilities/booking status. They asked for thoughtful motion and permitted suitable compatible packages/APIs. The implemented interface uses native forms, CSS and finite Web Animations; no extra animation dependency or external booking integration was needed.

## Grounding and scope

Read the current C7 brief, assessment/crit/hosting rules, Week 7 lecture, actual starter and upstream history. Read A2 implementation-goals and evidence material as a method reference. Preserve the unrelated modified A2 PROCESS.md.

The user supplied screenshots and allowed Edge inspection. After an initial URL-confidence failure and window-position recovery, the existing authenticated Edge interface was inspected read-only. The accessible search's 1-4 capacity bucket returned 63 mixed-size options. Its equipment and accessibility filters already exist. The design response is exact group-size compatibility and a complete requested interval, not a claim that those existing filters are missing. No real ANU reservation was created or cancelled. See docs/RESEARCH.md.

Current upstream main was changed into a final-project placeholder. Keep this provided C7 Astro/Drizzle/SQLite application and its fixed Fly resources, README/invariant checks, SSE stream, HTTPS-origin and CSRF probes. Do not import the newer placeholder.

All space inventory, facilities and hours are illustrative and labelled as such. No ANU login, email, real booking writes or personal student data. Prototype rules: 15-minute starts; 30/60/90/120-minute duration; up to 8 people; today through 14 days ahead in Australia/Sydney; sample hours 07:00-23:00; up to 120 confirmed minutes per browser per date.

## Implemented contract

- Immediate SQLite transaction includes owner-scoped idempotency, current-time validation, daily allowance and overlap checking plus insert. Identical retry returns the same record; changed data under the same request identifier fails. Adjacent intervals are allowed.
- Owner-checked cancellation persists and releases availability. Schema changes use committed Drizzle migrations; the original migration remains intact.
- An unpredictable HttpOnly cookie links this browser to its own bookings; only its hash is stored. Cookie lifetime is 60 days. Cookie bootstrap occurs on HTML entry or the owner-list API, never assets/SSE. Private responses use no-store.
- JSON and native form mutations have exact-origin checks, streaming request-size bounds and rate limits. Native error redirects retain validated search fields. There are no owner identifiers or reservation details in public SSE events.
- Search and booking work without JavaScript. Enhancements preserve focus and drafts, announce status, respect reduced motion and warn about stale availability after disconnection or restored pages.
- All four page types are in invariant coverage. /readme/ publishes the complete README. Dynamic page validation has regression checks.

## Evidence and checkpoints

- Original local harness: 9aed042; preserved.
- 5d33253: research and implementation plan, local commit.
- d1765ff: complete booking implementation, local commit.
- Baseline check: 28/28 tests. Backend availability RED: expected200, starter returned404. Restart/migration RED: starter owner API returned404.
- Current full check after dependency refresh and keyboard-history repair: 83/83 tests in8files; zero type errors, warnings or hints. Built-server restart/migration, concurrent booking, owner isolation, date boundaries, SSE cleanup, page recovery and invariant checks are included.
- Production dependency audit: zero advisories after compatible transitive refresh. Astro remains7.3.3 and Node adapter11.1.6.
- Independent review found and prompted fixes for malformed-date formatting, inadequate past-time test coverage, stale form errors, missed SSE updates and hash-navigation focus. Real browser verification is still running; do not equate the suite with browser success.

## Deployment and permissions

Fly credential is in ignored, mode0600 mise.local.toml and excluded from the Docker context; never read/print it in notes. Existing CLI: /home/lizhi/.local/share/mise/installs/flyctl/0.4.108/flyctl, run through mise exec. App: comp4020-crit7-naaeeen. Keep one256MB machine, one1GB volume, auto-stop and port4321.

Untouched baseline deployment succeeded. Common Room then deployed successfully and its real HTTPS URL returned200 with the new interface. The final keyboard fix awaits deployment after browser confirmation. Local preview port4407 uses .data/preview.db; the existing unrelated listener on4321 was preserved.

Repository remains private. Automatic approval rejected the attempted remote push because explicit current-conversation push authorization was absent. Do not retry through another path. Ask for explicit push/publication authorization only against the completed reviewable result. Making the repository public/course ship is a separate action.

## Completed release checks

The final rule implementation passed87/87 required tests and the evidence gate. The real browser run passed15checks with zero warnings/errors, including desktop/phone, mobile sizing, quota recovery, keyboard/history, motion and no-JavaScript keyboard flow. The actual Fly deployment preserved a booking across redeploy, enforced the active cap, served the verified ANU logo and passed origin/SSE checks; all anonymous live test bookings were cancelled. Precise limits remain in docs/VERIFICATION.md.

The user explicitly authorized push and public visibility to complete C7 submission. Final publication must preserve these tested source files and verify the remote workflow outcome. Process/reflection files are transparent Codex-assisted drafts grounded in the user’s directions and the observed record; the student should read them before presenting.

## Ownership and runtime

Backend: src/lib, middleware, APIs, schema/migrations and booking tests. Frontend: pages, components, layout, styles, client and original SVG. Verification worker: scripts/verify-browser.mjs and restart test. Parent: integration, docs, routes, final review, commits and deployment. Everyone shares the worktree; preserve others' edits.

Use Ubuntu as lizhi and the actual repo /home/lizhi/comp4020/comp4020-crit7-naaeeen. Run project tools through mise exec (Node24.18.1/pnpm11.9.0). Browser harness uses existing Playwright with installed Chromium151.0.7922.34; that is not a claim of latest-stable Chrome. Artefacts live in ignored .data/verification. Detailed decisions and verification remain in docs/PROCESS-EVIDENCE.md and docs/RESEARCH.md.

## Final user-requested rules

The user requested conspicuous, enforced booking-count and duration rules. The chosen prototype policy is at most two confirmed reservations whose end is still in the future, including ongoing sessions, across all dates. The existing120-minute daily total,30/60/90/120-minute sessions,14-day advance window and Canberra time remain unchanged. Cancellation before the start releases both count and allowance. This is a demo account saved in the browser, not an ANU login. Backend/front-end workers are implementing this shared policy and the verifier is adding one focused end-to-end quota case.

The user also explicitly requested the ANU logo and stronger motion. The verified original university header logo is in public/anu-logo.png; see docs/ASSETS.md. Native proportions and the student-project label remain clear.
