# Process evidence bank

This is an agent-maintained factual record for student review, not a student-authored reflection. Research details and sources are in RESEARCH.md.

## 1. Establish the actual starting point

The user requested current-source research, inspection of their booking interface in Edge, implementation in the existing WSL C7 repository, and A2's evidence-driven working method. C7 was clean at9aed042 with one unpushed harness commit. A2 had an unrelated modified PROCESS.md and was read only. The starter's28tests passed with zero diagnostics.

Current template-dynamic upstream had become the final-project placeholder. The decision was to preserve C7's provided Astro stack, fixed deployment shape, README/invariant checks and SSE/origin probes. This prevented an inappropriate wholesale upstream update. [5d33253](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-naaeeen/commit/5d33253) records the research and plan.

## 2. Inspect before claiming a missing feature

The initial Edge attempt failed its URL-confidence check; a later user-selected tab and corrected window position allowed read-only inspection. The accessible route already provides equipment filters. Its1-4 capacity bucket returned63 choices, including capacity1 desks and capacity2 spaces. No real reservation was submitted or cancelled.

We rejected the claim that equipment filters were absent. The stronger response is matching the actual party size and the whole requested interval, with clear alternatives and retained criteria. The user confirmed that interval matching, cross-library comparison and clear facilities/status all matter. This is a design comparison grounded in a specific task, not a participant experiment or measured speed claim.

## 3. Build the complete transaction and prove failure cases

New availability behavior was tested against the starter: expected200 but received404. The restart/migration tests also failed against the old owner API. After implementation, tests drove the actual built server and temporary SQLite databases.

Independent plan review required the daily allowance and idempotency checks to share the overlap transaction, cookie bootstrap to avoid parallel-response races, explicit Sydney calendar arithmetic across daylight saving, private-response caching rules and preserved error filters. The implementation incorporated these before final verification.

[d1765ff](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-naaeeen/commit/d1765ff) adds the booking flow, owned cancellation, migration, illustrative catalogue, native forms and responsive interface. Review found that a00:00 test only proved opening-hours rejection; three controlled real-SQLite cases now prove past-start rejection, replay after start and too-late cancellation.

## 4. Let browser and review evidence change the interface

Independent review caught malformed dates throwing before validation could render; a guarded formatter and three HTTP regressions protect that path. Parent review caught stale field-error/aria-invalid state after a corrected AJAX search; the interface now synchronizes that state.

The live-update review found that reconnection and restored pages could silently miss events. The interface now gives a non-destructive refresh notice. Browser verification then showed that an unconditional popstate reload broke skip-link focus even after main became focusable. The follow-up repair distinguishes content query changes from fragment navigation. Its browser regression remains separate from the83-test suite.

Original SVG illustrations and short CSS/Web Animations support the requested motion. Reduced motion, usable native forms, preserved drafts and keyboard navigation are acceptance criteria. Desktop/mobile screenshots are inspected; no automated or agent review is described as human participant feedback.

## 5. Verify dependencies and deployment honestly

The starter audit reported6advisories across four indirect packages. Current primary advisories and installed ranges were checked. devalue's advisory metadata disagreed with the maintainer patch release; the update required the verified fixed release. A targeted lockfile refresh retained Astro7.3.3/adapter11.1.6. Frozen install succeeded and the repeated production audit reported zero advisories. No remotely exploitable booking-input path to those parsers was demonstrated.

An immutable starter export first proved the scoped token, builder, one-machine/one-volume setup and HTTP200 serving. The CLI DNS probe timed out, so an independent HTTPS request established the actual result; it was not reported as a passed DNS probe. Common Room then deployed and returnedHTTP200 with the new interface. The token was stored privately, ignored by Git/Docker and never printed.

## Current status

83/83tests pass after the final keyboard-history source repair, with zero type diagnostics. Real browser verification and the final deployment update are still in progress. Source commits remain local: automatic approval rejected remote push pending explicit current-conversation authorization. Student process/reflection review remains required. Update this status only from actual completion evidence.

## Final rules and browser outcome

The user explicitly requested the ANU logo, more visible motion and clear per-account booking rules. The final shared policy limits a browser-saved demo account to two confirmed bookings that have not ended,120minutes/day and30-120minutes/session. Its count is enforced in the same transaction as overlap and daily checks, after idempotent replay lookup. A third-booking RED returned201before the rule; final tests verify409, cancellation recovery, ongoing/end boundary and concurrency across different dates/spaces. Independent review found no issue in this delta.

Final local release check:87/87tests and the evidence gate pass. The real browser verifier passed15checks in23.6seconds with0warnings/errors; both required viewports and the new quota journey passed. Source code was committed as4c5f420. See VERIFICATION.md for precise coverage and remaining browser-emulation limits.

The user explicitly authorized pushing and making this exact C7 repository public to complete submission. The earlier automatic push rejection is now resolved by that authorization; actual remote/CI readback will be recorded after execution.

## Live release confirmed

After the final deployment, an existing anonymous prototype booking remained present for its original owner and could be cancelled. Direct HTTPS checks then created two future bookings, rejected a third with409/active_limit and cancelled both test records. The deployed ANU logo matched the verified asset. Same-origin requests, foreign-origin rejection and SSE opening bytes all passed. No real ANU booking was touched.
