# Verification record

Verified28September2026 against the release candidate in this repository.

## Required checks

- `mise exec -- pnpm check`:87/87tests passed in8files; typecheck had0errors,0warnings and0hints. Includes actual built-server HTTP tests, isolated SQLite service cases, fresh/starter migration and restart persistence, allfourpage-type invariants and full README rendering.
- `mise exec -- pnpm check:evidence`: passed; correct crit-7 reflection filename and resolving local commit citations. Written drafts are labelled as prepared with Codex for student review; passing this check does not establish personal authorship or writing quality.
- `mise exec -- pnpm audit --prod --json`:0advisories after compatible transitive fixes. Astro7.3.3 andadapter11.1.6 unchanged.
- `git diff --check`: passed. Staged tree checked for credential markers and unintended local/private files before commits.

## Real browser run

`scripts/verify-browser.mjs` exited0:15checks passed,0failures,0consolewarnings/errors,25screenshots. Used existing Playwright with Chromium151.0.7922.34; no claim that this proves latest-stable Chrome specifically.

Covered desktop1920x1080 and phone390x844, plus320px resize; first-screen search action; native keyboard skip and query-history navigation; motion and changed reduced-motion preference; search/review/booking/reload/cancel; other-owner isolation; normal cross-browser SSE create/release; invalid-query recovery; visible booking rules; two-active-booking API and native-form rejection; cancellation restoring count/daily allowance and replacement booking; no-JavaScript flow using normal keyboard activation.

Network interruption/reconnect and true browser BFCache restoration remain unverified: Chromium's offline emulation did not interrupt an already-open stream. Do not confuse that tool limitation with failure of normal live updates, which passed. No forced click or forced animation completion was used to claim the final no-JS result.

Screenshots and machine-readable report are retained locally in ignored `.data/verification/`. They contain prototype test data, not real ANU reservations. Code coverage percentage was not measured; the repo has no configured coverage provider/command. Test counts are not a coverage percentage.

## Live deployment

The assigned Fly app has served both the starter and the completed Common Room interface withHTTP200. Real HTTPS API checks verified Secure/HttpOnly ownership cookies, creation, a fresh read, foreign-owner cancellation rejection and foreign-origin rejection. An anonymous prototype booking survived the final deployment, remained visible to its original owner, and was then cancelled. The live two-booking cap rejected a third future reservation with409/active_limit; both test reservations were cancelled afterward. The ANU image served over HTTPS matches the verified local asset. SSE opening bytes and same-/foreign-origin checks passed. GitHub Actions is the authoritative remote release record at the workflow link below.

Remote workflow: https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-naaeeen/actions/workflows/checks.yml
