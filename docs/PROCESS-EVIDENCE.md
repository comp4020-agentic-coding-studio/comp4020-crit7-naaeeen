# Process evidence bank

This is an agent-maintained factual record for student review, not a student-authored reflection.

## 2026-09-28 — baseline and research

Trigger: user requested detailed source-backed research, Edge inspection and full implementation in the existing WSL C7 repo, with A2 thinking standards.

Observed: clean main at 9aed042, one unpushed harness commit; A2 has unrelated PROCESS.md changes and was read only. The app is the untouched guestbook. Native WSL node is old; mise supplies node24/pnpm11.9. Current upstream main is now the final-project placeholder, unlike this provided C7 starter.

Decision: keep the actual C7 deploy/test contracts and transfer A2's evidence-driven workflow rather than its content or gates. Start with a complete booking/cancel journey and independent review.

Validation: mise exec -- pnpm check passed: 28 tests, four files; Astro check 0 errors/warnings/hints. No product implementation claimed. Edge tool stopped before page observation because URL identification failed; screenshots and public sources are the present evidence boundary. See RESEARCH.md.

Commit: pending coherent planning checkpoint. Personal student interpretation remains to be written by the student.

## Backend RED and independent plan correction

The backend worker ran the new availability behavior against the built starter: `mise exec -- pnpm exec vitest run spec/booking.test.ts -t "serves a complete interval"` exited1 because /api/availability returned404 rather than200. Other24 cases were not selected, not passing. Implementation follows that observed RED.

Independent plan review identified that daily limits and idempotency need the same database transaction as overlap checking; parallel cookie initialization and private-response caching needed explicit contracts; filter preservation omitted fields; DST and restart persistence need dedicated checks. Parent accepted these concrete corrections and communicated them to workers. Actual implementation verification remains pending.

## Existing-system research corrected the feature story

The successful Edge follow-up found equipment filters in the accessible booking route. We therefore rejected the simplistic claim that the existing system lacks facilities filters. The stronger observation is that its1-4 capacity bucket returned63 mixed options, including capacity1 and2 spaces, for a task needing4 seats. The prototype instead matches exact party size and full requested duration. Frontend worker was informed before its final copy/design. This illustrates why source inspection changed the proposed response to the brief.

## Deployment baseline

Deployed an immutable export of original9aed042 to the course-managed C7 Fly app while workers changed the checkout separately. Deployment exited0, created one1GB data volume and one machine in the configured shape. CLI's external DNS probe timed out, but an independent request to https://comp4020-crit7-naaeeen.fly.dev/ returnedHTTP200 with the actual Guestbook heading. This verifies the credential, build and serving path, not the new product. The provided token was never printed, is mode0600 in ignored mise.local.toml and excluded from Docker context.
